import type { GameSource } from './model'
import { normalizeGameTitle } from './game-metadata'

/** Minimal provider snapshot item used to reconcile Steam ownership. */
export interface SteamOwnershipSnapshotItem {
  appId: number
  title: string
}

export interface CanonicalGameCandidate {
  id: number
  title: string
  source: GameSource
  catalogId: number | null
}

export type SteamOwnershipMatch =
  | { kind: 'existing-ownership'; gameId: number }
  | { kind: 'catalog-match'; gameId: number }
  | { kind: 'title-confirmation'; gameIds: number[] }
  | { kind: 'new-game' }

/** Reconciles one Steam item conservatively without fuzzy or silent title matching. */
export function reconcileSteamOwnership(
  item: SteamOwnershipSnapshotItem,
  games: CanonicalGameCandidate[],
  existingGameId?: number | null
): SteamOwnershipMatch {
  if (existingGameId != null) return { kind: 'existing-ownership', gameId: existingGameId }

  const catalogMatch = games.find(
    (game) => game.source === 'steam' && game.catalogId === item.appId
  )
  if (catalogMatch) return { kind: 'catalog-match', gameId: catalogMatch.id }

  const normalizedTitle = normalizeGameTitle(item.title)
  const titleMatches = games
    .filter((game) => normalizeGameTitle(game.title) === normalizedTitle)
    .map((game) => game.id)
  return titleMatches.length > 0
    ? { kind: 'title-confirmation', gameIds: titleMatches }
    : { kind: 'new-game' }
}
