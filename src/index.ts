import { Env } from "./env";
import { handleUpload } from "./upload";
import { handleReport } from "./report";
import { serveSlug } from "./serve";

// Single Worker entrypoint. Dispatches by hostname then path:
//   <slug>.<domain>        -> serveSlug          (hosted user pages)
//   <domain>/upload  POST  -> handleUpload
//   <domain>/report        -> handleReport
//   <domain>/ , /index.html-> landing page (Turnstile sitekey injected)
//   <domain>/<other>       -> static assets (vendor/qrcode.js, etc.)
//
// run_worker_first = true in wrangler.toml ensures this runs for every request,
// including wildcard subdomains, before static-asset serving.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    const domain = env.DOMAIN.toLowerCase();

    // --- Slug serving on a subdomain --------------------------------------
    // Treat <label>.<domain> (and <label>.localhost for dev) as a slug, except
    // the bare apex and the www host.
    const slug = subdomainSlug(host, domain);
    if (slug !== null) {
      return serveSlug(slug, url.pathname, env);
    }

    // --- Apex / www routing -----------------------------------------------
    const path = url.pathname;

    if (path === "/upload") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
      }
      return handleUpload(request, env);
    }

    if (path === "/report") {
      return handleReport(request, env);
    }

    if (path === "/" || path === "/index.html") {
      return serveLanding(request, env);
    }

    // Everything else: static assets (vendored QR lib, favicon, etc.).
    return env.ASSETS.fetch(request);
  },
};

// Returns the slug label for a serving subdomain, or null if `host` is the
// apex / www / not under our domain.
function subdomainSlug(host: string, domain: string): string | null {
  for (const base of [domain, "localhost"]) {
    if (host === base || host === `www.${base}`) return null;
    if (host.endsWith(`.${base}`)) {
      const label = host.slice(0, host.length - base.length - 1);
      // Multi-level labels aren't valid slugs; ignore.
      if (label && !label.includes(".") && label !== "www") return label;
    }
  }
  return null;
}

// Serve the landing page, injecting the public Turnstile sitekey and domain so
// configuration lives only in wrangler.toml.
async function serveLanding(request: Request, env: Env): Promise<Response> {
  // Fetch the index asset at "/" (the asset server redirects/empties
  // "/index.html"), then template in the public sitekey + domain.
  const assetUrl = new URL(request.url);
  assetUrl.pathname = "/";
  const res = await env.ASSETS.fetch(new Request(assetUrl.toString(), { method: "GET" }));
  let html = await res.text();
  html = html
    .replaceAll("__TURNSTILE_SITEKEY__", env.TURNSTILE_SITEKEY)
    .replaceAll("__DOMAIN__", env.DOMAIN);
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
