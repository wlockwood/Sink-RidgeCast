defineRouteMeta({
  openAPI: {
    description: 'Generate OpenGraph title and description from a URL supplied in the request body',
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: { 'application/json': {} },
    },
  },
})

export default eventHandler(async (event) => {
  const body = await readValidatedBody(event, LinkPreviewRequestSchema.parse)
  return await generateLinkPreview(event, body)
})
