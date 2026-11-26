import { isPublicHttpUrl } from './public-url'

const MAX_REDIRECTS = 5
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

export async function fetchPublicHttp(url: string, headers: Headers, signal: AbortSignal): Promise<Response> {
  let target = new URL(url)
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    if (!isPublicHttpUrl(target.href))
      throw new Error('URL is not allowed for server-side checking')

    const response = await fetch(target, { headers, signal, redirect: 'manual' })
    const location = response.headers.get('Location')
    if (!REDIRECT_STATUSES.has(response.status) || !location)
      return response

    await response.body?.cancel().catch(() => undefined)
    target = new URL(location, target)
  }

  throw new Error('Too many redirects')
}
