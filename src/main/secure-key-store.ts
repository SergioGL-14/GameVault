import { existsSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { CatalogStatus } from '../catalog/model'

export interface Encryption {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

export interface SecureKeyStore {
  get(): string | null
  status(): CatalogStatus
  save(key: string): CatalogStatus
  clear(): CatalogStatus
}

export class SecureStorageError extends Error {
  constructor() {
    super('El cifrado seguro del sistema no está disponible')
    this.name = 'SecureStorageError'
  }
}

/** Stores one provider key using OS encryption, with an optional environment override. */
export function createSecureKeyStore(
  file: string,
  encryption: Encryption,
  readEnvironment: () => string | undefined,
  invalidMessage: string,
  isSecureStorageAvailable: () => boolean = () => encryption.isEncryptionAvailable()
): SecureKeyStore {
  function normalizeKey(key: string): string {
    const normalized = key.trim()
    if (!normalized || normalized.length > 256) throw new Error(invalidMessage)
    return normalized
  }

  function environmentKey(): string | null {
    const key = readEnvironment()
    return key === undefined || !key.trim() ? null : normalizeKey(key)
  }

  function savedKey(): string | null {
    if (!existsSync(file)) return null
    if (!isSecureStorageAvailable()) throw new SecureStorageError()
    return normalizeKey(encryption.decryptString(readFileSync(file)))
  }

  function status(): CatalogStatus {
    if (environmentKey()) return { configured: true, source: 'environment' }
    return { configured: existsSync(file), source: existsSync(file) ? 'saved' : null }
  }

  return {
    get: () => environmentKey() ?? savedKey(),
    status,
    save(key) {
      const normalized = normalizeKey(key)
      if (!isSecureStorageAvailable()) throw new SecureStorageError()
      const temporaryFile = `${file}.${process.pid}.${randomUUID()}.tmp`
      try {
        writeFileSync(temporaryFile, encryption.encryptString(normalized), { mode: 0o600 })
        renameSync(temporaryFile, file)
      } finally {
        rmSync(temporaryFile, { force: true })
      }
      return status()
    },
    clear() {
      if (existsSync(file)) unlinkSync(file)
      return status()
    }
  }
}
