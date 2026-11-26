import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { readBoundedRequestChunks } from '#shared/utils/request-limits'

export async function readBoundedRequestBody(event: H3Event, maxBytes: number) {
  if (Number(getHeader(event, 'Content-Length')) > maxBytes)
    throw createError({ status: 413, statusText: 'Request body is too large' })

  const stream = getRequestWebStream(event)
  if (!stream)
    return Buffer.alloc(0)

  const payload = await readBoundedRequestChunks(stream, maxBytes)
  if (!payload)
    throw createError({ status: 413, statusText: 'Request body is too large' })

  return Buffer.concat(payload.chunks, payload.size)
}
