import { GAME_STATUSES, type GameInput, type ProfileInput } from './model'

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

function validateWebUrl(value: string | null | undefined, label: string): void {
  if (!value) return
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error()
  } catch {
    throw new ValidationError(`${label} debe ser una URL http o https válida`)
  }
}

export function validateGameInput(input: GameInput): void {
  const title = input.title.trim()
  if (!title) throw new ValidationError('El título no puede estar vacío')

  if (!GAME_STATUSES.includes(input.status)) {
    throw new ValidationError(`Estado no válido: ${input.status}`)
  }

  const playtimeMinutes = input.playtimeMinutes ?? 0
  if (!Number.isInteger(playtimeMinutes) || playtimeMinutes < 0) {
    throw new ValidationError('El tiempo jugado debe ser un número entero no negativo')
  }

  const rating = input.rating ?? null
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 10)) {
    throw new ValidationError('La puntuación debe estar entre 1 y 10')
  }

  if (input.catalogId != null && (!Number.isInteger(input.catalogId) || input.catalogId <= 0)) {
    throw new ValidationError('El identificador del catálogo no es válido')
  }

  const metacritic = input.metacritic ?? null
  if (
    metacritic !== null &&
    (!Number.isInteger(metacritic) || metacritic < 0 || metacritic > 100)
  ) {
    throw new ValidationError('La puntuación de Metacritic no es válida')
  }
  validateWebUrl(input.coverUrl, 'La carátula')
  validateWebUrl(input.backgroundUrl, 'El fondo')
  validateWebUrl(input.website, 'El sitio oficial')
  for (const screenshot of input.screenshots ?? []) validateWebUrl(screenshot, 'Cada captura')
}

export function validateProfileInput(input: ProfileInput): void {
  if (!input.displayName.trim()) {
    throw new ValidationError('El nombre de perfil no puede estar vacío')
  }
  validateWebUrl(input.avatarUrl, 'El avatar')
  validateWebUrl(input.backgroundUrl, 'El fondo')
}
