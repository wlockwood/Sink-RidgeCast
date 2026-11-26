defineRouteMeta({
  openAPI: {
    description: 'Read the dashboard-managed application link allowlist',
    security: [{ bearerAuth: [] }],
  },
})

export default eventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return await getApplicationLinkSettings(event)
})
