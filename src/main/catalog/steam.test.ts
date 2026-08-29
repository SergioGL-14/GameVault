import { describe, expect, it, vi } from 'vitest'
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
    expect(game.screenshots).toEqual(['https://images/shot.jpg'])
    expect(game.website).toBe('https://store.steampowered.com/app/400')
  })

  it('rechaza respuestas sin una ficha válida', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ '400': { success: false } })))
    await expect(createSteamCatalog(fetcher as typeof fetch).getGame(400)).rejects.toThrow(
      'ficha de juego válida'
    )
  })
})
