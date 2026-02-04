import type { Env } from "../../../_lib/env";
import { errorJson } from "../../../_lib/response";

export const onRequest: PagesFunction<Env> = async ({ env, params }) => {
  const slug = params.slug as string;
  if (!slug) return errorJson(400, "Missing slug.");

  const row = await env.DB.prepare(
    "SELECT thumbnail_key FROM videos WHERE slug = ? AND status = ?"
  )
    .bind(slug, "ready")
    .first<{ thumbnail_key: string | null }>();

  if (!row?.thumbnail_key) {
    return errorJson(404, "Not found.");
  }

  const object = await env.R2_VIDEOS.get(row.thumbnail_key);
  if (!object) {
    return errorJson(404, "Not found.");
  }

  const headers = new Headers();
  headers.set(
    "Content-Type",
    object.httpMetadata?.contentType || "image/jpeg"
  );
  headers.set("Cache-Control", "public, max-age=3600");

  return new Response(object.body, { status: 200, headers });
};
