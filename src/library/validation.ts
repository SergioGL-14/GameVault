import { GAME_STATUSES, type AchievementInput, type GameInput, type ProfileInput } from './model'
import { parseManagedImageReference } from './managed-image'

const MAX_STRING_LENGTH = 10_000
const MAX_LONG_TEXT_LENGTH = 262_144
const MAX_LIST_LENGTH = 100
const MAX_URL_LENGTH = 2_048

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

function validateWebUrl(
  value: string | null | undefined,
  label: string,
  protocol: 'https' | 'http-or-https' = 'http-or-https'
): void {
  if (!value) return
  try {
    if (value.length > MAX_URL_LENGTH) throw new Error()
    const url = new URL(value)
    if (
      (protocol === 'https'
        ? url.protocol !== 'https:'
        : url.protocol !== 'https:' && url.protocol !== 'http:') ||
      url.username ||
      url.password
    ) {
      throw new Error()
    }
  } catch {
    throw new ValidationError(
      `${label} debe ser una URL ${protocol === 'https' ? 'https' : 'http o https'} válida`
    )
  }
}

function validateManagedImageUrl(value: string | null | undefined, label: string): void {
  if (!value || parseManagedImageReference(value)) return
  validateWebUrl(value, label, 'https')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateOptionalString(
  value: unknown,
  label: string,
  nullable = false,
  maximumLength = MAX_STRING_LENGTH
): asserts value is string | null | undefined {
  if (value === undefined || (nullable && value === null)) return
  if (typeof value !== 'string' || value.length > maximumLength) {
    throw new ValidationError(`${label} no es válido`)
  }
}

function validateStringList(value: unknown, label: string): asserts value is string[] | undefined {
  if (value === undefined) return
  if (
    !Array.isArray(value) ||
    value.length > MAX_LIST_LENGTH ||
    value.some((entry) => typeof entry !== 'string' || entry.length > MAX_STRING_LENGTH)
  ) {
    throw new ValidationError(`${label} no es válido`)
  }
}

/** Validates untrusted game data and narrows it to the library input contract. */
export function validateGameInput(input: unknown): asserts input is GameInput {
  if (!isRecord(input) || typeof input.title !== 'string' || typeof input.status !== 'string') {
    throw new ValidationError('Los datos del juego no son válidos')
  }

  const title = input.title.trim()
  if (!title || input.title.length > MAX_STRING_LENGTH) {
    throw new ValidationError('El título no puede estar vacío o ser demasiado largo')
  }

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
    !Number.isSafeInteger(playtimeMinutes) ||
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

  validateOptionalString(input.description, 'La descripción', false, MAX_LONG_TEXT_LENGTH)
  validateOptionalString(input.notes, 'Las notas', false, MAX_LONG_TEXT_LENGTH)
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

  const source = input.source ?? 'manual'
  const validCatalogId =
    typeof input.catalogId === 'number' &&
    Number.isSafeInteger(input.catalogId) &&
    input.catalogId > 0
  // Source records import provenance, not ownership on a future gaming platform.
  if (
    (source === 'manual' && input.catalogId != null) ||
    (source !== 'manual' && !validCatalogId)
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
  validateManagedImageUrl(input.coverUrl, 'La carátula')
  validateManagedImageUrl(input.backgroundUrl, 'El fondo')
  validateWebUrl(input.website, 'El sitio oficial')
  for (const screenshot of input.screenshots ?? []) {
    validateWebUrl(screenshot, 'Cada captura', 'https')
  }
}

/** Validates untrusted achievement data, including its unlock-state consistency. */
export function validateAchievementInput(input: unknown): asserts input is AchievementInput {
  if (!isRecord(input) || typeof input.name !== 'string' || typeof input.unlocked !== 'boolean') {
    throw new ValidationError('Los datos del logro no son válidos')
  }
  if (!input.name.trim() || input.name.length > MAX_STRING_LENGTH) {
    throw new ValidationError('El nombre del logro no puede estar vacío o ser demasiado largo')
  }

  validateOptionalString(input.description, 'La descripción', false, MAX_LONG_TEXT_LENGTH)
  validateOptionalString(input.iconUrl, 'El icono', true)
  validateOptionalString(input.unlockedAt, 'La fecha de desbloqueo', true)
  validateWebUrl(input.iconUrl, 'El icono', 'https')

  if (input.unlockedAt) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.unlockedAt)
    const date = match ? new Date(`${input.unlockedAt}T00:00:00Z`) : null
    if (!date || date.toISOString().slice(0, 10) !== input.unlockedAt) {
      throw new ValidationError('La fecha de desbloqueo no es válida')
    }
  }
  if (!input.unlocked && input.unlockedAt) {
    throw new ValidationError('Un logro bloqueado no puede tener fecha de desbloqueo')
  }
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

  if (!input.displayName.trim() || input.displayName.length > MAX_STRING_LENGTH) {
    throw new ValidationError('El nombre de perfil no puede estar vacío o ser demasiado largo')
  }
  validateOptionalString(input.about, 'La biografía', false, MAX_LONG_TEXT_LENGTH)
  validateOptionalString(input.location, 'La ubicación')
  validateManagedImageUrl(input.avatarUrl, 'El avatar')
  validateManagedImageUrl(input.backgroundUrl, 'El fondo')
}
