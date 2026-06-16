// Bindings + vars available to the Worker. Mirrors wrangler.toml.
export interface Env {
  BUCKET: R2Bucket;
  KV: KVNamespace;
  ASSETS: Fetcher;
  DB: D1Database;

  DOMAIN: string;
  DEV_MODE: string;
  TURNSTILE_SITEKEY: string;
  // Secret — set via `wrangler secret put TURNSTILE_SECRET`.
  TURNSTILE_SECRET?: string;
  // Secret — set via `wrangler secret put BETTER_AUTH_SECRET`.
  BETTER_AUTH_SECRET?: string;

  // --- Custom domains (Cloudflare for SaaS / Custom Hostnames) --------------
  // The whole feature self-gates: it is inert unless BOTH the token and zone id
  // are present, so it ships safely before SSL for SaaS is enabled.
  // Secret — scoped API token with SSL/custom-hostname edit on the zone.
  CF_API_TOKEN?: string;
  // The zone id that owns the apex domain.
  CF_ZONE_ID?: string;
  // Hostname users CNAME their domain to (the zone's fallback origin).
  // Defaults to the apex DOMAIN when unset.
  CF_FALLBACK_ORIGIN?: string;
}

// Metadata stored in KV under `slug:<slug>`. New optional fields can be added
// here for paid features (owner, permanent, customDomain) without migration.
export interface SlugMeta {
  filename: string;
  size: number;
  uploadedAt: number;
  // Absent on operator-pinned permanent slugs (whose KV entries also carry
  // no expirationTtl); serve.ts skips the expiry check when missing.
  expiresAt?: number;
  // Absent on anonymous uploads; set to Better Auth user.id when logged in.
  owner?: string;
  // Forward-compat for plan 003 (multi-file projects).
  kind?: "single" | "project";
  fileCount?: number;
}
