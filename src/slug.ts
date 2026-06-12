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
