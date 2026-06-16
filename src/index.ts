import { Env } from "./env";
import { handleUpload, handleProjectUpload } from "./upload";
import { handleReport } from "./report";
import { serveSlug } from "./serve";
import { createAuth } from "./auth";
import { handleLogin, handleSignup, handleAccount, getSession } from "./authpages";
import { handleDashboard, handleDashboardDelete, handleRename, handleSlugAvailable } from "./dashboard";
import { handleEditor, handleEditorSave } from "./editor";
import { lookupCustomDomain, handleAddDomain, handleDomainStatus, handleRemoveDomain } from "./customdomains";
import { notFoundResponse } from "./notfound";

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

    // --- Custom domains ----------------------------------------------------
    // A foreign host (not our apex/www or a dev host) may be a connected custom
    // domain. If it's mapped, serve its page; otherwise fall through to apex
    // routing (preserving local-dev on 127.0.0.1 and the old foreign-host path).
    if (!isOurApex(host, domain)) {
      const mapped = await lookupCustomDomain(env, host);
      if (mapped !== null) {
        return serveSlug(mapped, url.pathname, env);
      }
    }

    // --- Apex / www routing -----------------------------------------------
    const path = url.pathname;

    if (path === "/upload") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
      }
      return handleUpload(request, env);
    }

    if (path === "/upload/project") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
      }
      return handleProjectUpload(request, env);
    }

    if (path === "/report") {
      return handleReport(request, env);
    }

    if (path === "/api/auth" || path.startsWith("/api/auth/")) {
      return createAuth(request, env).handler(request);
    }

    if (path === "/login") return handleLogin(request, env);
    if (path === "/signup") return handleSignup(request, env);
    if (path === "/account") return handleAccount(request, env);

    if (path === "/dashboard") return handleDashboard(request, env);
    if (path === "/dashboard/delete") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
      }
      return handleDashboardDelete(request, env);
    }
    if (path === "/dashboard/slug-available") return handleSlugAvailable(request, env);
    if (path === "/dashboard/rename") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
      }
      return handleRename(request, env);
    }

    if (path === "/edit") return handleEditor(request, env);
    if (path === "/edit/save") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
      }
      return handleEditorSave(request, env);
    }
    if (path === "/edit/domain/status") return handleDomainStatus(request, env);
    if (path === "/edit/domain/remove") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
      }
      return handleRemoveDomain(request, env);
    }
    if (path === "/edit/domain") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
      }
      return handleAddDomain(request, env);
    }

    if (path === "/" || path === "/index.html") {
      return serveLanding(request, env);
    }

    // Everything else: static assets (vendored QR lib, favicon, etc.).
    return env.ASSETS.fetch(request);
  },
};

// Our own apex / www / dev hosts — these are served by apex routing, never
// treated as a custom domain (so local dev on 127.0.0.1 and the apex are safe).
function isOurApex(host: string, domain: string): boolean {
  if (host === "127.0.0.1" || host === "0.0.0.0" || host === "[::1]") return true;
  for (const base of [domain, "localhost"]) {
    if (host === base || host === `www.${base}`) return true;
  }
  return false;
}

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

  // Auth-aware top nav: mark the bar .is-authed when a session cookie is present
  // so the page shows Dashboard (and hides Sign in / Get started) for logged-in users.
  const session = await getSession(request, env);
  if (session) {
    html = html.replace('class="topnav"', 'class="topnav is-authed"');
  }

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      // Response varies by session — never let a shared cache serve one user's
      // authed nav to another visitor.
      "Cache-Control": "private, no-cache",
    },
  });
}
