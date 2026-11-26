defineRouteMeta({
  openAPI: {
    description: 'Revoke an application token and keep its usage history',
    security: [{ bearerAuth: [] }],
  },
})

export default eventHandler(async (event) => {
  assertApplicationTokenAdmin(event)
  assertLinkWritesAllowed(event, 'configure application')
  const token = await revokeApplicationLinkToken(event, getRouterParam(event, 'id')!)
  if (!token)
    throw createError({ status: 404, statusText: 'Application token not found' })

  return token
})
