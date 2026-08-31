import { describe, expect, it, vi } from 'vitest'
import { createRawgCatalog } from './rawg'

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
    await expect(createRawgCatalog(() => null).search('Portal')).rejects.toMatchObject({
      failure: { provider: 'rawg', kind: 'authentication' }
    })
    const fetcher = vi.fn(async () => new Response(null, { status: 401 }))
    await expect(
      createRawgCatalog(() => 'wrong', fetcher as typeof fetch).search('Portal')
    ).rejects.toMatchObject({ failure: { provider: 'rawg', kind: 'authentication' } })
  })

  it('clasifica límites y respuestas malformadas sin filtrar HTTP al consumidor', async () => {
    const limited = vi.fn(async () => new Response(null, { status: 429 }))
    await expect(
      createRawgCatalog(() => 'key', limited as typeof fetch).search('Portal')
    ).rejects.toMatchObject({ failure: { provider: 'rawg', kind: 'rate-limit' } })

    const malformed = vi.fn(async () => new Response(JSON.stringify({ unexpected: true })))
    await expect(
      createRawgCatalog(() => 'key', malformed as typeof fetch).search('Portal')
    ).rejects.toMatchObject({ failure: { provider: 'rawg', kind: 'provider-response' } })
  })

  it('encapsula estructuras anidadas malformadas', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ results: [null] })))

    await expect(
      createRawgCatalog(() => 'key', fetcher as typeof fetch).search('Portal')
    ).rejects.toMatchObject({ failure: { provider: 'rawg', kind: 'provider-response' } })
  })

  it('rechaza valores escalares y listas malformados', async () => {
    const malformedSearch = vi.fn(
      async () =>
        new Response(JSON.stringify({ results: [{ id: 1, name: 'Portal', background_image: {} }] }))
    )
    await expect(
      createRawgCatalog(() => 'key', malformedSearch as typeof fetch).search('Portal')
    ).rejects.toMatchObject({ failure: { provider: 'rawg', kind: 'provider-response' } })

    const malformedDetail = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('/screenshots')
        ? new Response(JSON.stringify({ results: [] }))
        : new Response(JSON.stringify({ id: 1, name: 'Portal', developers: [null] }))
    )
    await expect(
      createRawgCatalog(() => 'key', malformedDetail as typeof fetch).getGame(1)
    ).rejects.toMatchObject({ failure: { provider: 'rawg', kind: 'provider-response' } })
  })

  it('rechaza identificadores y puntuaciones fuera del dominio', async () => {
    for (const game of [
      { id: -1, name: 'Portal', metacritic: 90 },
      { id: 1, name: 'Portal', metacritic: 101 }
    ]) {
      const fetcher = vi.fn(async () => new Response(JSON.stringify({ results: [game] })))
      await expect(
        createRawgCatalog(() => 'key', fetcher as typeof fetch).search('Portal')
      ).rejects.toMatchObject({ failure: { provider: 'rawg', kind: 'provider-response' } })
    }
  })
})
