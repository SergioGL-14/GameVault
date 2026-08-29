import type {
  AuthenticatedGameCatalog,
  CatalogGameDetail,
  CatalogSearchResult
} from '../../catalog/model'

type FetchLike = typeof fetch

type RawgList<T> = { results?: T[] }
type RawgNamed = { name?: string }
type RawgPlatform = { platform?: RawgNamed }
type RawgSearchGame = {
  id?: number
  name?: string
  background_image?: string | null
  released?: string | null
  platforms?: RawgPlatform[] | null
  metacritic?: number | null
}
type RawgGame = RawgSearchGame & {
  description_raw?: string
  background_image_additional?: string | null
  developers?: RawgNamed[]
  publishers?: RawgNamed[]
  genres?: RawgNamed[]
  website?: string | null
}
type RawgScreenshot = { image?: string }

function names(items: RawgNamed[] | undefined): string[] {
  return (items ?? []).flatMap((item) => (item.name ? [item.name] : []))
}

function platforms(items: RawgPlatform[] | null | undefined): string[] {
  return (items ?? []).flatMap((item) => (item.platform?.name ? [item.platform.name] : []))
}

function searchResult(game: RawgSearchGame): CatalogSearchResult | null {
  if (!Number.isInteger(game.id) || !game.name?.trim()) return null
  return {
    source: 'rawg',
    catalogId: game.id as number,
    title: game.name.trim(),
    coverUrl: game.background_image ?? null,
    releasedAt: game.released ?? null,
    platforms: platforms(game.platforms),
    metacritic: game.metacritic ?? null
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
    if (!key) throw new Error('Configura tu clave de RAWG para buscar en el catálogo')
    const query = new URLSearchParams({ ...params, key })
    let response: Response
    try {
      response = await fetcher(`https://api.rawg.io/api${path}?${query.toString()}`, {
        signal: AbortSignal.timeout(10_000)
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new Error('RAWG tardó demasiado en responder')
      }
      throw new Error('No se pudo conectar con RAWG')
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('RAWG rechazó la clave configurada')
      }
      if (response.status === 429) throw new Error('Se ha alcanzado el límite temporal de RAWG')
      throw new Error(`RAWG no está disponible (${response.status})`)
    }
    return (await response.json()) as T
  }

  return {
    async verifyKey(key: string): Promise<void> {
      const normalized = key.trim()
      if (!normalized || normalized.length > 256) throw new Error('La clave de RAWG no es válida')
      await request<RawgList<RawgSearchGame>>(
        '/games',
        { search: 'Portal', page_size: '1' },
        normalized
      )
    },

    async search(query: string): Promise<CatalogSearchResult[]> {
      const normalized = query.trim()
      if (normalized.length < 2 || normalized.length > 100) {
        throw new Error('La búsqueda debe tener entre 2 y 100 caracteres')
      }
      const response = await request<RawgList<RawgSearchGame>>('/games', {
        search: normalized,
        search_precise: 'true',
        page_size: '12'
      })
      return (response.results ?? []).flatMap((game) => {
        const result = searchResult(game)
        return result ? [result] : []
      })
    },

    async getGame(catalogId: number): Promise<CatalogGameDetail> {
      if (!Number.isInteger(catalogId) || catalogId <= 0) {
        throw new Error('El identificador del catálogo no es válido')
      }
      const [game, screenshotResponse] = await Promise.all([
        request<RawgGame>(`/games/${catalogId}`),
        request<RawgList<RawgScreenshot>>(`/games/${catalogId}/screenshots`, {
          page_size: '8'
        }).catch(() => ({ results: [] }))
      ])
      const base = searchResult(game)
      if (!base) throw new Error('RAWG devolvió una ficha incompleta')
      return {
        ...base,
        description: game.description_raw?.trim() ?? '',
        backgroundUrl: game.background_image_additional ?? game.background_image ?? null,
        screenshots: (screenshotResponse.results ?? []).flatMap((item) =>
          item.image ? [item.image] : []
        ),
        developers: names(game.developers),
        publishers: names(game.publishers),
        genres: names(game.genres),
        website: game.website || null
      }
    }
  }
}
