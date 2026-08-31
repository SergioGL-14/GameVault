import { describe, expect, it } from 'vitest'
import type { CatalogFailureKind } from '../../../catalog/model'
import { catalogFailureMessage } from './catalog-failure'

describe('catalog failure messages', () => {
  it.each([
    ['invalid-input', 'Revisa'],
    ['offline', 'conexión'],
    ['timeout', 'tardando'],
    ['authentication', 'Sustitúyela o elimínala'],
    ['rate-limit', 'limitado temporalmente'],
    ['provider-response', 'no pudo interpretar']
  ] satisfies [CatalogFailureKind, string][])('describes %s failures in Spanish', (kind, copy) => {
    expect(catalogFailureMessage({ provider: 'rawg', kind })).toContain(copy)
  })
})
