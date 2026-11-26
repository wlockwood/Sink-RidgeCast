import { z } from 'zod'

export const MAX_APPLICATION_TOKEN_NAME_LENGTH = 80
export const ENVIRONMENT_APPLICATION_TOKEN_ID = 'environment'
export const ApplicationTokenNameSchema = z.string().trim().min(1).max(MAX_APPLICATION_TOKEN_NAME_LENGTH)
export const CreateApplicationTokenSchema = z.strictObject({ name: ApplicationTokenNameSchema })
export const RotateApplicationTokenSchema = z.strictObject({ version: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER - 1) })

export interface ApplicationLinkToken {
  id: string
  name: string
  version: number
  createdAt: number | null
  rotatedAt: number | null
  revokedAt: number | null
  lastUsedAt: number | null
  linksCreated: number
}

export interface IssuedApplicationLinkToken {
  secret: string
  token: ApplicationLinkToken
}

export interface ApplicationLinkTokenList {
  tokens: ApplicationLinkToken[]
  environmentActive: boolean
}

export interface ApplicationLinkCredential {
  id: string
  tokenHash: string | null
}

export interface ApplicationLinkWritePolicy {
  revision: number
  credential: ApplicationLinkCredential
}
