import { Env, SlugMeta } from "./env";
import { page } from "./page";
import {
  shell, appTopbar, avatarInitials, escapeHtml, sameOrigin,
  toastHtml, TOAST_JS, slugModalHtml, SLUG_MODAL_JS,
} from "./ui";
import { getSession } from "./authpages";
import {
  listDeploys, getOwnedDeploy, deleteDeployRow, renameDeployRow, slugTakenInD1, DeployRow,
} from "./deploys";
import { validateCustomSlug } from "./slug";
import { CONTENT_TYPES, extOf } from "./projects";

// GET /dashboard — the logged-in user's deploys, in the flat violet design.
export async function handleDashboard(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) {
    return Response.redirect(new URL("/login", request.url).toString(), 302);
  }

  const rows = await listDeploys(env, session.user.id);
  const initials = avatarInitials(session.user.name, session.user.email);

  const live = rows.length;
  const perm = rows.filter((r) => !!r.permanent).length;
  const files = rows.reduce((a, r) => a + (r.file_count || 0), 0);
  const bytes = rows.reduce((a, r) => a + (r.size || 0), 0);

  const grid = rows.length === 0
    ? `<div class="empty">No pages yet. <a href="/" style="color:var(--accent-deep);font-weight:600;text-decoration:none">Deploy your first page →</a></div>`
    : rows.map((r) => deployCard(r, env.DOMAIN)).join("");

  const body = `
<div class="dash">
  <div class="dash-head">
    <div>
      <h1>Your pages</h1>
      <p>Logged-in deploys are permanent — they never expire.</p>
    </div>
    <a class="btn-primary" style="padding:11px 20px;font-size:14.5px;" href="/">↑ Deploy new page</a>
  </div>

  <div class="stats">
    <div class="stat">
      <div class="k"><span class="pip" style="background:var(--accent)"></span>Live pages</div>
      <div class="v">${live}</div>
      <div class="d" style="color:var(--muted)">${perm === live ? "all permanent" : `${perm} permanent`}</div>
    </div>
    <div class="stat">
      <div class="k"><span class="pip" style="background:#3BA0C4"></span>Total files</div>
      <div class="v">${files}</div>
      <div class="d" style="color:var(--muted)">across your pages</div>
    </div>
    <div class="stat">
      <div class="k"><span class="pip" style="background:#C46FA8"></span>Storage used</div>
      <div class="v">${humanSizeParts(bytes)}</div>
      <div class="d" style="color:var(--muted)">total uploaded</div>
    </div>
    <div class="stat">
      <div class="k"><span class="pip" style="background:var(--green)"></span>Plan</div>
      <div class="v" style="font-size:22px">Free</div>
      <div class="d" style="color:var(--muted)">permanent links included</div>
    </div>
  </div>

  <div class="panel">
    <div class="panel-head">
      <h2>Deployed pages</h2>
      <div class="seg">
        <button class="active" onclick="filterDeploys(this,'all')">All</button>
        <button onclick="filterDeploys(this,'permanent')">Permanent</button>
        <button onclick="filterDeploys(this,'expiring')">Expiring</button>
      </div>
    </div>
    <div class="deploys" id="deploys">${grid}</div>
  </div>

  <a class="upload-cta" href="/">
    <div class="plus">+</div>
    <div>
      <div class="ct-t">Deploy another page</div>
      <div class="ct-s">Drop a single .html, a folder, or a .zip — live in seconds.</div>
    </div>
  </a>
</div>
${slugModalHtml(env.DOMAIN)}
${toastHtml()}`;

  const scripts = `${TOAST_JS}
${SLUG_MODAL_JS}
window.onSlugRenamed = function(){ window.location.reload(); };
function filterDeploys(btn, mode){
  btn.parentElement.querySelectorAll('button').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
  document.querySelectorAll('#deploys .deploy').forEach(function(d){
    var show = mode === 'all' || d.dataset.perm === mode;
    d.style.display = show ? '' : 'none';
  });
}
function confirmDelete(slug){
  if(!confirm('Delete this page? It cannot be undone.')) return;
  var f=document.createElement('form'); f.method='POST'; f.action='/dashboard/delete';
  var i=document.createElement('input'); i.type='hidden'; i.name='slug'; i.value=slug;
  f.appendChild(i); document.body.appendChild(f); f.submit();
}`;

  return shell({
    title: "Your pages",
    topbar: appTopbar("dashboard", initials),
    body,
    scripts,
  });
}

function deployCard(r: DeployRow, domain: string): string {
  const slug = r.slug; // slug chars are [a-z0-9-]; safe in JS string + attribute
  const display = r.name || r.slug;
  const url = `${escapeHtml(slug)}.${escapeHtml(domain)}`;
  const permanent = !!r.permanent;
  const date = new Date(r.created_at).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
  const badge = permanent
    ? `<span class="badge live"><span class="pip"></span>Permanent</span>`
    : `<span class="badge exp"><span class="pip"></span>Expiring</span>`;
  const n = r.file_count || 1;

  return `<div class="deploy" data-perm="${permanent ? "permanent" : "expiring"}" onclick="window.location='/edit?slug=${encodeURIComponent(slug)}'">
    <div class="thumb" style="background:${thumbColor(slug)}">${escapeHtml((display[0] || "·").toUpperCase())}</div>
    <div class="meta">
      <div class="name">${escapeHtml(display)}</div>
      <div class="url">${url}</div>
      <div class="row2">
        ${badge}
        <span>${n} file${n > 1 ? "s" : ""}</span>
        <span>${escapeHtml(humanSize(r.size))}</span>
        <span>${escapeHtml(date)}</span>
      </div>
    </div>
    <div class="acts">
      <a class="icon-btn" title="Edit page" href="/edit?slug=${encodeURIComponent(slug)}" onclick="event.stopPropagation()">${EDIT_ICON}</a>
      <button class="icon-btn" title="Edit URL" onclick="event.stopPropagation(); openSlugModal('${slug}')">${LINK_ICON}</button>
      <button class="icon-btn danger" title="Delete" onclick="event.stopPropagation(); confirmDelete('${slug}')">${TRASH_ICON}</button>
    </div>
  </div>`;
}

const EDIT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
const LINK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>';
const TRASH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>';

// Deterministic pastel-ish tile color from the slug.
function thumbColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 52% 55%)`;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Big-number rendering for the storage stat (value + small unit).
function humanSizeParts(bytes: number): string {
  if (bytes < 1024) return `${bytes} <span style="font-size:15px;color:var(--muted)">B</span>`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} <span style="font-size:15px;color:var(--muted)">KB</span>`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} <span style="font-size:15px;color:var(--muted)">MB</span>`;
}

// ---------------------------------------------------------------------------
// GET /dashboard/slug-available?slug=<s> — live uniqueness check for the modal.
// Session-gated to avoid open slug enumeration. Format-validates, then checks
// KV (the serving source of truth) for an existing claim.
// ---------------------------------------------------------------------------
export async function handleSlugAvailable(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return json({ available: false, reason: "Not signed in" }, 401);

  const slug = (new URL(request.url).searchParams.get("slug") || "").trim().toLowerCase();
  const check = validateCustomSlug(slug);
  if (!check.ok) return json({ available: false, reason: check.reason });

  const taken = await env.KV.get(`slug:${slug}`);
  if (taken !== null) return json({ available: false, reason: "That URL is already taken — try another" });
  return json({ available: true });
}

// ---------------------------------------------------------------------------
// POST /dashboard/rename {oldSlug, slug} — rename an owned deploy's slug,
// migrating R2 + KV + D1. Writes the new location fully before deleting the old
// one, so the page never 404s mid-rename.
// ---------------------------------------------------------------------------
export async function handleRename(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return json({ ok: false, error: "Not signed in" }, 401);
  if (!sameOrigin(request)) return json({ ok: false, error: "Bad origin" }, 403);
  const ownerId = session.user.id;

  let oldSlug = "", newSlug = "";
  try {
    const b = (await request.json()) as { oldSlug?: string; slug?: string };
    oldSlug = String(b.oldSlug ?? "").trim().toLowerCase();
    newSlug = String(b.slug ?? "").trim().toLowerCase();
  } catch {
    return json({ ok: false, error: "Bad request" }, 400);
  }

  const check = validateCustomSlug(newSlug);
  if (!check.ok) return json({ ok: false, error: check.reason }, 400);
  if (newSlug === oldSlug) return json({ ok: false, error: "That's already your URL" }, 400);

  // Ownership — never act on a posted slug we don't own.
  const owned = await getOwnedDeploy(env, oldSlug, ownerId);
  if (!owned) return json({ ok: false, error: "Page not found" }, 404);

  // Uniqueness — check BOTH KV (the serving source of truth) and D1 (where slug
  // is the PRIMARY KEY the rename UPDATE targets) so the UPDATE can never collide.
  const taken = "That URL is already taken — try another";
  if ((await env.KV.get(`slug:${newSlug}`)) !== null) return json({ ok: false, error: taken }, 409);
  if (await slugTakenInD1(env, newSlug)) return json({ ok: false, error: taken }, 409);

  const metaRaw = await env.KV.get(`slug:${oldSlug}`);
  if (!metaRaw) return json({ ok: false, error: "Page data missing" }, 404);
  const meta = JSON.parse(metaRaw) as SlugMeta;

  // 1) Copy R2 objects to the new key prefix (originals stay intact). Track the
  //    keys on each side so we can roll back the new copies if D1 fails.
  const oldKeys: string[] = [];
  const newKeys: string[] = [];
  if (owned.kind === "project") {
    let cursor: string | undefined;
    do {
      const list = await env.BUCKET.list({ prefix: `${oldSlug}/`, cursor });
      for (const o of list.objects) {
        const rest = o.key.slice(oldSlug.length + 1); // after "<oldSlug>/"
        const dest = `${newSlug}/${rest}`;
        await copyObject(env, o.key, dest);
        oldKeys.push(o.key);
        newKeys.push(dest);
      }
      cursor = list.truncated ? list.cursor : undefined;
    } while (cursor);
  } else {
    await copyObject(env, `${oldSlug}.html`, `${newSlug}.html`);
    oldKeys.push(`${oldSlug}.html`);
    newKeys.push(`${newSlug}.html`);
  }

  // 2) Flip D1 first (the ownership source of truth, with the PK on slug). If it
  //    doesn't change a row (concurrent delete / lost race), roll back the copies.
  let renamed = false;
  try {
    renamed = await renameDeployRow(env, oldSlug, newSlug, ownerId);
  } catch {
    renamed = false;
  }
  if (!renamed) {
    for (const k of newKeys) await env.BUCKET.delete(k);
    return json({ ok: false, error: taken }, 409);
  }

  // 3) Point KV at the new slug, release the old slug + its R2 objects.
  await env.KV.put(`slug:${newSlug}`, JSON.stringify(meta));
  await env.KV.delete(`slug:${oldSlug}`);
  for (const k of oldKeys) await env.BUCKET.delete(k);

  return json({ ok: true, slug: newSlug });
}

// Copy an R2 object to a new key, recomputing content type from the extension.
async function copyObject(env: Env, fromKey: string, toKey: string): Promise<void> {
  const obj = await env.BUCKET.get(fromKey);
  if (!obj) return;
  const ct = CONTENT_TYPES[extOf(toKey)] ?? obj.httpMetadata?.contentType ?? "application/octet-stream";
  await env.BUCKET.put(toKey, obj.body, { httpMetadata: { contentType: ct } });
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

// POST /dashboard/delete — deletes an owned page (R2 + KV + D1). Unchanged
// behavior from before, kept here so the dashboard owns its mutations.
export async function handleDashboardDelete(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) {
    return Response.redirect(new URL("/login", request.url).toString(), 302);
  }
  if (!sameOrigin(request)) {
    return page("Blocked", "<p>That request looked cross-site and was blocked.</p>");
  }

  const userId = session.user.id;
  const form = await request.formData();
  const slug = String(form.get("slug") ?? "");

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
