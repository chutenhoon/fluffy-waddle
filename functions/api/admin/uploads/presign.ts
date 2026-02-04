import type { Env } from "../../../_lib/env";
import { errorJson, json } from "../../../_lib/response";
import { requireAdmin } from "../../../_lib/adminAuth";
import { presignObjectUpload } from "../../../_lib/r2Multipart";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: string) {
  return UUID_RE.test(value);
}

function isSafePath(path: string) {
  if (!path) return false;
  if (path.includes("\0")) return false;
  if (path.includes("..")) return false;
  if (path.startsWith("/")) return false;
  if (path.includes("\\")) return false;
  return true;
}

function isAllowedPath(path: string) {
  if (path === "pc.mp4") return true;
  if (path.startsWith("thumb.") && !path.includes("/")) return true;
  if (path.startsWith("hls/") && path.length > "hls/".length) return true;
  return false;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }

  const guard = requireAdmin(request, env);
  if (guard) return guard;

  const missing = [
    "R2_S3_ACCESS_KEY_ID",
    "R2_S3_SECRET_ACCESS_KEY",
    "R2_S3_ENDPOINT",
    "R2_S3_BUCKET"
  ].filter((key) => !env[key as keyof Env]);

  if (missing.length > 0) {
    return errorJson(500, `Missing R2 config: ${missing.join(", ")}`);
  }

  let payload: {
    videoId?: string;
    path?: string;
    contentType?: string;
  } = {};

  try {
    payload = await request.json();
  } catch {
    return errorJson(400, "Invalid request.");
  }

  const videoId = payload.videoId?.trim() || "";
  const path = payload.path?.trim() || "";
  const contentType = payload.contentType?.trim() || "";

  if (!videoId || !path || !contentType) {
    return errorJson(400, "Missing upload fields.");
  }

  if (!isValidUuid(videoId)) {
    return errorJson(400, "Invalid video id.");
  }

  if (!isSafePath(path) || !isAllowedPath(path)) {
    return errorJson(400, "Invalid upload path.");
  }

  const objectKey = `videos/${videoId}/${path}`;

  try {
    const uploadUrl = await presignObjectUpload(env, objectKey, contentType);
    return json({ uploadUrl, objectKey });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to presign upload.";
    console.error("presign failed", message);
    return errorJson(500, message);
  }
};
