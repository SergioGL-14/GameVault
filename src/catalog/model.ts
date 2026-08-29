export type CatalogProvider = 'steam' | 'rawg'

export interface CatalogStatus {
  configured: boolean
  source: 'saved' | 'environment' | null
}

export interface CatalogSearchResult {
  source: CatalogProvider
  catalogId: number
  title: string
  coverUrl: string | null
  releasedAt: string | null
  platforms: string[]
  metacritic: number | null
}

export interface CatalogGameDetail extends CatalogSearchResult {
  description: string
  backgroundUrl: string | null
  screenshots: string[]
  developers: string[]
  publishers: string[]
  genres: string[]
  website: string | null
}

export interface GameCatalog {
  search(query: string): Promise<CatalogSearchResult[]>
  getGame(catalogId: number): Promise<CatalogGameDetail>
}

export interface AuthenticatedGameCatalog extends GameCatalog {
  verifyKey(key: string): Promise<void>
}
