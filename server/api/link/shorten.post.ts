import { getAllowedApplicationDestination, ShortenLinkSchema } from '#shared/schemas/application-link'
import { CreateLinkSchema, MAX_URL_LENGTH, nanoid } from '#shared/schemas/link'
import { APPLICATION_SHORTEN_BODY_LIMIT } from '#shared/utils/request-limits'

defineRouteMeta({
  openAPI: {
    $global: {
      components: {
        securitySchemes: {
          linkCreateBearer: {
            type: 'http',
            scheme: 'bearer',
            description: 'Use an Application Links create token or an active NUXT_LINK_CREATE_TOKEN as the bearer token',
          },
        },
      },
    },
    description: 'Create an application short link with a generated slug and an allowlisted destination',
    security: [{ linkCreateBearer: [] }],
    requestBody: {
      required: true,
      content: { 'application/json': {} },
    },
    responses: {
      201: {
        description: 'Application short link created',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['shortLink', 'link'],
              properties: {
                shortLink: { type: 'string', format: 'uri' },
                link: { type: 'object' },
              },
            },
          },
        },
      },
    },
  },
})

export default eventHandler(async (event) => {
  const credential = event.context.applicationLinkCredential
  if (!credential) {
    setResponseHeader(event, 'WWW-Authenticate', 'Bearer')
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const { url, prefix = '' } = await readBoundedJsonBody(event, ShortenLinkSchema, APPLICATION_SHORTEN_BODY_LIMIT)
  const { allowedUrls, revision } = await getApplicationLinkSettings(event)
  const destination = getAllowedApplicationDestination(url, allowedUrls)
  if (!destination)
    throw createError({ status: 403, statusText: 'Destination is not allowed' })
  if (destination.length > MAX_URL_LENGTH)
    throw createError({ status: 400, statusText: 'Encoded destination URL exceeds the maximum length' })

  const configuredLength = Number(useRuntimeConfig(event).public.slugDefaultLength)
  // Keep at least six random characters even when the caller uses a five-character prefix.
  const slugLength = Number.isInteger(configuredLength) && configuredLength <= 2048 ? Math.max(11, configuredLength) : 11
  const slug = prefix + nanoid(slugLength - prefix.length)()
  const link = CreateLinkSchema.parse({ url: destination, slug, redirectWithQuery: false })
  const response = await saveNewLink(event, link, { revision, credential })

  setResponseStatus(event, 201)
  return response
})
