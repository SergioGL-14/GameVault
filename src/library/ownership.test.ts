import { describe, expect, it } from 'vitest'
import type { Game } from './model'
import {
  reconcileSteamOwnership,
  type CanonicalGameCandidate,
  type SteamOwnershipSnapshotItem
} from './ownership'

const item: SteamOwnershipSnapshotItem = { appId: 400, title: 'Portal' }

function candidate(
  id: number,
  title: string,
  source: Game['source'] = 'manual',
  catalogId: number | null = null
): CanonicalGameCandidate {
  return { id, title, source, catalogId }
}

describe('Steam ownership reconciliation', () => {
  it('keeps an existing ownership ahead of every other candidate', () => {
    expect(reconcileSteamOwnership(item, [candidate(2, 'Portal', 'steam', 400)], 1)).toEqual({
      kind: 'existing-ownership',
      gameId: 1
    })
  })

  it('automatically selects exact Steam catalog provenance', () => {
    expect(reconcileSteamOwnership(item, [candidate(2, 'Different title', 'steam', 400)])).toEqual({
      kind: 'catalog-match',
      gameId: 2
    })
  })

  it('requires confirmation for exact case-folded and trimmed title candidates', () => {
    expect(
      reconcileSteamOwnership(item, [candidate(2, ' portal '), candidate(3, 'PORTAL', 'rawg', 7)])
    ).toEqual({ kind: 'title-confirmation', gameIds: [2, 3] })
  })

  it('creates a new game instead of using a fuzzy title match', () => {
    expect(reconcileSteamOwnership(item, [candidate(2, 'Portal 2')])).toEqual({ kind: 'new-game' })
  })
})
