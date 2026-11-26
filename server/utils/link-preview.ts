import type { H3Event } from 'h3'
import type { AiChatResponse } from './ai'
import { z } from 'zod'
import { MAX_LINK_DESCRIPTION_LENGTH, MAX_LINK_TITLE_LENGTH } from '#shared/schemas/link'
import { parseAiResponse } from './ai'

export const LinkPreviewRequestSchema = z.object({
  url: z.url().max(64 * 1024),
  locale: z.string().optional(),
})

function fallbackMetadata(url: string): { title: string, description: string } {
  try {
    const { hostname } = new URL(url)

    return {
      title: hostname.replace(/^www\./, '').slice(0, MAX_LINK_TITLE_LENGTH),
      description: `Short link for ${url}`.slice(0, MAX_LINK_DESCRIPTION_LENGTH),
    }
  }
  catch {
    return {
      title: 'Short Link',
      description: 'Check out this link on Sink.',
    }
  }
}

function resolveMetadataLocale(event: H3Event, locale?: string): string {
  const value = locale?.trim()
  if (!value) {
    return resolveRedirectLocale(event)
  }

  try {
    return Intl.getCanonicalLocales(value)[0] || resolveRedirectLocale(event)
  }
  catch {
    return resolveRedirectLocale(event)
  }
}

export async function generateLinkPreview(event: H3Event, input: z.infer<typeof LinkPreviewRequestSchema>) {
  const [url = ''] = input.url.split('#', 1)
  const { cloudflare } = event.context
  const { AI } = cloudflare.env

  if (!AI) {
    throw createError({ status: 501, statusText: 'AI not enabled' })
  }

  const { aiOgPrompt, aiModel } = useRuntimeConfig(event)
  const locale = resolveMetadataLocale(event, input.locale)

  const markdown = await fetchPageMarkdown(event, url, AI)
  const userContent = markdown
    ? `URL: ${url}\n\nPage content:\n${markdown}`
    : url

  const messages = [
    { role: 'system', content: `${aiOgPrompt}\nGenerate the title and description in the language matching this locale: ${locale}.` },

    { role: 'user', content: 'https://www.cloudflare.com/' },
    { role: 'assistant', content: '{"title": "Cloudflare", "description": "Cloudflare is a global network designed to make everything you connect to the Internet secure, private, fast, and reliable."}' },

    { role: 'user', content: 'https://github.com/nuxt/' },
    { role: 'assistant', content: '{"title": "Nuxt", "description": "Nuxt is an intuitive and extensible Vue framework for creating modern web applications."}' },

    { role: 'user', content: userContent },
  ]

  let response: AiChatResponse
  try {
    // @ts-expect-error Workers AI supports model-specific chat template options at runtime.
    response = await AI.run(aiModel as keyof AiModels, {
      messages,
      chat_template_kwargs: {
        enable_thinking: false,
        thinking: false,
      },
    }) as AiChatResponse
  }
  catch (error) {
    console.warn('Workers AI metadata generation failed; using fallback.', error)
    return fallbackMetadata(url)
  }

  const fallback = fallbackMetadata(url)
  const result = parseAiResponse(response)

  const title = String(result.title ?? '').trim().slice(0, MAX_LINK_TITLE_LENGTH) || fallback.title
  const description = String(result.description ?? '').trim().slice(0, MAX_LINK_DESCRIPTION_LENGTH) || fallback.description

  return {
    title,
    description,
  }
}
