import type { H3Event } from 'h3'
import type { Link } from '../../shared/schemas/link'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLinks, getLink } from '../../server/utils/link-store'

const mocks = vi.hoisted(() => ({
  d1CreateLinks: vi.fn(),
  d1GetActiveLink: vi.fn(),
  d1GetActiveLinkVersions: vi.fn(),
  deleteLinkCache: vi.fn(),
  putLinkCache: vi.fn(),
  readCompletedLinkMigrationMarker: vi.fn(),
  readLegacyKvLink: vi.fn(),
}))

vi.mock('../../server/services/link-store/d1', () => ({
  d1CountLinks: vi.fn(),
  d1CreateLink: vi.fn(),
  d1CreateLinks: mocks.d1CreateLinks,
  d1DeleteLink: vi.fn(),
  d1GetActiveLink: mocks.d1GetActiveLink,
  d1GetActiveLinkVersions: mocks.d1GetActiveLinkVersions,
  d1GetAnyLink: vi.fn(),
  d1GetLinkWithMetadata: vi.fn(),
  d1HasActiveLinkVersion: vi.fn(),
  d1IterateAllLinks: vi.fn(),
  d1ListLinks: vi.fn(),
  d1ListTags: vi.fn(),
  d1SearchLinks: vi.fn(),
  d1UpdateLink: vi.fn(),
}))

vi.mock('../../server/services/link-store/kv', () => ({
  deleteLinkCache: mocks.deleteLinkCache,
  isActiveLinkExpiration: () => true,
  putLinkCache: mocks.putLinkCache,
  readLegacyKvLink: mocks.readLegacyKvLink,
}))

vi.mock('../../server/services/link-store/migration', () => ({
  insertMigratedKvLink: vi.fn(),
  readCompletedLinkMigrationMarker: mocks.readCompletedLinkMigrationMarker,
}))

describe('getLink', () => {
  const event = { context: { cloudflare: { env: {} } } } as H3Event
  const link: Link = {
    id: 'test-id',
    slug: 'test-slug',
    url: 'https://example.com',
    createdAt: 1,
    updatedAt: 1,
    tags: [],
  }

  afterEach(() => vi.resetAllMocks())

  it('uses legacy KV while migration is incomplete', async () => {
    mocks.readCompletedLinkMigrationMarker.mockResolvedValue(null)
    mocks.readLegacyKvLink.mockResolvedValue({ link })

    await expect(getLink(event, link.slug, 60)).resolves.toEqual(link)
    expect(mocks.readLegacyKvLink).toHaveBeenCalledWith(event, link.slug, 60)
    expect(mocks.d1GetActiveLink).not.toHaveBeenCalled()
  })

  it('uses the current password policy even when KV holds an older version', async () => {
    const current = { ...link, password: 'current-password' }
    mocks.readCompletedLinkMigrationMarker.mockResolvedValue({ version: 1 })
    mocks.readLegacyKvLink.mockResolvedValue({ link })
    mocks.d1GetActiveLink.mockResolvedValue({ link: current })

    await expect(getLink(event, link.slug)).resolves.toEqual(current)
    expect(mocks.readLegacyKvLink).not.toHaveBeenCalled()
  })

  it('ignores a legacy KV record after the authoritative row is deleted', async () => {
    mocks.readCompletedLinkMigrationMarker.mockResolvedValue({ version: 1 })
    mocks.readLegacyKvLink.mockResolvedValue({ link })
    mocks.d1GetActiveLink.mockResolvedValue(null)

    await expect(getLink(event, link.slug)).resolves.toBeNull()
    expect(mocks.readLegacyKvLink).not.toHaveBeenCalled()
  })
})

describe('createLinks', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('keeps D1 success when post-write cache verification fails', async () => {
    const link: Link = {
      id: 'bulk-id',
      slug: 'bulk-success',
      url: 'https://example.com',
      createdAt: 1,
      updatedAt: 1,
      tags: [],
    }
    mocks.d1CreateLinks.mockResolvedValue([{ created: true, effectiveExpiresAt: null }])
    mocks.putLinkCache.mockResolvedValue(true)
    mocks.d1GetActiveLinkVersions.mockRejectedValue(new Error('version query failed'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(createLinks({} as H3Event, [link])).resolves.toEqual([{ created: true }])

    expect(mocks.d1CreateLinks).toHaveBeenCalledOnce()
    expect(mocks.deleteLinkCache).toHaveBeenCalledWith(expect.anything(), link.slug)
    expect(consoleError).toHaveBeenCalledWith(expect.objectContaining({ operation: 'bulk-write-through' }))
  })
})
