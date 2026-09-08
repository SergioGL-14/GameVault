import type { Game, GameInput } from './model'
import { parseManagedImageReference } from './managed-image'

export const CATALOG_METADATA_FIELDS = [
  'title',
  'description',
  'coverUrl',
  'backgroundUrl',
  'screenshots',
  'releasedAt',
  'developers',
  'publishers',
  'genres',
  'platforms',
  'website',
  'metacritic'
] as const

export type CatalogMetadataField = (typeof CATALOG_METADATA_FIELDS)[number]

/** Normalizes a title for conservative exact matching without fuzzy edition conflation. */
export function normalizeGameTitle(title: string): string {
  return title.trim().toLocaleLowerCase('en-US')
}

/** Returns whether imported metadata is sufficient for normal library browsing. */
export function isUsableGameCard(game: Game): boolean {
  return Boolean(
    game.title.trim() && game.description.trim() && parseManagedImageReference(game.coverUrl ?? '')
  )
}

function isReplaceableSteamArtwork(value: string | null, game: Game): boolean {
  if (!value || game.source !== 'steam' || game.catalogId === null) return false
  try {
    const url = new URL(value)
    const steamHost =
      url.hostname.endsWith('.steamstatic.com') || url.hostname === 'steamcdn-a.akamaihd.net'
    const file = url.pathname.split('/').pop() ?? ''
    return (
      url.protocol === 'https:' &&
      steamHost &&
      url.pathname.includes(`/steam/apps/${game.catalogId}/`) &&
      /^(header|capsule_)/.test(file)
    )
  } catch {
    return false
  }
}

/** Fills missing catalog metadata while preserving personal state and existing user edits. */
export function mergeMissingGameMetadata(current: Game, incoming: GameInput): GameInput {
  const choose = <T>(existing: T, candidate: T, empty: (value: T) => boolean): T =>
    empty(existing) && !empty(candidate) ? candidate : existing
  const incomingSource = incoming.source ?? 'manual'
  const adoptCatalogIdentity =
    current.source === 'manual' && incomingSource !== 'manual' && incoming.catalogId != null
  const provisionalTitle =
    current.source === 'steam' &&
    current.catalogId !== null &&
    current.title === `Steam App ${current.catalogId}`
  const incomingCover = incoming.coverUrl ?? null

  return {
    source: adoptCatalogIdentity ? incomingSource : current.source,
    catalogId: adoptCatalogIdentity ? (incoming.catalogId ?? null) : current.catalogId,
    title: provisionalTitle
      ? incoming.title
      : choose(current.title, incoming.title, (value) => !value.trim()),
    description: choose(current.description, incoming.description ?? '', (value) => !value.trim()),
    status: current.status,
    playtimeMinutes: current.playtimeMinutes,
    rating: current.rating,
    notes: current.notes,
    coverUrl: isReplaceableSteamArtwork(current.coverUrl, current)
      ? (incomingCover ?? current.coverUrl)
      : choose(current.coverUrl, incomingCover, (value) => value === null),
    backgroundUrl: choose(
      current.backgroundUrl,
      incoming.backgroundUrl ?? null,
      (value) => value === null
    ),
    screenshots: choose(
      current.screenshots,
      incoming.screenshots ?? [],
      (value) => value.length === 0
    ),
    releasedAt: choose(current.releasedAt, incoming.releasedAt ?? null, (value) => value === null),
    developers: choose(
      current.developers,
      incoming.developers ?? [],
      (value) => value.length === 0
    ),
    publishers: choose(
      current.publishers,
      incoming.publishers ?? [],
      (value) => value.length === 0
    ),
    genres: choose(current.genres, incoming.genres ?? [], (value) => value.length === 0),
    platforms: choose(current.platforms, incoming.platforms ?? [], (value) => value.length === 0),
    website: choose(current.website, incoming.website ?? null, (value) => value === null),
    metacritic: choose(current.metacritic, incoming.metacritic ?? null, (value) => value === null),
    showcased: current.showcased
  }
}

/** Refreshes provider-managed fields while preserving personal values and explicit overrides. */
export function mergeProviderGameMetadata(
  current: Game,
  incoming: GameInput,
  overrides: ReadonlySet<CatalogMetadataField>
): GameInput {
  const choose = <T>(
    field: CatalogMetadataField,
    existing: T,
    candidate: T,
    empty: (value: T) => boolean
  ): T => (overrides.has(field) || empty(candidate) ? existing : candidate)

  return {
    source: current.source,
    catalogId: current.catalogId,
    title: choose('title', current.title, incoming.title, (value) => !value.trim()),
    description: choose(
      'description',
      current.description,
      incoming.description ?? '',
      (value) => !value.trim()
    ),
    status: current.status,
    playtimeMinutes: current.playtimeMinutes,
    rating: current.rating,
    notes: current.notes,
    coverUrl: choose('coverUrl', current.coverUrl, incoming.coverUrl ?? null, (value) => !value),
    backgroundUrl: choose(
      'backgroundUrl',
      current.backgroundUrl,
      incoming.backgroundUrl ?? null,
      (value) => !value
    ),
    screenshots: choose(
      'screenshots',
      current.screenshots,
      incoming.screenshots ?? [],
      (value) => value.length === 0
    ),
    releasedAt: choose(
      'releasedAt',
      current.releasedAt,
      incoming.releasedAt ?? null,
      (value) => !value
    ),
    developers: choose(
      'developers',
      current.developers,
      incoming.developers ?? [],
      (value) => value.length === 0
    ),
    publishers: choose(
      'publishers',
      current.publishers,
      incoming.publishers ?? [],
      (value) => value.length === 0
    ),
    genres: choose('genres', current.genres, incoming.genres ?? [], (value) => value.length === 0),
    platforms: choose(
      'platforms',
      current.platforms,
      incoming.platforms ?? [],
      (value) => value.length === 0
    ),
    website: choose('website', current.website, incoming.website ?? null, (value) => !value),
    metacritic: choose(
      'metacritic',
      current.metacritic,
      incoming.metacritic ?? null,
      (value) => value === null
    ),
    showcased: current.showcased
  }
}
