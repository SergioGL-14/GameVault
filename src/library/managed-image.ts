/** Largest accepted managed image size, inclusive. */
export const MAX_MANAGED_IMAGE_BYTES = 10 * 1024 * 1024

/** Protocol used for opaque references to application-managed images. */
export const MANAGED_IMAGE_SCHEME = 'gamevault-image'

/** Canonical extension assigned after byte-signature detection. */
export type ManagedImageExtension = 'png' | 'jpg' | 'gif' | 'webp'

/** Safe path component and response metadata parsed from an opaque managed reference. */
export interface ManagedImageReference {
  fileName: string
  extension: ManagedImageExtension
  mediaType: string
}

const MEDIA_TYPES: Record<ManagedImageExtension, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp'
}

const MANAGED_IMAGE_REFERENCE =
  /^gamevault-image:\/\/local\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(png|jpg|gif|webp)$/

/** Parses an exact local managed-image reference, returning null for malformed or unsafe input. */
export function parseManagedImageReference(value: unknown): ManagedImageReference | null {
  if (typeof value !== 'string') return null
  const match = MANAGED_IMAGE_REFERENCE.exec(value)
  if (!match) return null

  const extension = match[2] as ManagedImageExtension
  return {
    fileName: `${match[1]}.${extension}`,
    extension,
    mediaType: MEDIA_TYPES[extension]
  }
}

/** Identifies a supported image from its leading bytes and returns its canonical extension. */
export function identifyManagedImage(bytes: Uint8Array): ManagedImageExtension | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpg'
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return 'gif'
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'webp'
  }
  return null
}
