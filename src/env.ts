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
}
