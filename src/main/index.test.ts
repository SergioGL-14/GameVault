import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const window = {
    on: vi.fn(),
    show: vi.fn(),
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    webContents: {
      setWindowOpenHandler: vi.fn(),
      on: vi.fn()
    }
  }
  return {
    window,
    BrowserWindow: Object.assign(
      vi.fn(function BrowserWindow() {
        return window
      }),
      { getAllWindows: vi.fn(() => []) }
    ),
    appOn: vi.fn(),
    getPath: vi.fn(() => 'user-data'),
    quit: vi.fn(),
    readyCallback: undefined as (() => void) | undefined,
    openExternal: vi.fn(() => Promise.resolve()),
    showErrorBox: vi.fn(),
    setAppUserModelId: vi.fn(),
    watchWindowShortcuts: vi.fn(),
    openDatabase: vi.fn(() => ({ database: true })),
    registerIpc: vi.fn(),
    createLibraryRepository: vi.fn(() => ({ repository: true }))
  }
})

vi.mock('electron', () => ({
  app: {
    whenReady: () => ({
      then: (callback: () => void) => {
        mocks.readyCallback = callback
      }
    }),
    on: mocks.appOn,
    getPath: mocks.getPath,
    quit: mocks.quit
  },
  BrowserWindow: mocks.BrowserWindow,
  dialog: { showErrorBox: mocks.showErrorBox },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    getSelectedStorageBackend: vi.fn(() => 'unknown'),
    encryptString: vi.fn(),
    decryptString: vi.fn()
  },
  shell: { openExternal: mocks.openExternal }
}))
vi.mock('@electron-toolkit/utils', () => ({
  electronApp: { setAppUserModelId: mocks.setAppUserModelId },
  optimizer: { watchWindowShortcuts: mocks.watchWindowShortcuts },
  is: { dev: false }
}))
vi.mock('../../build/icon.png?asset', () => ({ default: 'icon' }))
vi.mock('./library/sqlite-database', () => ({ openDatabase: mocks.openDatabase }))
vi.mock('./library/sqlite-library', () => ({
  createLibraryRepository: mocks.createLibraryRepository
}))
vi.mock('./ipc', () => ({ registerIpc: mocks.registerIpc }))
vi.mock('./catalog/rawg-key-store', () => ({ createCatalogKeyStore: vi.fn(() => ({})) }))
vi.mock('./catalog/rawg', () => ({ createRawgCatalog: vi.fn(() => ({})) }))
vi.mock('./catalog/steam', () => ({ createSteamCatalog: vi.fn(() => ({})) }))

beforeAll(async () => {
  await import('./index')
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.openDatabase.mockReturnValue({ database: true })
})

describe('inicio seguro de la aplicación', () => {
  it('crea una ventana aislada y bloquea toda navegación interna', async () => {
    mocks.openExternal.mockRejectedValueOnce(new Error('browser unavailable'))
    mocks.readyCallback?.()

    expect(mocks.setAppUserModelId).toHaveBeenCalledWith('com.sergiogl14.gamevault')
    expect(mocks.BrowserWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        webPreferences: expect.objectContaining({
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false
        })
      })
    )

    const windowOpenHandler = mocks.window.webContents.setWindowOpenHandler.mock.calls[0][0]
    expect(windowOpenHandler({ url: 'file:///etc/passwd' })).toEqual({ action: 'deny' })
    expect(windowOpenHandler({ url: 'https://example.com/path' })).toEqual({ action: 'deny' })

    const navigationHandler = mocks.window.webContents.on.mock.calls.find(
      ([event]) => event === 'will-navigate'
    )?.[1]
    const event = { preventDefault: vi.fn() }
    navigationHandler(event, 'javascript:alert(1)')
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(mocks.openExternal).toHaveBeenCalledOnce()
    expect(mocks.openExternal).toHaveBeenCalledWith('https://example.com/path')
    await Promise.resolve()
    expect(mocks.showErrorBox).toHaveBeenCalledWith(
      'No se pudo abrir el enlace',
      expect.stringContaining('navegador del sistema')
    )
  })

  it('muestra el fallo de base de datos en español y sale sin continuar', () => {
    mocks.openDatabase.mockImplementationOnce(() => {
      throw new Error('database failure')
    })

    mocks.readyCallback?.()

    expect(mocks.showErrorBox).toHaveBeenCalledWith(
      'Error al iniciar GameVault',
      expect.stringContaining('Tus datos no se han eliminado')
    )
    expect(mocks.quit).toHaveBeenCalledOnce()
    expect(mocks.registerIpc).not.toHaveBeenCalled()
    expect(mocks.BrowserWindow).not.toHaveBeenCalled()
  })
})
