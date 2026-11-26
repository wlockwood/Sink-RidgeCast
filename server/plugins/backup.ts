/// <reference path="../../worker-configuration.d.ts" />

import { destr } from 'destr'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('cloudflare:scheduled', async (event) => {
    const config = useRuntimeConfig()
    const env = event.env as Cloudflare.Env
    const previewMode = destr(env.NUXT_PUBLIC_PREVIEW_MODE) ?? config.public.previewMode
    const disableAutoBackup = destr(env.NUXT_DISABLE_AUTO_BACKUP) ?? config.disableAutoBackup

    if (disableAutoBackup || previewMode) {
      console.info('[backup] Auto backup is disabled by configuration')
      return
    }

    await backupLinksToR2(env)
  })
})
