import { Env } from "./env";
import { sameOrigin } from "./ui";
import { getSession } from "./authpages";
import { getOwnedDeploy, setCustomDomain } from "./deploys";

// ---------------------------------------------------------------------------
// Custom domains via Cloudflare for SaaS (Custom Hostnames).
//
// The feature self-gates on CF_API_TOKEN + CF_ZONE_ID: if either is missing the
// endpoints return 503 and the UI keeps showing "coming soon", so this ships
// safely before the operator enables SSL for SaaS.
//
// Serving hot path: KV `host:<hostname>` -> { slug, id }. The deploy row's
// `custom_domain` column is the management source of truth (one domain/page).
// ---------------------------------------------------------------------------

interface HostMap { slug: string; id: string; }
interface DnsRecord { type: "CNAME" | "TXT"; name: string; value: string; }

// Look up a mapped custom hostname -> slug for request routing. Cheap KV read.
export async function lookupCustomDomain(env: Env, host: string): Promise<string | null> {
  const raw = await env.KV.get(`host:${host.toLowerCase()}`);
  if (!raw) return null;
  try { return (JSON.parse(raw) as HostMap).slug || null; } catch { return null; }
}

function enabled(env: Env): boolean {
  return !!(env.CF_API_TOKEN && env.CF_ZONE_ID);
}

function fallbackTarget(env: Env): string {
  return (env.CF_FALLBACK_ORIGIN || env.DOMAIN).toLowerCase();
}

// Validate a user-supplied hostname. Rejects bad shapes, IPs, and our own space.
function validateHostname(raw: string, env: Env): { ok: boolean; host: string; reason?: string } {
  const host = (raw ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!host) return { ok: false, host, reason: "Enter a domain" };
  if (host.length > 253) return { ok: false, host, reason: "Domain is too long" };
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return { ok: false, host, reason: "IP addresses aren't supported" };
  const shape = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
  if (!shape.test(host)) return { ok: false, host, reason: "Enter a valid domain like example.com" };
  const apex = env.DOMAIN.toLowerCase();
  if (host === apex || host.endsWith(`.${apex}`)) {
    return { ok: false, host, reason: `${apex} subdomains are automatic — use your own domain` };
  }
  return { ok: true, host };
}

// --- Cloudflare API -------------------------------------------------------
interface CfResult {
  success: boolean;
  errors?: { message: string }[];
  result?: any;
}

async function cf(env: Env, path: string, init?: RequestInit): Promise<CfResult> {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  try { return (await res.json()) as CfResult; }
  catch { return { success: false, errors: [{ message: `Cloudflare returned ${res.status}` }] }; }
}

function dnsRecords(result: any, env: Env): DnsRecord[] {
  const recs: DnsRecord[] = [
    { type: "CNAME", name: result.hostname, value: fallbackTarget(env) },
  ];
  const ov = result.ownership_verification;
  if (ov && ov.type === "txt" && ov.name) recs.push({ type: "TXT", name: ov.name, value: ov.value });
  for (const vr of result.ssl?.validation_records ?? []) {
    if (vr.txt_name) recs.push({ type: "TXT", name: vr.txt_name, value: vr.txt_value });
  }
  return recs;
}

function statusOf(result: any): string {
  // Cloudflare reports hostname status + a separate ssl status; surface the
  // less-ready of the two so "active" only shows when the cert is live.
  const h = result.status ?? "pending";
  const s = result.ssl?.status ?? "pending";
  if (h === "active" && (s === "active")) return "active";
  return h === "active" ? "validating_cert" : h; // pending, blocked, moved, etc.
}

// --- Handlers -------------------------------------------------------------

// POST /edit/domain { slug, domain } — attach a custom domain to an owned page.
export async function handleAddDomain(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return json({ ok: false, error: "Not signed in" }, 401);
  if (!sameOrigin(request)) return json({ ok: false, error: "Bad origin" }, 403);
  if (!enabled(env)) return json({ ok: false, error: "Custom domains aren't enabled on this deployment yet" }, 503);
  const ownerId = session.user.id;

  let slug = "", domainRaw = "";
  try {
    const b = (await request.json()) as { slug?: string; domain?: string };
    slug = String(b.slug ?? "").trim().toLowerCase();
    domainRaw = String(b.domain ?? "");
  } catch { return json({ ok: false, error: "Bad request" }, 400); }

  const v = validateHostname(domainRaw, env);
  if (!v.ok) return json({ ok: false, error: v.reason }, 400);
  const host = v.host;

  const owned = slug ? await getOwnedDeploy(env, slug, ownerId) : null;
  if (!owned) return json({ ok: false, error: "Page not found" }, 404);
  if (owned.custom_domain) return json({ ok: false, error: "Remove the existing domain first" }, 409);

  if ((await env.KV.get(`host:${host}`)) !== null) {
    return json({ ok: false, error: "That domain is already connected to a page" }, 409);
  }

  const created = await cf(env, `/zones/${env.CF_ZONE_ID}/custom_hostnames`, {
    method: "POST",
    body: JSON.stringify({ hostname: host, ssl: { method: "txt", type: "dv" } }),
  });
  if (!created.success || !created.result?.id) {
    return json({ ok: false, error: created.errors?.[0]?.message || "Cloudflare rejected the domain" }, 502);
  }

  await env.KV.put(`host:${host}`, JSON.stringify({ slug, id: created.result.id } as HostMap));
  await setCustomDomain(env, slug, ownerId, host);

  return json({
    ok: true,
    domain: host,
    status: statusOf(created.result),
    target: fallbackTarget(env),
    records: dnsRecords(created.result, env),
  });
}

// GET /edit/domain/status?slug= — current status + DNS records (for the modal).
export async function handleDomainStatus(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return json({ ok: false, error: "Not signed in" }, 401);
  const ownerId = session.user.id;
  const slug = (new URL(request.url).searchParams.get("slug") || "").trim().toLowerCase();
  const owned = slug ? await getOwnedDeploy(env, slug, ownerId) : null;
  if (!owned) return json({ ok: false, error: "Page not found" }, 404);

  if (!owned.custom_domain) return json({ ok: true, domain: null });
  if (!enabled(env)) return json({ ok: true, domain: owned.custom_domain, status: "unknown" });

  const raw = await env.KV.get(`host:${owned.custom_domain}`);
  const id = raw ? (JSON.parse(raw) as HostMap).id : null;
  if (!id) return json({ ok: true, domain: owned.custom_domain, status: "unknown" });

  const got = await cf(env, `/zones/${env.CF_ZONE_ID}/custom_hostnames/${id}`);
  if (!got.success || !got.result) return json({ ok: true, domain: owned.custom_domain, status: "unknown" });

  return json({
    ok: true,
    domain: owned.custom_domain,
    status: statusOf(got.result),
    target: fallbackTarget(env),
    records: dnsRecords(got.result, env),
  });
}

// POST /edit/domain/remove { slug } — detach the custom domain.
export async function handleRemoveDomain(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return json({ ok: false, error: "Not signed in" }, 401);
  if (!sameOrigin(request)) return json({ ok: false, error: "Bad origin" }, 403);
  const ownerId = session.user.id;

  let slug = "";
  try {
    const b = (await request.json()) as { slug?: string };
    slug = String(b.slug ?? "").trim().toLowerCase();
  } catch { return json({ ok: false, error: "Bad request" }, 400); }

  const owned = slug ? await getOwnedDeploy(env, slug, ownerId) : null;
  if (!owned) return json({ ok: false, error: "Page not found" }, 404);

  const host = owned.custom_domain;
  if (host) {
    const raw = await env.KV.get(`host:${host}`);
    const id = raw ? (JSON.parse(raw) as HostMap).id : null;
    if (id && enabled(env)) await cf(env, `/zones/${env.CF_ZONE_ID}/custom_hostnames/${id}`, { method: "DELETE" });
    await env.KV.delete(`host:${host}`);
    await setCustomDomain(env, slug, ownerId, null);
  }
  return json({ ok: true });
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
