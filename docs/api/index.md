---
title: REST API
description: OpenAPI docs, authentication, CORS, and endpoint index for Sink.
---

# REST API

## OpenAPI document

Every Sink instance publishes its OpenAPI document at `https://your-domain/_docs/openapi.json`. You can import the document into your API client. [Public demo OpenAPI document](https://sink.cool/_docs/openapi.json)

## Authentication

Send your site password in the `Authorization` header:

```http
Authorization: Bearer YOUR_SITE_TOKEN
```

(`Bearer` means “here is the token”.) It must match `NUXT_SITE_TOKEN` exactly (at least 8 characters). With [Cloudflare Access](/configuration/cloudflare-access) enabled, browsers can also authenticate with a verified Access login. The [MCP endpoint](/integrations/#mcp-server) at `/api/mcp` uses the same token.

### Application-only link creation

Create a token and add allowed destinations in **Dashboard → Settings → Application Links**. A server-side application can use the separate token to create links with random slugs. The request body accepts `url` and an optional `prefix`. See [token rotation and usage](/configuration/#application-only-link-creation).

For client setup, a worked request, and retry behavior, see [Short Links for Desktop Apps](/integrations/desktop-short-links).

```http
POST /api/link/shorten
Authorization: Bearer YOUR_LINK_CREATE_TOKEN
Content-Type: application/json

{"url":"https://maps.example.com/share/123","prefix":"map-"}
```

The prefix can contain zero to five ASCII letters, digits, and single hyphens. Start a nonempty prefix with a letter or digit. For example, `map-` replaces the first four characters. Application slugs use at least 11 characters so even a five-character prefix leaves at least six random characters. Sink's case sensitivity setting applies to the result.

Application destinations with a fragment (the part after `#`) can reach 64 KiB (65,536 bytes) after URL encoding. To use the larger limit, keep the part before `#` within both `NUXT_PUBLIC_MAX_URL_LENGTH` and 16 KiB. This supports share URLs that carry map data in the fragment. Long destinations use temporary redirects with caching disabled. You can edit a long link's metadata and restore it from a Sink export with query forwarding and proxying disabled.

On success, Sink returns HTTP `201` with `shortLink` and the created `link`. A missing or incorrect application token returns `401`, an invalid prefix or unsupported request field returns `400`, and a destination outside the allowlist returns `403`. Bodies larger than 192 KiB return `413`. A slug collision, allowlist change, or token rotation or revocation during creation returns `409`. A retry checks the current token and allowlist and generates a new slug. Links created here preserve the destination's query string and ignore query parameters added to the short link.

The dashboard uses authenticated admin endpoints under `/api/link/application-tokens` to list credentials and read usage, create a token with `{ "name": "Maps" }`, rotate it with `POST /api/link/application-tokens/{id}/rotate` and the current `version`, and revoke it with `DELETE /api/link/application-tokens/{id}`. Create and rotate responses include the new `secret` and the token metadata. List responses include metadata and successful creation totals.

## CORS

Optional. Set `NUXT_API_CORS=true` at build time to allow browser apps on other sites to call `/api/**`. Login is still required. See [configuration](/configuration/#optional).

## Before you call link APIs

On Workers and Pages, Sink caps incoming request bodies at 16 MiB. Application shortening, allowlist updates, create token management, and image uploads have lower limits.

::: warning Storage must be ready
Until you open **Dashboard → Links** once after deploy, most `/api/link/**` calls fail with **“storage not ready” (HTTP 423)**. See [storage setup](/storage/kv-to-d1).
:::

- `upsert` creates when free; if the short code exists, returns it with `status: "existing"` (does **not** overwrite)
- `search` matches short code, URL, comment, and tags
- `check` probes target URLs from the server
- `verify` checks how you are authenticated
- `location` returns approximate coordinates when Cloudflare provides them
- Image upload: `multipart/form-data` upload requiring both `file` and target link `slug`; requires R2 (JPEG/PNG/WebP/GIF, max 5 MB)

## Endpoint groups

Use the OpenAPI document for full request and response details.

| Group             | Routes                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------- |
| Links             | `/api/link/create`, `edit`, `upsert`, `delete`, `query`, `search`, `list`, `check`, `tags`   |
| Application links | `POST /api/link/shorten`                                                                     |
| Import/export     | `/api/link/import`, `/api/link/export` — [Import and Export](/features/import-export)        |
| Storage setup     | `/api/link/migration/status`, `/api/link/migration/run` — [storage setup](/storage/kv-to-d1) |
| AI                | `/api/link/ai`, `/api/link/og-ai` — [Workers AI](/features/ai)                               |
| Analytics         | `/api/stats/**`, `/api/logs/**` — [Analytics](/features/analytics)                           |
| Utilities         | `/api/verify`, `/api/location`, `/api/upload/image`, `/api/backup`                           |
| MCP               | `/api/mcp` — [MCP Server](/integrations/#mcp-server)                                         |
