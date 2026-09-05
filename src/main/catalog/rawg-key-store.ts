import { existsSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
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
  readEnvironment: () => string | undefined = () => process.env.RAWG_API_KEY,
  isSecureStorageAvailable: () => boolean = () => encryption.isEncryptionAvailable()
): CatalogKeyStore {
  function normalizeKey(key: string): string {
    const normalized = key.trim()
    if (!normalized || normalized.length > 256) throw new Error('La clave de RAWG no es válida')
    return normalized
  }

  function environmentKey(): string | null {
    const key = readEnvironment()
    return key === undefined || !key.trim() ? null : normalizeKey(key)
  }

  function savedKey(): string | null {
    if (!existsSync(file)) return null
    if (!isSecureStorageAvailable()) {
      throw new Error('El cifrado seguro del sistema no está disponible')
    }
    return normalizeKey(encryption.decryptString(readFileSync(file)))
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
      const normalized = normalizeKey(key)
      if (!isSecureStorageAvailable()) {
        throw new Error('El cifrado seguro del sistema no está disponible')
      }
      const temporaryFile = `${file}.${process.pid}.${randomUUID()}.tmp`
      try {
        writeFileSync(temporaryFile, encryption.encryptString(normalized), { mode: 0o600 })
        renameSync(temporaryFile, file)
      } finally {
        rmSync(temporaryFile, { force: true })
      }
      return status()
    },

    clear(): CatalogStatus {
      if (existsSync(file)) unlinkSync(file)
      return status()
    }
  }
}
