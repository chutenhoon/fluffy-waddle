import type { Env } from "../../../_lib/env";
import { errorJson, json } from "../../../_lib/response";
import { requireAdmin } from "../../../_lib/adminAuth";
import { ensureVideosSchema } from "../../../_lib/videoSchema";
import { uniqueSlug } from "../../../_lib/slug";
import { extractHlsZip } from "../../../_lib/hlsZip";

const ALLOWED_THUMB_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

function extForContentType(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const guard = requireAdmin(request, env);
  if (guard) return guard;

  await ensureVideosSchema(env);

  if (request.method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT id, slug, title, COALESCE(thumb_key, thumbnail_key) as thumb_key, created_at, updated_at, status FROM videos ORDER BY created_at DESC"
    ).all();
    return json(results || []);
  }

  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }

  const form = await request.formData();
  const title = (form.get("title") || "").toString().trim();
  const description = form.get("description")?.toString().trim() || null;
  const mp4 = form.get("mp4");
  const thumb = form.get("thumb");
  const hlsZip = form.get("hls_zip");

  if (!title || !(mp4 instanceof File) || !(hlsZip instanceof File)) {
    return errorJson(400, "Missing required fields.");
  }

  if (thumb && thumb instanceof File && thumb.type && !ALLOWED_THUMB_TYPES.has(thumb.type)) {
    return errorJson(400, "Unsupported thumbnail format.");
  }

  const id = crypto.randomUUID();
  const slug = await uniqueSlug(env, title, id);
  const now = new Date().toISOString();

  const pcKey = `videos/${id}/pc.mp4`;
  const thumbKey =
    thumb instanceof File && thumb.size > 0
      ? `videos/${id}/thumb.${extForContentType(thumb.type || "")}`
      : null;

  let files: Array<{ path: string; data: Uint8Array; contentType: string }> = [];
  let masterPath = "";
  try {
    const hlsBuffer = await hlsZip.arrayBuffer();
    const extracted = await extractHlsZip(hlsBuffer);
    files = extracted.files;
    masterPath = extracted.masterPath;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Invalid HLS ZIP.";
    return errorJson(400, message);
  }
  if (!masterPath) {
    return errorJson(400, "Invalid HLS ZIP.");
  }

  const hlsPrefix = `videos/${id}/hls/`;
  const hlsMasterKey = `${hlsPrefix}${masterPath}`;

  await env.R2_VIDEOS.put(pcKey, mp4.stream(), {
    httpMetadata: { contentType: mp4.type || "video/mp4" }
  });

  if (thumbKey && thumb instanceof File) {
    await env.R2_VIDEOS.put(thumbKey, thumb.stream(), {
      httpMetadata: { contentType: thumb.type || "image/jpeg" }
    });
  }

  for (const file of files) {
    await env.R2_VIDEOS.put(`${hlsPrefix}${file.path}`, file.data, {
      httpMetadata: { contentType: file.contentType }
    });
  }

  await env.DB.prepare(
    `INSERT INTO videos
      (id, slug, title, description, pc_key, hls_master_key, thumb_key, r2_key, thumbnail_key, size_bytes, created_at, updated_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      slug,
      title,
      description,
      pcKey,
      hlsMasterKey,
      thumbKey,
      pcKey,
      thumbKey,
      mp4.size,
      now,
      now,
      "ready"
    )
    .run();

  const video = await env.DB.prepare(
    "SELECT id, slug, title, description, pc_key, hls_master_key, thumb_key, created_at, updated_at, status FROM videos WHERE id = ?"
  )
    .bind(id)
    .first();

  return json({ ok: true, video });
};
