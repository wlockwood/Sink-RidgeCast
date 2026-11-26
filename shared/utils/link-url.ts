export function isHttpLinkUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value) || /\p{Cc}/u.test(value))
    return false

  try {
    const { protocol, hostname } = new URL(value)
    return Boolean(hostname) && (protocol === 'http:' || protocol === 'https:')
  }
  catch {
    return false
  }
}
