/** Minimal Steam profile retained for an external account connection. */
export interface SteamProfile {
  steamId: string
  personaName: string
  avatarUrl: string | null
}

/** Minimal owned-game data used to reconcile a Steam library snapshot. */
export interface SteamOwnedGame {
  appId: number
  title: string
}

export interface SteamAchievement {
  providerId: string
  name: string
  description: string
  iconUrl: string | null
  unlocked: boolean
  unlockedAt: string | null
}

/** Minimal achievement row extracted from the connected account's Community page. */
export interface SteamCommunityAchievement {
  iconFile: string
  unlockedAt: string | null
}

export interface SteamAccount extends SteamProfile {
  lastRefreshedAt: string | null
}

export type SteamCredential =
  { kind: 'web-session'; value: string } | { kind: 'api-key'; value: string }

export interface SteamWebAuthentication {
  steamId: string
  credential: SteamCredential
}

/** Owns Steam's isolated browser session without exposing its credential to the renderer. */
export interface SteamWebSession {
  login(): Promise<SteamWebAuthentication>
  restore(): Promise<SteamWebAuthentication>
  getCommunityAchievements(steamId: string, appId: number): Promise<SteamCommunityAchievement[]>
  clear(): Promise<void>
}

export interface SteamOwnershipResolution {
  appId: number
  gameId: number | null
}

export interface SteamConnectionStatus {
  configured: boolean
  credentialSource: 'web-session' | 'api-key' | null
  account: SteamAccount | null
}

export type SteamRefreshItem =
  | { kind: 'existing'; game: SteamOwnedGame; gameId: number; canonicalTitle: string }
  | { kind: 'new'; game: SteamOwnedGame }
  | {
      kind: 'confirmation'
      game: SteamOwnedGame
      candidates: { gameId: number; title: string }[]
    }

export interface SteamRefreshPreview {
  previewId: string
  items: SteamRefreshItem[]
}

export interface ApplySteamRefreshInput {
  previewId: string
  resolutions: SteamOwnershipResolution[]
}

export interface SteamRefreshApplication {
  games: Game[]
}

export interface SteamRefreshFailure {
  appId: number
  title: string
  error: CatalogFailure
}

export interface SteamMetadataRefresh {
  games: Game[]
  metadataUpdated: number
  failures: SteamRefreshFailure[]
  pending: number
  cancelled?: boolean
}

export interface SteamMetadataProgress {
  status: 'running' | 'completed' | 'cancelled' | 'failed'
  currentTitle: string | null
  processed: number
  total: number
  metadataUpdated: number
  failed: number
  pending: number
}

export interface SteamAchievementRefresh {
  gamesUpdated: number
  failures: SteamRefreshFailure[]
  pending: number
}

/** Normalized Steam account operations used by either supported credential route. */
export interface SteamAccountProvider {
  resolveProfile(input: string, credential: SteamCredential): Promise<SteamProfile>
  getLibraryGames(steamId: string, credential: SteamCredential): Promise<SteamOwnedGame[]>
  getAchievements(
    steamId: string,
    appId: number,
    credential: SteamCredential
  ): Promise<SteamAchievement[]>
}
import type { CatalogFailure } from '../catalog/model'
import type { Game } from '../library/model'
