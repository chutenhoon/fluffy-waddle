import type { Env } from "./env";

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80)
    .replace(/^-|-$/g, "");
}

export async function uniqueSlug(env: Env, base: string, fallbackId: string) {
  const baseSlug = slugify(base) || `memory-${fallbackId.slice(0, 6)}`;
  const existing = await env.DB.prepare("SELECT slug FROM videos WHERE slug = ?")
    .bind(baseSlug)
    .first();
  if (!existing) return baseSlug;
  return `${baseSlug}-${fallbackId.slice(0, 6)}`;
}
