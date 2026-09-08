import { randomUUID } from 'node:crypto'
import { link, mkdir, open, rm, writeFile, type FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import {
  identifyManagedImage,
  MAX_MANAGED_IMAGE_BYTES,
  parseManagedImageReference
} from '../../library/managed-image'
import { retryAfterSeconds } from '../catalog/request'

/** Main-process picker seam; null represents explicit user cancellation. */
export type ManagedImagePicker = () => Promise<string | null>

/** Narrow file-reading seam used by the managed protocol handler. */
export type ManagedImageFileReader = (file: string) => Promise<Uint8Array>

/** Imports one provider image without exposing managed storage details to the provider adapter. */
export type RemoteImageImporter = (url: string, signal?: AbortSignal) => Promise<string>

export type ManagedImageFailureKind =
  'unavailable' | 'offline' | 'timeout' | 'rate-limit' | 'invalid' | 'persistence'

/** Reports an image import failure without exposing the selected filesystem path. */
export class ManagedImageError extends Error {
  constructor(
    message: string,
    readonly kind: ManagedImageFailureKind = 'invalid',
    readonly retryAfterSeconds?: number
  ) {
    super(message)
    this.name = 'ManagedImageError'
  }
}

async function readBounded(source: FileHandle): Promise<Buffer> {
  const buffer = Buffer.allocUnsafe(MAX_MANAGED_IMAGE_BYTES + 1)
  let length = 0
  while (length < buffer.length) {
    const { bytesRead } = await source.read(buffer, length, buffer.length - length, length)
    if (bytesRead === 0) break
    length += bytesRead
  }
  return buffer.subarray(0, length)
}

async function readManagedImageFile(file: string): Promise<Uint8Array> {
  const source = await open(file, 'r')
  try {
    return await readBounded(source)
  } finally {
    await source.close()
  }
}

async function persistManagedImage(
  managedDirectory: string,
  bytes: Buffer,
  createId: () => string,
  failureMessage: string
): Promise<string> {
  if (bytes.length > MAX_MANAGED_IMAGE_BYTES) {
    throw new ManagedImageError('La imagen supera el límite de 10 MiB')
  }
  const extension = identifyManagedImage(bytes)
  if (!extension) throw new ManagedImageError('El formato de la imagen no es compatible')

  const reference = `gamevault-image://local/${createId()}.${extension}`
  const parsed = parseManagedImageReference(reference)
  if (!parsed) throw new ManagedImageError('No se pudo crear la referencia de la imagen')
  const destination = join(managedDirectory, parsed.fileName)
  const temporary = `${destination}.${randomUUID()}.tmp`
  try {
    await mkdir(managedDirectory, { recursive: true })
    await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 })
    await link(temporary, destination)
  } catch {
    throw new ManagedImageError(failureMessage, 'persistence')
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined)
  }
  return reference
}

/** Downloads one HTTPS image into managed storage with bounded memory and cancellation. */
export async function importRemoteManagedImage(
  managedDirectory: string,
  url: string,
  fetcher: typeof fetch = fetch,
  createId: () => string = randomUUID,
  signal?: AbortSignal
): Promise<string> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new ManagedImageError('La dirección de la imagen no es válida')
  }
  if (parsed.protocol !== 'https:') {
    throw new ManagedImageError('La dirección de la imagen no es segura')
  }

  const timeout = AbortSignal.timeout(10_000)
  let response: Response
  try {
    response = await fetcher(url, {
      redirect: 'manual',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout
    })
  } catch (cause) {
    if (signal?.aborted) throw cause
    throw new ManagedImageError(
      'No se pudo descargar la imagen',
      timeout.aborted ? 'timeout' : 'offline'
    )
  }
  if (response.status >= 300 && response.status < 400) {
    throw new ManagedImageError('La imagen intentó redirigir a otra dirección')
  }
  if (response.status === 429) {
    throw new ManagedImageError(
      'Steam ha limitado temporalmente la descarga de imágenes',
      'rate-limit',
      retryAfterSeconds(response.headers.get('retry-after'))
    )
  }
  if (!response.ok || !response.body) {
    throw new ManagedImageError('No se pudo descargar la imagen', 'unavailable')
  }
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MANAGED_IMAGE_BYTES) {
    throw new ManagedImageError('La imagen supera el límite de 10 MiB')
  }

  const chunks: Uint8Array[] = []
  let length = 0
  const reader = response.body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_MANAGED_IMAGE_BYTES) {
        await reader.cancel()
        throw new ManagedImageError('La imagen supera el límite de 10 MiB')
      }
      chunks.push(value)
    }
  } catch (cause) {
    if (cause instanceof ManagedImageError || signal?.aborted) throw cause
    throw new ManagedImageError(
      'No se pudo descargar la imagen',
      timeout.aborted ? 'timeout' : 'offline'
    )
  }
  return persistManagedImage(
    managedDirectory,
    Buffer.concat(
      chunks.map((chunk) => Buffer.from(chunk)),
      length
    ),
    createId,
    'No se pudo guardar la imagen descargada'
  )
}

/** Binds remote image imports to one application-managed directory. */
export function createRemoteManagedImageImporter(
  managedDirectory: string,
  fetcher: typeof fetch = fetch
): RemoteImageImporter {
  return (url, signal) =>
    importRemoteManagedImage(managedDirectory, url, fetcher, randomUUID, signal)
}

/**
 * Selects and imports one supported regular image into the managed directory.
 * Returns null on picker cancellation; failures never include the selected path.
 */
export async function selectManagedImage(
  managedDirectory: string,
  pickImage: ManagedImagePicker,
  createId: () => string = randomUUID
): Promise<string | null> {
  let sourcePath: string | null
  try {
    sourcePath = await pickImage()
  } catch {
    throw new ManagedImageError('No se pudo seleccionar la imagen')
  }
  if (sourcePath === null) return null

  let bytes: Buffer
  try {
    const source = await open(sourcePath, 'r')
    try {
      const stat = await source.stat()
      if (!stat.isFile()) throw new ManagedImageError('La imagen seleccionada no es un archivo')
      if (stat.size > MAX_MANAGED_IMAGE_BYTES) {
        throw new ManagedImageError('La imagen seleccionada supera el límite de 10 MiB')
      }
      bytes = await readBounded(source)
    } finally {
      await source.close()
    }
  } catch (error) {
    if (error instanceof ManagedImageError) throw error
    throw new ManagedImageError('No se pudo leer la imagen seleccionada')
  }

  // Copies outlive cancelled edits because references may be shared; safe cleanup requires
  // reference-aware garbage collection rather than deleting on replacement.
  return persistManagedImage(
    managedDirectory,
    bytes,
    createId,
    'No se pudo guardar la imagen seleccionada'
  )
}

/**
 * Creates a protocol request handler that serves only strict managed references.
 * Invalid, missing, and unreadable files return an opaque 404 response.
 */
export function createManagedImageRequestHandler(
  managedDirectory: string,
  readManagedFile: ManagedImageFileReader = readManagedImageFile
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== 'GET') return new Response(null, { status: 405 })
    const parsed = parseManagedImageReference(request.url)
    if (!parsed) return new Response(null, { status: 404 })

    try {
      const bytes = await readManagedFile(join(managedDirectory, parsed.fileName))
      if (bytes.byteLength > MAX_MANAGED_IMAGE_BYTES) {
        return new Response(null, { status: 404 })
      }
      return new Response(Uint8Array.from(bytes), {
        status: 200,
        headers: { 'Content-Type': parsed.mediaType }
      })
    } catch {
      return new Response(null, { status: 404 })
    }
  }
}
