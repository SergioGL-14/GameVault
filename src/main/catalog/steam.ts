import type { CatalogGameDetail, CatalogSearchResult, GameCatalog } from '../../catalog/model'

type FetchLike = typeof fetch
type SteamSearchResponse = {
  items?: SteamSearchItem[]
}
type SteamSearchItem = {
  type?: string
  name?: string
  id?: number
  tiny_image?: string
  metascore?: string
  platforms?: Record<string, boolean>
}
type SteamDetailEnvelope = Record<string, { success?: boolean; data?: SteamGame }>
type SteamGame = {
  type?: string
  name?: string
  steam_appid?: number
  short_description?: string
  header_image?: string
  website?: string | null
  developers?: string[]
  publishers?: string[]
  platforms?: Record<string, boolean>
  metacritic?: { score?: number }
  genres?: { description?: string }[]
  screenshots?: { path_full?: string }[]
  release_date?: { date?: string }
  background?: string
}

function platformNames(platforms: Record<string, boolean> | undefined): string[] {
  return Object.entries(platforms ?? {}).flatMap(([name, enabled]) =>
    enabled ? [name === 'windows' ? 'Windows' : name === 'mac' ? 'macOS' : 'Linux'] : []
  )
}

function metacritic(value: string | undefined): number | null {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null
}

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
  let response: Response
  try {
    response = await fetcher(url, { signal: AbortSignal.timeout(10_000) })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('Steam tardó demasiado en responder')
    }
    throw new Error('No se pudo conectar con la tienda de Steam')
  }
  if (!response.ok) {
    if (response.status === 429) throw new Error('Steam ha limitado temporalmente las búsquedas')
    throw new Error(`La tienda de Steam no está disponible (${response.status})`)
  }
  return (await response.json()) as T
}

export function createSteamCatalog(fetcher: FetchLike = fetch): GameCatalog {
  return {
    async search(query: string): Promise<CatalogSearchResult[]> {
      const normalized = query.trim()
      if (normalized.length < 2 || normalized.length > 100) {
        throw new Error('La búsqueda debe tener entre 2 y 100 caracteres')
      }
      const url = new URL('https://store.steampowered.com/api/storesearch/')
      url.search = new URLSearchParams({ term: normalized, l: 'spanish', cc: 'ES' }).toString()
      const response = await steamRequest<SteamSearchResponse>(url, fetcher)
      return (response.items ?? []).flatMap((item) => {
        if (item.type !== 'app' || !Number.isInteger(item.id) || !item.name?.trim()) return []
        return [
          {
            source: 'steam' as const,
            catalogId: item.id as number,
            title: item.name.trim(),
            coverUrl: item.tiny_image ?? null,
            releasedAt: null,
            platforms: platformNames(item.platforms),
            metacritic: metacritic(item.metascore)
          }
        ]
      })
    },

    async getGame(catalogId: number): Promise<CatalogGameDetail> {
      if (!Number.isInteger(catalogId) || catalogId <= 0) {
        throw new Error('El identificador de Steam no es válido')
      }
      const url = new URL('https://store.steampowered.com/api/appdetails')
      url.search = new URLSearchParams({
        appids: String(catalogId),
        l: 'spanish',
        cc: 'ES'
      }).toString()
      const response = await steamRequest<SteamDetailEnvelope>(url, fetcher)
      const envelope = response[String(catalogId)]
      const game = envelope?.success ? envelope.data : undefined
      if (game?.type !== 'game' || !game.name?.trim()) {
        throw new Error('Steam no devolvió una ficha de juego válida')
      }
      return {
        source: 'steam',
        catalogId,
        title: game.name.trim(),
        description: plainText(game.short_description),
        coverUrl: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${catalogId}/library_600x900.jpg`,
        backgroundUrl: game.background ?? game.header_image ?? null,
        screenshots: (game.screenshots ?? []).flatMap((item) =>
          item.path_full ? [item.path_full] : []
        ),
        releasedAt: game.release_date?.date ?? null,
        developers: game.developers ?? [],
        publishers: game.publishers ?? [],
        genres: (game.genres ?? []).flatMap((item) => (item.description ? [item.description] : [])),
        platforms: platformNames(game.platforms),
        website: game.website || `https://store.steampowered.com/app/${catalogId}`,
        metacritic: game.metacritic?.score ?? null
      }
    }
  }
}
