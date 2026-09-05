import { randomUUID } from 'node:crypto'
import { mkdir, open, writeFile, type FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import {
  identifyManagedImage,
  MAX_MANAGED_IMAGE_BYTES,
  parseManagedImageReference
} from '../../library/managed-image'

/** Main-process picker seam; null represents explicit user cancellation. */
export type ManagedImagePicker = () => Promise<string | null>

/** Narrow file-reading seam used by the managed protocol handler. */
export type ManagedImageFileReader = (file: string) => Promise<Uint8Array>

/** Reports an image import failure without exposing the selected filesystem path. */
export class ManagedImageError extends Error {
  constructor(message: string) {
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

  if (bytes.length > MAX_MANAGED_IMAGE_BYTES) {
    throw new ManagedImageError('La imagen seleccionada supera el límite de 10 MiB')
  }
  const extension = identifyManagedImage(bytes)
  if (!extension) throw new ManagedImageError('El formato de la imagen no es compatible')

  const reference = `gamevault-image://local/${createId()}.${extension}`
  const parsed = parseManagedImageReference(reference)
  if (!parsed) throw new ManagedImageError('No se pudo crear la referencia de la imagen')

  try {
    await mkdir(managedDirectory, { recursive: true })
    // Copies outlive cancelled edits because references may be shared; safe cleanup requires
    // reference-aware garbage collection rather than deleting on replacement.
    await writeFile(join(managedDirectory, parsed.fileName), bytes, { flag: 'wx', mode: 0o600 })
  } catch {
    throw new ManagedImageError('No se pudo guardar la imagen seleccionada')
  }
  return reference
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
