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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateOptionalString(
  value: unknown,
  label: string,
  nullable = false
): asserts value is string | null | undefined {
  if (value === undefined || (nullable && value === null)) return
  if (typeof value !== 'string') throw new ValidationError(`${label} no es válido`)
}

function validateStringList(value: unknown, label: string): asserts value is string[] | undefined {
  if (value === undefined) return
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new ValidationError(`${label} no es válido`)
  }
}

/** Validates untrusted game data and narrows it to the library input contract. */
export function validateGameInput(input: unknown): asserts input is GameInput {
  if (!isRecord(input) || typeof input.title !== 'string' || typeof input.status !== 'string') {
    throw new ValidationError('Los datos del juego no son válidos')
  }

  const title = input.title.trim()
  if (!title) throw new ValidationError('El título no puede estar vacío')

  if (!GAME_STATUSES.includes(input.status as GameInput['status'])) {
    throw new ValidationError(`Estado no válido: ${input.status}`)
  }

  if (
    input.source !== undefined &&
    input.source !== 'manual' &&
    input.source !== 'steam' &&
    input.source !== 'rawg'
  ) {
    throw new ValidationError('El origen del juego no es válido')
  }

  const playtimeMinutes = input.playtimeMinutes === undefined ? 0 : input.playtimeMinutes
  if (
    typeof playtimeMinutes !== 'number' ||
    !Number.isInteger(playtimeMinutes) ||
    playtimeMinutes < 0
  ) {
    throw new ValidationError('El tiempo jugado debe ser un número entero no negativo')
  }

  const rating = input.rating ?? null
  if (
    rating !== null &&
    (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 10)
  ) {
    throw new ValidationError('La puntuación debe estar entre 1 y 10')
  }

  validateOptionalString(input.description, 'La descripción')
  validateOptionalString(input.notes, 'Las notas')
  validateOptionalString(input.coverUrl, 'La carátula', true)
  validateOptionalString(input.backgroundUrl, 'El fondo', true)
  validateOptionalString(input.releasedAt, 'La fecha de lanzamiento', true)
  validateOptionalString(input.website, 'El sitio oficial', true)
  validateStringList(input.screenshots, 'Las capturas')
  validateStringList(input.developers, 'Los desarrolladores')
  validateStringList(input.publishers, 'Los distribuidores')
  validateStringList(input.genres, 'Los géneros')
  validateStringList(input.platforms, 'Las plataformas')
  if (input.showcased !== undefined && typeof input.showcased !== 'boolean') {
    throw new ValidationError('El estado del expositor no es válido')
  }

  if (
    input.catalogId != null &&
    (typeof input.catalogId !== 'number' ||
      !Number.isInteger(input.catalogId) ||
      input.catalogId <= 0)
  ) {
    throw new ValidationError('El identificador del catálogo no es válido')
  }

  const metacritic = input.metacritic ?? null
  if (
    metacritic !== null &&
    (typeof metacritic !== 'number' ||
      !Number.isInteger(metacritic) ||
      metacritic < 0 ||
      metacritic > 100)
  ) {
    throw new ValidationError('La puntuación de Metacritic no es válida')
  }
  validateWebUrl(input.coverUrl, 'La carátula')
  validateWebUrl(input.backgroundUrl, 'El fondo')
  validateWebUrl(input.website, 'El sitio oficial')
  for (const screenshot of input.screenshots ?? []) validateWebUrl(screenshot, 'Cada captura')
}

/** Validates untrusted profile data and narrows it to the profile input contract. */
export function validateProfileInput(input: unknown): asserts input is ProfileInput {
  if (
    !isRecord(input) ||
    typeof input.displayName !== 'string' ||
    typeof input.about !== 'string' ||
    typeof input.location !== 'string' ||
    (input.avatarUrl !== null && typeof input.avatarUrl !== 'string') ||
    (input.backgroundUrl !== null && typeof input.backgroundUrl !== 'string')
  ) {
    throw new ValidationError('Los datos del perfil no son válidos')
  }

  if (!input.displayName.trim()) {
    throw new ValidationError('El nombre de perfil no puede estar vacío')
  }
  validateWebUrl(input.avatarUrl, 'El avatar')
  validateWebUrl(input.backgroundUrl, 'El fondo')
}
