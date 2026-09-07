import { createSecureKeyStore, type Encryption, type SecureKeyStore } from '../secure-key-store'

export type SteamKeyStore = SecureKeyStore

/** Creates the encrypted saved Steam Web API key store. */
export function createSteamKeyStore(
  file: string,
  encryption: Encryption,
  isSecureStorageAvailable: () => boolean = () => encryption.isEncryptionAvailable()
): SteamKeyStore {
  return createSecureKeyStore(
    file,
    encryption,
    () => undefined,
    'La clave de Steam no es válida',
    isSecureStorageAvailable
  )
}
