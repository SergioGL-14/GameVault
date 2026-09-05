import { describe, expect, it } from 'vitest'
import {
  ValidationError,
  validateAchievementInput,
  validateGameInput,
  validateProfileInput
} from './validation'

const game = { title: 'Celeste', status: 'pendiente' } as const

describe('game validation', () => {
  it.each([
    game,
    { ...game, source: 'manual', catalogId: null },
    { ...game, source: 'steam', catalogId: 7 },
    { ...game, source: 'rawg', catalogId: Number.MAX_SAFE_INTEGER }
  ])('accepts consistent import provenance', (input) => {
    expect(() => validateGameInput(input)).not.toThrow()
  })

  it.each([
    { ...game, catalogId: 7 },
    { ...game, source: 'manual', catalogId: 7 },
    { ...game, source: 'steam' },
    { ...game, source: 'rawg', catalogId: null },
    { ...game, source: 'steam', catalogId: Number.MAX_SAFE_INTEGER + 1 }
  ])('rejects inconsistent import provenance', (input) => {
    expect(() => validateGameInput(input)).toThrow(ValidationError)
  })

  it('bounds strings and lists', () => {
    expect(() => validateGameInput({ ...game, title: 'a'.repeat(10_000) })).not.toThrow()
    expect(() =>
      validateGameInput({ ...game, developers: Array(100).fill('studio') })
    ).not.toThrow()
    expect(() => validateGameInput({ ...game, title: 'a'.repeat(10_001) })).toThrow(ValidationError)
    expect(() => validateGameInput({ ...game, developers: Array(101).fill('studio') })).toThrow(
      ValidationError
    )
    expect(() => validateGameInput({ ...game, developers: ['a'.repeat(10_001)] })).toThrow(
      ValidationError
    )
  })

  it('requires safe playtime integers', () => {
    expect(() =>
      validateGameInput({ ...game, playtimeMinutes: Number.MAX_SAFE_INTEGER })
    ).not.toThrow()
    expect(() =>
      validateGameInput({ ...game, playtimeMinutes: Number.MAX_SAFE_INTEGER + 1 })
    ).toThrow(ValidationError)
  })

  it('accepts credential-free web image and website URLs', () => {
    const maxUrl = `https://example.com/${'a'.repeat(2_048 - 'https://example.com/'.length)}`

    expect(() => validateGameInput({ ...game, coverUrl: maxUrl })).not.toThrow()
    expect(() =>
      validateGameInput({ ...game, coverUrl: 'http://example.com/legacy-cover.jpg' })
    ).not.toThrow()
    expect(() => validateGameInput({ ...game, website: 'http://example.com' })).not.toThrow()
    expect(() => validateGameInput({ ...game, website: 'https://user:pass@example.com' })).toThrow(
      ValidationError
    )
    expect(() => validateGameInput({ ...game, coverUrl: `${maxUrl}a` })).toThrow(ValidationError)
  })
})

describe('achievement validation', () => {
  it.each([
    { name: 'Primer paso', unlocked: false },
    {
      name: 'Coleccionista',
      description: 'Encuentra todos los objetos.',
      iconUrl: 'https://images.example/achievement.png',
      unlocked: true,
      unlockedAt: '2026-08-31'
    }
  ])('accepts valid achievement input', (input) => {
    expect(() => validateAchievementInput(input)).not.toThrow()
  })

  it.each([
    null,
    { name: ' ', unlocked: false },
    { name: 'Primer paso', unlocked: 'no' },
    { name: 'Primer paso', unlocked: false, iconUrl: 'file:///secret.png' },
    { name: 'Primer paso', unlocked: false, iconUrl: 'http://images.example/icon.png' },
    { name: 'Primer paso', unlocked: true, unlockedAt: '2026-02-30' },
    { name: 'Primer paso', unlocked: false, unlockedAt: '2026-08-31' }
  ])('rejects invalid achievement input', (input) => {
    expect(() => validateAchievementInput(input)).toThrow(ValidationError)
  })
})

describe('profile validation', () => {
  const profile = {
    displayName: 'Jugador',
    about: '',
    location: '',
    avatarUrl: null,
    backgroundUrl: null
  }

  it('bounds text and accepts credential-free web images', () => {
    expect(() => validateProfileInput({ ...profile, about: 'a'.repeat(262_144) })).not.toThrow()
    expect(() => validateProfileInput({ ...profile, about: 'a'.repeat(262_145) })).toThrow(
      ValidationError
    )
    expect(() =>
      validateProfileInput({ ...profile, avatarUrl: 'http://example.com/avatar.jpg' })
    ).not.toThrow()
    expect(() =>
      validateProfileInput({ ...profile, avatarUrl: 'https://user@example.com/avatar.jpg' })
    ).toThrow(ValidationError)
  })
})
