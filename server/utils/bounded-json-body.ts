import type { H3Event } from 'h3'
import type { z } from 'zod'

export async function readBoundedJsonBody<T>(event: H3Event, schema: z.ZodType<T>, maxBytes: number): Promise<T> {
  const rawBody = await readBoundedRequestBody(event, maxBytes)

  let body: unknown
  try {
    body = JSON.parse(rawBody.toString())
  }
  catch {
    throw createError({ status: 400, statusText: 'Invalid JSON body' })
  }

  const validated = schema.safeParse(body)
  if (!validated.success)
    throw createError({ status: 400, statusText: 'Validation Error' })

  return validated.data
}
