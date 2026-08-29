import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createCatalogKeyStore, type Encryption } from './catalog-key-store'

const encryption: Encryption = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`encrypted:${value}`),
  decryptString: (value) => value.toString().replace(/^encrypted:/, '')
}

describe('almacén cifrado de clave RAWG', () => {
  it('guarda, recupera y elimina sin escribir el secreto en claro', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gamevault-key-'))
    const file = join(directory, 'rawg-key.bin')
    try {
      const store = createCatalogKeyStore(file, encryption, () => undefined)
      expect(store.status()).toEqual({ configured: false, source: null })
      expect(store.save(' personal-key ')).toEqual({ configured: true, source: 'saved' })
      expect(readFileSync(file, 'utf8')).not.toBe('personal-key')
      expect(store.get()).toBe('personal-key')
      expect(store.clear()).toEqual({ configured: false, source: null })
      expect(existsSync(file)).toBe(false)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('prioriza la variable de entorno y falla si no hay cifrado', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gamevault-key-'))
    const file = join(directory, 'rawg-key.bin')
    try {
      writeFileSync(file, encryption.encryptString('saved-key'))
      const fromEnvironment = createCatalogKeyStore(file, encryption, () => 'environment-key')
      expect(fromEnvironment.get()).toBe('environment-key')
      expect(fromEnvironment.status()).toEqual({ configured: true, source: 'environment' })

      const unavailable = createCatalogKeyStore(
        join(directory, 'other-key.bin'),
        { ...encryption, isEncryptionAvailable: () => false },
        () => undefined
      )
      expect(() => unavailable.save('key')).toThrow('cifrado seguro')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
