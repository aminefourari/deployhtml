// Readable random slug generator: <adjective>-<noun>-<4 chars>
// e.g. "calm-river-x4x2". ~36^4 suffix entropy per word pair keeps collisions
// negligible; the upload handler also retries on the rare KV collision.

const ADJECTIVES = [
  "calm", "brave", "bright", "swift", "quiet", "bold", "warm", "cool",
  "wild", "soft", "keen", "lucky", "merry", "noble", "proud", "shy",
  "witty", "zesty", "amber", "azure", "coral", "crisp", "dusky", "fancy",
  "gentle", "happy", "icy", "jolly", "kind", "lush", "misty", "neat",
];

const NOUNS = [
  "river", "meadow", "forest", "canyon", "harbor", "summit", "valley", "comet",
  "falcon", "otter", "lynx", "raven", "willow", "cedar", "maple", "fern",
  "ember", "pebble", "ripple", "breeze", "dune", "glade", "haze", "isle",
  "lagoon", "marsh", "orchard", "prairie", "reef", "tundra", "vista", "wren",
];

const SUFFIX_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function pick<T>(arr: T[]): T {
  const idx = Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * arr.length);
  return arr[idx];
}

function suffix(len = 4): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (let i = 0; i < len; i++) out += SUFFIX_CHARS[bytes[i] % SUFFIX_CHARS.length];
  return out;
}

export function generateSlug(): string {
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${suffix()}`;
}

/** Valid slug shape for serving (lowercase letters, digits, hyphens). */
export const SLUG_RE = /^[a-z0-9-]{3,63}$/;

// Labels that must never be claimed as a user slug — they collide with
// infrastructure subdomains or the www/apex host handling in index.ts.
const RESERVED_SLUGS = new Set([
  "www", "api", "app", "admin", "mail", "ftp", "localhost",
  "static", "assets", "cdn", "ns1", "ns2", "smtp",
  // Custom-domain fallback origin host (cname.deployhtml.com) — keep it
  // un-claimable so a user slug can't shadow the SaaS fallback record.
  "cname",
]);

export interface SlugCheck { ok: boolean; reason?: string; }

// Validate a user-chosen custom slug (stricter than SLUG_RE: min length 4, no
// leading/trailing hyphen, no reserved labels). Mirrors the modal's client-side
// rules so the server is the authority. Does NOT check uniqueness (caller does).
export function validateCustomSlug(raw: string): SlugCheck {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return { ok: false, reason: "URL can't be empty" };
  if (!/^[a-z0-9-]+$/.test(v)) return { ok: false, reason: "Use lowercase letters, numbers and hyphens only" };
  if (/^-|-$/.test(v)) return { ok: false, reason: "Can't start or end with a hyphen" };
  if (v.length < 4) return { ok: false, reason: "Must be at least 4 characters" };
  if (v.length > 63) return { ok: false, reason: "Too long (max 63 characters)" };
  if (RESERVED_SLUGS.has(v)) return { ok: false, reason: "That URL is reserved" };
  return { ok: true };
}
