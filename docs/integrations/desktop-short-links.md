---
title: Short Links for Desktop Apps
description: Set up Sink create tokens and add a short-link sharing action to a desktop application.
---

# Short Links for Desktop Apps

Use Sink to turn a long URL, such as a map share URL, into a short link your app can copy to the clipboard. The app sends the destination to Sink, and Sink generates the short code. Anyone with the resulting link can open it in a browser.

## Choose where the token lives

- **Trusted desktop installation.** The desktop process calls Sink directly. Let the operator enter or update the token, store it in the OS credential store, and associate it with the configured Sink origin. Keep the token out of app binaries, installer assets, logs, and WebView JavaScript.
- **Publicly distributed app using a shared Sink instance.** The desktop app calls your authenticated backend. The backend checks who can create a link and makes the request to Sink using the token it stores. A token distributed inside an app can be extracted from an installed copy.

## Set up the Sink instance

The instance needs the [D1 schema migrations](/deployment/upgrading), including `0009_application_link_tokens.sql`, and a [completed link-storage migration](/storage/kv-to-d1). To check that storage is ready, open **Dashboard → Links** and wait until the link list appears.

Ask the Sink operator for three values. If you run the instance yourself, use its deployed URL and configure the other two in the dashboard.

1. **Sink base URL.** Use the HTTPS address of your deployed Sink instance, such as `https://short.example.com`. This is where the app sends requests.
2. **Approved destination.** Open **Dashboard → Settings → Application Links**. Add the destination under **Allowed URLs** and select **Save**. For an app that generates links like `https://maps.example.com/share/123`, a rule of `https://maps.example.com/share/` allows that URL and other paths under `/share/`.
3. **Create token.** Under **Create tokens**, select **Create token**, enter a name that identifies the application or installation, and copy the secret from the result. Sink displays each secret once when it issues it. The create token grants access only to `POST /api/link/shorten`. Keep the dashboard credential, `NUXT_SITE_TOKEN`, with the operator.

If [Cloudflare Access](/configuration/cloudflare-access#stricter-option-protect-api-too) also protects `/api`, ask the operator how the client or its backend should satisfy Access before the request reaches Sink.

### Choose an allowlist rule

| Rule                              | Allowed paths on the specified HTTPS origin |
| --------------------------------- | ------------------------------------------- |
| `https://maps.example.com`        | Every path                                  |
| `https://maps.example.com/share`  | Exactly `/share`                            |
| `https://maps.example.com/share/` | `/share/` and paths beneath it              |

An origin includes the scheme, hostname, and port. Subdomains and non-default ports need their own rules. Enter rules without credentials, queries, or fragments. The destination itself may include a query and a fragment. All create tokens share this list, saved changes apply to subsequent creations, and an empty list blocks creation. Use the narrowest path that serves the application's share URLs.

## Send a shortening request

The component holding the token sends this request to the Sink base URL. Replace the example hostname, destination, and token with the values from setup. Keep HTTPS certificate validation enabled and send the token only to the configured Sink origin. Disable automatic redirects on the authenticated POST. A native HTTP client needs no browser CORS configuration.

```http
POST /api/link/shorten HTTP/1.1
Host: short.example.com
Authorization: Bearer <application-create-token>
Content-Type: application/json

{"url":"https://maps.example.com/share/123?zoom=12#map","prefix":"map-"}
```

`url` is the required absolute HTTPS destination. `prefix` is optional. Omit it or send `""` to generate the entire short code. A nonempty prefix uses up to five ASCII letters, digits, or hyphens (`A` through `Z`, `a` through `z`, `0` through `9`, and `-`). Start with a letter or digit. Hyphens can occur between letters or digits, or at the end, with at most one hyphen in a row. Sink generates a short code of at least 11 characters, with at least six random characters after the prefix. The instance's case-sensitivity setting determines whether Sink lowercases the result.

Send only `url` and `prefix`. Extra properties such as a custom slug, title, or expiration produce `400`. The JSON request body can be up to **192 KiB (196,608 bytes)**.

On success, Sink responds with **`201 Created`** and a JSON object like this:

```json
{
  "shortLink": "https://short.example.com/map-8e9k2qr",
  "link": {
    "id": "8e9k2qrjm5",
    "slug": "map-8e9k2qr",
    "url": "https://maps.example.com/share/123?zoom=12#map",
    "createdAt": 1780000000,
    "updatedAt": 1780000000,
    "redirectWithQuery": false,
    "tags": []
  }
}
```

Copy or display `shortLink` exactly as returned. If the app tracks links locally, `link.slug` is the short code and `link.id` is the record identifier. The `link` object may include additional fields. The redirect preserves the destination's query and fragment and ignores query parameters that visitors append to the short link. A recipient can see the destination after opening the link, so keep credentials and private data out of share URLs.

### Send long map URLs

A fragment is the part of a URL after `#`. Some map tools put the map state there. Send the whole destination, including the fragment, in the JSON body.

The ordinary limit is `NUXT_PUBLIC_MAX_URL_LENGTH`, which defaults to **16,384**. For a destination that exceeds this limit, Sink accepts up to **64 KiB (65,536 bytes)** after URL encoding if it has a fragment and the portion before `#` fits both the ordinary limit and **16 KiB**. Use a URL library to serialize the destination and count the bytes of that URL string, including escapes such as `%20` for a space. For example, a fragment of `North Ridge` serializes as `#North%20Ridge`. Measure the JSON body separately for the 192 KiB request limit. Extended destinations use a temporary redirect with caching disabled. Test a realistic large share URL against your deployed instance and target browsers.

## Handle errors and retries

| HTTP status or result                                         | What the app should do                                                                                                                                                                  |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `3xx`                                                         | Check the configured Sink URL and whether Cloudflare Access redirected the call to a sign-in page.                                                                                      |
| `400`                                                         | Check the URL, prefix, JSON fields, and encoded URL length before retrying.                                                                                                             |
| `401`                                                         | Ask for a valid create token. Check whether the operator replaced or revoked the old token.                                                                                             |
| `403`                                                         | Ask the operator to confirm the destination matches a saved allowlist rule. Check the edge Access policy if the request was blocked before reaching Sink.                               |
| `409`                                                         | Sink could not create the link because the generated code was taken or the token or allowlist changed during the request. Retry at most once. Handle any status returned by that retry. |
| `413`                                                         | Report that the serialized JSON body exceeds 192 KiB.                                                                                                                                   |
| `423`                                                         | Ask the operator to finish storage setup from **Dashboard → Links**.                                                                                                                    |
| `5xx`, timeout, lost response, or `201` without a usable link | Report an unknown outcome. Sink might already have created the link. Let the user decide whether to try again.                                                                          |

Every successful creation produces a fresh short link, even for a previously submitted destination. Disable repeated clicks while a request is in flight. Treat the operation as successful when the response has status `201` and contains a valid HTTPS URL in the JSON `shortLink` field. For any unexpected status, report that the app could not confirm creation and leave retries up to the user.

## Verify the integration

1. Create a fresh token in a test instance. In **Application Links**, confirm that **Links created** starts at zero.
2. Send the example request from an HTTP client, or complete one share from the desktop app if it is already connected. Open the returned link in a browser and confirm the expected destination.
3. Select **Refresh usage** in **Application Links**. Verify that **Links created** increased to one and **Last used** shows a time.
4. Try an unapproved destination and confirm the request returns `403`.
5. Rotate the test token and confirm that requests using the old secret receive `401`. Update the component that stores the token with its replacement and verify that the app can create a link again.

Rotation replaces the secret immediately and retains usage totals. Revocation disables future creation and retains usage history. Both leave existing short links in place. An operator can retire an older `NUXT_LINK_CREATE_TOKEN` from the same dashboard after switching clients to managed tokens. See the [REST API reference](/api/#application-only-link-creation) for the endpoint contract and [application-link configuration](/configuration/#application-only-link-creation) for operator controls.
