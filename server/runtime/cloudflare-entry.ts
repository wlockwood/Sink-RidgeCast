import { getRequestBodyLimit, readBoundedRequestChunks } from '#shared/utils/request-limits'
// @ts-expect-error Nitro supplies the original adapter for the active Cloudflare preset.
import nitroAdapter from '#sink-cloudflare-runtime'

const payloadTooLarge = () => new Response('Request body is too large', { status: 413 })

export default {
  ...nitroAdapter,
  async fetch(request: Request, env: Cloudflare.Env, context: ExecutionContext): Promise<Response> {
    if (!request.body)
      return await nitroAdapter.fetch(request, env, context)

    const limit = getRequestBodyLimit(new URL(request.url).pathname)
    if (Number(request.headers.get('Content-Length')) > limit)
      return payloadTooLarge()

    const payload = await readBoundedRequestChunks(request.body, limit)
    if (!payload)
      return payloadTooLarge()

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of payload.chunks)
          controller.enqueue(chunk)
        controller.close()
      },
    })
    return await nitroAdapter.fetch(new Request(request, { body }), env, context)
  },
}
