export const LEGACY_LINK_PASSWORD_HASH_PREFIX = 'sink-pwd:v1:'
export const LINK_PASSWORD_HASH_PREFIX = 'sink-pwd:v2:'
export const LINK_PASSWORD_MASK_PREFIX = '__SINK_MASKED__'
export const LINK_PASSWORD_MASK = `${LINK_PASSWORD_MASK_PREFIX}•••`

export function isMaskedLinkPassword(password: string): boolean {
  return password.startsWith(LINK_PASSWORD_MASK_PREFIX)
}

export function isHashedLinkPassword(password: string): boolean {
  return password.startsWith(LINK_PASSWORD_HASH_PREFIX) || password.startsWith(LEGACY_LINK_PASSWORD_HASH_PREFIX)
}
