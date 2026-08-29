import type { GameVaultApi } from '../desktop-api'

declare global {
  interface Window {
    api: GameVaultApi
  }
}
