import type { H3Event } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPageMarkdown } from '../../server/utils/markdown'

function createEvent(headers: Record<string, string>): H3Event {
  return {
    node: {
      req: { headers },
    },
  } as H3Event
}

function createAI(toMarkdown = vi.fn()): Ai {
  return { toMarkdown } as unknown as Ai
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchPageMarkdown', () => {
  it('forwards only Accept and Accept-Language headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('# Page', {
      headers: { 'Content-Type': 'text/markdown' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchPageMarkdown(createEvent({
      'authorization': 'Bearer secret',
      'cookie': 'session=secret',
      'cf-access-jwt-assertion': 'access-secret',
      'x-custom-secret': 'custom-secret',
      'accept-language': 'zh-CN,zh;q=0.9',
    }), 'https://example.com/page', createAI())

    expect(result).toBe('# Page')
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers
    expect(Object.fromEntries(headers.entries())).toEqual({
      'accept': 'text/markdown, text/html;q=0.9, */*;q=0.8',
      'accept-language': 'zh-CN,zh;q=0.9',
    })
  })

  it.each([
    'file:///etc/passwd',
    'http://localhost/page',
    'http://service.internal/page',
    'http://127.0.0.1/page',
    'http://[::1]/page',
    'https://user:pass@example.com/page',
  ])('rejects a disallowed URL without fetching', async (url) => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchPageMarkdown(createEvent({}), url, createAI())).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('checks redirect targets before requesting them', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, {
      status: 302,
      headers: { Location: 'http://localhost/next' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchPageMarkdown(createEvent({}), 'https://example.com/page', createAI())).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(new URL('https://example.com/page'), expect.objectContaining({ redirect: 'manual' }))
  })

  it('follows a relative redirect to an allowed target', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: '/next' } }))
      .mockResolvedValueOnce(new Response('# Next', { headers: { 'Content-Type': 'text/markdown' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchPageMarkdown(createEvent({}), 'https://example.com/page', createAI())).resolves.toBe('# Next')
    expect(fetchMock).toHaveBeenNthCalledWith(2, new URL('https://example.com/next'), expect.objectContaining({ redirect: 'manual' }))
  })

  it('stops following redirects at the hop limit', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(null, {
      status: 302,
      headers: { Location: '/loop' },
    })))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchPageMarkdown(createEvent({}), 'https://example.com/loop', createAI())).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(6)
  })

  it('caps streamed responses at 256 KiB and cancels the reader', async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(128 * 1024).fill(97))
        controller.enqueue(new Uint8Array(128 * 1024).fill(98))
        controller.enqueue(new Uint8Array(128 * 1024).fill(99))
      },
      cancel,
    })
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, {
      headers: { 'Content-Type': 'text/html' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const toMarkdown = vi.fn().mockResolvedValue({
      format: 'markdown',
      data: 'x'.repeat(5000),
    })

    const result = await fetchPageMarkdown(createEvent({}), 'https://example.com/large', createAI(toMarkdown))

    expect(cancel).toHaveBeenCalledOnce()
    expect(toMarkdown).toHaveBeenCalledOnce()
    expect(toMarkdown.mock.calls[0]?.[0].blob.size).toBe(256 * 1024)
    expect(result).toHaveLength(4096)
  })
})
