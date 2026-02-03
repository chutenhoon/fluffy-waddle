import type { Env } from "../../../_lib/env";
import { errorJson, json } from "../../../_lib/response";
import { completeMultipartUpload } from "../../../_lib/r2Multipart";

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

  let payload: {
    videoId?: string;
    uploadId?: string;
    r2Key?: string;
    sizeBytes?: number;
    parts?: Array<{ partNumber: number; etag: string }>;
  } = {};

  try {
    payload = await request.json();
  } catch {
    return errorJson(400, "Invalid request.");
  }

  const { videoId, uploadId, r2Key, sizeBytes, parts } = payload;
  if (!videoId || !uploadId || !r2Key || !sizeBytes || !parts?.length) {
    return errorJson(400, "Missing completion fields.");
  }

  await completeMultipartUpload(env, r2Key, uploadId, parts);

  const now = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE videos SET status = ?, size_bytes = ?, updated_at = ? WHERE id = ?"
  )
    .bind("ready", sizeBytes, now, videoId)
    .run();

  return json({ ok: true });
};
