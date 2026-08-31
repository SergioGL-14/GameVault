export const GAME_STATUSES = [
  'jugando',
  'completado',
  'pendiente',
  'abandonado',
  'deseado'
] as const

export type GameStatus = (typeof GAME_STATUSES)[number]
export type GameSource = 'manual' | 'steam' | 'rawg'

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

export interface Achievement {
  id: number
  gameId: number
  name: string
  description: string
  iconUrl: string | null
  unlocked: boolean
  unlockedAt: string | null
}

export interface AchievementInput {
  name: string
  description?: string
  iconUrl?: string | null
  unlocked: boolean
  unlockedAt?: string | null
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
  totalAchievements: number
  unlockedAchievements: number
}
