import type { H3Event } from 'h3'
import type { Link } from '../../shared/schemas/link'
import { env } from 'cloudflare:workers'
import { eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { expect, it, vi } from 'vitest'
import { applicationLinkSettings, applicationLinkTokens, links } from '../../server/database/schema'
import { d1CreateLink } from '../../server/services/link-store/d1'
import { ENVIRONMENT_APPLICATION_TOKEN_ID } from '../../shared/schemas/application-link-token'

it('commits application links only when the approved settings revision is current', async () => {
  const db = drizzle(env.DB)
  const event = { context: { cloudflare: { env } } } as unknown as H3Event
  const link: Link = {
    id: 'test-id',
    slug: `application-revision-${crypto.randomUUID()}`,
    url: 'https://example.com',
    createdAt: 1,
    updatedAt: 1,
    redirectWithQuery: false,
    tags: [],
  }
  const settings = await db.select().from(applicationLinkSettings).where(eq(applicationLinkSettings.id, 1)).get()
  const currentRevision = (settings?.revision ?? 0) + 2
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { previewMode: false } }))

  try {
    await db.insert(applicationLinkSettings)
      .values({ id: 1, allowedUrls: [], revision: currentRevision })
      .onConflictDoUpdate({ target: applicationLinkSettings.id, set: { allowedUrls: [], revision: currentRevision } })

    const credential = { id: ENVIRONMENT_APPLICATION_TOKEN_ID, tokenHash: null }
    await expect(d1CreateLink(event, link, { revision: currentRevision - 1, credential })).resolves.toMatchObject({ created: false })
    await expect(db.select().from(links).where(eq(links.slug, link.slug)).get()).resolves.toBeUndefined()

    await expect(d1CreateLink(event, link, { revision: currentRevision, credential })).resolves.toMatchObject({ created: true })
    await expect(db.select().from(links).where(eq(links.slug, link.slug)).get()).resolves.toMatchObject({ url: link.url, redirectWithQuery: false })
  }
  finally {
    await db.delete(links).where(eq(links.slug, link.slug))
    await db.delete(applicationLinkSettings).where(eq(applicationLinkSettings.id, 1))
    if (settings)
      await db.insert(applicationLinkSettings).values(settings)
    vi.unstubAllGlobals()
  }
})

it('writes usage only for a committed link under the still-active credential', async () => {
  const db = drizzle(env.DB)
  const id = crypto.randomUUID()
  const oldHash = 'previous-token-hash'
  const newHash = 'rotated-token-hash'
  const credential = { id, tokenHash: oldHash }
  const event = { context: { cloudflare: { env } } } as unknown as H3Event
  const link: Link = {
    id,
    slug: `application-usage-${id}`,
    url: 'https://example.com',
    createdAt: 1,
    updatedAt: 1,
    redirectWithQuery: false,
    tags: [],
  }
  const settings = await db.select().from(applicationLinkSettings).where(eq(applicationLinkSettings.id, 1)).get()
  const revision = (settings?.revision ?? 0) + 1
  const revokedSlug = `${link.slug}-revoked`
  const token = eq(applicationLinkTokens.id, id)
  const settingsRow = eq(applicationLinkSettings.id, 1)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { previewMode: false } }))

  try {
    await db.insert(applicationLinkSettings)
      .values({ id: 1, allowedUrls: [], revision })
      .onConflictDoUpdate({ target: applicationLinkSettings.id, set: { revision } })
    await db.insert(applicationLinkTokens).values({ id, name: 'Test', tokenHash: oldHash })
    await db.update(applicationLinkTokens).set({ tokenHash: newHash }).where(token)
    await expect(d1CreateLink(event, link, { revision, credential })).resolves.toMatchObject({ created: false })
    await expect(db.select().from(applicationLinkTokens).where(token).get()).resolves.toMatchObject({ linksCreated: 0, lastUsedAt: null })

    credential.tokenHash = newHash
    await expect(d1CreateLink(event, link, { revision: revision - 1, credential })).resolves.toMatchObject({ created: false })
    await expect(d1CreateLink(event, link, { revision, credential })).resolves.toMatchObject({ created: true })
    await expect(d1CreateLink(event, link, { revision, credential })).resolves.toMatchObject({ created: false })
    await db.update(applicationLinkTokens).set({ tokenHash: null, revokedAt: Date.now() }).where(token)
    await expect(d1CreateLink(event, { ...link, slug: revokedSlug }, { revision, credential })).resolves.toMatchObject({ created: false })
    await expect(db.select().from(applicationLinkTokens).where(token).get()).resolves.toMatchObject({ linksCreated: 1, lastUsedAt: expect.any(Number) })
  }
  finally {
    await db.delete(links).where(inArray(links.slug, [link.slug, revokedSlug]))
    await db.delete(applicationLinkTokens).where(token)
    await db.delete(applicationLinkSettings).where(settingsRow)
    if (settings)
      await db.insert(applicationLinkSettings).values(settings)
    vi.unstubAllGlobals()
  }
})
