import type {
  AuthenticatedGameCatalog,
  CatalogGameDetail,
  CatalogSearchResult
} from '../../catalog/model'
import { CatalogError } from '../../catalog/model'
import { requestCatalogJson } from './request'

type FetchLike = typeof fetch

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidResponse(): never {
  throw new CatalogError({ provider: 'rawg', kind: 'provider-response' })
}

function optionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') invalidResponse()
  return value
}

function names(value: unknown): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) invalidResponse()
  return value.map((item) => {
    if (!isRecord(item) || typeof item.name !== 'string') invalidResponse()
    return item.name
  })
}

function platforms(value: unknown): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) invalidResponse()
  return value.map((item) => {
    if (!isRecord(item) || !isRecord(item.platform) || typeof item.platform.name !== 'string') {
      invalidResponse()
    }
    return item.platform.name
  })
}

function optionalMetacritic(value: unknown): number | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) {
    invalidResponse()
  }
  return value
}

function searchResult(value: unknown): CatalogSearchResult {
  if (
    !isRecord(value) ||
    !Number.isInteger(value.id) ||
    (value.id as number) <= 0 ||
    typeof value.name !== 'string' ||
    !value.name.trim()
  ) {
    invalidResponse()
  }
  return {
    source: 'rawg',
    catalogId: value.id as number,
    title: value.name.trim(),
    coverUrl: optionalString(value.background_image),
    releasedAt: optionalString(value.released),
    platforms: platforms(value.platforms),
    metacritic: optionalMetacritic(value.metacritic)
  }
}

function screenshots(value: unknown): string[] {
  if (!Array.isArray(value)) invalidResponse()
  return value.map((item) => {
    if (!isRecord(item) || typeof item.image !== 'string') invalidResponse()
    return item.image
  })
}

function listResponse(value: unknown): unknown[] {
  if (!isRecord(value) || !Array.isArray(value.results)) {
    invalidResponse()
  }
  return value.results
}

async function rawgOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (cause) {
    if (cause instanceof CatalogError) throw cause
    throw new CatalogError({ provider: 'rawg', kind: 'provider-response' }, { cause })
  }
}

export function createRawgCatalog(
  getApiKey: () => string | null,
  fetcher: FetchLike = fetch
): AuthenticatedGameCatalog {
  async function request<T>(
    path: string,
    params: Record<string, string> = {},
    suppliedKey?: string
  ): Promise<T> {
    const key = suppliedKey ?? getApiKey()
    if (!key) throw new CatalogError({ provider: 'rawg', kind: 'authentication' })
    const query = new URLSearchParams({ ...params, key })
    return (await requestCatalogJson(
      'rawg',
      `https://api.rawg.io/api${path}?${query.toString()}`,
      fetcher,
      true
    )) as T
  }

  return {
    async verifyKey(key: string): Promise<void> {
      return rawgOperation(async () => {
        const normalized = key.trim()
        if (!normalized || normalized.length > 256) {
          throw new CatalogError({ provider: 'rawg', kind: 'invalid-input' })
        }
        const results = listResponse(
          await request<unknown>('/games', { search: 'Portal', page_size: '1' }, normalized)
        )
        results.forEach(searchResult)
      })
    },

    async search(query: string): Promise<CatalogSearchResult[]> {
      return rawgOperation(async () => {
        const normalized = query.trim()
        if (normalized.length < 2 || normalized.length > 100) {
          throw new CatalogError({ provider: 'rawg', kind: 'invalid-input' })
        }
        const results = listResponse(
          await request<unknown>('/games', {
            search: normalized,
            search_precise: 'true',
            page_size: '12'
          })
        )
        return results.map(searchResult)
      })
    },

    async getGame(catalogId: number): Promise<CatalogGameDetail> {
      return rawgOperation(async () => {
        if (!Number.isInteger(catalogId) || catalogId <= 0) {
          throw new CatalogError({ provider: 'rawg', kind: 'invalid-input' })
        }
        const [gameResponse, screenshotResponse] = await Promise.all([
          request<unknown>(`/games/${catalogId}`),
          request<unknown>(`/games/${catalogId}/screenshots`, { page_size: '8' })
            .then(listResponse)
            // Screenshots are optional enrichment; propagate this failure if imports require them.
            .catch(() => [])
        ])
        if (!isRecord(gameResponse)) {
          throw new CatalogError({ provider: 'rawg', kind: 'provider-response' })
        }
        const game = gameResponse
        const base = searchResult(game)
        return {
          ...base,
          description: optionalString(game.description_raw)?.trim() ?? '',
          backgroundUrl:
            optionalString(game.background_image_additional) ??
            optionalString(game.background_image) ??
            null,
          screenshots: screenshots(screenshotResponse),
          developers: names(game.developers),
          publishers: names(game.publishers),
          genres: names(game.genres),
          website: optionalString(game.website) || null
        }
      })
    }
  }
}
