import { getImageAssetContentType, IMAGE_MAX_SIZE } from '#shared/utils/image'

export default eventHandler(async (event) => {
  const R2 = requireR2Bucket(event.context.cloudflare.env)
  const key = getRouterParam(event, 'key')

  if (!key) {
    throw createError({ status: 400, statusText: 'Key is required' })
  }

  // Only allow access to images/ path
  if (!key.startsWith('images/')) {
    throw createError({ status: 403, statusText: 'Access denied' })
  }

  const contentType = getImageAssetContentType(key)
  if (!contentType)
    throw createError({ status: 400, statusText: 'Invalid image path' })

  const object = await R2.get(key)

  if (!object) {
    throw createError({ status: 404, statusText: 'Image not found' })
  }

  const storedContentType = object.httpMetadata?.contentType
  if (object.size > IMAGE_MAX_SIZE || (storedContentType && storedContentType !== contentType))
    throw createError({ status: 415, statusText: 'Unsupported image' })

  const data = await object.arrayBuffer()
  if (detectRasterImageContentType(new Uint8Array(data)) !== contentType)
    throw createError({ status: 415, statusText: 'Unsupported image' })

  setHeader(event, 'Content-Type', contentType)
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  setHeader(event, 'Content-Security-Policy', 'default-src \'none\'; sandbox')
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  setHeader(event, 'ETag', object.etag)

  return sendWebResponse(event, new Response(data))
})
