import type { H3Event } from 'h3'
import type { ApplicationLinkCredential, ApplicationLinkToken, ApplicationLinkTokenList, IssuedApplicationLinkToken } from '#shared/schemas/application-link-token'
import { and, desc, eq, isNull, ne } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { ENVIRONMENT_APPLICATION_TOKEN_ID } from '../../shared/schemas/application-link-token'
import { applicationLinkTokens } from '../database/schema'

export const MANAGED_APPLICATION_TOKEN_PATTERN = /^sink_ct_[\da-f]{64}$/
const tokenFields = {
  id: applicationLinkTokens.id,
  name: applicationLinkTokens.name,
  version: applicationLinkTokens.version,
  createdAt: applicationLinkTokens.createdAt,
  rotatedAt: applicationLinkTokens.rotatedAt,
  revokedAt: applicationLinkTokens.revokedAt,
  lastUsedAt: applicationLinkTokens.lastUsedAt,
  linksCreated: applicationLinkTokens.linksCreated,
}

function database(event: H3Event) {
  return drizzle(event.context.cloudflare.env.DB)
}

function encodeHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

async function hashToken(secret: string): Promise<string> {
  return encodeHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))))
}

export function getEnvironmentApplicationToken(event: H3Event): string | undefined {
  const env = event.context.cloudflare?.env
  // Read the literal binding before Nuxt deserializes numeric or JSON-like secrets.
  const secret = env && 'NUXT_LINK_CREATE_TOKEN' in env ? env.NUXT_LINK_CREATE_TOKEN : useRuntimeConfig(event).linkCreateToken
  return typeof secret === 'string' ? secret : undefined
}

export function isValidEnvironmentApplicationToken(secret: string | undefined): secret is string {
  return Boolean(secret && /^\S{8,}$/.test(secret))
}

export function getDashboardSiteToken(event: H3Event): string {
  return event.context.cloudflare?.env?.NUXT_SITE_TOKEN ?? String(useRuntimeConfig(event).siteToken ?? '')
}

export function assertApplicationTokenAdmin(event: H3Event): void {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  if (!event.context.authMethod)
    throw createError({ status: 401, statusText: 'Unauthorized' })
}

export function activeApplicationToken(credential: ApplicationLinkCredential) {
  return and(
    eq(applicationLinkTokens.id, credential.id),
    isNull(applicationLinkTokens.revokedAt),
    credential.tokenHash === null ? isNull(applicationLinkTokens.tokenHash) : eq(applicationLinkTokens.tokenHash, credential.tokenHash),
  )
}

export async function findApplicationLinkCredential(event: H3Event, secret: string): Promise<ApplicationLinkCredential | undefined> {
  const tokenHash = await hashToken(secret)
  const row = await database(event).select({ id: applicationLinkTokens.id }).from(applicationLinkTokens).where(and(eq(applicationLinkTokens.tokenHash, tokenHash), isNull(applicationLinkTokens.revokedAt))).get()
  return row && { id: row.id, tokenHash }
}

export async function findEnvironmentApplicationLinkCredential(event: H3Event): Promise<ApplicationLinkCredential | undefined> {
  const credential = { id: ENVIRONMENT_APPLICATION_TOKEN_ID, tokenHash: null }
  const row = await database(event).select({ id: applicationLinkTokens.id }).from(applicationLinkTokens).where(activeApplicationToken(credential)).get()
  return row && credential
}

export async function listApplicationLinkTokens(event: H3Event): Promise<ApplicationLinkTokenList> {
  const tokens = await database(event).select(tokenFields).from(applicationLinkTokens).orderBy(desc(applicationLinkTokens.createdAt), desc(applicationLinkTokens.id))
  const environmentToken = getEnvironmentApplicationToken(event)
  const environment = tokens.find(token => token.id === ENVIRONMENT_APPLICATION_TOKEN_ID)
  const environmentActive = environment?.revokedAt === null && isValidEnvironmentApplicationToken(environmentToken) && environmentToken !== getDashboardSiteToken(event)
  return { tokens, environmentActive }
}

async function generateApplicationToken() {
  const secret = `sink_ct_${encodeHex(crypto.getRandomValues(new Uint8Array(32)))}`
  return { secret, tokenHash: await hashToken(secret) }
}

export async function createApplicationLinkToken(event: H3Event, name: string): Promise<IssuedApplicationLinkToken> {
  const { secret, tokenHash } = await generateApplicationToken()
  const token = await database(event).insert(applicationLinkTokens).values({ id: crypto.randomUUID(), name, tokenHash, createdAt: Date.now() }).returning(tokenFields).get()
  return { secret, token }
}

export async function rotateApplicationLinkToken(event: H3Event, id: string, version: number): Promise<IssuedApplicationLinkToken | undefined> {
  const { secret, tokenHash } = await generateApplicationToken()
  const token = await database(event).update(applicationLinkTokens).set({ tokenHash, version: version + 1, rotatedAt: Date.now() }).where(and(
    eq(applicationLinkTokens.id, id),
    ne(applicationLinkTokens.id, ENVIRONMENT_APPLICATION_TOKEN_ID),
    eq(applicationLinkTokens.version, version),
    isNull(applicationLinkTokens.revokedAt),
  )).returning(tokenFields).get()
  return token && { secret, token }
}

export async function revokeApplicationLinkToken(event: H3Event, id: string): Promise<ApplicationLinkToken | undefined> {
  const db = database(event)
  const where = eq(applicationLinkTokens.id, id)
  const updated = await db.update(applicationLinkTokens)
    .set({ tokenHash: null, revokedAt: Date.now() })
    .where(and(where, isNull(applicationLinkTokens.revokedAt)))
    .returning(tokenFields)
    .get()
  return updated ?? await db.select(tokenFields).from(applicationLinkTokens).where(where).get()
}
