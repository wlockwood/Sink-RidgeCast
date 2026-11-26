import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { fetch, fetchWithAuth, TEST_PNG_BYTES } from '../utils'

describe('/api/upload/image', () => {
  it('uploads and serves a PNG with immutable cache metadata', async () => {
    const formData = new FormData()
    const file = new File([TEST_PNG_BYTES], 'test.png', { type: 'image/png' })
    const slug = `upload-${crypto.randomUUID()}`
    formData.append('file', file)
    formData.append('slug', slug)

    let key: string | undefined
    try {
      const response = await fetchWithAuth('/api/upload/image', {
        method: 'POST',
        body: formData,
      })
      expect(response.status).toBe(200)

      const data = await response.json() as { url: string, key: string }
      key = data.key
      expect(data.url).toBe(`/_assets/${data.key}`)
      expect(data.key).toMatch(new RegExp(`^images/${slug}/[a-z0-9]+\\.png$`))

      const assetResponse = await fetch(data.url)
      expect(assetResponse.status).toBe(200)
      expect(new Uint8Array(await assetResponse.arrayBuffer())).toEqual(TEST_PNG_BYTES)
      expect(assetResponse.headers.get('Content-Type')).toBe('image/png')
      expect(assetResponse.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(assetResponse.headers.get('Content-Security-Policy')).toContain('sandbox')
      expect(assetResponse.headers.get('ETag')).toBeTruthy()
      expect(assetResponse.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
    }
    finally {
      if (key)
        await env.R2.delete(key)
    }
  })

  it('rejects asset paths outside images', async () => {
    const response = await fetch('/_assets/documents/test.txt')
    expect(response.status).toBe(403)
  })

  it('rejects stored content that disagrees with the raster file extension', async () => {
    const key = `images/upload-${crypto.randomUUID()}/23456789ab.png`
    try {
      await env.R2.put(key, 'not a PNG', { httpMetadata: { contentType: 'image/png' } })
      expect((await fetch(`/_assets/${key}`)).status).toBe(415)
      await env.R2.put(key, TEST_PNG_BYTES, { httpMetadata: { contentType: 'text/html' } })
      expect((await fetch(`/_assets/${key}`)).status).toBe(415)
    }
    finally {
      await env.R2.delete(key)
    }
  })

  it('rejects nested image paths', async () => {
    const key = `images/upload-${crypto.randomUUID()}/nested/23456789ab.png`
    try {
      await env.R2.put(key, TEST_PNG_BYTES, { httpMetadata: { contentType: 'image/png' } })
      expect((await fetch(`/_assets/${key}`)).status).toBe(400)
    }
    finally {
      await env.R2.delete(key)
    }
  })

  it('returns 400 when file is missing', async () => {
    const formData = new FormData()
    formData.append('slug', 'test-slug')

    const response = await fetchWithAuth('/api/upload/image', {
      method: 'POST',
      body: formData,
    })
    expect(response.status).toBe(400)
  })

  it('returns 400 when slug is missing', async () => {
    const formData = new FormData()
    const file = new File(['test'], 'test.png', { type: 'image/png' })
    formData.append('file', file)

    const response = await fetchWithAuth('/api/upload/image', {
      method: 'POST',
      body: formData,
    })
    expect(response.status).toBe(400)
  })

  it('returns 400 for invalid file type', async () => {
    const formData = new FormData()
    const file = new File(['test content'], 'test.txt', { type: 'text/plain' })
    formData.append('file', file)
    formData.append('slug', 'test-slug')

    const response = await fetchWithAuth('/api/upload/image', {
      method: 'POST',
      body: formData,
    })
    expect(response.status).toBe(400)
  })

  it('returns 400 when the declared image type does not match the bytes', async () => {
    const formData = new FormData()
    const file = new File(['not a PNG'], 'test.png', { type: 'image/png' })
    formData.append('file', file)
    formData.append('slug', `upload-${crypto.randomUUID()}`)

    const response = await fetchWithAuth('/api/upload/image', { method: 'POST', body: formData })
    if (response.ok) {
      const { key } = await response.json() as { key: string }
      await env.R2.delete(key)
    }
    expect(response.status).toBe(400)
  })

  it('returns 400 for file exceeding 5MB limit', async () => {
    const formData = new FormData()
    const largeContent = new Uint8Array(5 * 1024 * 1024 + 1)
    const file = new File([largeContent], 'large.png', { type: 'image/png' })
    formData.append('file', file)
    formData.append('slug', 'test-slug')

    const response = await fetchWithAuth('/api/upload/image', {
      method: 'POST',
      body: formData,
    })
    expect(response.status).toBe(400)
  })

  it('returns 413 when the multipart request exceeds the body limit', async () => {
    const formData = new FormData()
    const excessiveContent = new Uint8Array(6 * 1024 * 1024)
    formData.append('file', new File([excessiveContent], 'large.png', { type: 'image/png' }))
    formData.append('slug', 'test-slug')
    const response = await fetchWithAuth('/api/upload/image', { method: 'POST', body: formData })
    expect(response.status).toBe(413)
  })

  it('returns 400 for invalid slug format', async () => {
    const formData = new FormData()
    const file = new File([TEST_PNG_BYTES], 'test.png', { type: 'image/png' })
    formData.append('file', file)
    formData.append('slug', 'invalid<>slug/path')

    const response = await fetchWithAuth('/api/upload/image', {
      method: 'POST',
      body: formData,
    })
    expect(response.status).toBe(400)
  })
})
