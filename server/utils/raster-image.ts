function matchesSignature(bytes: Uint8Array, offset: number, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte)
}

export function detectRasterImageContentType(bytes: Uint8Array): string | undefined {
  if (matchesSignature(bytes, 0, [0xFF, 0xD8, 0xFF]))
    return 'image/jpeg'
  if (matchesSignature(bytes, 0, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))
    return 'image/png'
  if (matchesSignature(bytes, 0, [0x47, 0x49, 0x46, 0x38]) && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61)
    return 'image/gif'
  if (matchesSignature(bytes, 0, [0x52, 0x49, 0x46, 0x46]) && matchesSignature(bytes, 8, [0x57, 0x45, 0x42, 0x50]))
    return 'image/webp'
}
