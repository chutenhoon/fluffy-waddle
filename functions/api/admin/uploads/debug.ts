import type { Env } from "../../../_lib/env";
import { errorJson, json } from "../../../_lib/response";

function requireAdmin(request: Request, env: Env) {
  const key = request.headers.get("x-admin-key");
  return key && key === env.ADMIN_KEY;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== "GET") {
    return new Response(null, { status: 405 });
  }

  if (!requireAdmin(request, env)) {
    return errorJson(403, "Forbidden.");
  }

  const accessKeyId = env.R2_S3_ACCESS_KEY_ID || "";
  const secret = env.R2_S3_SECRET_ACCESS_KEY || "";
  const endpoint = env.R2_S3_ENDPOINT || "";
  const bucket = env.R2_S3_BUCKET || "";

  return json({
    endpoint,
    bucket,
    accessKeyIdLen: accessKeyId.length,
    accessKeyIdSuffix: accessKeyId.slice(-4),
    secretLen: secret.length,
    secretSuffix: secret.slice(-4)
  });
};
