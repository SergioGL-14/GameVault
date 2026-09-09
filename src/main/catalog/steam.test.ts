import { describe, expect, it, vi } from 'vitest'
import { ManagedImageError } from '../images/managed-images'
import { createSteamCatalog } from './steam'

describe('catálogo de Steam', () => {
  it('busca juegos sin añadir credenciales', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request): Promise<Response> => {
      void url
      return new Response(
        JSON.stringify({
          items: [
            {
              type: 'app',
              name: 'Portal',
              id: 400,
              tiny_image: 'https://images/portal.jpg',
              metascore: '90',
              platforms: { windows: true, mac: false, linux: true }
            },
            { type: 'bundle', name: 'Portal Bundle', id: 1 }
          ]
        })
      )
    })
    const games = await createSteamCatalog(fetcher as typeof fetch).search('Portal')
    expect(games).toEqual([
      {
        source: 'steam',
        catalogId: 400,
        title: 'Portal',
        coverUrl: 'https://images/portal.jpg',
        releasedAt: null,
        platforms: ['Windows', 'Linux'],
        metacritic: 90
      }
    ])
    expect(String(fetcher.mock.calls[0][0])).toContain('term=Portal')
    expect(String(fetcher.mock.calls[0][0])).not.toContain('key=')
  })

  it('normaliza ficha, carátula vertical y capturas', async () => {
    const fetcher = vi.fn(async (): Promise<Response> =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            '400': {
              success: true,
              data: {
                type: 'game',
                name: 'Portal',
                short_description: 'Puzles &amp; portales.<br>Una prueba.',
                header_image: 'https://images/header.jpg',
                background: 'https://images/background.jpg',
                developers: ['Valve'],
                publishers: ['Valve'],
                platforms: { windows: true, mac: false, linux: true },
                metacritic: { score: 90 },
                genres: [{ description: 'Acción' }],
                screenshots: [{ path_full: 'https://images/shot.jpg' }],
                release_date: { date: '10 OCT 2007' }
              }
            }
          })
        )
      )
    )
    const game = await createSteamCatalog(fetcher as typeof fetch).getGame(400)
    expect(game.source).toBe('steam')
    expect(game.description).toBe('Puzles & portales.\nUna prueba.')
    expect(game.coverUrl).toContain('/400/library_600x900.jpg')
    expect(game.backgroundUrl).toBe('https://images/background.jpg')
    expect(game.screenshots).toEqual(['https://images/shot.jpg'])
    expect(game.website).toBe('https://store.steampowered.com/app/400')
  })

  it('imports Steam cover and background through managed storage', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            '400': {
              success: true,
              data: {
                type: 'game',
                name: 'Portal',
                short_description: 'Descripción',
                background:
                  'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/400/background.jpg'
              }
            }
          })
        )
    )
    const importImage = vi
      .fn()
      .mockResolvedValueOnce('gamevault-image://local/123e4567-e89b-42d3-a456-426614174000.jpg')
      .mockResolvedValueOnce('gamevault-image://local/223e4567-e89b-42d3-a456-426614174000.jpg')

    const game = await createSteamCatalog(fetcher as typeof fetch, importImage).getGame(400)

    expect(game).toMatchObject({
      coverUrl: 'gamevault-image://local/123e4567-e89b-42d3-a456-426614174000.jpg',
      backgroundUrl: 'gamevault-image://local/223e4567-e89b-42d3-a456-426614174000.jpg'
    })
    expect(importImage).toHaveBeenCalledTimes(2)
  })

  it.each(['offline', 'timeout', 'rate-limit'] as const)(
    'preserves a managed image %s failure so metadata fan-out can stop',
    async (kind) => {
      const fetcher = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              '400': {
                success: true,
                data: { type: 'game', name: 'Portal', short_description: 'Descripción' }
              }
            })
          )
      )
      const importImage = vi.fn(async () => {
        throw new ManagedImageError('download failed', kind, kind === 'rate-limit' ? 12 : undefined)
      })

      await expect(
        createSteamCatalog(fetcher as typeof fetch, importImage).getGame(400)
      ).rejects.toMatchObject({
        failure: {
          provider: 'steam',
          kind,
          ...(kind === 'rate-limit' ? { retryAfterSeconds: 12 } : {})
        }
      })
    }
  )

  it('does not disguise managed image persistence failures as provider failures', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            '400': {
              success: true,
              data: { type: 'game', name: 'Portal', short_description: 'Descripción' }
            }
          })
        )
    )
    const failure = new ManagedImageError('write failed', 'persistence')

    await expect(
      createSteamCatalog(fetcher as typeof fetch, async () => {
        throw failure
      }).getGame(400)
    ).rejects.toBe(failure)
  })

  it('uses the conventional vertical asset when Steam omits Store artwork', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            '400': { success: true, data: { type: 'game', name: 'Portal' } }
          })
        )
    )

    const game = await createSteamCatalog(fetcher as typeof fetch).getGame(400)

    expect(game.coverUrl).toContain('/400/library_600x900.jpg')
  })

  it('uses detailed Store text when the short description is empty', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            '400': {
              success: true,
              data: {
                type: 'game',
                name: 'Portal',
                short_description: '',
                detailed_description: '<p>Descripción detallada.</p>'
              }
            }
          })
        )
    )

    await expect(createSteamCatalog(fetcher as typeof fetch).getGame(400)).resolves.toMatchObject({
      description: 'Descripción detallada.'
    })
  })

  it('falls back to Store artwork when the vertical asset does not exist', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            '400': {
              success: true,
              data: { type: 'game', name: 'Portal', header_image: 'https://images/header.jpg' }
            }
          })
        )
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }))

    const game = await createSteamCatalog(fetcher as typeof fetch).getGame(400)

    expect(game.coverUrl).toBe('https://images/header.jpg')
  })

  it('returns a Store rate limit immediately to the resumable library flow', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 429 }))

    await expect(createSteamCatalog(fetcher as typeof fetch).getGame(400)).rejects.toMatchObject({
      failure: { provider: 'steam', kind: 'rate-limit' }
    })
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it.each(['demo', 'mod'])('enriches an imported Steam %s', async (type) => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            '400': { success: true, data: { type, name: 'Portal' } }
          })
        )
    )

    await expect(createSteamCatalog(fetcher as typeof fetch).getGame(400)).resolves.toMatchObject({
      catalogId: 400,
      title: 'Portal'
    })
  })

  it('does not replace an alias title with metadata from another Steam AppID', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            '21110': {
              success: true,
              data: {
                type: 'game',
                name: 'F.E.A.R.',
                steam_appid: 21090,
                short_description: 'Includes the base game and both expansions.',
                header_image: 'https://shared.akamai.steamstatic.com/steam/apps/21090/header.jpg'
              }
            }
          })
        )
    )

    await expect(createSteamCatalog(fetcher as typeof fetch).getGame(21110)).resolves.toMatchObject(
      {
        catalogId: 21110,
        title: 'Steam App 21110'
      }
    )
  })

  it('uses retained Steam artwork when a Store entry is unavailable', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ '400': { success: false } })))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))

    await expect(createSteamCatalog(fetcher as typeof fetch).getGame(400)).resolves.toMatchObject({
      catalogId: 400,
      title: 'Steam App 400',
      coverUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/400/header.jpg',
      backgroundUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/400/header.jpg'
    })
  })

  it('rechaza respuestas sin una ficha válida', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ '400': {} })))
    await expect(createSteamCatalog(fetcher as typeof fetch).getGame(400)).rejects.toMatchObject({
      failure: { provider: 'steam', kind: 'provider-response' }
    })
  })

  it.each([
    ['offline', new TypeError('fetch failed')],
    ['timeout', Object.assign(new Error('aborted'), { name: 'TimeoutError' })]
  ] as const)('clasifica un fallo %s sin exponer detalles de fetch', async (kind, reason) => {
    const fetcher = vi.fn(async () => Promise.reject(reason))

    await expect(
      createSteamCatalog(fetcher as typeof fetch).search('Portal')
    ).rejects.toMatchObject({ failure: { provider: 'steam', kind } })
  })

  it('clasifica JSON malformado como respuesta del proveedor', async () => {
    const fetcher = vi.fn(async () => new Response('{'))

    await expect(
      createSteamCatalog(fetcher as typeof fetch).search('Portal')
    ).rejects.toMatchObject({ failure: { provider: 'steam', kind: 'provider-response' } })
  })

  it('encapsula estructuras anidadas malformadas', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ items: [null] })))

    await expect(
      createSteamCatalog(fetcher as typeof fetch).search('Portal')
    ).rejects.toMatchObject({ failure: { provider: 'steam', kind: 'provider-response' } })
  })

  it('rechaza valores escalares malformados en resultados de búsqueda', async () => {
    const malformedSearch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ items: [{ type: 'app', id: 400, name: 'Portal', tiny_image: {} }] })
        )
    )
    await expect(
      createSteamCatalog(malformedSearch as typeof fetch).search('Portal')
    ).rejects.toMatchObject({ failure: { provider: 'steam', kind: 'provider-response' } })
  })

  it('conserva el núcleo válido cuando un campo opcional de detalle está malformado', async () => {
    const malformedDetail = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            '400': {
              success: true,
              data: {
                type: 'game',
                name: 'Portal',
                short_description: 'Descripción válida',
                developers: [null]
              }
            }
          })
        )
    )
    await expect(
      createSteamCatalog(malformedDetail as typeof fetch).getGame(400)
    ).resolves.toMatchObject({ description: 'Descripción válida', developers: [] })
  })

  it('rechaza identificadores y puntuaciones fuera del dominio', async () => {
    for (const item of [
      { type: 'app', id: 0, name: 'Portal', metascore: '90' },
      { type: 'app', id: 400, name: 'Portal', metascore: '101' }
    ]) {
      const fetcher = vi.fn(async () => new Response(JSON.stringify({ items: [item] })))
      await expect(
        createSteamCatalog(fetcher as typeof fetch).search('Portal')
      ).rejects.toMatchObject({ failure: { provider: 'steam', kind: 'provider-response' } })
    }
  })
})
