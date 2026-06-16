import { Env, SlugMeta } from "./env";
import {
  shell, appTopbar, avatarInitials, escapeHtml, sameOrigin,
  toastHtml, TOAST_JS, slugModalHtml, SLUG_MODAL_JS, jsonForScript,
} from "./ui";
import { getSession } from "./authpages";
import { getOwnedDeploy, updateDeployContent } from "./deploys";
import { CONTENT_TYPES, extOf, safeRelPath } from "./projects";
import { scanContent } from "./scan";
import { CONFIG } from "./config";

// Extensions that are editable as text in the in-browser editor. Binary assets
// (images/fonts) are listed read-only and preserved untouched across redeploys.
const TEXT_EXTS = new Set(["html", "htm", "css", "js", "mjs", "json", "svg", "txt", "map"]);
const isTextExt = (path: string) => TEXT_EXTS.has(extOf(path));

interface EditorFile { path: string; content: string; }

// ---------------------------------------------------------------------------
// GET /edit?slug=<s> — the page editor for an owned deploy.
// ---------------------------------------------------------------------------
export async function handleEditor(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return Response.redirect(new URL("/login", request.url).toString(), 302);

  const slug = (new URL(request.url).searchParams.get("slug") || "").trim().toLowerCase();
  const owned = slug ? await getOwnedDeploy(env, slug, session.user.id) : null;
  if (!owned) return Response.redirect(new URL("/dashboard", request.url).toString(), 302);

  // Load the current files from R2: text files become editable, binaries are
  // listed read-only.
  const files: EditorFile[] = [];
  const assets: string[] = [];

  if (owned.kind === "project") {
    for (const key of await listKeys(env, `${slug}/`)) {
      const rel = key.slice(slug.length + 1);
      if (!rel) continue;
      if (isTextExt(rel)) {
        const obj = await env.BUCKET.get(key);
        files.push({ path: rel, content: obj ? await obj.text() : "" });
      } else {
        assets.push(rel);
      }
    }
  } else {
    const obj = await env.BUCKET.get(`${slug}.html`);
    files.push({ path: "index.html", content: obj ? await obj.text() : "" });
  }

  // index.html first, then the rest alphabetically — stable, predictable order.
  files.sort((a, b) =>
    a.path === "index.html" ? -1 : b.path === "index.html" ? 1 : a.path.localeCompare(b.path));
  assets.sort();

  const fileMap: Record<string, string> = {};
  for (const f of files) fileMap[f.path] = f.content;

  const data = {
    slug,
    domain: env.DOMAIN,
    name: owned.name || slug,
    files: fileMap,
    assets,
    permanent: !!owned.permanent,
    customDomain: owned.custom_domain || null,
  };

  const initials = avatarInitials(session.user.name, session.user.email);
  const fullUrl = `${escapeHtml(slug)}.${escapeHtml(env.DOMAIN)}`;

  const body = `
<div class="editor">
  <div class="ed-head">
    <div class="crumb">
      <a class="back" href="/dashboard" title="Back to dashboard">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </a>
      <div class="ct">
        <div class="title" id="edTitle">${escapeHtml(data.name)}</div>
        <button class="urlpill" id="edUrl" onclick="openSlugModal('${slug}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>
          <span id="edUrlText">${fullUrl}</span>
        </button>
      </div>
    </div>
    <div class="ed-actions">
      <button class="btn-ghost" onclick="refreshPreview(); toast('Preview refreshed')">Preview</button>
      <button class="btn-primary" style="padding:11px 22px;font-size:14.5px;" onclick="redeploy()">↑ Redeploy</button>
    </div>
  </div>

  <div class="ed-tabs">
    <button class="ed-tab active" id="tabFiles" onclick="showEditorTab('files')">Files</button>
    <button class="ed-tab" id="tabSettings" onclick="showEditorTab('settings')">Settings</button>
  </div>

  <div class="ed-view active" id="view-files">
    <div class="ed-grid">
      <div class="files-pane">
        <div class="ph">Files</div>
        <div id="fileList"></div>
        <div class="file-add" onclick="newFile()">+ New file</div>
      </div>
      <div class="code-pane">
        <div class="code-bar">
          <span id="codeName">index.html</span>
          <span class="saved" id="saveState">Saved</span>
        </div>
        <textarea id="codeArea" spellcheck="false" oninput="onCodeInput()"></textarea>
      </div>
      <div class="preview-pane">
        <div class="pv-bar">
          <span class="dots"><i></i><i></i><i></i></span>
          <span class="addr" id="pvAddr">${fullUrl}</span>
          <button class="reload" onclick="refreshPreview()" title="Reload preview">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>
          </button>
        </div>
        <iframe id="previewFrame" sandbox="allow-scripts" title="Live preview"></iframe>
      </div>
    </div>
  </div>

  <div class="ed-view" id="view-settings">
    <div class="ed-settings">
      <div class="acct-card">
        <div class="acct-rows" style="margin-top:0">
          <div class="acct-row" style="border-top:0; padding-top:0">
            <div class="l">
              <div class="t">Public URL</div>
              <div class="s" id="setUrl">${fullUrl}</div>
            </div>
            <button class="btn-ghost" onclick="openSlugModal('${slug}')">Edit URL</button>
          </div>
          <div class="acct-row">
            <div class="l">
              <div class="t">Permanent link</div>
              <div class="s">Included on every account — your pages never expire</div>
            </div>
            <div class="toggle on" onclick="toast('Permanent links are included on every account')"></div>
          </div>
          <div class="acct-row">
            <div class="l">
              <div class="t">Custom domain</div>
              <div class="s" id="domainSub">${owned.custom_domain ? escapeHtml(owned.custom_domain) : "Point your own domain at this page"}</div>
            </div>
            <button class="btn-ghost" id="domainBtn" onclick="openDomainModal()">${owned.custom_domain ? "Manage" : "Connect"}</button>
          </div>
        </div>
      </div>
      <div class="acct-card">
        <div class="acct-row" style="border-top:0; padding:0;">
          <div class="l">
            <div class="t">Delete this page</div>
            <div class="s">Removes the page and all its files permanently</div>
          </div>
          <button class="btn-danger" onclick="deletePage()">Delete page</button>
        </div>
      </div>
    </div>
  </div>
</div>
${slugModalHtml(env.DOMAIN)}
<div class="modal-overlay" id="domainModal">
  <div class="modal" style="width:min(520px,100%)">
    <h3>Custom domain</h3>
    <p class="ms">Point your own domain at this page over HTTPS.</p>
    <div id="domainBody"></div>
  </div>
</div>
${toastHtml()}`;

  const scripts = `${TOAST_JS}
${SLUG_MODAL_JS}
var DATA = ${jsonForScript(data)};
window.onSlugRenamed = function(s){ window.location = '/edit?slug=' + encodeURIComponent(s); };

var curFile = Object.keys(DATA.files)[0] || 'index.html';
var dirty = false;

function fileIcon(fn){
  var c = /\\.css$/i.test(fn) ? '#3BA0C4' : /\\.(js|mjs)$/i.test(fn) ? '#C9962A' : '#6d4ae0';
  return '<svg viewBox="0 0 24 24" fill="none" stroke="'+c+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
}
function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }

function renderFileList(){
  var html = Object.keys(DATA.files).map(function(fn){
    return '<div class="file-item'+(fn===curFile?' active':'')+'" onclick="loadFile(\\''+fn+'\\')">'+fileIcon(fn)+'<span>'+esc(fn)+'</span></div>';
  }).join('');
  html += (DATA.assets||[]).map(function(fn){
    return '<div class="file-item" title="Binary asset (preserved, not editable)" style="cursor:default">'+fileIcon(fn)+'<span>'+esc(fn)+'</span><span class="ro">ASSET</span></div>';
  }).join('');
  document.getElementById('fileList').innerHTML = html;
}
function loadFile(fn){
  if(!(fn in DATA.files)) return;
  curFile = fn;
  renderFileList();
  var ta = document.getElementById('codeArea');
  ta.value = DATA.files[fn];
  ta.readOnly = false;
  document.getElementById('codeName').textContent = fn;
}
function onCodeInput(){
  DATA.files[curFile] = document.getElementById('codeArea').value;
  markDirty();
  schedulePreview();
}
function markDirty(){
  if(dirty) return;
  dirty = true;
  var s = document.getElementById('saveState');
  s.className = 'dirty'; s.textContent = 'Unsaved changes';
}
function markSaved(){
  dirty = false;
  var s = document.getElementById('saveState');
  s.className = 'saved'; s.textContent = 'Saved';
}

var pvTimer;
function schedulePreview(){ clearTimeout(pvTimer); pvTimer = setTimeout(refreshPreview, 350); }
function escapeReg(s){ return s.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&'); }
function buildPreview(files){
  var html = files['index.html'] || '<!doctype html><meta charset="utf-8"><body style="font:15px sans-serif;padding:40px;color:#888">No index.html in this project.</body>';
  Object.keys(files).forEach(function(fn){
    if(/\\.css$/i.test(fn)){
      html = html.replace(new RegExp('<link[^>]*href=["\\']'+escapeReg(fn)+'["\\'][^>]*>', 'i'), '');
      html = html.replace(/<\\/head>/i, '<style>'+files[fn]+'</style></head>');
    }
  });
  Object.keys(files).forEach(function(fn){
    if(/\\.(js|mjs)$/i.test(fn)){
      html = html.replace(new RegExp('<script[^>]*src=["\\']'+escapeReg(fn)+'["\\'][^>]*>\\\\s*<\\\\/script>', 'i'), '');
      html = html.replace(/<\\/body>/i, '<scr'+'ipt>'+files[fn]+'</scr'+'ipt></body>');
    }
  });
  return html;
}
function refreshPreview(){
  document.getElementById('previewFrame').srcdoc = buildPreview(DATA.files);
}
function showEditorTab(which){
  document.getElementById('tabFiles').classList.toggle('active', which==='files');
  document.getElementById('tabSettings').classList.toggle('active', which==='settings');
  document.getElementById('view-files').classList.toggle('active', which==='files');
  document.getElementById('view-settings').classList.toggle('active', which==='settings');
}
function newFile(){
  var name = prompt('New file name (e.g. style.css, app.js):');
  if(!name) return;
  name = name.trim().replace(/^\\/+/, '');
  if(!/^[A-Za-z0-9._\\/-]+$/.test(name)){ toast('Invalid file name'); return; }
  if(!/\\.(html?|css|m?js|json|svg|txt|map)$/i.test(name)){ toast('Only text files (html, css, js, json, svg, txt) can be added here'); return; }
  if(name in DATA.files){ toast('That file already exists'); return; }
  DATA.files[name] = '';
  markDirty();
  loadFile(name);
}
function redeploy(){
  var btn = event && event.target; if(btn) btn.disabled = true;
  toast('Deploying…');
  fetch('/edit/save', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({slug: DATA.slug, files: DATA.files})})
    .then(function(r){ return r.json().then(function(d){ return {ok:r.ok, d:d}; }); })
    .then(function(res){
      if(btn) btn.disabled = false;
      if(res.ok && res.d.ok){ markSaved(); refreshPreview(); toast('Redeployed — changes are live'); }
      else { toast((res.d && res.d.error) || 'Redeploy failed'); }
    })
    .catch(function(){ if(btn) btn.disabled = false; toast('Network error'); });
}
function deletePage(){
  if(!confirm('Delete this page? It cannot be undone.')) return;
  var f=document.createElement('form'); f.method='POST'; f.action='/dashboard/delete';
  var i=document.createElement('input'); i.type='hidden'; i.name='slug'; i.value=DATA.slug;
  f.appendChild(i); document.body.appendChild(f); f.submit();
}

// ---- custom domain ----
function openDomainModal(){ document.getElementById('domainModal').classList.add('open'); loadDomain(); }
function closeDomainModal(){ document.getElementById('domainModal').classList.remove('open'); }
function updateDomainRow(){
  document.getElementById('domainSub').textContent = DATA.customDomain || 'Point your own domain at this page';
  document.getElementById('domainBtn').textContent = DATA.customDomain ? 'Manage' : 'Connect';
}
function domBadge(status){
  if(status==='active') return '<span class="badge live"><span class="pip"></span>Active</span>';
  var label = status==='validating_cert' ? 'Issuing certificate' : status==='unknown' ? 'Status unavailable' : 'Pending DNS';
  return '<span class="badge exp"><span class="pip"></span>'+label+'</span>';
}
function recordsTable(records, target){
  var rows = (records||[]).map(function(r){
    return '<tr><td style="padding:6px 10px;color:var(--muted)">'+esc(r.type)+'</td>'+
      '<td style="padding:6px 10px;font:12px monospace;word-break:break-all">'+esc(r.name)+'</td>'+
      '<td style="padding:6px 10px;font:12px monospace;word-break:break-all">'+esc(r.value)+'</td></tr>';
  }).join('');
  return '<p style="font-size:13px;color:var(--muted);margin:14px 0 8px">Add these DNS records at your registrar:</p>'+
    '<div style="border:1px solid var(--border);border-radius:10px;overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">'+
    '<thead><tr style="text-align:left;color:var(--faint);font-size:11px"><th style="padding:6px 10px">TYPE</th><th style="padding:6px 10px">NAME</th><th style="padding:6px 10px">VALUE</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function renderDomainForm(err){
  document.getElementById('domainBody').innerHTML =
    '<div class="slug-field" id="domField"><input id="domInput" type="text" spellcheck="false" autocomplete="off" placeholder="www.example.com"></div>'+
    (err?'<div class="slug-note bad">\\u2715 '+esc(err)+'</div>':'<div class="slug-note"></div>')+
    '<div class="modal-foot"><button class="btn-ghost" type="button" onclick="closeDomainModal()">Cancel</button>'+
    '<button class="btn-primary" id="domAdd" style="padding:11px 22px;font-size:14.5px" onclick="addDomain()">Add domain</button></div>';
  setTimeout(function(){ var i=document.getElementById('domInput'); if(i) i.focus(); },30);
}
function renderDomainStatus(d){
  var recs = d.status==='active' ? '' : recordsTable(d.records, d.target);
  document.getElementById('domainBody').innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">'+
    '<div style="font:14px monospace;color:var(--ink);word-break:break-all">'+esc(d.domain)+'</div>'+domBadge(d.status)+'</div>'+
    recs+
    '<div class="modal-foot"><button class="btn-danger" type="button" onclick="removeDomain()">Remove domain</button>'+
    '<button class="btn-ghost" type="button" onclick="loadDomain()">Recheck</button>'+
    '<button class="btn-primary" type="button" style="padding:11px 22px;font-size:14.5px" onclick="closeDomainModal()">Done</button></div>';
}
function loadDomain(){
  if(!DATA.customDomain){ renderDomainForm(); return; }
  document.getElementById('domainBody').innerHTML='<div style="color:var(--muted);font-size:13.5px;padding:10px 0">Checking status\\u2026</div>';
  fetch('/edit/domain/status?slug='+encodeURIComponent(DATA.slug)).then(function(r){return r.json();}).then(function(d){
    if(d.ok && d.domain){ renderDomainStatus(d); } else { DATA.customDomain=null; updateDomainRow(); renderDomainForm(); }
  }).catch(function(){ renderDomainStatus({domain:DATA.customDomain,status:'unknown',records:[]}); });
}
function addDomain(){
  var input=document.getElementById('domInput'); var val=input.value.trim();
  var btn=document.getElementById('domAdd'); btn.disabled=true;
  fetch('/edit/domain',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:DATA.slug,domain:val})})
    .then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d};});})
    .then(function(res){
      if(res.ok && res.d.ok){ DATA.customDomain=res.d.domain; updateDomainRow(); renderDomainStatus(res.d); toast('Domain added — add the DNS records'); }
      else { btn.disabled=false; renderDomainForm((res.d&&res.d.error)||'Could not add domain'); }
    })
    .catch(function(){ btn.disabled=false; renderDomainForm('Network error'); });
}
function removeDomain(){
  if(!confirm('Remove this custom domain?')) return;
  fetch('/edit/domain/remove',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:DATA.slug})})
    .then(function(r){return r.json();}).then(function(d){
      if(d.ok){ DATA.customDomain=null; updateDomainRow(); renderDomainForm(); toast('Domain removed'); }
      else { toast(d.error||'Could not remove domain'); }
    }).catch(function(){ toast('Network error'); });
}
document.getElementById('domainModal').addEventListener('click',function(e){ if(e.target.id==='domainModal') closeDomainModal(); });

renderFileList();
loadFile(curFile);
refreshPreview();`;

  return shell({
    title: `Editing ${data.name}`,
    topbar: appTopbar("dashboard", initials),
    body,
    scripts,
  });
}

// ---------------------------------------------------------------------------
// POST /edit/save {slug, files:{path:content}} — re-scan, validate, rewrite R2,
// update KV + D1. Handles single<->project conversion. Binary assets present in
// R2 are preserved (never sent by the client) and counted toward size/count.
// ---------------------------------------------------------------------------
export async function handleEditorSave(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return json({ ok: false, error: "Not signed in" }, 401);
  if (!sameOrigin(request)) return json({ ok: false, error: "Bad origin" }, 403);
  const ownerId = session.user.id;

  let slug = "";
  let filesIn: Record<string, unknown> = {};
  try {
    const b = (await request.json()) as { slug?: string; files?: Record<string, unknown> };
    slug = String(b.slug ?? "").trim().toLowerCase();
    filesIn = b.files && typeof b.files === "object" ? b.files : {};
  } catch {
    return json({ ok: false, error: "Bad request" }, 400);
  }

  const owned = slug ? await getOwnedDeploy(env, slug, ownerId) : null;
  if (!owned) return json({ ok: false, error: "Page not found" }, 404);

  // --- Validate the submitted text files -----------------------------------
  const enc = new TextEncoder();
  const textFiles: { path: string; content: string; bytes: number }[] = [];
  let textBytes = 0;

  for (const [rawPath, rawContent] of Object.entries(filesIn)) {
    const safe = safeRelPath(rawPath);
    if (!safe || safe !== rawPath) return json({ ok: false, error: `Invalid file path: "${rawPath}"` }, 415);
    if (!isTextExt(safe)) return json({ ok: false, error: `Only text files can be edited: "${safe}"` }, 415);
    if (typeof rawContent !== "string") return json({ ok: false, error: `Invalid content for "${safe}"` }, 400);
    const bytes = enc.encode(rawContent).length;
    if (bytes > CONFIG.projectMaxFileBytes) return json({ ok: false, error: `File too large: ${safe}` }, 413);
    textBytes += bytes;
    textFiles.push({ path: safe, content: rawContent, bytes });
  }

  if (textFiles.length === 0) return json({ ok: false, error: "No files to deploy" }, 400);
  if (!textFiles.some((f) => f.path === "index.html")) {
    return json({ ok: false, error: "Project must contain an index.html at its root" }, 422);
  }
  if (textBytes > CONFIG.projectMaxTotalBytes) return json({ ok: false, error: "Project exceeds total size limit" }, 413);

  // Phishing / abuse scan on every HTML file (same gate as upload).
  for (const f of textFiles) {
    if (extOf(f.path) === "html" || extOf(f.path) === "htm") {
      const scan = scanContent(f.content, env.DOMAIN);
      if (scan.blocked) return json({ ok: false, error: `Rejected: ${scan.reason}` }, 422);
    }
  }

  // --- Inventory existing R2 objects (to preserve binary assets + diff) -----
  const existingKeys = await listKeys(env, `${slug}/`);
  const binaryAssets = existingKeys
    .map((k) => ({ key: k, rel: k.slice(slug.length + 1) }))
    .filter((o) => o.rel && !isTextExt(o.rel));

  let binaryBytes = 0;
  for (const a of binaryAssets) {
    const head = await env.BUCKET.head(a.key);
    binaryBytes += head?.size ?? 0;
  }

  if (textFiles.length + binaryAssets.length > CONFIG.projectMaxFiles) {
    return json({ ok: false, error: "Too many files in project" }, 413);
  }

  // --- Decide layout: single only when it's literally just index.html ------
  const targetProject = textFiles.length > 1 || binaryAssets.length > 0;

  if (targetProject) {
    // Write text files under <slug>/<path>.
    for (const f of textFiles) {
      const ct = CONTENT_TYPES[extOf(f.path)] ?? "text/plain; charset=utf-8";
      await env.BUCKET.put(`${slug}/${f.path}`, f.content, { httpMetadata: { contentType: ct } });
    }
    // Remove a stale single object if we converted from single.
    await env.BUCKET.delete(`${slug}.html`);
    // Remove text files the user deleted (keep binary assets).
    const keepText = new Set(textFiles.map((f) => `${slug}/${f.path}`));
    for (const k of existingKeys) {
      const rel = k.slice(slug.length + 1);
      if (rel && isTextExt(rel) && !keepText.has(k)) await env.BUCKET.delete(k);
    }
  } else {
    // Single layout: one index.html at <slug>.html.
    const index = textFiles[0];
    await env.BUCKET.put(`${slug}.html`, index.content, {
      httpMetadata: { contentType: "text/html; charset=utf-8" },
    });
    // Drop any old project tree.
    for (const k of existingKeys) await env.BUCKET.delete(k);
  }

  // --- Update KV meta + D1 -------------------------------------------------
  const fileCount = targetProject ? textFiles.length + binaryAssets.length : 1;
  const size = textBytes + (targetProject ? binaryBytes : 0);
  const kind: "single" | "project" = targetProject ? "project" : "single";

  const metaRaw = await env.KV.get(`slug:${slug}`);
  const prev = metaRaw ? (JSON.parse(metaRaw) as SlugMeta) : ({} as SlugMeta);
  const meta: SlugMeta = {
    filename: prev.filename ?? owned.name ?? slug,
    size,
    uploadedAt: Date.now(),
    owner: ownerId,
    kind,
    fileCount,
  };
  await env.KV.put(`slug:${slug}`, JSON.stringify(meta)); // permanent: no TTL
  await updateDeployContent(env, slug, ownerId, { size, fileCount, kind });

  return json({ ok: true, kind, files: fileCount });
}

// List every R2 key under a prefix, following pagination.
async function listKeys(env: Env, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const list = await env.BUCKET.list({ prefix, cursor });
    for (const o of list.objects) keys.push(o.key);
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  return keys;
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
