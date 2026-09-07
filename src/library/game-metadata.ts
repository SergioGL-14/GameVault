import type { Game, GameInput } from './model'

/** Normalizes a title for conservative exact matching without fuzzy edition conflation. */
export function normalizeGameTitle(title: string): string {
  return title.trim().toLocaleLowerCase('en-US')
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
