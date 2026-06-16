import { Env } from "./env";

export interface DeployRow {
  slug: string;
  owner_id: string;
  kind: string;
  name: string | null;
  size: number;
  file_count: number;
  permanent: number;
  created_at: number;
  custom_domain: string | null;
}

export async function recordDeploy(env: Env, row: {
  slug: string;
  ownerId: string;
  kind?: string;
  name?: string;
  size?: number;
  fileCount?: number;
  createdAt: number;
}): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO deploy (slug, owner_id, kind, name, size, file_count, permanent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
  ).bind(
    row.slug,
    row.ownerId,
    row.kind ?? "single",
    row.name ?? null,
    row.size ?? 0,
    row.fileCount ?? 1,
    row.createdAt,
  ).run();
}

export async function listDeploys(env: Env, ownerId: string): Promise<DeployRow[]> {
  const res = await env.DB.prepare(
    `SELECT * FROM deploy WHERE owner_id = ? ORDER BY created_at DESC`
  ).bind(ownerId).all<DeployRow>();
  return res.results ?? [];
}

export async function getOwnedDeploy(env: Env, slug: string, ownerId: string): Promise<DeployRow | null> {
  return env.DB.prepare(
    `SELECT * FROM deploy WHERE slug = ? AND owner_id = ?`
  ).bind(slug, ownerId).first<DeployRow>();
}

// Set or clear an owned deploy's custom domain. Ownership-scoped.
export async function setCustomDomain(
  env: Env, slug: string, ownerId: string, domain: string | null,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE deploy SET custom_domain = ? WHERE slug = ? AND owner_id = ?`
  ).bind(domain, slug, ownerId).run();
}

// Does any deploy row (any owner) already claim this slug? Used as the D1-side
// uniqueness gate for renames, alongside the KV check — `deploy.slug` is the
// PRIMARY KEY, so renaming onto an existing row would otherwise hit a conflict.
export async function slugTakenInD1(env: Env, slug: string): Promise<boolean> {
  const row = await env.DB.prepare(`SELECT 1 FROM deploy WHERE slug = ?`).bind(slug).first();
  return row !== null;
}

export async function deleteDeployRow(env: Env, slug: string, ownerId: string): Promise<void> {
  await env.DB.prepare(
    `DELETE FROM deploy WHERE slug = ? AND owner_id = ?`
  ).bind(slug, ownerId).run();
}

// Rename an owned deploy's slug. Ownership-scoped: the WHERE clause makes a
// foreign slug a no-op. Returns whether a row was actually updated.
export async function renameDeployRow(
  env: Env, oldSlug: string, newSlug: string, ownerId: string,
): Promise<boolean> {
  const res = await env.DB.prepare(
    `UPDATE deploy SET slug = ? WHERE slug = ? AND owner_id = ?`
  ).bind(newSlug, oldSlug, ownerId).run();
  return (res.meta?.changes ?? 0) > 0;
}

// Update an owned deploy's stored size / file count / kind after an in-editor
// redeploy. Ownership-scoped.
export async function updateDeployContent(
  env: Env, slug: string, ownerId: string,
  fields: { size: number; fileCount: number; kind: string },
): Promise<void> {
  await env.DB.prepare(
    `UPDATE deploy SET size = ?, file_count = ?, kind = ? WHERE slug = ? AND owner_id = ?`
  ).bind(fields.size, fields.fileCount, fields.kind, slug, ownerId).run();
}
