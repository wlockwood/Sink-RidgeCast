import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

let schema: typeof import('../../shared/schemas/link')

beforeAll(async () => {
  vi.stubGlobal('useAppConfig', () => ({ slugRegex: /^[a-z0-9-]+$/i, reserveSlug: [] }))
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { slugDefaultLength: 6, maxUrlLength: 16_384 } }))
  schema = await import('../../shared/schemas/link')
})

afterAll(() => vi.unstubAllGlobals())

describe('link destination validation', () => {
  const link = {
    slug: 'historical-link',
    url: 'https://example.com/',
    id: 'legacy-id',
    createdAt: 1,
    updatedAt: 1,
  }
  const oldDestination = 'mailto:person@example.com'

  it.each([
    { url: oldDestination },
    { apple: oldDestination },
    { google: oldDestination },
    { geo: { US: oldDestination } },
  ])('rejects non-web destinations from new, edited and imported links (%o)', (destination) => {
    const data = { ...link, ...destination }
    expect(schema.CreateLinkSchema.safeParse(data).success).toBe(false)
    expect(schema.EditLinkSchema.safeParse(data).success).toBe(false)
    expect(schema.ImportLinkSchema.safeParse(data).success).toBe(false)
    expect(schema.StoredLinkSchema.safeParse(data).success).toBe(true)
    expect(schema.parseLegacyKvLink(data, data.slug).success).toBe(true)
  })

  it('accepts HTTP and HTTPS destinations in all writable URL fields', () => {
    const data = {
      ...link,
      apple: 'https://apps.apple.com/example',
      google: 'https://play.google.com/example',
      geo: { US: 'http://us.example.com/' },
    }
    expect(schema.CreateLinkSchema.safeParse(data).success).toBe(true)
    expect(schema.EditLinkSchema.safeParse(data).success).toBe(true)
    expect(schema.ImportLinkSchema.safeParse(data).success).toBe(true)
  })
})
