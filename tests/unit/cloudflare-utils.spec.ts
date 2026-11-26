import type { H3Event } from 'h3'
import type { Compilable } from 'kysely'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { blobs2logs, writeAccessLog } from '../../server/utils/access-log'
import { useWAE } from '../../server/utils/cloudflare'

vi.mock('#shared/utils/flag', () => ({ getFlag: vi.fn() }))

const event = {
  context: {
    cloudflare: { env: {} },
    link: { id: 'link-id' },
  },
} as unknown as H3Event

const query = {} as Compilable

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('writeAccessLog', () => {
  it('silently skips production writes without an Analytics Engine binding', () => {
    vi.stubEnv('NODE_ENV', 'production')

    expect(() => writeAccessLog(event, {})).not.toThrow()
  })

  it('records clicks on long fragment URLs within the Analytics Engine blob budget', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const writeDataPoint = vi.fn()
    const analyticsEvent = {
      context: {
        cloudflare: { env: { ANALYTICS: { writeDataPoint } } },
        link: { id: 'link-id' },
      },
    } as unknown as H3Event
    const page = 'https://geojson.io/'
    const logs = blobs2logs(['map-slug', `${page}#${'a'.repeat(65_500)}`, 'é'.repeat(8000)])

    writeAccessLog(analyticsEvent, logs as Parameters<typeof writeAccessLog>[1])

    expect(writeDataPoint).toHaveBeenCalledOnce()
    const { indexes, blobs } = writeDataPoint.mock.calls[0]![0]
    expect(indexes).toEqual(['link-id'])
    expect(blobs[0]).toBe('map-slug')
    expect(blobs[1] === page).toBe(true)
    expect(new TextEncoder().encode(blobs.join('')).byteLength).toBeLessThanOrEqual(16_000)
  })

  it('keeps visitor IPs and referrers when the destination would fill the blob budget', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const writeDataPoint = vi.fn()
    const analyticsEvent = {
      context: {
        cloudflare: { env: { ANALYTICS: { writeDataPoint } } },
        link: { id: 'link-id' },
      },
    } as unknown as H3Event
    const prefix = 'https://geojson.io/?view='
    const page = prefix + 'a'.repeat(15_989 - prefix.length)
    const url = `${page}#${'b'.repeat(65_536 - page.length - 1)}`
    const ipAddresses = ['192.0.2.1', '192.0.2.2']
    for (const ip of ipAddresses) {
      const logs = blobs2logs(['map-slug000', url, 'Browser', ip, 'example.com'])
      writeAccessLog(analyticsEvent, logs as Parameters<typeof writeAccessLog>[1])
    }

    const recorded = writeDataPoint.mock.calls.map(([data]) => blobs2logs(data.blobs))
    expect(recorded.map(log => ({ ip: log.ip, referer: log.referer }))).toEqual(
      ipAddresses.map(ip => ({ ip, referer: 'example.com' })),
    )
  })
})

describe('useWAE', () => {
  it.each([
    { cfAccountId: '', cfApiToken: 'token' },
    { cfAccountId: 'account', cfApiToken: '' },
  ])('returns empty data without requesting when credentials are incomplete', (config) => {
    const fetchMock = vi.fn()
    vi.stubGlobal('useRuntimeConfig', () => config)
    vi.stubGlobal('$fetch', fetchMock)

    expect(useWAE(event, query)).toEqual({ data: [] })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('preserves requests and propagates errors when credentials are complete', async () => {
    const error = new Error('forbidden')
    const fetchMock = vi.fn().mockRejectedValue(error)
    vi.stubGlobal('useRuntimeConfig', () => ({
      cfAccountId: 'account',
      cfApiToken: 'token',
    }))
    vi.stubGlobal('compileAnalyticsQuery', () => 'select * from sink')
    vi.stubGlobal('$fetch', fetchMock)

    await expect(useWAE(event, query)).rejects.toBe(error)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/account/analytics_engine/sql',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer token' },
        body: 'select * from sink',
        retry: 1,
        retryDelay: 100,
      },
    )
  })
})
