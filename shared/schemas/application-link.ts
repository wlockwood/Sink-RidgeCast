import { z } from 'zod'

export const MAX_APPLICATION_ALLOWED_URLS = 100

// JSON Schema publishes the pattern without regular expression flags.
// eslint-disable-next-line regexp/use-ignore-case
const prefixPattern = /^(?:[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*-?)?$/

export const ShortenLinkSchema = z.strictObject({
  url: z.string().trim().url().describe('An allowlisted HTTPS destination.'),
  prefix: z.string().max(5).regex(prefixPattern).optional().describe('Up to five characters to replace the start of the generated slug. Use letters, digits, and single hyphens after a letter or digit.'),
})

export const ApplicationAllowedUrlSchema = z.string().trim().max(2048).refine(
  value => parseAllowedUrl(value) !== null,
  'Enter an HTTPS origin or path without credentials, a query, or a fragment.',
)

export const ApplicationLinkSettingsSchema = z.strictObject({
  allowedUrls: z.array(ApplicationAllowedUrlSchema).max(MAX_APPLICATION_ALLOWED_URLS),
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
})

export type ApplicationLinkSettings = z.infer<typeof ApplicationLinkSettingsSchema>

export function getAllowedApplicationDestination(value: string, allowedUrls: string[]): string | null {
  const target = parseHttpsUrl(value)
  if (!target)
    return null

  const rules = allowedUrls.map(parseAllowedUrl)
  if (rules.some(rule => !rule))
    return null

  const matches = rules.some(rule => rule?.origin === target.origin && (
    rule.pathname === target.pathname
    || (rule.pathname.endsWith('/') && target.pathname.startsWith(rule.pathname))
  ))
  return matches ? target.href : null
}

function parseAllowedUrl(value: string): URL | null {
  const match = /^https:\/\/[^/?#@\\\s]+(\/[^?#\\\s]*)?$/i.exec(value)
  if (!match)
    return null

  const url = parseHttpsUrl(value)
  // Reject rules with paths that normalize to a different path, especially the origin root.
  return url?.pathname === (match[1] ?? '/') ? url : null
}

function parseHttpsUrl(value: string): URL | null {
  if (!/^https:\/\/[^/\\]/i.test(value))
    return null

  try {
    const url = new URL(value)
    // Some servers decode separators or strip path parameters before routing.
    if (url.protocol !== 'https:' || url.username || url.password || /;|%(?:00|23|25|2f|3b|3f|5c)/i.test(url.pathname))
      return null

    return url
  }
  catch {
    return null
  }
}
