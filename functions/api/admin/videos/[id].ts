import type { Env } from "../../../_lib/env";
import { errorJson, json } from "../../../_lib/response";
import { requireAdmin } from "../../../_lib/adminAuth";
import { ensureVideosSchema } from "../../../_lib/videoSchema";
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

function prefixFromKey(key?: string | null) {
  if (!key) return null;
  const idx = key.lastIndexOf("/");
  if (idx === -1) return null;
  return key.slice(0, idx + 1);
}

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const guard = requireAdmin(request, env);
  if (guard) return guard;

  await ensureVideosSchema(env);

  const id = params.id as string;
  if (!id) return errorJson(400, "Missing id.");

  if (request.method === "GET") {
    const row = await env.DB.prepare(
      "SELECT id, slug, title, description, pc_key, hls_master_key, COALESCE(thumb_key, thumbnail_key) as thumb_key, created_at, updated_at, status FROM videos WHERE id = ?"
    )
      .bind(id)
      .first();
    if (!row) return errorJson(404, "Not found.");
    return json(row);
  }

  if (request.method !== "PUT") {
    return new Response(null, { status: 405 });
  }

  const existing = await env.DB.prepare(
    "SELECT id, slug, title, description, pc_key, hls_master_key, thumb_key, thumbnail_key, r2_key FROM videos WHERE id = ?"
  )
    .bind(id)
    .first<{
      id: string;
      slug: string;
      title: string;
      description: string | null;
      pc_key: string | null;
      hls_master_key: string | null;
      thumb_key: string | null;
      thumbnail_key: string | null;
      r2_key: string | null;
    }>();

  if (!existing) return errorJson(404, "Not found.");

  const form = await request.formData();
  const hasTitle = form.has("title");
  const hasDescription = form.has("description");
  const title = hasTitle ? form.get("title")?.toString().trim() || "" : null;
  const description = hasDescription
    ? form.get("description")?.toString().trim() || ""
    : null;
  const mp4 = form.get("mp4");
  const thumb = form.get("thumb");
  const hlsZip = form.get("hls_zip");

  if (thumb && thumb instanceof File && thumb.type && !ALLOWED_THUMB_TYPES.has(thumb.type)) {
    return errorJson(400, "Unsupported thumbnail format.");
  }

  const updates: string[] = [];
  const paramsList: Array<string | number | null> = [];
  const now = new Date().toISOString();

  let pcKey = existing.pc_key || existing.r2_key || `videos/${id}/pc.mp4`;
  let thumbKey = existing.thumb_key || existing.thumbnail_key || null;
  let hlsMasterKey = existing.hls_master_key || null;

  if (hasTitle) {
    updates.push("title = ?");
    paramsList.push(title || existing.title);
  }

  if (hasDescription) {
    updates.push("description = ?");
    paramsList.push(description || null);
  }

  if (mp4 instanceof File) {
    await env.R2_VIDEOS.put(pcKey, mp4.stream(), {
      httpMetadata: { contentType: mp4.type || "video/mp4" }
    });
    updates.push("pc_key = ?", "r2_key = ?", "size_bytes = ?");
    paramsList.push(pcKey, pcKey, mp4.size);
  }

  if (thumb instanceof File) {
    const nextThumbKey = `videos/${id}/thumb.${extForContentType(thumb.type || "")}`;
    await env.R2_VIDEOS.put(nextThumbKey, thumb.stream(), {
      httpMetadata: { contentType: thumb.type || "image/jpeg" }
    });
    if (thumbKey && thumbKey !== nextThumbKey) {
      await env.R2_VIDEOS.delete(thumbKey);
    }
    thumbKey = nextThumbKey;
    updates.push("thumb_key = ?", "thumbnail_key = ?");
    paramsList.push(nextThumbKey, nextThumbKey);
  }

  if (hlsZip instanceof File) {
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

    const newPrefix = `videos/${id}/hls_new/`;
    const newMasterKey = `${newPrefix}${masterPath}`;

    for (const file of files) {
      await env.R2_VIDEOS.put(`${newPrefix}${file.path}`, file.data, {
        httpMetadata: { contentType: file.contentType }
      });
    }

    const previousPrefix = prefixFromKey(hlsMasterKey);
    hlsMasterKey = newMasterKey;
    updates.push("hls_master_key = ?");
    paramsList.push(newMasterKey);

    if (previousPrefix && previousPrefix !== newPrefix) {
      try {
        const list = await env.R2_VIDEOS.list({ prefix: previousPrefix });
        if (list.objects.length > 0) {
          await env.R2_VIDEOS.delete(list.objects.map((obj) => obj.key));
        }
      } catch {
        // Best-effort cleanup.
      }
    }
  }

  updates.push("updated_at = ?");
  paramsList.push(now);

  if (updates.length > 0) {
    await env.DB.prepare(
      `UPDATE videos SET ${updates.join(", ")} WHERE id = ?`
    )
      .bind(...paramsList, id)
      .run();
  }

  const updated = await env.DB.prepare(
    "SELECT id, slug, title, description, pc_key, hls_master_key, COALESCE(thumb_key, thumbnail_key) as thumb_key, created_at, updated_at, status FROM videos WHERE id = ?"
  )
    .bind(id)
    .first();

  return json({ ok: true, video: updated });
};
