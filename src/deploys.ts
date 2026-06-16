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

export async function deleteDeployRow(env: Env, slug: string, ownerId: string): Promise<void> {
  await env.DB.prepare(
    `DELETE FROM deploy WHERE slug = ? AND owner_id = ?`
  ).bind(slug, ownerId).run();
}
