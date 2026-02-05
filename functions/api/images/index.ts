import type { Env } from "../../_lib/env";
import { json } from "../../_lib/response";
import { ensureImagesSchema } from "../../_lib/imageSchema";

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  await ensureImagesSchema(env);

  const { results } = await env.DB.prepare(
    "SELECT id, title, description, image_key, thumb_key, created_at FROM images ORDER BY created_at DESC"
  ).all();

  return json(results || []);
};
