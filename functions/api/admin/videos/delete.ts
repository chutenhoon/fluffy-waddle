import type { Env } from "../../../_lib/env";
import { errorJson, json } from "../../../_lib/response";

function requireAdmin(request: Request, env: Env) {
  const key = request.headers.get("x-admin-key");
  return key && key === env.ADMIN_KEY;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }

  if (!requireAdmin(request, env)) {
    return errorJson(403, "Forbidden.");
  }

  let payload: { slug?: string; id?: string } = {};
  try {
    payload = await request.json();
  } catch {
    return errorJson(400, "Invalid request.");
  }

  const { slug, id } = payload;
  if (!slug && !id) {
    return errorJson(400, "Missing video identifier.");
  }

  const row = await env.DB.prepare(
    "SELECT id, r2_key, thumbnail_key FROM videos WHERE slug = ? OR id = ?"
  )
    .bind(slug || null, id || null)
    .first<{ id: string; r2_key: string; thumbnail_key: string | null }>();

  if (!row) {
    return errorJson(404, "Not found.");
  }

  const deletions: Promise<unknown>[] = [];
  if (row.r2_key) {
    deletions.push(env.R2_VIDEOS.delete(row.r2_key));
  }
  if (row.thumbnail_key) {
    deletions.push(env.R2_VIDEOS.delete(row.thumbnail_key));
  }

  await Promise.all(deletions);

  await env.DB.prepare("DELETE FROM videos WHERE id = ?")
    .bind(row.id)
    .run();

  return json({ ok: true });
};
