import type { CatalogGameDetail, Game, GameInput } from '../../../shared/types'

export function gameToInput(game: Game): GameInput {
  return {
    source: game.source,
    catalogId: game.catalogId,
    title: game.title,
    description: game.description,
    status: game.status,
    playtimeMinutes: game.playtimeMinutes,
    rating: game.rating,
    notes: game.notes,
    coverUrl: game.coverUrl,
    backgroundUrl: game.backgroundUrl,
    screenshots: game.screenshots,
    releasedAt: game.releasedAt,
    developers: game.developers,
    publishers: game.publishers,
    genres: game.genres,
    platforms: game.platforms,
    website: game.website,
    metacritic: game.metacritic,
    showcased: game.showcased
  }
}

export function catalogGameToInput(game: CatalogGameDetail): GameInput {
  return {
    source: game.source,
    catalogId: game.catalogId,
    title: game.title,
    description: game.description,
    status: 'pendiente',
    coverUrl: game.coverUrl,
    backgroundUrl: game.backgroundUrl,
    screenshots: game.screenshots,
    releasedAt: game.releasedAt,
    developers: game.developers,
    publishers: game.publishers,
    genres: game.genres,
    platforms: game.platforms,
    website: game.website,
    metacritic: game.metacritic
  }
}
