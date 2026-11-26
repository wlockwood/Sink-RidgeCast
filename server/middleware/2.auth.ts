import { timingSafeEqual } from 'node:crypto'

const APPLICATION_SHORTEN_ROUTE = /^\/api\/link\/shorten\/?(?:\?|$)/

export default eventHandler(async (event) => {
  if (!event.path.startsWith('/api/'))
    return

  const authorization = getHeader(event, 'Authorization')
  const siteToken = getDashboardSiteToken(event)
  const linkCreateToken = getEnvironmentApplicationToken(event)
  const duplicateToken = Boolean(linkCreateToken && linkCreateToken === siteToken)
  if (event.method === 'POST' && APPLICATION_SHORTEN_ROUTE.test(event.path)) {
    const bearer = authorization?.match(/^Bearer +(\S+)$/i)?.[1]
    if (bearer && !await verifyToken(bearer, siteToken)) {
      if (isValidEnvironmentApplicationToken(linkCreateToken) && await verifyToken(bearer, linkCreateToken))
        event.context.applicationLinkCredential = await findEnvironmentApplicationLinkCredential(event)
      else if (MANAGED_APPLICATION_TOKEN_PATTERN.test(bearer))
        event.context.applicationLinkCredential = await findApplicationLinkCredential(event, bearer)
    }
    if (event.context.applicationLinkCredential)
      return

    setResponseHeader(event, 'WWW-Authenticate', 'Bearer')
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const token = authorization?.replace(/^Bearer\s+/, '')
  if (!duplicateToken && token && !MANAGED_APPLICATION_TOKEN_PATTERN.test(token) && await verifyToken(token, siteToken)) {
    event.context.authMethod = 'site-token'
    event.context.userID = 'root'
    event.context.userEmail = `root@${getRequestURL(event).hostname}`
    return
  }

  const accessIdentity = await verifyCloudflareAccess(event)
  if (accessIdentity) {
    if (isCloudflareAccessRequestAllowed(event)) {
      Object.assign(
        event.context,
        mapCloudflareAccessIdentity(accessIdentity, getRequestURL(event).hostname),
      )
      return
    }

    throw createError({
      status: 403,
      statusText: 'Forbidden',
    })
  }

  setResponseHeader(event, 'WWW-Authenticate', 'Bearer')

  if (token && token.length < 8) {
    throw createError({
      status: 401,
      statusText: 'Token is too short',
    })
  }

  throw createError({
    status: 401,
    statusText: 'Unauthorized',
  })
})

async function verifyToken(provided: string | undefined, expected: string): Promise<boolean> {
  if (!provided || !expected)
    return false

  const encoder = new TextEncoder()
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ])
  if ('timingSafeEqual' in crypto.subtle && typeof crypto.subtle.timingSafeEqual === 'function')
    return crypto.subtle.timingSafeEqual(providedHash, expectedHash)
  return timingSafeEqual(new Uint8Array(providedHash), new Uint8Array(expectedHash))
}
