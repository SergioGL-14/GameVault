import { describe, expect, it } from 'vitest'
import {
  classifySteamCommunityPage,
  isAllowedSteamNavigation,
  parseSteamCommunityAchievements,
  parseSteamWebAuthentication
} from './web-session'

describe('Steam web authentication page', () => {
  it('extracts only the SteamID and temporary web token from a signed-in page', () => {
    expect(
      parseSteamWebAuthentication({
        userInfo: JSON.stringify({
          logged_in: true,
          steamid: '76561198000000000',
          account_name: 'must-not-leave-the-page'
        }),
        storeUserConfig: JSON.stringify({ webapi_token: 'temporary-token', country_code: 'ES' })
      })
    ).toEqual({
      steamId: '76561198000000000',
      credential: { kind: 'web-session', value: 'temporary-token' }
    })
  })

  it.each([
    null,
    {},
    { userInfo: '{', storeUserConfig: '{}' },
    {
      userInfo: JSON.stringify({ logged_in: false, steamid: '76561198000000000' }),
      storeUserConfig: JSON.stringify({ webapi_token: 'token' })
    },
    {
      userInfo: JSON.stringify({ logged_in: true, steamid: 'invalid' }),
      storeUserConfig: JSON.stringify({ webapi_token: 'token' })
    },
    {
      userInfo: JSON.stringify({ logged_in: true, steamid: '76561198000000000' }),
      storeUserConfig: JSON.stringify({})
    }
  ])('rejects a page without a complete authenticated session %#', (value) => {
    expect(parseSteamWebAuthentication(value)).toBeNull()
  })
})

describe('Steam login navigation', () => {
  it.each([
    'https://store.steampowered.com/login/',
    'https://steamcommunity.com/login/home/',
    'https://login.steampowered.com/jwt/finalizelogin',
    'https://help.steampowered.com/'
  ])('allows an official Steam HTTPS page: %s', (url) => {
    expect(isAllowedSteamNavigation(url)).toBe(true)
  })

  it.each([
    'http://store.steampowered.com/login/',
    'https://store.steampowered.com.evil.example/',
    'https://user:password@steamcommunity.com/',
    'javascript:alert(1)',
    'file:///etc/passwd'
  ])('blocks a non-Steam or unsafe page: %s', (url) => {
    expect(isAllowedSteamNavigation(url)).toBe(false)
  })
})

describe('Steam Community achievements', () => {
  it.each([
    ['https://steamcommunity.com/login/home/', 200, 'authentication'],
    [
      'https://steamcommunity.com/profiles/76561198000000000/stats/400/achievements',
      429,
      'rate-limit'
    ],
    [
      'https://steamcommunity.com/profiles/76561198000000000/stats/400/achievements',
      503,
      'provider-response'
    ],
    ['https://steamcommunity.com/profiles/76561198000000000/stats/400/achievements', 200, null]
  ] as const)('classifies the final Community page %s (%s)', (url, status, expected) => {
    expect(classifySteamCommunityPage(url, status, '76561198000000000', 400)).toBe(expected)
  })

  it('accepts only bounded icon rows and ISO unlock dates', () => {
    expect(
      parseSteamCommunityAchievements([
        { iconFile: 'complete.jpg', unlockedAt: '2026-09-06' },
        { iconFile: 'pending_bw.jpg', unlockedAt: null }
      ])
    ).toEqual([
      { iconFile: 'complete.jpg', unlockedAt: '2026-09-06' },
      { iconFile: 'pending_bw.jpg', unlockedAt: null }
    ])
  })

  it.each([
    null,
    [{ iconFile: '../secret', unlockedAt: null }],
    [{ iconFile: 'a.jpg', unlockedAt: 'not-a-date' }],
    [
      { iconFile: 'duplicate.jpg', unlockedAt: null },
      { iconFile: 'duplicate.jpg', unlockedAt: null }
    ]
  ])('rejects malformed Community rows %#', (value) => {
    expect(() => parseSteamCommunityAchievements(value)).toThrowError(
      expect.objectContaining({ failure: { provider: 'steam', kind: 'provider-response' } })
    )
  })
})
