import { RotateApplicationTokenSchema } from '#shared/schemas/application-link-token'
import { APPLICATION_TOKEN_BODY_LIMIT } from '#shared/utils/request-limits'

defineRouteMeta({
  openAPI: {
    description: 'Replace an application token secret while keeping its usage history',
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
  const { version } = await readBoundedJsonBody(event, RotateApplicationTokenSchema, APPLICATION_TOKEN_BODY_LIMIT)
  const issued = await rotateApplicationLinkToken(event, getRouterParam(event, 'id')!, version)
  if (!issued)
    throw createError({ status: 409, statusText: 'Application token changed or cannot be rotated' })

  return issued
})
