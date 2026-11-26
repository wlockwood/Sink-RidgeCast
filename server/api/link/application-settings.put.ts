import { ApplicationLinkSettingsSchema } from '#shared/schemas/application-link'
import { APPLICATION_SETTINGS_BODY_LIMIT } from '#shared/utils/request-limits'

defineRouteMeta({
  openAPI: {
    description: 'Replace the dashboard-managed application link allowlist',
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: { 'application/json': {} },
    },
  },
})

export default eventHandler(async (event) => {
  assertLinkWritesAllowed(event, 'configure application')
  // Leave room for every configured URL to be fully escaped in JSON.
  const settings = await readBoundedJsonBody(event, ApplicationLinkSettingsSchema, APPLICATION_SETTINGS_BODY_LIMIT)
  const saved = await saveApplicationLinkSettings(event, settings)
  if (!saved)
    throw createError({ status: 409, statusText: 'Application link settings changed' })

  setResponseHeader(event, 'Cache-Control', 'no-store')
  return saved
})
