import type { H3Event } from 'h3'
import type { ApplicationLinkSettings } from '#shared/schemas/application-link'
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { applicationLinkSettings } from '../database/schema'

export const APPLICATION_LINK_SETTINGS_ID = 1
const settingsFields = {
  allowedUrls: applicationLinkSettings.allowedUrls,
  revision: applicationLinkSettings.revision,
}

export async function getApplicationLinkSettings(event: H3Event): Promise<ApplicationLinkSettings> {
  const db = drizzle(event.context.cloudflare.env.DB)
  const settings = await db.select(settingsFields)
    .from(applicationLinkSettings)
    .where(eq(applicationLinkSettings.id, APPLICATION_LINK_SETTINGS_ID))
    .get()

  return settings ?? { allowedUrls: [], revision: 0 }
}

export async function saveApplicationLinkSettings(event: H3Event, settings: ApplicationLinkSettings): Promise<ApplicationLinkSettings | undefined> {
  const db = drizzle(event.context.cloudflare.env.DB)
  const updated = { allowedUrls: settings.allowedUrls, revision: settings.revision + 1 }

  if (settings.revision === 0) {
    const [inserted] = await db.insert(applicationLinkSettings).values({ id: APPLICATION_LINK_SETTINGS_ID, ...updated }).onConflictDoNothing({ target: applicationLinkSettings.id }).returning(settingsFields)
    return inserted
  }

  const [saved] = await db.update(applicationLinkSettings).set(updated).where(and(
    eq(applicationLinkSettings.id, APPLICATION_LINK_SETTINGS_ID),
    eq(applicationLinkSettings.revision, settings.revision),
  )).returning(settingsFields)
  return saved
}
