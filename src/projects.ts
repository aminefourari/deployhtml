import { unzipSync } from "fflate";
import { CONFIG } from "./config";
import { scanContent } from "./scan";
import { Env } from "./env";

export const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8", json: "application/json; charset=utf-8",
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", ico: "image/x-icon",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf",
  txt: "text/plain; charset=utf-8", map: "application/json; charset=utf-8",
};

export function extOf(path: string): string {
  const i = path.lastIndexOf(".");
  return i === -1 ? "" : path.slice(i + 1).toLowerCase();
}

// Normalize a relative path; null if unsafe/disallowed. Rejects traversal
// (.. / . / absolute / backslashes), strict per-segment alphabet, allowlisted
// extension. Case PRESERVED. Intentionally differs from legacy subpageKey.
export function safeRelPath(raw: string): string | null {
  let p = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!p || p.endsWith("/")) return null;
  const segs = p.split("/");
  if (segs.length > 12) return null;
  for (const s of segs) {
    if (s === "" || s === "." || s === "..") return null;
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(s)) return null;
  }
  if (!(extOf(p) in CONTENT_TYPES)) return null;
  return p;
}

export interface ProjectEntry { path: string; bytes: Uint8Array; }
export interface ParsedProject { entries: ProjectEntry[]; totalBytes: number; name: string; }
export type ParseResult = ParsedProject | { error: string; status: number };

export async function parseProject(form: FormData, env: Env): Promise<ParseResult> {
  const raw: { path: string; bytes: Uint8Array }[] = [];
  let name = "project";
  const zipRaw = form.get("zip") as unknown as File | string | null;
  if (zipRaw && typeof zipRaw !== "string") {
    const zip = zipRaw as File;
    name = zip.name.replace(/\.zip$/i, "") || "project";
    let files: Record<string, Uint8Array>;
    try { files = unzipSync(new Uint8Array(await zip.arrayBuffer())); }
    catch { return { error: "Could not read the zip file.", status: 400 }; }
    for (const [n, bytes] of Object.entries(files)) raw.push({ path: n, bytes });
  } else {
    const allEntries = form.getAll("file") as unknown as Array<File | string>;
    const files = allEntries.filter((f): f is File => typeof f !== "string" && f instanceof Object && "arrayBuffer" in f);
    if (files.length === 0) return { error: "No files provided.", status: 400 };
    const firstSegs = files.map(f => f.name.replace(/\\/g, "/").split("/")[0]);
    const hasCommon = firstSegs.every(s => s === firstSegs[0]) && files.some(f => f.name.includes("/"));
    const common = hasCommon ? firstSegs[0] + "/" : "";
    if (hasCommon) name = firstSegs[0] || "project";
    for (const f of files) {
      const norm = f.name.replace(/\\/g, "/");
      const rel = norm.startsWith(common) ? norm.slice(common.length) : norm;
      raw.push({ path: rel, bytes: new Uint8Array(await f.arrayBuffer()) });
    }
  }
  const entries: ProjectEntry[] = [];
  let total = 0;
  for (const { path, bytes } of raw) {
    if (path.endsWith("/")) continue;
    const safe = safeRelPath(path);
    if (!safe) return { error: `Unsupported or unsafe file path: "${path}".`, status: 415 };
    if (bytes.length > CONFIG.projectMaxFileBytes) return { error: `File too large: ${safe}.`, status: 413 };
    total += bytes.length;
    if (total > CONFIG.projectMaxTotalBytes) return { error: "Project exceeds total size limit.", status: 413 };
    if (entries.length >= CONFIG.projectMaxFiles) return { error: "Too many files in project.", status: 413 };
    entries.push({ path: safe, bytes });
  }
  if (!entries.some(e => e.path === "index.html"))
    return { error: "Project must contain an index.html at its root.", status: 422 };
  for (const e of entries) {
    if (extOf(e.path) === "html" || extOf(e.path) === "htm") {
      const scan = scanContent(new TextDecoder().decode(e.bytes), env.DOMAIN);
      if (scan.blocked) return { error: `Upload rejected: ${scan.reason}.`, status: 422 };
    }
  }
  return { entries, totalBytes: total, name };
}
