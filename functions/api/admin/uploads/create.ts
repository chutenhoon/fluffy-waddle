import type { Env } from "../../../_lib/env";
import { errorJson, json } from "../../../_lib/response";
import { uniqueSlug } from "../../../_lib/slug";
import {
  createMultipartUpload,
  presignPartUpload
} from "../../../_lib/r2Multipart";

const ALLOWED_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/ogg"
]);

function requireAdmin(request: Request, env: Env) {
  const key = request.headers.get("x-admin-key");
  return key && key === env.ADMIN_KEY;
}

function sanitizeFileName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(0, 120);
}

function choosePartSize(sizeBytes: number) {
  const min = 5 * 1024 * 1024;
  const base = 10 * 1024 * 1024;
  const maxParts = 10000;
  let partSize = Math.max(min, base);
  if (Math.ceil(sizeBytes / partSize) > maxParts) {
    partSize = Math.ceil(sizeBytes / maxParts);
  }
  const chunk = 5 * 1024 * 1024;
  return Math.ceil(partSize / chunk) * chunk;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }

  if (!requireAdmin(request, env)) {
    return errorJson(403, "Forbidden.");
  }

  let payload: {
    title?: string;
    fileName?: string;
    sizeBytes?: number;
    contentType?: string;
  } = {};

  try {
    payload = await request.json();
  } catch {
    return errorJson(400, "Invalid request.");
  }

  const { title, fileName, sizeBytes, contentType } = payload;
  if (!title || !fileName || !sizeBytes || !contentType) {
    return errorJson(400, "Missing upload fields.");
  }

  if (!ALLOWED_TYPES.has(contentType)) {
    return errorJson(400, "Unsupported video format.");
  }

  const videoId = crypto.randomUUID();
  const slug = await uniqueSlug(env, title, videoId);
  const safeName = sanitizeFileName(fileName) || `${slug}.mp4`;
  const r2Key = `videos/${videoId}/${safeName}`;

  const partSize = choosePartSize(sizeBytes);
  const totalParts = Math.ceil(sizeBytes / partSize);

  const uploadId = await createMultipartUpload(env, r2Key, contentType);

  const parts = await Promise.all(
    Array.from({ length: totalParts }, async (_, index) => {
      const partNumber = index + 1;
      const url = await presignPartUpload(env, r2Key, uploadId, partNumber);
      return { partNumber, url };
    })
  );

  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO videos (id, slug, title, r2_key, size_bytes, created_at, updated_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(videoId, slug, title, r2Key, sizeBytes, now, now, "uploading")
    .run();

  return json({
    videoId,
    slug,
    r2Key,
    uploadId,
    partSize,
    parts
  });
};
