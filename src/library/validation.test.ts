import { describe, expect, it } from 'vitest'
import { ValidationError, validateAchievementInput } from './validation'

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
