export const APPLICATION_SHORTEN_BODY_LIMIT = 192 * 1024
export const APPLICATION_SETTINGS_BODY_LIMIT = 1280 * 1024
export const APPLICATION_TOKEN_BODY_LIMIT = 1024
export const IMAGE_UPLOAD_BODY_LIMIT = 6 * 1024 * 1024
export const REQUEST_BODY_LIMIT = 16 * 1024 * 1024

export async function readBoundedRequestChunks(stream: ReadableStream<Uint8Array>, maxBytes: number) {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done)
        return { chunks, size }

      size += value.byteLength
      if (size > maxBytes) {
        void reader.cancel().catch(() => {})
        return null
      }
      chunks.push(value)
    }
  }
  finally {
    reader.releaseLock()
  }
}

export function getRequestBodyLimit(pathname: string): number {
  let path = pathname
  try {
    path = decodeURI(pathname)
  }
  catch {
    // The general limit still applies to a malformed path.
  }

  path = path.replace(/\/$/, '')
  if (path === '/api/link/application-tokens' || path.startsWith('/api/link/application-tokens/'))
    return APPLICATION_TOKEN_BODY_LIMIT

  switch (path) {
    case '/api/link/shorten': return APPLICATION_SHORTEN_BODY_LIMIT
    case '/api/link/application-settings': return APPLICATION_SETTINGS_BODY_LIMIT
    case '/api/upload/image': return IMAGE_UPLOAD_BODY_LIMIT
    default: return REQUEST_BODY_LIMIT
  }
}
