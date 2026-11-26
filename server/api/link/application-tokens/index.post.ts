import { CreateApplicationTokenSchema } from '#shared/schemas/application-link-token'
import { APPLICATION_TOKEN_BODY_LIMIT } from '#shared/utils/request-limits'

defineRouteMeta({
  openAPI: {
    description: 'Create an application token and return its secret once',
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: { 'application/json': {} },
    },
  },
})

export default eventHandler(async (event) => {
  assertApplicationTokenAdmin(event)
  assertLinkWritesAllowed(event, 'configure application')
  const { name } = await readBoundedJsonBody(event, CreateApplicationTokenSchema, APPLICATION_TOKEN_BODY_LIMIT)
  const issued = await createApplicationLinkToken(event, name)
  setResponseStatus(event, 201)
  return issued
})
