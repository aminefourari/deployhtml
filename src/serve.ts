import { Env, SlugMeta } from "./env";
import { CONFIG } from "./config";
import { SLUG_RE } from "./slug";
import { notFoundResponse } from "./notfound";

// Serve a hosted page for <slug>.<domain>[/<path>].
//
// Path mapping: "/" serves the slug's root object "<slug>.html"; a deeper
// path like "/projects" serves "<slug>/projects.html" when that object
// exists. Subpage objects are operator-managed (uploaded via wrangler) —
// the public upload flow only ever writes the root object. Unknown or
// invalid subpaths fall back to the root page, preserving the original
// any-path-serves-the-page behavior for single-page slugs.
//
// All paths under a slug share the slug's KV metadata, so expiry (or
// permanence, when `expiresAt` is absent) applies to the whole subdomain.
export async function serveSlug(slug: string, pathname: string, env: Env): Promise<Response> {
  if (!SLUG_RE.test(slug)) return notFoundResponse(env.DOMAIN);

  const metaRaw = await env.KV.get(`slug:${slug}`);
  if (!metaRaw) return notFoundResponse(env.DOMAIN);

  let meta: SlugMeta;
  try {
    meta = JSON.parse(metaRaw) as SlugMeta;
  } catch {
    return notFoundResponse(env.DOMAIN);
  }
  if (meta.expiresAt && Date.now() > meta.expiresAt) {
    return notFoundResponse(env.DOMAIN);
  }

  const subKey = subpageKey(slug, pathname);
  let obj = subKey ? await env.BUCKET.get(subKey) : null;
  if (!obj) obj = await env.BUCKET.get(`${slug}.html`);
  if (!obj) return notFoundResponse(env.DOMAIN);

  const original = await obj.text();
  const html = injectFooter(original, slug, env.DOMAIN);

  return new Response(html, {
    status: 200,
    headers: securityHeaders(),
  });
}

// Map a request path to a subpage R2 key, or null when the path is the root
// ("/", "/index.html"), too deep, or contains anything outside the strict
// segment alphabet (which also rules out traversal — no dots allowed except
// an optional ".html" suffix on the last segment).
function subpageKey(slug: string, pathname: string): string | null {
  const trimmed = pathname.replace(/^\/+|\/+$/g, "");
  if (!trimmed || trimmed === "index.html") return null;

  const segments = trimmed.split("/");
  if (segments.length > 8) return null;

  const last = segments.length - 1;
  segments[last] = segments[last].replace(/\.html?$/i, "");

  for (const segment of segments) {
    if (!/^[a-z0-9_-]{1,64}$/.test(segment)) return null;
  }
  return `${slug}/${segments.join("/")}.html`;
}

// Security headers applied to all served user content.
function securityHeaders(): HeadersInit {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    // Prevent the hosted page from being framed/clickjacked.
    "Content-Security-Policy": "frame-ancestors 'none'",
    "Cache-Control": "public, max-age=60",
  };
}

// Inject the fixed "Hosted on Deployhtml — Report abuse" badge before </body>
// (falling back to append). The badge markup is self-contained with inline
// styles so it survives regardless of the page's own CSS.
function injectFooter(html: string, slug: string, domain: string): string {
  const reportUrl = `https://${domain}/report?slug=${encodeURIComponent(slug)}`;
  const badge = `
<div style="position:fixed;left:0;right:0;bottom:0;z-index:2147483647;display:flex;justify-content:center;pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="pointer-events:auto;margin:0 0 10px;padding:6px 12px;background:rgba(11,13,18,.85);color:#e6e8ee;border:1px solid #2c3445;border-radius:999px;font-size:12px;line-height:1;backdrop-filter:blur(6px)">
    ${CONFIG.footerText} —
    <a href="${reportUrl}" style="color:#7aa2ff;text-decoration:none">${CONFIG.reportLabel}</a>
  </div>
</div>`;

  const idx = html.toLowerCase().lastIndexOf("</body>");
  if (idx !== -1) {
    return html.slice(0, idx) + badge + html.slice(idx);
  }
  return html + badge;
}
