import type { ApplicationLinkSettings } from '../../shared/schemas/application-link'
import type { Link } from '../../shared/schemas/link'
import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearLinkMigrationState, deleteStoredLink, deleteStoredLinks, fetch, fetchWithAuth, getD1Link, postJson, putJson, setLinkStoreD1Mode } from '../utils'

const appToken = 'test-application-link-token'
const endpoint = '/api/link/shorten'
const settingsEndpoint = '/api/link/application-settings'
const allowedPage = 'https://maps.example.com/share/view'
const allowedUrl = `${allowedPage}?id=42#map`
const allowedUrls = ['https://maps.example.com/share/', 'https://www.example.com/map']
const createdSlugs: string[] = []
const runtimeEnv: typeof env & { NUXT_LINK_CREATE_TOKEN?: string } = env

function requestShortLink(url: string, extra: Record<string, unknown> = {}, path = endpoint) {
  return fetch(path, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${appToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, ...extra }),
  })
}

async function readSettings(): Promise<ApplicationLinkSettings> {
  const response = await fetchWithAuth(settingsEndpoint)
  expect(response.status).toBe(200)
  return await response.json() as ApplicationLinkSettings
}

async function updateRules(allowedUrls: string[]): Promise<Response> {
  const { revision } = await readSettings()
  return await putJson(settingsEndpoint, { allowedUrls, revision })
}

describe(endpoint, () => {
  beforeEach(async () => {
    await setLinkStoreD1Mode()
    runtimeEnv.NUXT_LINK_CREATE_TOKEN = appToken
    expect((await updateRules(allowedUrls)).status).toBe(200)
  })

  afterEach(async () => {
    runtimeEnv.NUXT_LINK_CREATE_TOKEN = ''
    await updateRules([])
    await deleteStoredLinks(createdSlugs.splice(0))
    await clearLinkMigrationState()
  })

  it.each([allowedUrl, 'https://www.example.com/map?zoom=12'])('creates a random short link for %s', async (url) => {
    const response = await requestShortLink(url)
    expect(response.status).toBe(201)
    const { link, shortLink } = await response.json() as { link: Link, shortLink: string }
    createdSlugs.push(link.slug)

    expect(link.slug).toMatch(/^[2-9a-hjkmnp-z]{11}$/)
    expect(shortLink).toBe(`http://localhost/${link.slug}`)
    expect(await getD1Link(link.slug)).toMatchObject({ url, redirectWithQuery: false })
    const redirect = await fetch(`/${link.slug}?id=untrusted`, { redirect: 'manual' })
    expect(redirect.headers.get('Location')).toBe(url)
  })

  it.each([['rc123', /^rc123[2-9a-hjkmnp-z]{6}$/], ['RC-', /^rc-[2-9a-hjkmnp-z]{8}$/]])('starts the generated slug with the prefix %s', async (prefix, expected) => {
    const response = await requestShortLink(allowedUrl, { prefix })
    expect(response.status).toBe(201)
    const { link } = await response.json() as { link: Link }
    createdSlugs.push(link.slug)
    expect(link.slug).toMatch(expected)
  })

  it('accepts an explicitly empty prefix', async () => {
    const response = await requestShortLink(allowedUrl, { prefix: '' })
    expect(response.status).toBe(201)
    const { link } = await response.json() as { link: Link }
    createdSlugs.push(link.slug)
    expect(link.slug).toMatch(/^[2-9a-hjkmnp-z]{11}$/)
  })

  it.each(['abcdef', '-abc', 'ab--c', 'ab/c', 'ab c', 'ab\n', 123])('rejects the invalid prefix %j', async (prefix) => {
    expect((await requestShortLink(allowedUrl, { prefix })).status).toBe(400)
  })

  it.each([
    'http://maps.example.com/share/view',
    'https://maps.example.com:8443/share/view',
    'https://maps.example.com.other.example/share/view',
    'https://sub.maps.example.com/share/view',
    'https://maps.example.com@other.example/share/view',
    'https://user:pass@maps.example.com/share/view',
    'https://maps.example.com/share-other/view',
    'https://maps.example.com/share/../other/view',
    'https://maps.example.com/share/foo%2F..%2F..%2Fother',
    'https://www.example.com/map/child',
  ])('forbids destinations outside the configured HTTPS origin and path: %s', async (url) => {
    expect((await requestShortLink(url)).status).toBe(403)
  })

  it('rejects destinations that exceed the URL limit after encoding', async () => {
    const url = `https://maps.example.com/share/${'😀'.repeat(2000)}`
    expect((await requestShortLink(url)).status).toBe(400)
  })

  it('stores and redirects to a 64 KiB fragment-bearing destination intact', async () => {
    const base = `${allowedPage}?mode=map#data=data:application/json;base64,`
    const url = base + 'A'.repeat(65_536 - base.length)
    const response = await requestShortLink(url)
    if (response.status === 201) {
      const { link } = await response.json() as { link: Link }
      createdSlugs.push(link.slug)
      expect(await getD1Link(link.slug)).toMatchObject({ url, redirectWithQuery: false })
      const redirect = await fetch(`/${link.slug}?mode=other`, { redirect: 'manual' })
      expect(redirect.status).toBe(302)
      expect(redirect.headers.get('Cache-Control')).toBe('no-store')
      expect(redirect.headers.get('Location') === url).toBe(true)
    }
    expect(response.status).toBe(201)
  })

  it('applies the 64 KiB limit after removing an explicit default port', async () => {
    const url = `${allowedPage}#${'a'.repeat(65_536 - allowedPage.length - 1)}`
    const submitted = url.replace('maps.example.com', 'maps.example.com:443')
    const response = await requestShortLink(submitted)
    expect(response.status).toBe(201)
    const { link } = await response.json() as { link: Link }
    createdSlugs.push(link.slug)
    expect(link.url === url).toBe(true)
  })

  it('finds a stored long destination via the exact URL search body', async () => {
    const url = `${allowedPage}#${'a'.repeat(40_000)}`
    const response = await requestShortLink(url)
    expect(response.status).toBe(201)
    const { link } = await response.json() as { link: Link }
    createdSlugs.push(link.slug)
    const search = await postJson('/api/link/search', { url })
    expect(search.status).toBe(200)
    const results = await search.json() as Link[]
    expect(results.some(item => item.slug === link.slug && item.url === url)).toBe(true)
  })

  it.each([
    ['one byte over 64 KiB', `${allowedPage}#${'a'.repeat(65_537 - allowedPage.length - 1)}`, 400],
    ['over 64 KiB after encoding', `${allowedPage}#${'😀'.repeat(5500)}`, 400],
    ['with an oversized query', `${allowedPage}?data=${'a'.repeat(16_384)}#map`, 400],
    ['outside the allowlist', `https://unlisted.example/#${'a'.repeat(40_000)}`, 403],
  ])('rejects a destination %s', async (_label, url, status) => {
    const response = await requestShortLink(url)
    if (response.status === 201) {
      const { link } = await response.json() as { link: Link }
      createdSlugs.push(link.slug)
    }
    expect(response.status).toBe(status)
  })

  it('allows updates that keep the existing long destination', async () => {
    const url = `${allowedPage}#${'a'.repeat(40_000)}`
    const response = await requestShortLink(url)
    expect(response.status).toBe(201)
    const { link } = await response.json() as { link: Link }
    createdSlugs.push(link.slug)
    const edited = await putJson('/api/link/edit', { url, slug: link.slug, comment: 'Shared map' })
    expect(edited.status).toBe(201)
    expect(await getD1Link(link.slug)).toMatchObject({ url, comment: 'Shared map', redirectWithQuery: false })
    expect((await putJson('/api/link/edit', { ...link, url: `${url}b` })).status).toBe(400)
    expect((await putJson('/api/link/edit', { ...link, redirectWithQuery: true })).status).toBe(400)
  })

  it('restores an exported long application link', async () => {
    const url = `${allowedPage}#${'a'.repeat(40_000)}`
    const response = await requestShortLink(url)
    expect(response.status).toBe(201)
    const { link } = await response.json() as { link: Link }
    createdSlugs.push(link.slug)
    const exported = await fetchWithAuth('/api/link/export')
    expect(exported.status).toBe(200)
    const data = await exported.json() as { version: string, links: Link[] }
    const saved = data.links.find(item => item.slug === link.slug)
    expect(saved?.url === url).toBe(true)
    await deleteStoredLink(link.slug)

    const imported = await postJson('/api/link/import', { version: data.version, links: [saved] })
    expect(imported.status).toBe(200)
    expect(await getD1Link(link.slug)).toMatchObject({ url, redirectWithQuery: false })
  })

  it('rejects a request whose JSON exceeds the shortening body limit', async () => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${appToken}`, 'Content-Type': 'application/json' },
      body: `${' '.repeat(192 * 1024)}${JSON.stringify({ url: allowedUrl })}`,
    })
    if (response.status === 201) {
      const { link } = await response.json() as { link: Link }
      createdSlugs.push(link.slug)
    }
    expect(response.status).toBe(413)
  })

  it('rejects an oversized body stream before application authentication', async () => {
    const chunk = new Uint8Array(32 * 1024)
    let remaining = 7
    const body = new ReadableStream({
      pull(controller) {
        if (remaining-- > 0)
          controller.enqueue(chunk)
        else
          controller.close()
      },
    })
    const response = await fetch('/api/link/%73horten', { method: 'POST', body })
    expect(response.status).toBe(413)
  })

  it('escapes the destination inside the redirect fallback document', async () => {
    const url = 'https://maps.example.com/share/view?label=A&amp;part=B'
    const response = await requestShortLink(url)
    expect(response.status).toBe(201)
    const { link } = await response.json() as { link: Link }
    createdSlugs.push(link.slug)

    const redirect = await fetch(`/${link.slug}`, { redirect: 'manual' })
    expect(redirect.headers.get('Location')).toBe(url)
    expect(await redirect.text()).toContain('label=A&amp;amp;part=B')
  })

  it.each(['slug', 'id', 'geo', 'apple', 'google', 'proxy', 'unsafe', 'redirectWithQuery'])(
    'rejects the caller-supplied %s field',
    async (field) => {
      expect((await requestShortLink(allowedUrl, { [field]: true })).status).toBe(400)
    },
  )

  it.each([
    ['GET', '/api/verify'],
    ['GET', '/api/link/list'],
    ['POST', '/api/link/create'],
    ['POST', '/api/link/upsert'],
    ['GET', endpoint],
    ['GET', settingsEndpoint],
    ['PUT', settingsEndpoint],
  ])('rejects the application token for %s %s', async (method, path) => {
    const response = await fetch(path, {
      method,
      headers: { Authorization: `Bearer ${appToken}` },
    })
    expect(response.status).toBe(401)
  })

  it('requires the application token on the restricted route', async () => {
    expect((await postJson(endpoint, { url: allowedUrl })).status).toBe(401)
  })

  it('disables application auth when its token is empty', async () => {
    runtimeEnv.NUXT_LINK_CREATE_TOKEN = ''
    expect((await requestShortLink(allowedUrl)).status).toBe(401)
    expect((await postJson(endpoint, { url: allowedUrl }, false)).status).toBe(401)
  })

  it('uses a numeric Worker secret literally', async () => {
    const numericToken = '1234567890123456'
    runtimeEnv.NUXT_LINK_CREATE_TOKEN = numericToken
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${numericToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: allowedUrl }),
    })
    expect(response.status).toBe(201)
    const { link } = await response.json() as { link: Link }
    createdSlugs.push(link.slug)
  })

  it('uses allowlist changes for subsequent requests', async () => {
    expect((await updateRules([])).status).toBe(200)
    expect((await requestShortLink(allowedUrl)).status).toBe(403)

    const updated = ['https://maps.example.com']
    expect((await updateRules(updated)).status).toBe(200)
    expect((await readSettings()).allowedUrls).toEqual(updated)

    const response = await requestShortLink('https://maps.example.com/other')
    expect(response.status).toBe(201)
    const { link } = await response.json() as { link: Link }
    createdSlugs.push(link.slug)
  })

  it.each([
    'http://example.com',
    'https://example.com/path/../',
    'https://example.com/?x=1',
    'https://example.com/#map',
    'https://exam\nple.com',
  ])(
    'rejects the invalid allowlist rule %s without changing the saved list',
    async (rule) => {
      expect((await updateRules([rule])).status).toBe(400)
      expect((await readSettings()).allowedUrls).toEqual(allowedUrls)
    },
  )

  it('refuses to use the dashboard token as the application token', async () => {
    runtimeEnv.NUXT_LINK_CREATE_TOKEN = import.meta.env.NUXT_SITE_TOKEN
    expect((await postJson(endpoint, { url: allowedUrl })).status).toBe(401)
    expect((await fetchWithAuth('/api/verify')).status).toBe(401)
    expect((await fetchWithAuth(settingsEndpoint)).status).toBe(401)
  })

  it('preserves a saved removal when another session submits stale settings', async () => {
    const { revision } = await readSettings()
    expect(Number.isSafeInteger(revision)).toBe(true)

    expect((await putJson(settingsEndpoint, { allowedUrls: [], revision })).status).toBe(200)
    expect((await putJson(settingsEndpoint, { allowedUrls, revision })).status).toBe(409)
    expect((await requestShortLink(allowedUrl)).status).toBe(403)
  })

  it.each([endpoint, '/api/link/%73horten?test=1'])('requires the link store migration to be complete for %s', async (path) => {
    await clearLinkMigrationState()
    expect((await requestShortLink(allowedUrl, {}, path)).status).toBe(423)
  })
})
