const LOCAL_DOMAINS = ['localhost', 'local', 'internal', 'lan', 'home', 'home.arpa']

export function isPublicHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.username || parsed.password)
      return false

    const rawHostname = parsed.hostname.toLowerCase()
    const hostname = rawHostname.startsWith('[') && rawHostname.endsWith(']')
      ? rawHostname.slice(1, -1)
      : rawHostname.replace(/\.+$/, '')
    if ((!hostname.includes('.') && !hostname.includes(':'))
      || LOCAL_DOMAINS.some(domain => hostname === domain || hostname.endsWith(`.${domain}`))) {
      return false
    }

    return !isBlockedIp(hostname)
  }
  catch {
    return false
  }
}

function isBlockedIp(hostname: string): boolean {
  if (hostname.includes(':'))
    return isBlockedIpv6(hostname)

  return isBlockedIpv4(hostname)
}

function isBlockedIpv4(hostname: string): boolean {
  const parts = hostname.split('.')
  if (parts.length !== 4)
    return false

  const bytes = parts.map((part) => {
    if (!/^\d+$/.test(part))
      return Number.NaN

    const value = Number(part)
    return value >= 0 && value <= 255 ? value : Number.NaN
  })

  if (bytes.some(Number.isNaN))
    return false

  const [a, b, c] = bytes as [number, number, number, number]

  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && (c === 0 || c === 2))
    || (a === 192 && b === 88 && c === 99)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224
}

function isBlockedIpv6(hostname: string): boolean {
  const [firstSegment = '', secondSegment = ''] = hostname.split(':', 2)
  const first = Number.parseInt(firstSegment, 16)
  const second = Number.parseInt(secondSegment || '0', 16)
  // Allow global unicast only, excluding protocol assignments, 6to4 and documentation ranges.
  return !(first >= 0x2000 && first < 0x4000)
    || (first === 0x2001 && (second <= 0x1FF || second === 0xDB8))
    || first === 0x2002
    || first === 0x3FFF
}
