import type { Env } from "../../../../_lib/env";
import { errorJson } from "../../../../_lib/response";

const CONTENT_TYPES: Record<string, string> = {
  m3u8: "application/vnd.apple.mpegurl",
  ts: "video/mp2t",
  m4s: "video/iso.segment",
  mp4: "video/mp4"
};

function contentTypeForKey(key: string) {
  const ext = key.split(".").pop()?.toLowerCase() || "";
  return CONTENT_TYPES[ext] || "application/octet-stream";
}

function normalizePath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\/+/, "");
}

function isSafePath(path: string) {
  if (!path) return false;
  if (path.includes("\0")) return false;
  if (path.includes("..")) return false;
  if (path.startsWith("/")) return false;
  if (path.includes("\\")) return false;
  return true;
}

function prefixFromKey(key: string) {
  const idx = key.lastIndexOf("/");
  if (idx === -1) return null;
  return key.slice(0, idx + 1);
}

export const onRequest: PagesFunction<Env> = async ({ env, params }) => {
  const slug = params.slug as string;
  if (!slug) return errorJson(400, "Missing slug.");

  const rawPath = params.path as string | string[] | undefined;
  const joined = Array.isArray(rawPath) ? rawPath.join("/") : rawPath || "";
  const relPath = normalizePath(joined);
  if (!isSafePath(relPath)) {
    return errorJson(400, "Invalid path.");
  }

  const row = await env.DB.prepare(
    "SELECT hls_master_key FROM videos WHERE slug = ? AND status = ?"
  )
    .bind(slug, "ready")
    .first<{ hls_master_key: string | null }>();

  if (!row?.hls_master_key) {
    return errorJson(404, "Not found.");
  }

  const prefix = prefixFromKey(row.hls_master_key);
  if (!prefix) {
    return errorJson(404, "Not found.");
  }

  const objectKey = `${prefix}${relPath}`;
  const object = await env.R2_VIDEOS.get(objectKey);
  if (!object) return errorJson(404, "Not found.");

  const headers = new Headers();
  headers.set(
    "Content-Type",
    object.httpMetadata?.contentType || contentTypeForKey(objectKey)
  );
  headers.set("Cache-Control", "public, max-age=3600");
  if (object.size) {
    headers.set("Content-Length", object.size.toString());
  }

  return new Response(object.body, {
    status: 200,
    headers
  });
};
