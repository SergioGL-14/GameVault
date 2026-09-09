import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_MANAGED_IMAGE_BYTES, parseManagedImageReference } from '../../library/managed-image'
import {
  createManagedImageRequestHandler,
  importRemoteManagedImage,
  ManagedImageError,
  selectManagedImage
} from './managed-images'

const UUID = '123e4567-e89b-42d3-a456-426614174000'
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
const GIF = Buffer.from('GIF89a')
const WEBP = Buffer.from('RIFF0000WEBP')
const directories: string[] = []

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'gamevault-image-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('managed image import', () => {
  it('downloads a supported remote image into managed storage', async () => {
    const root = temporaryDirectory()
    const managed = join(root, 'managed')
    const fetcher = vi.fn(async () => new Response(PNG, { status: 200 }))

    const reference = await importRemoteManagedImage(
      managed,
      'https://images.example/cover.png',
      fetcher as typeof fetch,
      () => UUID
    )

    expect(reference).toBe(`gamevault-image://local/${UUID}.png`)
    expect(readFileSync(join(managed, `${UUID}.png`))).toEqual(PNG)
    expect(fetcher).toHaveBeenCalledWith(
      'https://images.example/cover.png',
      expect.objectContaining({ redirect: 'manual', signal: expect.any(AbortSignal) })
    )
  })

  it('rejects redirects instead of trusting an unvalidated destination', async () => {
    const fetcher = vi.fn(
      async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1' } })
    )

    await expect(
      importRemoteManagedImage(
        temporaryDirectory(),
        'https://images.example/cover.png',
        fetcher as typeof fetch
      )
    ).rejects.toMatchObject({ kind: 'invalid' })
  })

  it('preserves image rate limits and their retry delay', async () => {
    const fetcher = vi.fn(
      async () => new Response(null, { status: 429, headers: { 'retry-after': '12' } })
    )

    await expect(
      importRemoteManagedImage(
        temporaryDirectory(),
        'https://images.example/cover.png',
        fetcher as typeof fetch
      )
    ).rejects.toMatchObject({ kind: 'rate-limit', retryAfterSeconds: 12 })
  })

  it('rejects oversized remote images before creating managed storage', async () => {
    const root = temporaryDirectory()
    const managed = join(root, 'managed')
    const fetcher = vi.fn(
      async () =>
        new Response(PNG, {
          headers: { 'content-length': String(MAX_MANAGED_IMAGE_BYTES + 1) }
        })
    )

    await expect(
      importRemoteManagedImage(managed, 'https://images.example/cover.png', fetcher as typeof fetch)
    ).rejects.toThrow('10 MiB')
    expect(existsSync(managed)).toBe(false)
  })

  it.each([
    ['renamed.txt', PNG, 'png'],
    ['photo.png', JPEG, 'jpg'],
    ['animation.bin', GIF, 'gif'],
    ['picture.jpeg', WEBP, 'webp']
  ])('detects %s by signature and uses the canonical extension', async (name, bytes, extension) => {
    const root = temporaryDirectory()
    const source = join(root, name)
    const managed = join(root, 'managed')
    writeFileSync(source, bytes)

    const reference = await selectManagedImage(
      managed,
      async () => source,
      () => UUID
    )

    expect(reference).toBe(`gamevault-image://local/${UUID}.${extension}`)
    expect(readFileSync(join(managed, `${UUID}.${extension}`))).toEqual(bytes)
    expect(reference).not.toContain(root)
  })

  it('accepts the inclusive 10 MiB limit and rejects one byte more before creating a directory', async () => {
    const root = temporaryDirectory()
    const acceptedSource = join(root, 'accepted')
    const rejectedSource = join(root, 'rejected.png')
    const accepted = Buffer.alloc(MAX_MANAGED_IMAGE_BYTES)
    PNG.copy(accepted)
    const rejected = Buffer.alloc(MAX_MANAGED_IMAGE_BYTES + 1)
    PNG.copy(rejected)
    writeFileSync(acceptedSource, accepted)
    writeFileSync(rejectedSource, rejected)

    await expect(
      selectManagedImage(
        join(root, 'accepted-managed'),
        async () => acceptedSource,
        () => UUID
      )
    ).resolves.toContain(`${UUID}.png`)
    await expect(
      selectManagedImage(
        join(root, 'rejected-managed'),
        async () => rejectedSource,
        () => UUID
      )
    ).rejects.toThrow('10 MiB')
    expect(existsSync(join(root, 'rejected-managed'))).toBe(false)
  })

  it.each([
    ['vector.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ['fake.png', Buffer.from('not an image')]
  ])(
    'rejects unsupported image bytes in %s without exposing the source path',
    async (name, bytes) => {
      const root = temporaryDirectory()
      const source = join(root, name)
      writeFileSync(source, bytes)

      let failure: unknown
      try {
        await selectManagedImage(join(root, 'managed'), async () => source)
      } catch (error) {
        failure = error
      }
      expect(failure).toBeInstanceOf(ManagedImageError)
      expect(String(failure)).not.toContain(root)
      expect(existsSync(join(root, 'managed'))).toBe(false)
    }
  )

  it('rejects non-regular sources and returns null on cancellation without writing', async () => {
    const root = temporaryDirectory()
    const managed = join(root, 'managed')

    await expect(selectManagedImage(managed, async () => root)).rejects.toThrow('no es un archivo')
    await expect(selectManagedImage(managed, async () => null)).resolves.toBeNull()
    expect(existsSync(managed)).toBe(false)
  })

  it('uses exclusive destinations and retains an existing managed file', async () => {
    const root = temporaryDirectory()
    const source = join(root, 'source.png')
    const managed = join(root, 'managed')
    writeFileSync(source, PNG)

    await selectManagedImage(
      managed,
      async () => source,
      () => UUID
    )
    await expect(
      selectManagedImage(
        managed,
        async () => source,
        () => UUID
      )
    ).rejects.toThrow('guardar')
    expect(readFileSync(join(managed, `${UUID}.png`))).toEqual(PNG)
    expect(readdirSync(managed)).toEqual([`${UUID}.png`])
  })
})

describe('managed image references and requests', () => {
  it('serves the managed copy after the original is deleted', async () => {
    const root = temporaryDirectory()
    const source = join(root, 'source.png')
    const managed = join(root, 'managed')
    writeFileSync(source, PNG)
    const reference = await selectManagedImage(
      managed,
      async () => source,
      () => UUID
    )
    unlinkSync(source)

    const response = await createManagedImageRequestHandler(managed)(new Request(reference!))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PNG)
  })

  it.each([
    'gamevault-image://other/123e4567-e89b-42d3-a456-426614174000.png',
    'https://local/123e4567-e89b-42d3-a456-426614174000.png',
    'gamevault-image://user:pass@local/123e4567-e89b-42d3-a456-426614174000.png',
    'gamevault-image://local:80/123e4567-e89b-42d3-a456-426614174000.png',
    'gamevault-image://local/nested/123e4567-e89b-42d3-a456-426614174000.png',
    'gamevault-image://local/../123e4567-e89b-42d3-a456-426614174000.png',
    'gamevault-image://local/123e4567-e89b-42d3-a456-426614174000.svg',
    'gamevault-image://local/not-a-uuid.png',
    `gamevault-image://local/${UUID}.png?download=1`,
    `gamevault-image://local/${UUID}.png#fragment`,
    `gamevault-image://local/${UUID.toUpperCase()}.png`
  ])('rejects unsafe reference %s', (reference) => {
    expect(parseManagedImageReference(reference)).toBeNull()
  })

  it('returns a path-free 404 for invalid, missing, and unreadable requests', async () => {
    const root = temporaryDirectory()
    const handler = createManagedImageRequestHandler(root)
    const missing = `gamevault-image://local/${UUID}.jpg`

    const invalidResponse = await handler(new Request('gamevault-image://local/../secret.png'))
    const missingResponse = await handler(new Request(missing))
    const unreadableResponse = await createManagedImageRequestHandler(root, async () => {
      throw new Error(`cannot read ${join(root, 'private')}`)
    })(new Request(missing))

    for (const response of [invalidResponse, missingResponse, unreadableResponse]) {
      expect(response.status).toBe(404)
      expect(await response.text()).toBe('')
      expect(response.statusText).not.toContain(root)
    }
  })

  it('rejects non-GET requests and oversized managed files', async () => {
    const reference = `gamevault-image://local/${UUID}.png`
    const handler = createManagedImageRequestHandler('', async () =>
      Buffer.alloc(MAX_MANAGED_IMAGE_BYTES + 1)
    )

    await expect(handler(new Request(reference, { method: 'POST' }))).resolves.toMatchObject({
      status: 405
    })
    await expect(handler(new Request(reference))).resolves.toMatchObject({ status: 404 })
  })
})
