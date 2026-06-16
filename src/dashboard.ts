import { Env } from "./env";
import { page, escapeHtml } from "./page";
import { getSession } from "./authpages";
import { listDeploys, getOwnedDeploy, deleteDeployRow, DeployRow } from "./deploys";

// GET /dashboard — shows the logged-in user's uploaded pages.
export async function handleDashboard(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) {
    return Response.redirect(new URL("/login", request.url).toString(), 302);
  }

  const userId = session.user.id;
  const rows = await listDeploys(env, userId);

  const tableBody = rows.length === 0
    ? `<tr><td colspan="5" style="color:#9aa3b2;text-align:center;padding:24px">No pages yet — upload one!</td></tr>`
    : rows.map((r) => deployRow(r, env.DOMAIN)).join("");

  const body = `
<style>
  table { width:100%; border-collapse:collapse; margin-top:16px; }
  th, td { padding:8px 10px; text-align:left; border-bottom:1px solid #2c3445; font-size:14px; }
  th { color:#9aa3b2; font-weight:500; }
  .del-btn { padding:4px 10px; font-size:12px; background:#2c3445; color:#e6e8ee;
             border:1px solid #3d4c65; border-radius:6px; cursor:pointer; margin-top:0; }
  .del-form { display:inline; }
</style>
<p>Pages you have uploaded. Logged-in pages are permanent — they never expire.</p>
<table>
  <thead>
    <tr>
      <th>URL</th>
      <th>Filename</th>
      <th>Size</th>
      <th>Uploaded</th>
      <th></th>
    </tr>
  </thead>
  <tbody>${tableBody}</tbody>
</table>
<p style="margin-top:24px"><a class="btn" href="/">Upload another page</a></p>`;

  return page("My pages", body);
}

function deployRow(r: DeployRow, domain: string): string {
  const url = `https://${escapeHtml(r.slug)}.${escapeHtml(domain)}`;
  const name = r.name ? escapeHtml(r.name) : escapeHtml(r.slug);
  const size = humanSize(r.size);
  const date = new Date(r.created_at).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
  return `<tr>
    <td><a href="${url}" target="_blank" rel="noopener">${escapeHtml(r.slug)}.${escapeHtml(domain)}</a></td>
    <td>${name}</td>
    <td>${escapeHtml(size)}</td>
    <td>${escapeHtml(date)}</td>
    <td>
      <form class="del-form" method="POST" action="/dashboard/delete"
            onsubmit="return confirm('Delete this page? It cannot be undone.')">
        <input type="hidden" name="slug" value="${escapeHtml(r.slug)}">
        <button class="del-btn" type="submit">Delete</button>
      </form>
    </td>
  </tr>`;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// POST /dashboard/delete — deletes an owned page (R2 + KV + D1).
export async function handleDashboardDelete(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) {
    return Response.redirect(new URL("/login", request.url).toString(), 302);
  }

  const userId = session.user.id;
  const form = await request.formData();
  const slug = String(form.get("slug") ?? "");

  // Ownership check — never delete based on the posted slug alone.
  const owned = await getOwnedDeploy(env, slug, userId);
  if (!owned) {
    return page("Not found", "<p>That page isn&#39;t yours or doesn&#39;t exist.</p>");
  }

  if (owned.kind === "project") {
    const list = await env.BUCKET.list({ prefix: `${slug}/` });
    for (const o of list.objects) await env.BUCKET.delete(o.key);
    await env.BUCKET.delete(`${slug}.html`); // defensive
  } else {
    await env.BUCKET.delete(`${slug}.html`);
  }

  await env.KV.delete(`slug:${slug}`);
  await deleteDeployRow(env, slug, userId);

  return Response.redirect(new URL("/dashboard", request.url).toString(), 302);
}
