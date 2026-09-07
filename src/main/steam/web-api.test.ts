import { describe, expect, it, vi } from 'vitest'
import { createSteamAccountProvider, parseSteamIdentity } from './web-api'

const STEAM_ID = '76561198000000000'

describe('Steam identity', () => {
  it.each([
    [STEAM_ID, { kind: 'id', value: STEAM_ID }],
    [`https://steamcommunity.com/profiles/${STEAM_ID}/`, { kind: 'id', value: STEAM_ID }],
    ['https://steamcommunity.com/id/portal_player/', { kind: 'vanity', value: 'portal_player' }],
    ['00042', { kind: 'id', value: '42' }]
  ])('parses %s', (input, expected) => {
    expect(parseSteamIdentity(input)).toEqual(expected)
  })

  it.each([
    '0',
    '18446744073709551616',
    '-1',
    '1e3',
    `http://steamcommunity.com/profiles/${STEAM_ID}`,
    `https://user@steamcommunity.com/profiles/${STEAM_ID}`,
    `https://steamcommunity.com:443/profiles/${STEAM_ID}`,
    `https://steamcommunity.com/profiles/${STEAM_ID}?x=1`,
    'https://evil.example/id/player',
    'https://steamcommunity.com/id/a/extra'
  ])('rejects %s', (input) => expect(parseSteamIdentity(input)).toBeNull())
})

describe('official Steam account provider', () => {
  it('resolves and validates a profile without placing the key in URLs', async () => {
    const fetcher = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).not.toContain('secret')
      expect(new Headers(init?.headers).get('x-webapi-key')).toBe('secret')
      expect(init?.redirect).toBe('error')
      return new Response(
        JSON.stringify({
          response: {
            players: [{ steamid: STEAM_ID, personaname: 'Jugador', avatarfull: 'https://avatar' }]
          }
        })
      )
    })

    await expect(
      createSteamAccountProvider(fetcher as typeof fetch).resolveProfile(STEAM_ID, {
        kind: 'api-key',
        value: 'secret'
      })
    ).resolves.toEqual({ steamId: STEAM_ID, personaName: 'Jugador', avatarUrl: 'https://avatar/' })
  })

  it('resolves a vanity URL before validating the profile', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ response: { steamid: STEAM_ID } })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ response: { players: [{ steamid: STEAM_ID, personaname: 'J' }] } })
        )
      )
    const provider = createSteamAccountProvider(fetcher as typeof fetch)

    await expect(
      provider.resolveProfile('https://steamcommunity.com/id/player', {
        kind: 'api-key',
        value: 'key'
      })
    ).resolves.toMatchObject({
      steamId: STEAM_ID
    })
    expect(String(fetcher.mock.calls[0][0])).toContain('/ResolveVanityURL/v1/')
  })

  it('returns one complete owned-games snapshot and ignores unrelated fields', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      void url
      return new Response(
        JSON.stringify({
          response: {
            game_count: 2,
            games: [
              { appid: 400, name: 'Portal', playtime_forever: 999 },
              { appid: 620, name: 'Portal 2' }
            ]
          }
        })
      )
    })
    const games = await createSteamAccountProvider(fetcher as typeof fetch).getLibraryGames(
      STEAM_ID,
      { kind: 'api-key', value: 'key' }
    )

    expect(games).toEqual([
      { appId: 400, title: 'Portal' },
      { appId: 620, title: 'Portal 2' }
    ])
    const url = String(fetcher.mock.calls[0][0])
    expect(url).toContain('include_appinfo=true')
    expect(url).toContain('include_played_free_games=true')
  })

  it('accepts an explicitly counted empty snapshot for user confirmation', async () => {
    const provider = createSteamAccountProvider(
      vi.fn(
        async () => new Response(JSON.stringify({ response: { game_count: 0, games: [] } }))
      ) as typeof fetch
    )
    await expect(
      provider.getLibraryGames(STEAM_ID, { kind: 'api-key', value: 'key' })
    ).resolves.toEqual([])
  })

  it('accepts a complete games array when Valve omits the undocumented count', async () => {
    const provider = createSteamAccountProvider(
      vi.fn(
        async () =>
          new Response(JSON.stringify({ response: { games: [{ appid: 400, name: 'Portal' }] } }))
      ) as typeof fetch
    )
    await expect(
      provider.getLibraryGames(STEAM_ID, { kind: 'api-key', value: 'key' })
    ).resolves.toEqual([{ appId: 400, title: 'Portal' }])
  })

  it.each([
    {},
    { response: {} },
    { response: { game_count: 1, games: [{ appid: 4_294_967_296, name: 'Impossible' }] } },
    {
      response: {
        games: [
          { appid: 400, name: 'A' },
          { appid: 400, name: 'B' }
        ]
      }
    }
  ])('rejects an incomplete snapshot %#', async (body) => {
    const provider = createSteamAccountProvider(
      vi.fn(async () => new Response(JSON.stringify(body))) as typeof fetch
    )
    await expect(
      provider.getLibraryGames(STEAM_ID, { kind: 'api-key', value: 'key' })
    ).rejects.toMatchObject({
      failure: { provider: 'steam', kind: 'provider-response' }
    })
  })

  it('preserves unnamed Steam entries and tolerates a non-normative count mismatch', async () => {
    const provider = createSteamAccountProvider(
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ response: { game_count: 2, games: [{ appid: 400, name: '' }] } })
          )
      ) as typeof fetch
    )

    await expect(
      provider.getLibraryGames(STEAM_ID, { kind: 'api-key', value: 'token' })
    ).resolves.toEqual([{ appId: 400, title: 'Steam App 400' }])
  })

  it('rejects a false empty snapshot when Steam reports owned games', async () => {
    const provider = createSteamAccountProvider(
      vi.fn(
        async () => new Response(JSON.stringify({ response: { game_count: 2, games: [] } }))
      ) as typeof fetch
    )

    await expect(
      provider.getLibraryGames(STEAM_ID, { kind: 'api-key', value: 'token' })
    ).rejects.toMatchObject({ failure: { kind: 'provider-response' } })
  })

  it('rejects oversized profile data at the provider boundary', async () => {
    const provider = createSteamAccountProvider(
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              response: { players: [{ steamid: STEAM_ID, personaname: 'x'.repeat(10_001) }] }
            })
          )
      ) as typeof fetch
    )
    await expect(
      provider.resolveProfile(STEAM_ID, { kind: 'api-key', value: 'key' })
    ).rejects.toMatchObject({
      failure: { kind: 'provider-response' }
    })
  })

  it('uses only the authoritative owned-games list for a web session', async () => {
    const fetcher = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const requestUrl = new URL(String(url))
      expect(requestUrl.searchParams.get('access_token')).toBe('web-token')
      expect(new Headers(init?.headers).has('x-webapi-key')).toBe(false)
      return new Response(JSON.stringify({ response: { games: [{ appid: 400, name: 'Portal' }] } }))
    })
    const provider = createSteamAccountProvider(fetcher as typeof fetch)

    await expect(
      provider.getLibraryGames(STEAM_ID, { kind: 'web-session', value: 'web-token' })
    ).resolves.toEqual([{ appId: 400, title: 'Portal' }])
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('combines public definitions with authenticated Community unlock rows', async () => {
    const fetcher = vi.fn(async (url: string | URL) => {
      void url
      return new Response(
        JSON.stringify({
          response: {
            achievements: [
              {
                internal_name: 'PORTAL_COMPLETE',
                localized_name: 'Portal completado',
                localized_desc: 'Termina el juego.',
                icon: 'complete.jpg',
                icon_gray: 'complete_bw.jpg'
              }
            ]
          }
        })
      )
    })
    const community = vi.fn(async () => [{ iconFile: 'complete.jpg', unlockedAt: '2026-09-06' }])

    await expect(
      createSteamAccountProvider(fetcher as typeof fetch, community).getAchievements(
        STEAM_ID,
        400,
        { kind: 'web-session', value: 'store-token' }
      )
    ).resolves.toEqual([
      {
        providerId: 'PORTAL_COMPLETE',
        name: 'Portal completado',
        description: 'Termina el juego.',
        iconUrl:
          'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/400/complete.jpg',
        unlocked: true,
        unlockedAt: '2026-09-06'
      }
    ])
    expect(String(fetcher.mock.calls[0][0])).toContain('/IPlayerService/GetGameAchievements/v1/')
    expect(String(fetcher.mock.calls[0][0])).not.toContain('store-token')
    expect(community).toHaveBeenCalledWith(STEAM_ID, 400)
  })

  it('treats a valid empty public definition response as no achievements', async () => {
    const community = vi.fn(async () => [])
    const provider = createSteamAccountProvider(
      vi.fn(async () => new Response(JSON.stringify({ response: {} }))) as typeof fetch,
      community
    )

    await expect(
      provider.getAchievements(STEAM_ID, 70, { kind: 'web-session', value: 'token' })
    ).resolves.toEqual([])
    expect(community).not.toHaveBeenCalled()
  })

  it('uses the documented achievement APIs for a personal key', async () => {
    const fetcher = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).not.toContain('personal-key')
      expect(new Headers(init?.headers).get('x-webapi-key')).toBe('personal-key')
      return new Response(
        JSON.stringify(
          String(url).includes('GetSchemaForGame')
            ? {
                game: {
                  availableGameStats: {
                    achievements: [
                      { name: 'COMPLETE', displayName: 'Completado', icon: 'https://icon' }
                    ]
                  }
                }
              }
            : {
                playerstats: {
                  success: true,
                  achievements: [{ apiname: 'COMPLETE', achieved: 1, unlocktime: 1_700_000_000 }]
                }
              }
        )
      )
    })

    await expect(
      createSteamAccountProvider(fetcher as typeof fetch).getAchievements(STEAM_ID, 400, {
        kind: 'api-key',
        value: 'personal-key'
      })
    ).resolves.toMatchObject([
      { providerId: 'COMPLETE', name: 'Completado', unlocked: true, unlockedAt: '2023-11-14' }
    ])
  })

  it('rejects a malformed achievement schema instead of returning an empty snapshot', async () => {
    const provider = createSteamAccountProvider(
      vi.fn(async () => new Response(JSON.stringify({}))) as typeof fetch
    )

    await expect(
      provider.getAchievements(STEAM_ID, 400, { kind: 'api-key', value: 'personal-key' })
    ).rejects.toMatchObject({ failure: { provider: 'steam', kind: 'provider-response' } })
  })

  it('rejects duplicate API-key achievement identities before requesting player state', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            game: {
              availableGameStats: {
                achievements: [
                  { name: 'DUPLICATE', displayName: 'One' },
                  { name: 'DUPLICATE', displayName: 'Two' }
                ]
              }
            }
          })
        )
    )

    await expect(
      createSteamAccountProvider(fetcher as typeof fetch).getAchievements(STEAM_ID, 400, {
        kind: 'api-key',
        value: 'personal-key'
      })
    ).rejects.toMatchObject({ failure: { provider: 'steam', kind: 'provider-response' } })
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('rejects player achievement rows that are absent from the schema', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            game: {
              availableGameStats: {
                achievements: [{ name: 'KNOWN', displayName: 'Known' }]
              }
            }
          })
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            playerstats: {
              success: true,
              achievements: [
                { apiname: 'KNOWN', achieved: 0 },
                { apiname: 'UNKNOWN', achieved: 1 }
              ]
            }
          })
        )
      )

    await expect(
      createSteamAccountProvider(fetcher as typeof fetch).getAchievements(STEAM_ID, 400, {
        kind: 'api-key',
        value: 'personal-key'
      })
    ).rejects.toMatchObject({ failure: { provider: 'steam', kind: 'provider-response' } })
  })
})
