import { nanoid, SlugSchema } from '#shared/schemas/link'
import { IMAGE_ALLOWED_TYPES, IMAGE_MAX_SIZE } from '#shared/utils/image'

const slugValidator = SlugSchema

defineRouteMeta({
  openAPI: {
    description: 'Upload an image to R2 storage',
    requestBody: {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            required: ['file', 'slug'],
            properties: {
              file: { type: 'string', format: 'binary' },
              slug: { type: 'string' },
            },
          },
        },
      },
    },
  },
})

export default eventHandler(async (event) => {
  assertLinkWritesAllowed(event, 'upload images')
  const R2 = requireR2Bucket(event.context.cloudflare.env)

  const contentType = getHeader(event, 'Content-Type')
  if (!contentType || !/^multipart\/form-data(?:\s*;|$)/i.test(contentType))
    throw createError({ status: 400, statusText: 'Expected multipart form data' })

  const body = await readBoundedRequestBody(event, IMAGE_MAX_SIZE + 64 * 1024)
  const formData = await new Response(body, { headers: { 'Content-Type': contentType } }).formData().catch(() => {
    throw createError({ status: 400, statusText: 'Invalid multipart form data' })
  })
  const file = formData.get('file')
  const slug = formData.get('slug')

  if (!file || typeof file === 'string') {
    throw createError({ status: 400, statusText: 'File is required' })
  }

  if (!slug) {
    throw createError({ status: 400, statusText: 'Slug is required' })
  }

  const slugResult = slugValidator.safeParse(slug)
  if (!slugResult.success) {
    throw createError({ status: 400, statusText: 'Invalid slug format' })
  }

  if (!IMAGE_ALLOWED_TYPES.includes(file.type)) {
    throw createError({ status: 400, statusText: 'Invalid file type. Allowed: jpeg, png, webp, gif' })
  }

  if (file.size > IMAGE_MAX_SIZE) {
    throw createError({ status: 400, statusText: 'File size exceeds 5MB limit' })
  }

  const arrayBuffer = await file.arrayBuffer()
  if (detectRasterImageContentType(new Uint8Array(arrayBuffer)) !== file.type)
    throw createError({ status: 400, statusText: 'File data does not match the declared image type' })

  const ext = file.type.split('/')[1]
  const key = `images/${slugResult.data}/${nanoid(10)()}.${ext}`

  await R2.put(key, arrayBuffer, {
    httpMetadata: {
      contentType: file.type,
    },
  })

  const imageUrl = `/_assets/${key}`
  return { url: imageUrl, key }
})
