export const IMAGE_MAX_SIZE = 5 * 1024 * 1024
export const IMAGE_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export function getImageAssetContentType(key: string): string | undefined {
  const extension = /^images\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]{10}\.(jpeg|png|webp|gif)$/i.exec(key)?.[1]
  return extension && `image/${extension.toLowerCase()}`
}
