import type { H3Event } from 'h3'

const PROXY_TIMEOUT_MS = 30_000
const MAX_PROXY_REDIRECTS = 5
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

// Filter transport headers, Sink credentials, and client-supplied forwarding headers.
// The configured upstream still receives Authorization and other application headers.
const PROXY_SKIPPED_REQUEST_HEADERS = new Set([
  'connection',
  'content-length',
  'cookie',
  'forwarded',
  'front-end-https',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'true-client-ip',
  'upgrade',
  'x-client-ip',
  'x-cluster-client-ip',
  'x-real-ip',
  'x-remote-addr',
  'x-remote-ip',
  'x-url-scheme',
])

const PROXY_SKIPPED_REQUEST_PREFIXES = ['cf-', 'x-envoy-', 'x-forwarded-', 'x-link-', 'x-original-', 'x-rewrite-']

function isForwardedRequestHeader(name: string): boolean {
  return !PROXY_SKIPPED_REQUEST_HEADERS.has(name)
    && !PROXY_SKIPPED_REQUEST_PREFIXES.some(prefix => name.startsWith(prefix))
}

// Hop-by-hop and credential headers are never reflected to the client.
const PROXY_SKIPPED_RESPONSE_HEADERS = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'set-cookie',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

const CDN_CACHE_HEADERS = ['cdn-cache-control', 'cloudflare-cdn-cache-control', 'surrogate-control']
const BODY_HEADERS = ['content-encoding', 'content-language', 'content-location', 'content-type']

const CROSS_ORIGIN_REQUEST_HEADERS = new Set([
  'accept',
  'accept-encoding',
  'accept-language',
  'cache-control',
  'pragma',
  'range',
  'user-agent',
])

// These standard headers can occur on an ordinary navigation. They are discarded on an origin change.
const ORIGIN_SPECIFIC_REQUEST_HEADERS = new Set([
  'cdn-loop',
  'content-type',
  'dnt',
  'if-match',
  'if-modified-since',
  'if-none-match',
  'if-range',
  'if-unmodified-since',
  'origin',
  'priority',
  'referer',
  'sec-gpc',
  'upgrade-insecure-requests',
])

export interface LinkProxyOptions {
  // Requested after the password/unsafe gate consumed the form body: the
  // upstream fetch must run as a bodyless GET so the password never leaks.
  method?: string
  // Set for gated links so upstream or shared caches never store the response.
  privateCache?: boolean
}

function connectionHeaderNames(value: string | null | undefined): Set<string> {
  return new Set(value?.toLowerCase().split(',').map(name => name.trim()))
}

function buildForwardHeaders(event: H3Event) {
  const headers = new Headers()
  const connectionNames = connectionHeaderNames(getHeader(event, 'connection'))
  let hasCredentials = false
  for (const [name, value] of Object.entries(getHeaders(event))) {
    const lowerName = name.toLowerCase()
    if (value === undefined || connectionNames.has(lowerName) || !isForwardedRequestHeader(lowerName))
      continue
    headers.set(lowerName, value)
    // A custom header can contain a credential regardless of its name.
    if (!CROSS_ORIGIN_REQUEST_HEADERS.has(lowerName) && !ORIGIN_SPECIFIC_REQUEST_HEADERS.has(lowerName)
      && !lowerName.startsWith('sec-fetch-') && !lowerName.startsWith('sec-ch-ua')) {
      hasCredentials = true
    }
  }
  const platformRequest = event.context.cloudflare?.request
  const requestUrl = platformRequest ? new URL(platformRequest.url) : getRequestURL(event, { xForwardedProto: false })
  const clientIp = platformRequest?.headers.get('cf-connecting-ip')
  if (clientIp)
    headers.set('x-forwarded-for', clientIp)
  headers.set('x-forwarded-proto', requestUrl.protocol.slice(0, -1))
  headers.set('x-forwarded-host', requestUrl.host)
  return { headers, hasCredentials }
}

function buildUpstreamResponse(upstream: Response, privateCache: boolean): Response {
  const headers = new Headers()
  const connectionNames = connectionHeaderNames(upstream.headers.get('connection'))
  for (const [key, value] of upstream.headers.entries()) {
    const name = key.toLowerCase()
    if (!PROXY_SKIPPED_RESPONSE_HEADERS.has(name) && !connectionNames.has(name))
      headers.set(key, value)
  }
  if (privateCache) {
    for (const name of CDN_CACHE_HEADERS)
      headers.delete(name)
    headers.set('Cache-Control', 'private, no-store')
  }
  headers.set('X-Content-Type-Options', 'nosniff')
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  })
}

function getProxyBody(event: H3Event, method: string): ReadableStream | null {
  if (method === 'GET' || method === 'HEAD')
    return null
  const request = event.context.cloudflare?.request
  if (request && !request.bodyUsed)
    return request.body
  return toWebRequest(event).body
}

export async function proxyLinkRequest(event: H3Event, targetUrl: string, options: LinkProxyOptions = {}): Promise<Response> {
  if (!isPublicHttpUrl(targetUrl))
    throw createError({ status: 403, statusText: 'Proxy target is not allowed' })

  let url = new URL(targetUrl)
  let method = options.method ?? event.method
  let body = getProxyBody(event, method)
  const { headers, hasCredentials } = buildForwardHeaders(event)
  const restrictOrigin = hasCredentials || body !== null
  // The timeout only bounds waiting for response headers; a signal that stays
  // armed would also abort long downloads or event streams mid-body.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS)
  try {
    for (let hop = 0; ; hop++) {
      const init: RequestInit & { duplex?: 'half' } = {
        method,
        headers: new Headers(headers),
        redirect: 'manual',
        signal: controller.signal,
      }
      if (body) {
        init.body = body
        init.duplex = 'half'
      }

      const upstream = await fetch(url, init)
      const location = upstream.headers.get('location')
      if (!REDIRECT_STATUSES.has(upstream.status) || location === null)
        return buildUpstreamResponse(upstream, options.privateCache ?? false)

      await upstream.body?.cancel().catch(() => undefined)
      if (hop >= MAX_PROXY_REDIRECTS)
        throw new Error('Too many upstream redirects')

      const nextUrl = new URL(location, url)
      if (!isPublicHttpUrl(nextUrl.href))
        throw new Error('Upstream redirect target is not allowed')

      if (nextUrl.origin !== url.origin) {
        if (restrictOrigin)
          throw new Error('Cross-origin upstream redirect is not allowed for private requests')
        for (const name of [...headers.keys()]) {
          if (!CROSS_ORIGIN_REQUEST_HEADERS.has(name))
            headers.delete(name)
        }
      }

      if ((upstream.status === 303 && method !== 'GET' && method !== 'HEAD')
        || ((upstream.status === 301 || upstream.status === 302) && method === 'POST')) {
        method = 'GET'
        body = null
        for (const name of BODY_HEADERS)
          headers.delete(name)
      }
      else if (body) {
        throw new Error('Upstream redirect requires replaying the request body')
      }
      url = nextUrl
    }
  }
  catch (cause) {
    throw createError({ status: 502, statusText: 'Proxy request failed', cause })
  }
  finally {
    clearTimeout(timer)
  }
}
