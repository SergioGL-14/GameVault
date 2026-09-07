import { BrowserWindow, session } from 'electron'
import { CatalogError, type CatalogFailureKind } from '../../catalog/model'
import type {
  SteamCommunityAchievement,
  SteamWebAuthentication,
  SteamWebSession
} from '../../steam/model'
import { parseSteamIdentity } from './web-api'

const PARTITION = 'persist:gamevault-steam'
const LOGIN_URL = 'https://store.steampowered.com/explore/'
const ALLOWED_HOSTS = new Set([
  'store.steampowered.com',
  'steamcommunity.com',
  'login.steampowered.com',
  'help.steampowered.com'
])
const PAGE_CREDENTIAL_SCRIPT = `(() => {
  const config = document.getElementById('application_config');
  return {
    userInfo: config?.getAttribute('data-userinfo') ?? null,
    storeUserConfig: config?.getAttribute('data-store_user_config') ?? null
  };
})()`
const COMMUNITY_ACHIEVEMENT_SCRIPT = `(() => [...document.querySelectorAll('#personalAchieve .achieveRow')].map((row) => {
  const source = row.querySelector('.achieveImgHolder img')?.src;
  if (!source) return null;
  const iconFile = decodeURIComponent(new URL(source).pathname.split('/').pop() ?? '');
  const rawDate = row.querySelector('.achieveUnlockTime')?.textContent?.trim() ?? '';
  const timestamp = rawDate ? Date.parse(rawDate.replace(/^Unlocked\\s+/, '').replace(' @ ', ' ')) : NaN;
  return { iconFile, unlockedAt: Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString().slice(0, 10) };
}).filter(Boolean))()`

function authenticationError(): CatalogError {
  return new CatalogError({ provider: 'steam', kind: 'authentication' })
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string' || value.length > 100_000) return null
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/** Parses the minimal identity and bearer token exposed by Steam's authenticated Store page. */
export function parseSteamWebAuthentication(value: unknown): SteamWebAuthentication | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const page = value as Record<string, unknown>
  const userInfo = parseJsonRecord(page.userInfo)
  const storeUserConfig = parseJsonRecord(page.storeUserConfig)
  if (!userInfo || !storeUserConfig || userInfo.logged_in !== true) return null

  const identity =
    typeof userInfo.steamid === 'string' ? parseSteamIdentity(userInfo.steamid) : null
  const token = storeUserConfig.webapi_token
  if (
    !identity ||
    identity.kind !== 'id' ||
    typeof token !== 'string' ||
    !token.trim() ||
    token.length > 2_048
  ) {
    return null
  }
  return {
    steamId: identity.value,
    credential: { kind: 'web-session', value: token.trim() }
  }
}

/** Allows top-level navigation only across Steam-owned HTTPS login surfaces. */
export function isAllowedSteamNavigation(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' && ALLOWED_HOSTS.has(url.hostname) && !url.username && !url.password
    )
  } catch {
    return false
  }
}

/** Returns validated Community achievement rows or rejects malformed page data. */
export function parseSteamCommunityAchievements(value: unknown): SteamCommunityAchievement[] {
  if (!Array.isArray(value) || value.length > 10_000) {
    throw new CatalogError({ provider: 'steam', kind: 'provider-response' })
  }
  const seen = new Set<string>()
  const rows: SteamCommunityAchievement[] = []
  for (const row of value) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      throw new CatalogError({ provider: 'steam', kind: 'provider-response' })
    }
    const record = row as Record<string, unknown>
    if (
      typeof record.iconFile !== 'string' ||
      !record.iconFile ||
      record.iconFile.length > 512 ||
      record.iconFile.includes('/') ||
      record.iconFile.includes('\\') ||
      (record.unlockedAt !== null &&
        (typeof record.unlockedAt !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}$/.test(record.unlockedAt))) ||
      seen.has(record.iconFile)
    ) {
      throw new CatalogError({ provider: 'steam', kind: 'provider-response' })
    }
    seen.add(record.iconFile)
    rows.push({ iconFile: record.iconFile, unlockedAt: record.unlockedAt as string | null })
  }
  return rows
}

/** Classifies the final Community response before extracted rows are trusted. */
export function classifySteamCommunityPage(
  pageUrl: string,
  status: number,
  steamId: string,
  appId: number
): CatalogFailureKind | null {
  if (status === 401 || status === 403) return 'authentication'
  if (status === 429) return 'rate-limit'
  if (status >= 400) return 'provider-response'
  try {
    const url = new URL(pageUrl)
    const expectedPath = `/profiles/${steamId}/stats/${appId}/achievements`
    return url.protocol === 'https:' &&
      url.hostname === 'steamcommunity.com' &&
      url.pathname.replace(/\/$/, '') === expectedPath
      ? null
      : 'authentication'
  } catch {
    return 'provider-response'
  }
}

/** Creates an isolated Steam browser session; passwords remain inside Steam's own pages. */
export function createSteamWebSession(): SteamWebSession {
  const steamSession = session.fromPartition(PARTITION)
  steamSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))

  async function clear(): Promise<void> {
    await Promise.all([
      steamSession.clearStorageData({ storages: ['cookies', 'localstorage'] }),
      steamSession.clearCache()
    ])
  }

  async function readAuthentication(visible: boolean): Promise<SteamWebAuthentication> {
    return new Promise((resolve, reject) => {
      const window = new BrowserWindow({
        width: 560,
        height: 760,
        minWidth: 480,
        minHeight: 640,
        show: false,
        autoHideMenuBar: true,
        title: 'Iniciar sesión en Steam',
        webPreferences: {
          partition: PARTITION,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false
        }
      })
      let settled = false
      const timeout = setTimeout(
        () => finish(authenticationError()),
        visible ? 5 * 60 * 1000 : 20_000
      )

      function finish(reason: SteamWebAuthentication | Error): void {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        if (!window.isDestroyed()) window.close()
        if (reason instanceof Error) reject(reason)
        else resolve(reason)
      }

      async function inspectPage(): Promise<void> {
        if (settled || !isAllowedSteamNavigation(window.webContents.getURL())) return
        try {
          const value: unknown = await window.webContents.executeJavaScript(
            PAGE_CREDENTIAL_SCRIPT,
            true
          )
          const authentication = parseSteamWebAuthentication(value)
          if (authentication) finish(authentication)
          else if (!visible) finish(authenticationError())
        } catch {
          if (!visible) finish(authenticationError())
        }
      }

      function guardNavigation(event: Electron.Event, url: string): void {
        if (!isAllowedSteamNavigation(url)) event.preventDefault()
      }

      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      window.webContents.on('will-navigate', guardNavigation)
      window.webContents.on('will-redirect', guardNavigation)
      window.webContents.on('did-finish-load', () => void inspectPage())
      window.once('ready-to-show', () => {
        if (visible) window.show()
      })
      window.once('closed', () => {
        if (!settled) finish(authenticationError())
      })
      void window.loadURL(LOGIN_URL).catch(() => finish(authenticationError()))
    })
  }

  async function getCommunityAchievements(
    steamId: string,
    appId: number
  ): Promise<SteamCommunityAchievement[]> {
    const identity = parseSteamIdentity(steamId)
    if (
      !identity ||
      identity.kind !== 'id' ||
      !Number.isSafeInteger(appId) ||
      appId <= 0 ||
      appId > 4_294_967_295
    ) {
      throw new CatalogError({ provider: 'steam', kind: 'invalid-input' })
    }
    const window = new BrowserWindow({
      show: false,
      webPreferences: {
        partition: PARTITION,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    function guardNavigation(event: Electron.Event, url: string): void {
      if (!isAllowedSteamNavigation(url)) event.preventDefault()
    }
    window.webContents.on('will-navigate', guardNavigation)
    window.webContents.on('will-redirect', guardNavigation)
    let responseStatus = 0
    window.webContents.on('did-navigate', (_event, _url, httpResponseCode) => {
      responseStatus = httpResponseCode
    })
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        window.loadURL(
          `https://steamcommunity.com/profiles/${identity.value}/stats/${appId}/achievements?l=english`
        ),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(authenticationError()), 20_000)
        })
      ])
      const pageFailure = classifySteamCommunityPage(
        window.webContents.getURL(),
        responseStatus,
        identity.value,
        appId
      )
      if (pageFailure) throw new CatalogError({ provider: 'steam', kind: pageFailure })
      const value: unknown = await window.webContents.executeJavaScript(
        COMMUNITY_ACHIEVEMENT_SCRIPT,
        true
      )
      const rows = parseSteamCommunityAchievements(value)
      return rows
    } catch (cause) {
      if (cause instanceof CatalogError) throw cause
      const pageFailure = classifySteamCommunityPage(
        window.webContents.getURL(),
        responseStatus,
        identity.value,
        appId
      )
      if (pageFailure) throw new CatalogError({ provider: 'steam', kind: pageFailure })
      throw new CatalogError({ provider: 'steam', kind: 'provider-response' })
    } finally {
      if (timeout) clearTimeout(timeout)
      if (!window.isDestroyed()) window.close()
    }
  }

  return {
    async login() {
      await clear()
      return readAuthentication(true)
    },
    restore: () => readAuthentication(false),
    getCommunityAchievements,
    clear
  }
}
