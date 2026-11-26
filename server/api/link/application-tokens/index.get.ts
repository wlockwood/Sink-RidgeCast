defineRouteMeta({
  openAPI: {
    description: 'List application create tokens and their usage',
    security: [{ bearerAuth: [] }],
  },
})

export default eventHandler(async (event) => {
  assertApplicationTokenAdmin(event)
  return listApplicationLinkTokens(event)
})
