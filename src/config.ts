// Central tunables. Adjust these to change limits/lifetime without touching
// the handler logic. Paid tiers will eventually read overrides from KV metadata.

export const CONFIG = {
  /** Maximum upload size in bytes (1 MB). */
  maxBytes: 1024 * 1024,

  /** Link lifetime in seconds (7 days). Used for both KV TTL and metadata. */
  ttlSeconds: 7 * 24 * 60 * 60,

  /** Max successful uploads allowed per IP per rolling hour. */
  maxUploadsPerHour: 5,

  /** Footer badge text injected into every served page. */
  footerText: "Hosted on Deployhtml",

  /** Report link label in the footer badge. */
  reportLabel: "Report abuse",
} as const;
