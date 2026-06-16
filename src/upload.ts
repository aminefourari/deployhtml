import { Env, SlugMeta } from "./env";
import { CONFIG } from "./config";
import { generateSlug } from "./slug";
import { scanContent } from "./scan";
import { getSession } from "./authpages";
import { recordDeploy } from "./deploys";

// POST /upload — accepts one HTML file, returns { url, slug, expiresAt }.
export async function handleUpload(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";

  // 1) Rate limit (per IP, per hour) — check before doing any work.
  if (!(await underRateLimit(env, ip))) {
    return json({ error: `Rate limit reached (${CONFIG.maxUploadsPerHour} uploads/hour). Try again later.` }, 429);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Expected multipart/form-data." }, 400);
  }

  // 2) Turnstile (bypassed only when DEV_MODE=true).
  const token = String(form.get("cf-turnstile-response") ?? "");
  if (!(await verifyTurnstile(env, token, ip))) {
    return json({ error: "Turnstile verification failed." }, 403);
  }

  // 3) File presence + size.
  // FormData.get returns `string | File | null`; a real upload is a File-like
  // object (has a name + arrayBuffer), not a plain string field.
  const entry = form.get("file") as unknown as File | string | null;
  if (entry === null || typeof entry === "string") {
    return json({ error: "No file provided." }, 400);
  }
  const file = entry;
  if (file.size === 0) {
    return json({ error: "File is empty." }, 400);
  }
  if (file.size > CONFIG.maxBytes) {
    return json({ error: "File too large (max 1 MB)." }, 413);
  }

  // 4) Type check: declared content-type must be HTML (or .html/.htm name).
  const declaredType = (file.type || "").toLowerCase();
  const nameOk = /\.html?$/i.test(file.name);
  if (!declaredType.includes("text/html") && !nameOk) {
    return json({ error: "Only HTML files are allowed." }, 415);
  }

  // 5) Content sniff — must actually look like HTML.
  const text = await file.text();
  const head = text.slice(0, 4000).toLowerCase();
  if (!head.includes("<!doctype html") && !head.includes("<html") && !head.includes("<body")) {
    return json({ error: "File does not look like HTML." }, 415);
  }

  // 6) Phishing scan.
  const scan = scanContent(text, env.DOMAIN);
  if (scan.blocked) {
    return json({ error: `Upload rejected: ${scan.reason}.` }, 422);
  }

  // 7) Allocate a unique slug (retry on the rare collision).
  let slug = "";
  for (let i = 0; i < 6; i++) {
    const candidate = generateSlug();
    if (!(await env.KV.get(`slug:${candidate}`))) {
      slug = candidate;
      break;
    }
  }
  if (!slug) {
    return json({ error: "Could not allocate a slug, please retry." }, 503);
  }

  // 8) Store file in R2, then branch on session: permanent (logged-in) vs TTL (anon).
  const now = Date.now();
  const session = await getSession(request, env);
  const ownerId = session?.user?.id ?? null;

  await env.BUCKET.put(`${slug}.html`, text, {
    httpMetadata: { contentType: "text/html; charset=utf-8" },
  });

  if (ownerId) {
    // Logged-in: permanent link — no TTL on KV, no expiresAt in meta.
    const meta: SlugMeta = {
      filename: file.name,
      size: file.size,
      uploadedAt: now,
      owner: ownerId,
      kind: "single",
      fileCount: 1,
    };
    await env.KV.put(`slug:${slug}`, JSON.stringify(meta)); // no expirationTtl
    await recordDeploy(env, {
      slug,
      ownerId,
      kind: "single",
      name: file.name,
      size: file.size,
      fileCount: 1,
      createdAt: now,
    });
    await bumpRateLimit(env, ip);
    return json({ url: `https://${slug}.${env.DOMAIN}`, slug, permanent: true });
  }

  // Anonymous: 7-day TTL, unchanged from before.
  const expiresAt = now + CONFIG.ttlSeconds * 1000;
  const meta: SlugMeta = { filename: file.name, size: file.size, uploadedAt: now, expiresAt };
  await env.KV.put(`slug:${slug}`, JSON.stringify(meta), { expirationTtl: CONFIG.ttlSeconds });

  // 9) Count this successful upload against the rate limit.
  await bumpRateLimit(env, ip);

  return json({ url: `https://${slug}.${env.DOMAIN}`, slug, expiresAt });
}

// --- Rate limiting (KV counters, per IP, per rolling hour bucket) -----------

function hourBucket(): number {
  return Math.floor(Date.now() / 3_600_000);
}

async function underRateLimit(env: Env, ip: string): Promise<boolean> {
  const key = `rl:${ip}:${hourBucket()}`;
  const v = await env.KV.get(key);
  return (v ? parseInt(v, 10) : 0) < CONFIG.maxUploadsPerHour;
}

async function bumpRateLimit(env: Env, ip: string): Promise<void> {
  const key = `rl:${ip}:${hourBucket()}`;
  const v = await env.KV.get(key);
  const count = v ? parseInt(v, 10) : 0;
  // ~1h TTL so buckets self-expire.
  await env.KV.put(key, String(count + 1), { expirationTtl: 3700 });
}

// --- Turnstile --------------------------------------------------------------

async function verifyTurnstile(env: Env, token: string, ip: string): Promise<boolean> {
  if (env.DEV_MODE === "true") return true; // local dev bypass
  if (!token || !env.TURNSTILE_SECRET) return false;

  const body = new FormData();
  body.append("secret", env.TURNSTILE_SECRET);
  body.append("response", token);
  body.append("remoteip", ip);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { success?: boolean };
  return data.success === true;
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
