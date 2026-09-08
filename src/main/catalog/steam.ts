import {
  CatalogError,
  type CatalogGameDetail,
  type CatalogSearchResult,
  type GameCatalog
} from '../../catalog/model'
import { requestCatalogJson } from './request'
import { ManagedImageError, type RemoteImageImporter } from '../images/managed-images'

type FetchLike = typeof fetch

function plainText(value: string | undefined): string {
  return (value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .trim()
}

async function steamRequest<T>(url: URL, fetcher: FetchLike, signal?: AbortSignal): Promise<T> {
  return (await requestCatalogJson('steam', url, fetcher, false, { signal })) as T
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

function safeString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function safeStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
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

function safeScreenshots(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) =>
        isRecord(item) && typeof item.path_full === 'string' ? [item.path_full] : []
      )
    : []
}

function safeGenres(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) =>
        isRecord(item) && typeof item.description === 'string' ? [item.description] : []
      )
    : []
}

function safePlatforms(value: unknown): string[] {
  if (!isRecord(value)) return []
  return [
    value.windows === true ? 'Windows' : null,
    value.mac === true ? 'macOS' : null,
    value.linux === true ? 'Linux' : null
  ].filter((platform): platform is string => platform !== null)
}

function safeReleaseDate(value: unknown): string | null {
  return isRecord(value) ? safeString(value.date) : null
}

function safeDetailMetacritic(value: unknown): number | null {
  if (!isRecord(value) || !Number.isInteger(value.score)) return null
  const score = value.score as number
  return score >= 0 && score <= 100 ? score : null
}

function description(game: Record<string, unknown>): string {
  for (const field of ['short_description', 'detailed_description', 'about_the_game']) {
    const text = plainText(safeString(game[field]) ?? undefined)
    if (text) return text
  }
  return ''
}

function steamImageUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    const allowedHost =
      url.hostname.endsWith('.steamstatic.com') || url.hostname === 'steamcdn-a.akamaihd.net'
    return url.protocol === 'https:' && allowedHost ? value : null
  } catch {
    return null
  }
}

async function steamOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (cause) {
    if (cause instanceof CatalogError) throw cause
    if (cause instanceof ManagedImageError) {
      if (cause.kind === 'offline' || cause.kind === 'timeout' || cause.kind === 'rate-limit') {
        throw new CatalogError(
          {
            provider: 'steam',
            kind: cause.kind,
            retryAfterSeconds: cause.retryAfterSeconds
          },
          { cause }
        )
      }
      if (cause.kind === 'persistence') throw cause
    }
    throw new CatalogError({ provider: 'steam', kind: 'provider-response' }, { cause })
  }
}

export function createSteamCatalog(
  fetcher: FetchLike = fetch,
  importImage?: RemoteImageImporter
): GameCatalog {
  async function managedImages(
    coverCandidates: (string | null)[],
    backgroundUrl: string | null,
    signal?: AbortSignal
  ): Promise<{ coverUrl: string | null; backgroundUrl: string | null }> {
    if (!importImage) {
      const [preferred, fallback] = coverCandidates
      const coverUrl = preferred && (await imageExists(preferred, fetcher)) ? preferred : fallback
      return { coverUrl: coverUrl ?? null, backgroundUrl }
    }

    const imported = new Map<string, string>()
    let coverUrl: string | null = null
    for (const candidate of coverCandidates) {
      const trustedCandidate = steamImageUrl(candidate)
      if (!trustedCandidate) continue
      try {
        coverUrl = await importImage(trustedCandidate, signal)
        imported.set(trustedCandidate, coverUrl)
        break
      } catch (cause) {
        if (signal?.aborted) throw cause
        if (
          !(cause instanceof ManagedImageError) ||
          (cause.kind !== 'unavailable' && cause.kind !== 'invalid')
        ) {
          throw cause
        }
      }
    }
    let managedBackground: string | null = null
    const trustedBackground = steamImageUrl(backgroundUrl)
    if (trustedBackground) {
      managedBackground = imported.get(trustedBackground) ?? null
      if (!managedBackground) {
        try {
          managedBackground = await importImage(trustedBackground, signal)
        } catch (cause) {
          if (signal?.aborted) throw cause
          if (
            !(cause instanceof ManagedImageError) ||
            (cause.kind !== 'unavailable' && cause.kind !== 'invalid')
          ) {
            throw cause
          }
        }
      }
    }
    return { coverUrl, backgroundUrl: managedBackground }
  }

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

    async getGame(catalogId: number, signal?: AbortSignal): Promise<CatalogGameDetail> {
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
        const response = await steamRequest<unknown>(url, fetcher, signal)
        if (!isRecord(response)) invalidResponse()
        const envelope = response[String(catalogId)]
        if (!isRecord(envelope)) invalidResponse()
        const verticalImage = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${catalogId}/library_600x900.jpg`
        if (envelope.success === false) {
          const legacyHeader = `https://cdn.akamai.steamstatic.com/steam/apps/${catalogId}/header.jpg`
          const images = await managedImages([verticalImage, legacyHeader], legacyHeader, signal)
          return {
            source: 'steam',
            catalogId,
            title: `Steam App ${catalogId}`,
            description: '',
            coverUrl: images.coverUrl,
            backgroundUrl: images.backgroundUrl,
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
        const website = safeString(game.website)
        const headerImage = safeString(game.header_image)
        const images = await managedImages(
          [verticalImage, headerImage],
          safeString(game.background) ?? headerImage,
          signal
        )
        return {
          source: 'steam',
          catalogId,
          title: isCatalogAlias ? `Steam App ${catalogId}` : game.name.trim(),
          description: description(game),
          coverUrl: images.coverUrl,
          backgroundUrl: images.backgroundUrl,
          screenshots: safeScreenshots(game.screenshots),
          releasedAt: safeReleaseDate(game.release_date),
          developers: safeStringList(game.developers),
          publishers: safeStringList(game.publishers),
          genres: safeGenres(game.genres),
          platforms: safePlatforms(game.platforms),
          website: website || `https://store.steampowered.com/app/${catalogId}`,
          metacritic: safeDetailMetacritic(game.metacritic)
        }
      })
    }
  }
}
