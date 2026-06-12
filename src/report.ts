import { Env } from "./env";
import { SLUG_RE } from "./slug";

// Abuse reporting.
//   GET  /report?slug=<slug>  -> minimal confirmation page with a submit button
//   POST /report (slug=...)   -> append the report to KV for review
//
// Reports are stored as individual KV keys `report:<ts>-<rand>` so concurrent
// reports never clobber each other. List them with:
//   wrangler kv key list --binding KV --prefix "report:"
// (Swap KV-list for email later — see README "Extending /report".)

export async function handleReport(request: Request, env: Env): Promise<Response> {
  if (request.method === "POST") return submitReport(request, env);
  return reportForm(request, env);
}

async function submitReport(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const slug = String(form.get("slug") ?? "").trim();
  const note = String(form.get("note") ?? "").slice(0, 1000);

  if (!SLUG_RE.test(slug)) {
    return page(env, "Invalid report", "<p>That slug doesn't look valid.</p>");
  }

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const ts = Date.now();
  const rand = crypto.randomUUID().slice(0, 8);
  const record = { slug, note, ip, reportedAt: ts };

  // 90-day retention on report records so the review list self-cleans.
  await env.KV.put(`report:${ts}-${rand}`, JSON.stringify(record), {
    expirationTtl: 90 * 24 * 60 * 60,
  });

  return page(
    env,
    "Report received",
    `<p>Thanks — <code>${escapeHtml(slug)}</code> has been flagged for review.</p>
     <a class="btn" href="https://${env.DOMAIN}/">Back to Deployhtml</a>`,
  );
}

function reportForm(request: Request, env: Env): Response {
  const url = new URL(request.url);
  const slug = (url.searchParams.get("slug") ?? "").trim();
  const safeSlug = SLUG_RE.test(slug) ? slug : "";

  return page(
    env,
    "Report abuse",
    `<p>Report a Deployhtml page that is phishing, malware, or otherwise abusive.</p>
     <form method="POST" action="/report">
       <label>Slug
         <input name="slug" value="${escapeHtml(safeSlug)}" placeholder="calm-river-x4x2" required>
       </label>
       <label>What's wrong? (optional)
         <textarea name="note" rows="4" placeholder="Describe the issue"></textarea>
       </label>
       <button type="submit">Submit report</button>
     </form>`,
  );
}

function page(env: Env, title: string, body: string): Response {
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Deployhtml</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
    font:16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background:#0b0d12; color:#e6e8ee; padding:24px; }
  .card { width:100%; max-width:460px; }
  h1 { font-size:22px; margin:0 0 12px; }
  p { color:#9aa3b2; }
  label { display:block; margin:14px 0 6px; font-size:14px; color:#c7cdda; }
  input, textarea { width:100%; padding:10px 12px; border-radius:10px;
    border:1px solid #2c3445; background:#11151d; color:#e6e8ee; font:inherit; }
  button, .btn { margin-top:16px; display:inline-block; padding:10px 18px;
    border-radius:10px; border:1px solid #2c3445; background:#7aa2ff; color:#0b0d12;
    font-weight:600; cursor:pointer; text-decoration:none; }
  .btn { background:#1c2230; color:#e6e8ee; }
  code { background:#11151d; padding:2px 6px; border-radius:6px; }
</style>
</head><body><div class="card"><h1>${title}</h1>${body}</div></body></html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}
