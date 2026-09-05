import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createCatalogKeyStore, type Encryption } from './rawg-key-store'

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

  it('rechaza un backend inseguro sin impedir la clave de entorno', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gamevault-key-'))
    const file = join(directory, 'rawg-key.bin')
    try {
      const unavailable = createCatalogKeyStore(
        file,
        encryption,
        () => undefined,
        () => false
      )
      expect(() => unavailable.save('key')).toThrow('cifrado seguro')

      const fromEnvironment = createCatalogKeyStore(
        file,
        encryption,
        () => 'environment-key',
        () => false
      )
      expect(fromEnvironment.get()).toBe('environment-key')
      expect(fromEnvironment.status()).toEqual({ configured: true, source: 'environment' })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('reemplaza la clave mediante un archivo temporal en el mismo directorio', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gamevault-key-'))
    const file = join(directory, 'rawg-key.bin')
    try {
      const store = createCatalogKeyStore(file, encryption, () => undefined)
      store.save('old-key')
      store.save('new-key')

      expect(store.get()).toBe('new-key')
      expect(readdirSync(directory)).toEqual(['rawg-key.bin'])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('elimina el archivo temporal cuando no puede reemplazar el destino', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gamevault-key-'))
    const file = join(directory, 'rawg-key.bin')
    try {
      mkdirSync(file)
      const store = createCatalogKeyStore(file, encryption, () => undefined)

      expect(() => store.save('new-key')).toThrow()
      expect(readdirSync(directory)).toEqual(['rawg-key.bin'])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it.each(['', ' '.repeat(4), 'x'.repeat(257)])('rechaza una clave descifrada no válida', (key) => {
    const directory = mkdtempSync(join(tmpdir(), 'gamevault-key-'))
    const file = join(directory, 'rawg-key.bin')
    try {
      writeFileSync(file, Buffer.from('encrypted'))
      const store = createCatalogKeyStore(
        file,
        { ...encryption, decryptString: () => key },
        () => undefined
      )
      expect(() => store.get()).toThrow('no es válida')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
