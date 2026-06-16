# Deployhtml

Drag-and-drop hosting for a single HTML file. Drop a `.html` file on the
homepage and instantly get a live public URL like
`https://calm-river-x4x2.deployhtml.com`. No signup. Free links expire in 7 days.

Runs entirely on Cloudflare: **Workers** (logic), **R2** (file storage),
**KV** (slug metadata, rate-limit counters, abuse reports). One Worker serves
both the apex landing page/API and every `*.deployhtml.com` subdomain.

---

## Architecture

```
                       ┌─────────────────────────────┐
  deployhtml.com  ───► │  Worker (src/index.ts)       │
  *.deployhtml.com ──► │  routes by hostname + path   │
                       └──────────┬──────────────────┘
        ┌─────────────────────────┼───────────────────────────┐
        ▼                         ▼                            ▼
  GET /  landing page      POST /upload                <slug>.deployhtml.com
  (Turnstile injected)     • rate limit (KV)           • KV meta lookup
                           • Turnstile verify           • R2 fetch
                           • type + size + HTML sniff    • inject footer badge
                           • phishing scan (scan.ts)     • security headers
                           • slug → R2 + KV (7d TTL)     • friendly 404 if gone
```

### Files

| Path | Purpose |
|------|---------|
| `src/index.ts` | Router: hostname/path dispatch, landing-page sitekey injection |
| `src/upload.ts` | `/upload`: rate limit, Turnstile, validation, scan, store |
| `src/serve.ts` | Slug serving, footer-badge injection, security headers |
| `src/report.ts` | `/report`: GET form + POST → KV report records |
| `src/scan.ts` | Phishing heuristics |
| `src/blocklist.ts` | **Extend this** — brand keywords + scam phrases |
| `src/slug.ts` | Readable slug generator (`adjective-noun-xxxx`) |
| `src/config.ts` | Tunables (size, TTL, rate limit, footer text) |
| `src/notfound.ts` | Friendly 404 page |
| `src/env.ts` | Binding/var types + KV metadata shape |
| `public/index.html` | Landing page (dropzone, copy, QR) |
| `public/vendor/qrcode.js` | Vendored offline QR generator (MIT) |

### KV layout

| Key | Value | TTL |
|-----|-------|-----|
| `slug:<slug>` | `{ filename, size, uploadedAt, expiresAt }` | 7 days |
| `rl:<ip>:<hourBucket>` | upload counter | ~1 hour |
| `report:<ts>-<rand>` | `{ slug, note, ip, reportedAt }` | 90 days |

R2 stores the file body at key `<slug>.html`.

---

## Deploy — step by step

### 0. Prerequisites

- A Cloudflare account with the **deployhtml.com** zone added (the domain's
  nameservers must point at Cloudflare).
- Node 18+ and the Wrangler CLI:
  ```bash
  npm install
  npx wrangler login
  ```

### 1. Create the R2 bucket

```bash
npx wrangler r2 bucket create deployhtml-files
```
The binding name `BUCKET` and bucket name `deployhtml-files` are already wired
in `wrangler.toml`.

### 2. Create the KV namespace

```bash
npx wrangler kv namespace create KV
```
Copy the printed `id` into `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "KV"
id = "PASTE_THE_ID_HERE"
```

### 3. Create Turnstile keys

1. Cloudflare dashboard → **Turnstile** → **Add widget** (name it anything, e.g.
   `deployhtml-upload` — the name is just a label).
2. Mode: **Managed**. Hostname: add **`deployhtml.com`** only. Turnstile does
   NOT accept `*.` wildcard syntax, and you don't need it — the widget renders
   only on the apex homepage (the upload form); hosted `*.deployhtml.com` pages
   never show it. Subdomains of a listed hostname are trusted automatically.
3. Copy the **Site Key** into `wrangler.toml` → `TURNSTILE_SITEKEY`
   (it is public; the Worker injects it into the landing page).
4. Set the **Secret Key** as a Worker secret (never commit it):
   ```bash
   npx wrangler secret put TURNSTILE_SECRET
   ```

> **Cloudflare test keys** (handy for staging): sitekey
> `1x00000000000000000000AA` + secret `1x0000000000000000000000000000000AA`
> always pass.

### 4. Wildcard DNS + routes

The Worker routes in `wrangler.toml` already cover apex and wildcard:
```toml
routes = [
  { pattern = "deployhtml.com/*",   zone_name = "deployhtml.com" },
  { pattern = "*.deployhtml.com/*", zone_name = "deployhtml.com" },
]
```
You still need DNS records so the hostnames resolve to Cloudflare's edge.
In the dashboard → **DNS** → add **proxied** (orange-cloud) records:

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| A or CNAME | `@` (deployhtml.com) | `192.0.2.1` / your origin placeholder | Proxied |
| CNAME | `*` (wildcard) | `deployhtml.com` | Proxied |

The IPs don't matter for a Worker route — they just need to be proxied so the
Worker intercepts the request. (A dummy `A @ 192.0.2.1` placeholder is fine.)

### 5. Deploy

```bash
npm run deploy        # wrangler deploy
```

Visit `https://deployhtml.com`, drop an HTML file, and open the returned URL.

---

## Local development

```bash
npm run dev           # wrangler dev
```

- Set `DEV_MODE = "true"` in `wrangler.toml` **for local only** to bypass
  Turnstile server verification. **Set it back to `"false"` before deploying.**
- Wildcard subdomains: modern browsers resolve `*.localhost` to `127.0.0.1`,
  and the Worker also treats `<slug>.localhost` as a slug. After uploading,
  open e.g. `http://calm-river-x4x2.localhost:8787/`.
- `npm run typecheck` runs `tsc --noEmit`.

---

## Abuse protection (built in)

- **Turnstile** on the form, verified server-side in `upload.ts`.
- **Rate limit**: max `5` uploads/IP/hour via KV counters (`config.ts`).
- **Content scan** (`scan.ts` + `blocklist.ts`): rejects password forms posting
  off-site, password forms impersonating known brands, and high-signal scam
  phrases. Extend the lists in `src/blocklist.ts`.
- **Footer badge** injected into every served page: *"Hosted on Deployhtml —
  Report abuse"* linking to `/report?slug=...`.
- **/report** stores reports in KV. Review them with:
  ```bash
  npx wrangler kv key list --binding KV --prefix "report:"
  npx wrangler kv key get --binding KV "report:<ts>-<rand>"
  ```

### Extending /report to email you

`report.ts` currently writes a KV record. To also email, add a provider call
in `submitReport()` (e.g. Resend):

```ts
await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    from: "abuse@deployhtml.com",
    to: "you@example.com",
    subject: `Abuse report: ${slug}`,
    text: JSON.stringify(record, null, 2),
  }),
});
```
Add `RESEND_API_KEY` via `wrangler secret put RESEND_API_KEY` and a verified
sender domain in Resend.

---

## Multi-file projects (CSS, JS, images)

Logged-in users can deploy a whole static site — a folder of files or a `.zip` archive — at a single slug. Every asset is served with its correct `Content-Type` so CSS, JS, and images actually load.

### How to deploy

**Via the landing page UI:**
1. Sign in, then expand "Deploy a folder or .zip" below the single-file dropzone.
2. Choose **Folder / files** (select your project folder via the directory picker) or **ZIP archive** (select a `.zip` file).
3. Click **Deploy project**. The slug URL appears immediately.

**Via API (authenticated):**
```bash
# Zip method
curl -b cookies.txt -X POST https://deployhtml.com/upload/project \
  -F "zip=@/path/to/site.zip"

# Individual files method (relative paths preserve folder structure)
curl -b cookies.txt -X POST https://deployhtml.com/upload/project \
  -F "file=@index.html;filename=index.html" \
  -F "file=@css/app.css;filename=css/app.css" \
  -F "file=@app.js;filename=app.js"
```
Response: `{ url, slug, permanent: true, files: <count> }`

### Requirements and limits

- Must contain **`index.html` at the project root** (not in a subfolder).
- Max **200 files** per project.
- Max **10 MB** total uncompressed size.
- Max **2 MB** per individual file.
- Paths are **case-sensitive** (R2 keys preserve case).

### Allowed file types

| Extension | Content-Type |
|-----------|-------------|
| html, htm | text/html |
| css | text/css |
| js, mjs | text/javascript |
| json, map | application/json |
| svg | image/svg+xml |
| png | image/png |
| jpg, jpeg | image/jpeg |
| gif | image/gif |
| webp | image/webp |
| ico | image/x-icon |
| woff | font/woff |
| woff2 | font/woff2 |
| ttf | font/ttf |
| txt | text/plain |

Files with unlisted extensions are rejected at upload time with a `415` error.

### How serving works

- `https://<slug>.deployhtml.com/` and `/index.html` both serve the root `index.html`.
- All other paths (`/css/app.css`, `/app.js`, etc.) are served directly from R2 with the correct `Content-Type`.
- HTML files get the footer badge injected (same as single-file deploys).
- Non-HTML assets (`css`, `js`, images, fonts) are served raw — no footer injection.
- `X-Content-Type-Options: nosniff` is set on all responses, so assets must have correct content types (they do, set at upload time).
- Project links are **permanent** (never expire) — same as other logged-in deploys.

### Security

- Anonymous callers to `POST /upload/project` receive `401`.
- Path traversal attempts (e.g. `../` in zip entries or filenames) are rejected at upload time with `415`.
- Encoded traversal in request paths (e.g. `/%2e%2e/`) is blocked by the `safeRelPath` validator at serve time.

---

## Accounts (Better Auth + D1)

Authentication uses [Better Auth](https://better-auth.com) backed by Cloudflare D1.
Routes: `GET /login`, `GET /signup`, `GET /account`, `POST /api/auth/*`.

Logged-in uploads produce **permanent links** that never expire and appear in the uploader's dashboard at `GET /dashboard`. From the dashboard, owners can delete their pages (R2 object + KV key + D1 row removed). Anonymous uploads are completely unchanged: 7-day TTL, no login required.

### Setup (operator steps — production)

**1. Create the D1 database**
```bash
npx wrangler d1 create deployhtml-auth
# Paste the printed database_id into wrangler.toml [[d1_databases]] block.
```

**2. Apply migrations**
```bash
# Local development:
npx wrangler d1 migrations apply deployhtml-auth --local
# Production (remote):
npx wrangler d1 migrations apply deployhtml-auth --remote
```

**3. Set the auth secret**
```bash
npx wrangler secret put BETTER_AUTH_SECRET
# Enter a long random string (32+ chars). Never commit a real value.
```

For local development, create `.dev.vars` (already git-ignored):
```
BETTER_AUTH_SECRET=dev-only-secret-change-me-32chars-min
```

The auth `baseURL` is derived from the incoming request origin — no `BETTER_AUTH_URL` variable is needed or used.

---

## Roadmap hooks (paid features later)

The structure is intentionally modular so paid tiers slot in without rewrites:

- **Accounts / auth** — add an `auth.ts` handler + new routes; serving logic in
  `serve.ts` is untouched.
- **Permanent links** — add `permanent: true` to `SlugMeta` (`env.ts`) and skip
  the KV TTL + expiry check in `serve.ts`.
- **Custom domains** — add `customDomain` to `SlugMeta` and a hostname lookup
  branch in `index.ts`.
- **Bigger files / higher limits** — per-tier overrides read from KV metadata
  instead of the static `config.ts` values.

---

## Security headers on served pages

Every hosted page is returned with:

```
Content-Type: text/html; charset=utf-8
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Content-Security-Policy: frame-ancestors 'none'
```
