import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import type { CatalogStatus } from '../../catalog/model'

export interface CatalogKeyStore {
  get(): string | null
  status(): CatalogStatus
  save(key: string): CatalogStatus
  clear(): CatalogStatus
}

export interface Encryption {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

export function createCatalogKeyStore(
  file: string,
  encryption: Encryption,
  readEnvironment: () => string | undefined = () => process.env.RAWG_API_KEY
): CatalogKeyStore {
  function environmentKey(): string | null {
    return readEnvironment()?.trim() || null
  }

  function savedKey(): string | null {
    if (!existsSync(file)) return null
    if (!encryption.isEncryptionAvailable()) {
      throw new Error('El cifrado seguro del sistema no está disponible')
    }
    return encryption.decryptString(readFileSync(file))
  }

  function status(): CatalogStatus {
    if (environmentKey()) return { configured: true, source: 'environment' }
    return { configured: existsSync(file), source: existsSync(file) ? 'saved' : null }
  }

  return {
    get(): string | null {
      return environmentKey() ?? savedKey()
    },

    status(): CatalogStatus {
      return status()
    },

    save(key: string): CatalogStatus {
      const normalized = key.trim()
      if (!normalized || normalized.length > 256) throw new Error('La clave de RAWG no es válida')
      if (!encryption.isEncryptionAvailable()) {
        throw new Error('El cifrado seguro del sistema no está disponible')
      }
      writeFileSync(file, encryption.encryptString(normalized), { mode: 0o600 })
      return status()
    },

    clear(): CatalogStatus {
      if (existsSync(file)) unlinkSync(file)
      return status()
    }
  }
}
