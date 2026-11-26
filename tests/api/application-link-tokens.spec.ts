import type { ApplicationLinkTokenList, IssuedApplicationLinkToken } from '../../shared/schemas/application-link-token'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { expect, it } from 'vitest'
import { applicationLinkTokens } from '../../server/database/schema'
import { ENVIRONMENT_APPLICATION_TOKEN_ID } from '../../shared/schemas/application-link-token'
import { clearLinkMigrationState, db, deleteStoredLinks, fetch, fetchWithAuth, postJson, putJson, setLinkStoreD1Mode } from '../utils'

const endpoint = '/api/link/application-tokens'
const settingsEndpoint = '/api/link/application-settings'
const destination = 'https://managed-tokens.example.com/link'

function shorten(secret: string, url = destination) {
  return fetch('/api/link/shorten', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
}

it('manages application credentials and counts successful links across rotation and revocation', async () => {
  const slugs: string[] = []
  const settings = await (await fetchWithAuth(settingsEndpoint)).json<{ allowedUrls: string[], revision: number }>()
  await setLinkStoreD1Mode()
  let tokenId: string | undefined
  try {
    expect((await putJson(settingsEndpoint, { ...settings, allowedUrls: [destination] })).status).toBe(200)
    expect((await postJson(endpoint, { name: 'Maps' }, false)).status).toBe(401)
    const create = await postJson(endpoint, { name: 'Maps' })
    expect(create.status).toBe(201)
    expect(create.headers.get('Cache-Control')).toBe('no-store')
    const issued = await create.json<IssuedApplicationLinkToken>()
    const { secret, token } = issued
    expect(secret).toMatch(/^sink_ct_[0-9a-f]{64}$/)
    expect(token).toMatchObject({ name: 'Maps', linksCreated: 0, lastUsedAt: null })
    tokenId = token.id
    const tokenPath = `${endpoint}/${tokenId}`

    expect((await fetch(endpoint, { headers: { Authorization: `Bearer ${secret}` } })).status).toBe(401)
    expect((await fetch(tokenPath, { method: 'DELETE', headers: { Authorization: `Bearer ${secret}` } })).status).toBe(401)
    expect((await shorten(secret, 'https://unlisted.example.com')).status).toBe(403)
    const first = await shorten(secret)
    expect(first.status).toBe(201)
    slugs.push((await first.json<{ link: { slug: string } }>()).link.slug)

    const rotations = await Promise.all([
      postJson(`${tokenPath}/rotate`, { version: token.version }),
      postJson(`${tokenPath}/rotate`, { version: token.version }),
    ])
    expect(rotations.map(response => response.status).sort()).toEqual([200, 409])
    const rotated = await rotations.find(response => response.ok)!.json<IssuedApplicationLinkToken>()
    expect(rotated.token).toMatchObject({ id: token.id, linksCreated: 1, lastUsedAt: expect.any(Number) })
    expect(rotated.secret).not.toBe(secret)
    expect((await shorten(secret)).status).toBe(401)
    const second = await shorten(rotated.secret)
    expect(second.status).toBe(201)
    slugs.push((await second.json<{ link: { slug: string } }>()).link.slug)

    const revoke = await fetchWithAuth(tokenPath, { method: 'DELETE' })
    expect(revoke.status).toBe(200)
    expect((await shorten(rotated.secret)).status).toBe(401)
    expect(await db.select({ tokenHash: applicationLinkTokens.tokenHash }).from(applicationLinkTokens).where(eq(applicationLinkTokens.id, tokenId)).get())
      .toEqual({ tokenHash: null })

    const list = await fetchWithAuth(endpoint)
    expect(list.headers.get('Cache-Control')).toBe('no-store')
    const body = await list.text()
    expect(body).not.toContain(secret)
    expect(body).not.toContain(rotated.secret)
    expect(body).not.toContain('tokenHash')
    const { tokens } = JSON.parse(body) as ApplicationLinkTokenList
    expect(tokens.find(item => item.id === token.id)).toMatchObject({ linksCreated: 2, revokedAt: expect.any(Number) })
  }
  finally {
    if (tokenId)
      await db.delete(applicationLinkTokens).where(eq(applicationLinkTokens.id, tokenId))
    const { revision } = await (await fetchWithAuth(settingsEndpoint)).json<{ revision: number }>()
    await putJson(settingsEndpoint, { ...settings, revision })
    await deleteStoredLinks(slugs)
    await clearLinkMigrationState()
  }
})

it('tracks and retires the environment credential from the dashboard', async () => {
  const slugs: string[] = []
  const secret = 'test-legacy-application-credential'
  const runtimeEnv: typeof env & { NUXT_LINK_CREATE_TOKEN?: string } = env
  const previousSecret = runtimeEnv.NUXT_LINK_CREATE_TOKEN
  const id = ENVIRONMENT_APPLICATION_TOKEN_ID
  const predicate = eq(applicationLinkTokens.id, id)
  const initialToken = (await db.select().from(applicationLinkTokens).where(predicate).get())!
  const settings = await (await fetchWithAuth(settingsEndpoint)).json<{ allowedUrls: string[], revision: number }>()
  await setLinkStoreD1Mode()
  runtimeEnv.NUXT_LINK_CREATE_TOKEN = secret
  try {
    expect((await putJson(settingsEndpoint, { ...settings, allowedUrls: [destination] })).status).toBe(200)
    const list = await (await fetchWithAuth(endpoint)).json<ApplicationLinkTokenList>()
    expect(list.environmentActive).toBe(true)
    expect(list.tokens.find(token => token.id === id)).toMatchObject({ name: 'NUXT_LINK_CREATE_TOKEN', revokedAt: null })
    const created = await shorten(secret)
    expect(created.status).toBe(201)
    slugs.push((await created.json<{ link: { slug: string } }>()).link.slug)
    expect((await postJson(`${endpoint}/${id}/rotate`, { version: 1 })).status).toBe(409)
    runtimeEnv.NUXT_LINK_CREATE_TOKEN = ''
    const inactive = await (await fetchWithAuth(endpoint)).json<ApplicationLinkTokenList>()
    expect(inactive.environmentActive).toBe(false)
    expect(inactive.tokens.find(token => token.id === id)).toMatchObject({ linksCreated: initialToken.linksCreated + 1, revokedAt: null })
    const revoked = await fetchWithAuth(`${endpoint}/${id}`, { method: 'DELETE' })
    expect(revoked.status).toBe(200)
    expect(await revoked.json()).toMatchObject({ linksCreated: initialToken.linksCreated + 1, lastUsedAt: expect.any(Number), revokedAt: expect.any(Number) })
    runtimeEnv.NUXT_LINK_CREATE_TOKEN = secret
    expect((await shorten(secret)).status).toBe(401)
    const retired = await (await fetchWithAuth(endpoint)).json<ApplicationLinkTokenList>()
    expect(retired.environmentActive).toBe(false)
  }
  finally {
    runtimeEnv.NUXT_LINK_CREATE_TOKEN = previousSecret
    await db.update(applicationLinkTokens).set(initialToken).where(predicate)
    const { revision } = await (await fetchWithAuth(settingsEndpoint)).json<{ revision: number }>()
    await putJson(settingsEndpoint, { ...settings, revision })
    await deleteStoredLinks(slugs)
    await clearLinkMigrationState()
  }
})
