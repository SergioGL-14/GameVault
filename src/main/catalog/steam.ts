import {
  CatalogError,
  type CatalogGameDetail,
  type CatalogSearchResult,
  type GameCatalog
} from '../../catalog/model'
import { requestCatalogJson } from './request'

type FetchLike = typeof fetch

function plainText(value: string | undefined): string {
  return (value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .trim()
}

async function steamRequest<T>(url: URL, fetcher: FetchLike): Promise<T> {
  return (await requestCatalogJson('steam', url, fetcher)) as T
}

async function steamStoreRequest<T>(url: URL, fetcher: FetchLike): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await steamRequest<T>(url, fetcher)
    } catch (cause) {
      if (
        !(cause instanceof CatalogError) ||
        cause.failure.kind !== 'rate-limit' ||
        attempt >= 10
      ) {
        throw cause
      }
      // Steam Store often omits Retry-After; Playnite uses the same bounded 2.5-second fallback.
      const delay = cause.failure.retryAfterSeconds
        ? cause.failure.retryAfterSeconds * 1_000
        : 2_500
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

async function imageExists(url: string, fetcher: FetchLike): Promise<boolean> {
  try {
    const response = await fetcher(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000)
    })
    return response.ok
  } catch {
    return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidResponse(): never {
  throw new CatalogError({ provider: 'steam', kind: 'provider-response' })
}

function optionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') invalidResponse()
  return value
}

function stringList(value: unknown): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) invalidResponse()
  return value
}

function platformNames(value: unknown): string[] {
  if (value === undefined) return []
  if (!isRecord(value)) invalidResponse()
  for (const platform of ['windows', 'mac', 'linux']) {
    if (value[platform] !== undefined && typeof value[platform] !== 'boolean') invalidResponse()
  }
  return [
    value.windows ? 'Windows' : null,
    value.mac ? 'macOS' : null,
    value.linux ? 'Linux' : null
  ].filter((platform): platform is string => Boolean(platform))
}

function metacritic(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' && typeof value !== 'number') invalidResponse()
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) invalidResponse()
  return parsed
}

function searchResult(value: unknown): CatalogSearchResult | null {
  if (!isRecord(value) || typeof value.type !== 'string') invalidResponse()
  if (value.type !== 'app') return null
  if (
    !Number.isInteger(value.id) ||
    (value.id as number) <= 0 ||
    typeof value.name !== 'string' ||
    !value.name.trim()
  ) {
    invalidResponse()
  }
  return {
    source: 'steam',
    catalogId: value.id as number,
    title: value.name.trim(),
    coverUrl: optionalString(value.tiny_image),
    releasedAt: null,
    platforms: platformNames(value.platforms),
    metacritic: metacritic(value.metascore)
  }
}

function screenshots(value: unknown): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) invalidResponse()
  return value.map((item) => {
    if (!isRecord(item) || typeof item.path_full !== 'string') invalidResponse()
    return item.path_full
  })
}

function genres(value: unknown): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) invalidResponse()
  return value.map((item) => {
    if (!isRecord(item) || typeof item.description !== 'string') invalidResponse()
    return item.description
  })
}

function releaseDate(value: unknown): string | null {
  if (value === undefined) return null
  if (!isRecord(value)) invalidResponse()
  return optionalString(value.date)
}

function detailMetacritic(value: unknown): number | null {
  if (value === undefined) return null
  if (
    !isRecord(value) ||
    typeof value.score !== 'number' ||
    !Number.isInteger(value.score) ||
    value.score < 0 ||
    value.score > 100
  ) {
    invalidResponse()
  }
  return value.score
}

async function steamOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (cause) {
    if (cause instanceof CatalogError) throw cause
    throw new CatalogError({ provider: 'steam', kind: 'provider-response' }, { cause })
  }
}

export function createSteamCatalog(fetcher: FetchLike = fetch): GameCatalog {
  return {
    async search(query: string): Promise<CatalogSearchResult[]> {
      return steamOperation(async () => {
        const normalized = query.trim()
        if (normalized.length < 2 || normalized.length > 100) {
          throw new CatalogError({ provider: 'steam', kind: 'invalid-input' })
        }
        const url = new URL('https://store.steampowered.com/api/storesearch/')
        url.search = new URLSearchParams({ term: normalized, l: 'spanish', cc: 'ES' }).toString()
        const response = await steamRequest<unknown>(url, fetcher)
        if (
          !isRecord(response) ||
          (response.items !== undefined && !Array.isArray(response.items))
        ) {
          invalidResponse()
        }
        const items = response.items ?? []
        return items.flatMap((item) => {
          const result = searchResult(item)
          return result ? [result] : []
        })
      })
    },

    async getGame(catalogId: number): Promise<CatalogGameDetail> {
      return steamOperation(async () => {
        if (!Number.isInteger(catalogId) || catalogId <= 0) {
          throw new CatalogError({ provider: 'steam', kind: 'invalid-input' })
        }
        const url = new URL('https://store.steampowered.com/api/appdetails')
        url.search = new URLSearchParams({
          appids: String(catalogId),
          l: 'spanish',
          cc: 'ES'
        }).toString()
        const response = await steamStoreRequest<unknown>(url, fetcher)
        if (!isRecord(response)) invalidResponse()
        const envelope = response[String(catalogId)]
        if (!isRecord(envelope)) invalidResponse()
        const verticalImage = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${catalogId}/library_600x900.jpg`
        if (envelope.success === false) {
          const legacyHeader = `https://cdn.akamai.steamstatic.com/steam/apps/${catalogId}/header.jpg`
          const coverUrl = (await imageExists(verticalImage, fetcher))
            ? verticalImage
            : (await imageExists(legacyHeader, fetcher))
              ? legacyHeader
              : null
          return {
            source: 'steam',
            catalogId,
            title: `Steam App ${catalogId}`,
            description: '',
            coverUrl,
            backgroundUrl: coverUrl,
            screenshots: [],
            releasedAt: null,
            developers: [],
            publishers: [],
            genres: [],
            platforms: [],
            website: `https://store.steampowered.com/app/${catalogId}`,
            metacritic: null
          }
        }
        if (envelope.success !== true || !isRecord(envelope.data)) {
          invalidResponse()
        }
        const game = envelope.data
        if (typeof game.type !== 'string' || typeof game.name !== 'string' || !game.name.trim()) {
          invalidResponse()
        }
        if (
          game.steam_appid !== undefined &&
          (!Number.isInteger(game.steam_appid) || (game.steam_appid as number) <= 0)
        ) {
          invalidResponse()
        }
        const isCatalogAlias = game.steam_appid !== undefined && game.steam_appid !== catalogId
        const website = optionalString(game.website)
        const headerImage = optionalString(game.header_image)
        const coverUrl = (await imageExists(verticalImage, fetcher)) ? verticalImage : headerImage
        return {
          source: 'steam',
          catalogId,
          title: isCatalogAlias ? `Steam App ${catalogId}` : game.name.trim(),
          description: plainText(optionalString(game.short_description) ?? undefined),
          coverUrl,
          backgroundUrl: optionalString(game.background) ?? headerImage,
          screenshots: screenshots(game.screenshots),
          releasedAt: releaseDate(game.release_date),
          developers: stringList(game.developers),
          publishers: stringList(game.publishers),
          genres: genres(game.genres),
          platforms: platformNames(game.platforms),
          website: website || `https://store.steampowered.com/app/${catalogId}`,
          metacritic: detailMetacritic(game.metacritic)
        }
      })
    }
  }
}
