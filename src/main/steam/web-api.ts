import { CatalogError } from '../../catalog/model'
import type {
  SteamAccountProvider,
  SteamAchievement,
  SteamCommunityAchievement,
  SteamCredential,
  SteamOwnedGame,
  SteamProfile
} from '../../steam/model'
import { requestCatalogJson } from '../catalog/request'

type FetchLike = typeof fetch
type CommunityAchievementReader = (
  steamId: string,
  appId: number
) => Promise<SteamCommunityAchievement[]>
type SteamIdentity = { kind: 'id'; value: string } | { kind: 'vanity'; value: string }

const MAX_STEAM_ID = 18_446_744_073_709_551_615n
const MAX_APP_ID = 4_294_967_295
const MAX_TEXT_LENGTH = 10_000
const MAX_URL_LENGTH = 2_048

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safeText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() && value.length <= MAX_TEXT_LENGTH
    ? value.trim()
    : null
}

function safeAvatar(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null
  } catch {
    return null
  }
}

/** Parses a SteamID64 or exact individual steamcommunity.com profile URL. */
export function parseSteamIdentity(input: string): SteamIdentity | null {
  const value = input.trim()
  if (/^[0-9]+$/.test(value)) {
    const id = BigInt(value)
    return id > 0n && id <= MAX_STEAM_ID ? { kind: 'id', value: id.toString() } : null
  }

  if (!value.startsWith('https://steamcommunity.com/')) return null

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'steamcommunity.com' ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname.includes('%')
  ) {
    return null
  }

  const profile = /^\/profiles\/([0-9]+)\/?$/.exec(url.pathname)
  if (profile) return parseSteamIdentity(profile[1])
  const vanity = /^\/id\/([A-Za-z0-9_-]{1,64})\/?$/.exec(url.pathname)
  return vanity ? { kind: 'vanity', value: vanity[1] } : null
}

/** Creates the official Steam Web API adapter used by explicit account refreshes. */
export function createSteamAccountProvider(
  fetcher: FetchLike = fetch,
  readCommunityAchievements: CommunityAchievementReader = async () => {
    throw new CatalogError({ provider: 'steam', kind: 'authentication' })
  }
): SteamAccountProvider {
  async function request(
    path: string,
    params: Record<string, string>,
    credential: SteamCredential
  ): Promise<unknown> {
    const value = credential.value.trim()
    if (!value || value.length > 2_048) {
      throw new CatalogError({ provider: 'steam', kind: 'invalid-input' })
    }
    const url = new URL(`https://api.steampowered.com${path}`)
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value)
    if (credential.kind === 'web-session') url.searchParams.set('access_token', value)
    return requestCatalogJson('steam', url, fetcher, true, {
      headers: credential.kind === 'api-key' ? { 'x-webapi-key': value } : undefined
    })
  }

  async function resolveSteamId(
    identity: SteamIdentity,
    credential: SteamCredential
  ): Promise<string> {
    if (identity.kind === 'id') return identity.value
    const body = await request(
      '/ISteamUser/ResolveVanityURL/v1/',
      { vanityurl: identity.value },
      credential
    )
    const response = isRecord(body) && isRecord(body.response) ? body.response : null
    return response && typeof response.steamid === 'string' && parseSteamIdentity(response.steamid)
      ? parseSteamIdentity(response.steamid)!.value
      : Promise.reject(new CatalogError({ provider: 'steam', kind: 'invalid-input' }))
  }

  function validAppId(value: number): boolean {
    return Number.isSafeInteger(value) && value > 0 && value <= MAX_APP_ID
  }

  function achievementDefinitions(
    value: unknown,
    appId: number
  ): {
    achievement: Omit<SteamAchievement, 'unlocked' | 'unlockedAt'>
    iconFile: string
    grayIconFile: string
  }[] {
    const response = isRecord(value) && isRecord(value.response) ? value.response : null
    if (
      !response ||
      (response.achievements !== undefined && !Array.isArray(response.achievements))
    ) {
      throw new CatalogError({ provider: 'steam', kind: 'provider-response' })
    }
    if (response.achievements === undefined) return []
    const ids = new Set<string>()
    return response.achievements.map((entry) => {
      if (!isRecord(entry)) {
        throw new CatalogError({ provider: 'steam', kind: 'provider-response' })
      }
      const providerId = safeText(entry.internal_name)
      const name = safeText(entry.localized_name)
      const iconFile = safeText(entry.icon)
      const grayIconFile = safeText(entry.icon_gray)
      if (
        !providerId ||
        !name ||
        !iconFile ||
        !grayIconFile ||
        iconFile.includes('/') ||
        grayIconFile.includes('/') ||
        ids.has(providerId)
      ) {
        throw new CatalogError({ provider: 'steam', kind: 'provider-response' })
      }
      ids.add(providerId)
      return {
        achievement: {
          providerId,
          name,
          description: safeText(entry.localized_desc) ?? '',
          iconUrl: `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/${appId}/${encodeURIComponent(iconFile)}`
        },
        iconFile,
        grayIconFile
      }
    })
  }

  function parseGames(value: unknown, reportedCount?: unknown): SteamOwnedGame[] {
    if (
      !Array.isArray(value) ||
      (value.length === 0 && Number.isSafeInteger(reportedCount) && (reportedCount as number) > 0)
    ) {
      throw new CatalogError({ provider: 'steam', kind: 'provider-response' })
    }
    const seen = new Set<number>()
    return value.map((entry) => {
      if (
        !isRecord(entry) ||
        !Number.isSafeInteger(entry.appid) ||
        (entry.appid as number) <= 0 ||
        (entry.appid as number) > MAX_APP_ID ||
        seen.has(entry.appid as number)
      ) {
        throw new CatalogError({ provider: 'steam', kind: 'provider-response' })
      }
      const appId = entry.appid as number
      seen.add(appId)
      return { appId, title: safeText(entry.name ?? entry.app) ?? `Steam App ${appId}` }
    })
  }

  return {
    async resolveProfile(input: string, credential: SteamCredential): Promise<SteamProfile> {
      const identity = parseSteamIdentity(input)
      if (!identity) throw new CatalogError({ provider: 'steam', kind: 'invalid-input' })
      const steamId = await resolveSteamId(identity, credential)
      const body = await request(
        '/ISteamUser/GetPlayerSummaries/v2/',
        { steamids: steamId },
        credential
      )
      const players = isRecord(body) && isRecord(body.response) ? body.response.players : null
      if (!Array.isArray(players) || players.length !== 1 || !isRecord(players[0])) {
        throw new CatalogError({ provider: 'steam', kind: 'provider-response' })
      }
      const player = players[0]
      const personaName = safeText(player.personaname)
      if (player.steamid !== steamId || !personaName) {
        throw new CatalogError({ provider: 'steam', kind: 'provider-response' })
      }
      return {
        steamId,
        personaName,
        avatarUrl: safeAvatar(player.avatarfull)
      }
    },

    async getLibraryGames(steamId: string, credential: SteamCredential): Promise<SteamOwnedGame[]> {
      const identity = parseSteamIdentity(steamId)
      if (!identity || identity.kind !== 'id') {
        throw new CatalogError({ provider: 'steam', kind: 'invalid-input' })
      }
      const body = await request(
        '/IPlayerService/GetOwnedGames/v1/',
        {
          steamid: identity.value,
          include_appinfo: 'true',
          include_played_free_games: 'true'
        },
        credential
      )
      const response = isRecord(body) && isRecord(body.response) ? body.response : null
      if (!response) throw new CatalogError({ provider: 'steam', kind: 'provider-response' })
      const games = new Map(
        parseGames(response.games, response.game_count).map((game) => [game.appId, game])
      )
      return [...games.values()]
    },

    async getAchievements(steamId, appId, credential): Promise<SteamAchievement[]> {
      const identity = parseSteamIdentity(steamId)
      if (!identity || identity.kind !== 'id' || !validAppId(appId)) {
        throw new CatalogError({ provider: 'steam', kind: 'invalid-input' })
      }

      if (credential.kind === 'web-session') {
        const url = new URL('https://api.steampowered.com/IPlayerService/GetGameAchievements/v1/')
        url.search = new URLSearchParams({ appid: String(appId), language: 'spanish' }).toString()
        const definitions = achievementDefinitions(
          await requestCatalogJson('steam', url, fetcher),
          appId
        )
        if (definitions.length === 0) return []
        const rows = await readCommunityAchievements(identity.value, appId)
        if (rows.length !== definitions.length) {
          throw new CatalogError({ provider: 'steam', kind: 'provider-response' })
        }
        const rowsByIcon = new Map<string, SteamCommunityAchievement>()
        for (const row of rows) {
          const iconFile = safeText(row.iconFile)
          if (
            !iconFile ||
            iconFile.includes('/') ||
            (row.unlockedAt !== null && !/^\d{4}-\d{2}-\d{2}$/.test(row.unlockedAt)) ||
            rowsByIcon.has(iconFile)
          ) {
            throw new CatalogError({ provider: 'steam', kind: 'provider-response' })
          }
          rowsByIcon.set(iconFile, row)
        }
        return definitions.map(({ achievement, iconFile, grayIconFile }) => {
          const unlocked = rowsByIcon.get(iconFile)
          const locked = rowsByIcon.get(grayIconFile)
          if (Boolean(unlocked) === Boolean(locked)) {
            throw new CatalogError({ provider: 'steam', kind: 'provider-response' })
          }
          return {
            ...achievement,
            unlocked: Boolean(unlocked),
            unlockedAt: unlocked?.unlockedAt ?? null
          }
        })
      }

      const schemaBody = await request(
        '/ISteamUserStats/GetSchemaForGame/v2/',
        { appid: String(appId), l: 'spanish' },
        credential
      )
      const game = isRecord(schemaBody) && isRecord(schemaBody.game) ? schemaBody.game : null
      if (!game) throw new CatalogError({ provider: 'steam', kind: 'provider-response' })
      if (game.availableGameStats === undefined) return []
      if (!isRecord(game.availableGameStats)) {
        throw new CatalogError({ provider: 'steam', kind: 'provider-response' })
      }
      const stats = game.availableGameStats
      if (stats.achievements === undefined) return []
      if (!Array.isArray(stats.achievements)) {
        throw new CatalogError({ provider: 'steam', kind: 'provider-response' })
      }
      const definitionIds = new Set<string>()
      const definitions = stats.achievements.map((entry) => {
        if (!isRecord(entry)) {
          throw new CatalogError({ provider: 'steam', kind: 'provider-response' })
        }
        const providerId = safeText(entry.name)
        const name = safeText(entry.displayName)
        if (!providerId || !name || definitionIds.has(providerId)) {
          throw new CatalogError({ provider: 'steam', kind: 'provider-response' })
        }
        definitionIds.add(providerId)
        return {
          providerId,
          name,
          description: safeText(entry.description) ?? '',
          iconUrl: safeAvatar(entry.icon)
        }
      })
      if (definitions.length === 0) return []
      const playerBody = await request(
        '/ISteamUserStats/GetPlayerAchievements/v1/',
        { steamid: identity.value, appid: String(appId), l: 'spanish' },
        credential
      )
      const playerStats =
        isRecord(playerBody) && isRecord(playerBody.playerstats) ? playerBody.playerstats : null
      if (
        !playerStats ||
        playerStats.success !== true ||
        !Array.isArray(playerStats.achievements)
      ) {
        throw new CatalogError({ provider: 'steam', kind: 'provider-response' })
      }
      const states = new Map<string, { unlocked: boolean; unlockedAt: string | null }>()
      for (const entry of playerStats.achievements) {
        if (!isRecord(entry) || typeof entry.apiname !== 'string' || states.has(entry.apiname)) {
          throw new CatalogError({ provider: 'steam', kind: 'provider-response' })
        }
        const unlocked = entry.achieved === 1
        if (!unlocked && entry.achieved !== 0) {
          throw new CatalogError({ provider: 'steam', kind: 'provider-response' })
        }
        states.set(entry.apiname, {
          unlocked,
          unlockedAt:
            unlocked && Number.isSafeInteger(entry.unlocktime) && (entry.unlocktime as number) > 0
              ? new Date((entry.unlocktime as number) * 1000).toISOString().slice(0, 10)
              : null
        })
      }
      if (states.size !== definitions.length) {
        throw new CatalogError({ provider: 'steam', kind: 'provider-response' })
      }
      return definitions.map((definition) => {
        const state = states.get(definition.providerId)
        if (!state) throw new CatalogError({ provider: 'steam', kind: 'provider-response' })
        return { ...definition, ...state }
      })
    }
  }
}
