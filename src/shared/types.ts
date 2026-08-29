export const GAME_STATUSES = [
  'jugando',
  'completado',
  'pendiente',
  'abandonado',
  'deseado'
] as const

export type GameStatus = (typeof GAME_STATUSES)[number]
export type CatalogProvider = 'steam' | 'rawg'
export type GameSource = 'manual' | CatalogProvider

export const STATUS_LABELS: Record<GameStatus, string> = {
  jugando: 'Jugando',
  completado: 'Completado',
  pendiente: 'Pendiente',
  abandonado: 'Abandonado',
  deseado: 'En deseo'
}

export interface Game {
  id: number
  source: GameSource
  catalogId: number | null
  title: string
  description: string
  status: GameStatus
  playtimeMinutes: number
  rating: number | null
  notes: string
  coverUrl: string | null
  backgroundUrl: string | null
  screenshots: string[]
  releasedAt: string | null
  developers: string[]
  publishers: string[]
  genres: string[]
  platforms: string[]
  website: string | null
  metacritic: number | null
  showcased: boolean
  completedAt: string | null
  addedAt: string
}

export interface GameInput {
  source?: GameSource
  catalogId?: number | null
  title: string
  description?: string
  status: GameStatus
  playtimeMinutes?: number
  rating?: number | null
  notes?: string
  coverUrl?: string | null
  backgroundUrl?: string | null
  screenshots?: string[]
  releasedAt?: string | null
  developers?: string[]
  publishers?: string[]
  genres?: string[]
  platforms?: string[]
  website?: string | null
  metacritic?: number | null
  showcased?: boolean
}

export interface Profile {
  displayName: string
  about: string
  location: string
  avatarUrl: string | null
  backgroundUrl: string | null
}

export type ProfileInput = Profile

export interface LibraryStats {
  totalGames: number
  completed: number
  playing: number
  totalPlaytimeMinutes: number
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
