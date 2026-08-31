export type CatalogProvider = 'steam' | 'rawg'

export type CatalogFailureKind =
  'invalid-input' | 'offline' | 'timeout' | 'authentication' | 'rate-limit' | 'provider-response'

export interface CatalogFailure {
  kind: CatalogFailureKind
  provider: CatalogProvider
}

export type CatalogResult<T> = { ok: true; value: T } | { ok: false; error: CatalogFailure }

/** Represents a provider-neutral catalog failure inside the main process. */
export class CatalogError extends Error {
  constructor(
    readonly failure: CatalogFailure,
    options?: ErrorOptions
  ) {
    super(`${failure.provider} catalog ${failure.kind}`, options)
    this.name = 'CatalogError'
  }
}

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
