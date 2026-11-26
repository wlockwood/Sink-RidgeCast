defineRouteMeta({
  openAPI: {
    description: 'Generate OpenGraph title and description using AI based on the URL',
    security: [{ bearerAuth: [] }],
    parameters: [
      {
        name: 'url',
        in: 'query',
        required: true,
        schema: { type: 'string', format: 'uri' },
        description: 'The URL to generate OpenGraph metadata for',
      },
      {
        name: 'locale',
        in: 'query',
        required: false,
        schema: { type: 'string' },
        description: 'Preferred locale for the generated metadata',
      },
    ],
  },
})

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, LinkPreviewRequestSchema.parse)
  return await generateLinkPreview(event, query)
})
