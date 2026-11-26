defineRouteMeta({
  openAPI: {
    description: 'Manually trigger a backup to R2',
    security: [{ bearerAuth: [] }],
  },
})

export default eventHandler(async (event) => {
  if (useRuntimeConfig(event).public.previewMode) {
    setResponseStatus(event, 403, 'Preview mode cannot back up links.')
    return { success: false, message: 'Preview mode cannot back up links.' }
  }
  const env = event.context.cloudflare.env
  const result = await backupLinksToR2(env, true)
  if (!result.completed && result.reason === 'migration-incomplete')
    throw createError({ status: 423, statusText: 'Link migration is required' })
  if (!result.completed)
    requireR2Bucket(env)

  return {
    success: true,
    message: 'Backup completed successfully',
  }
})
