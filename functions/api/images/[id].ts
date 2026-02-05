import type { Env } from "../../_lib/env";
import { errorJson, json } from "../../_lib/response";
import { ensureImagesSchema } from "../../_lib/imageSchema";

export const onRequest: PagesFunction<Env> = async ({ env, params }) => {
  await ensureImagesSchema(env);

  const id = params.id as string;
  if (!id) return errorJson(400, "Missing id.");

  const row = await env.DB.prepare(
    "SELECT id, title, description, image_key, thumb_key, created_at FROM images WHERE id = ?"
  )
    .bind(id)
    .first();

  if (!row) return errorJson(404, "Not found.");

  return json(row);
};
