import { describe, expect, it, vi } from 'vitest'
import { createRawgCatalog } from './catalog'

describe('catálogo RAWG', () => {
  it('normaliza resultados de búsqueda sin exponer la clave', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request): Promise<Response> => {
      void url
      return new Response(
        JSON.stringify({
          results: [
            {
              id: 3498,
              name: 'Grand Theft Auto V',
              background_image: 'https://images/cover.jpg',
              released: '2013-09-17',
              platforms: [{ platform: { name: 'PC' } }],
              metacritic: 92
            }
          ]
        }),
        { status: 200 }
      )
    })
    const catalog = createRawgCatalog(() => 'secret-key', fetcher as typeof fetch)
    const results = await catalog.search('Grand Theft Auto')
    expect(results).toEqual([
      {
        source: 'rawg',
        catalogId: 3498,
        title: 'Grand Theft Auto V',
        coverUrl: 'https://images/cover.jpg',
        releasedAt: '2013-09-17',
        platforms: ['PC'],
        metacritic: 92
      }
    ])
    expect(String(fetcher.mock.calls[0][0])).toContain('search=Grand+Theft+Auto')
  })

  it('combina detalle y capturas', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const value = String(url)
      if (value.includes('/screenshots')) {
        return new Response(JSON.stringify({ results: [{ image: 'https://images/shot.jpg' }] }))
      }
      return new Response(
        JSON.stringify({
          id: 1,
          name: 'Portal',
          description_raw: 'Una prueba.',
          background_image: 'https://images/cover.jpg',
          background_image_additional: 'https://images/hero.jpg',
          developers: [{ name: 'Valve' }],
          publishers: [{ name: 'Valve' }],
          genres: [{ name: 'Puzzle' }],
          platforms: [{ platform: { name: 'PC' } }],
          website: 'https://example.test'
        })
      )
    })
    const catalog = createRawgCatalog(() => 'key', fetcher as typeof fetch)
    const game = await catalog.getGame(1)
    expect(game.backgroundUrl).toBe('https://images/hero.jpg')
    expect(game.screenshots).toEqual(['https://images/shot.jpg'])
    expect(game.developers).toEqual(['Valve'])
  })

  it('rechaza búsquedas sin clave y respuestas de autenticación', async () => {
    await expect(createRawgCatalog(() => null).search('Portal')).rejects.toThrow('Configura')
    const fetcher = vi.fn(async () => new Response(null, { status: 401 }))
    await expect(
      createRawgCatalog(() => 'wrong', fetcher as typeof fetch).search('Portal')
    ).rejects.toThrow('rechazó')
  })
})
