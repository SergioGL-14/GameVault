import { createSecureKeyStore, type Encryption, type SecureKeyStore } from '../secure-key-store'

export type { Encryption }
export type CatalogKeyStore = SecureKeyStore

/** Creates the encrypted RAWG key store with environment-key precedence. */
export function createCatalogKeyStore(
  file: string,
  encryption: Encryption,
  readEnvironment: () => string | undefined = () => process.env.RAWG_API_KEY,
  isSecureStorageAvailable: () => boolean = () => encryption.isEncryptionAvailable()
): CatalogKeyStore {
  return createSecureKeyStore(
    file,
    encryption,
    readEnvironment,
    'La clave de RAWG no es válida',
    isSecureStorageAvailable
  )
}
