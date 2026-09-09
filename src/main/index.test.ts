import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { join } from 'path'

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
    showOpenDialog: vi.fn<() => Promise<{ canceled: boolean; filePaths: string[] }>>(() =>
      Promise.resolve({ canceled: true, filePaths: [] })
    ),
    showErrorBox: vi.fn(),
    registerSchemesAsPrivileged: vi.fn(),
    protocolHandle: vi.fn(),
    setAppUserModelId: vi.fn(),
    watchWindowShortcuts: vi.fn(),
    steamSession: {
      setPermissionRequestHandler: vi.fn(),
      clearStorageData: vi.fn(() => Promise.resolve()),
      clearCache: vi.fn(() => Promise.resolve())
    },
    openDatabase: vi.fn(() => ({ database: true })),
    registerIpc:
      vi.fn<
        (
          repo: unknown,
          steamCatalog: unknown,
          rawgCatalog: unknown,
          catalogKey: unknown,
          selectLocalImage: () => Promise<string | null>
        ) => void
      >(),
    createLibraryRepository: vi.fn(() => ({ repository: true })),
    createManagedImageRequestHandler: vi.fn(() => vi.fn()),
    createRemoteManagedImageImporter: vi.fn(() => vi.fn()),
    selectManagedImage: vi.fn<
      (directory: string, pickFile: () => Promise<string | null>) => Promise<string | null>
    >(() => Promise.resolve(null))
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
  dialog: { showErrorBox: mocks.showErrorBox, showOpenDialog: mocks.showOpenDialog },
  protocol: {
    registerSchemesAsPrivileged: mocks.registerSchemesAsPrivileged,
    handle: mocks.protocolHandle
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    getSelectedStorageBackend: vi.fn(() => 'unknown'),
    encryptString: vi.fn(),
    decryptString: vi.fn()
  },
  shell: { openExternal: mocks.openExternal },
  session: { fromPartition: vi.fn(() => mocks.steamSession) }
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
vi.mock('./images/managed-images', () => ({
  createManagedImageRequestHandler: mocks.createManagedImageRequestHandler,
  createRemoteManagedImageImporter: mocks.createRemoteManagedImageImporter,
  selectManagedImage: mocks.selectManagedImage
}))

beforeAll(async () => {
  await import('./index')
  expect(mocks.registerSchemesAsPrivileged).toHaveBeenCalledWith([
    {
      scheme: 'gamevault-image',
      privileges: { secure: true, standard: true, supportFetchAPI: true }
    }
  ])
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
    expect(mocks.createManagedImageRequestHandler).toHaveBeenCalledWith(join('user-data', 'images'))
    expect(mocks.protocolHandle).toHaveBeenCalledWith('gamevault-image', expect.any(Function))
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

  it('limits local image selection to a native image picker', async () => {
    mocks.readyCallback?.()
    const selectLocalImage = mocks.registerIpc.mock.calls[0][4]
    mocks.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['cover.png'] })

    await selectLocalImage()

    expect(mocks.selectManagedImage).toHaveBeenCalledWith(
      join('user-data', 'images'),
      expect.any(Function)
    )
    const pickFile = mocks.selectManagedImage.mock.calls[0][1]
    await expect(pickFile()).resolves.toBe('cover.png')
    expect(mocks.showOpenDialog).toHaveBeenCalledWith({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
    })
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
