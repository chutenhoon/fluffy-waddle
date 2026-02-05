import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client";

export type ImageItem = {
  id: string;
  title: string;
  description?: string | null;
  image_key?: string | null;
  thumb_key?: string | null;
  created_at: string;
  type?: "single" | "album";
  count?: number;
};

type AlbumDetail = {
  type: "album";
  images: Array<{
    id: string;
    image_key: string;
    thumb_key?: string | null;
    sort_order?: number | null;
  }>;
};

export default function ImageCard({
  image,
  className = ""
}: {
  image: ImageItem;
  className?: string;
}) {
  const isAlbum = image.type === "album";
  const baseCount = Math.max(1, image.count || 1);
  const canNavigate = isAlbum && baseCount > 1;
  const [albumImages, setAlbumImages] = useState<AlbumDetail["images"] | null>(
    null
  );
  const [index, setIndex] = useState(0);
  const [loadingAlbum, setLoadingAlbum] = useState(false);

  useEffect(() => {
    setIndex(0);
    setAlbumImages(null);
  }, [image.id]);

  const loadAlbumImages = async () => {
    if (!canNavigate || albumImages || loadingAlbum) return albumImages;
    setLoadingAlbum(true);
    try {
      const detail = await apiFetch<AlbumDetail>(`/api/images/${image.id}`);
      if (detail?.type === "album" && Array.isArray(detail.images)) {
        setAlbumImages(detail.images);
        return detail.images;
      }
    } catch {
      // ignore
    } finally {
      setLoadingAlbum(false);
    }
    return albumImages;
  };

  const handleNavigate = async (dir: number, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canNavigate) return;
    const items = albumImages || (await loadAlbumImages()) || [];
    const total = items.length || baseCount;
    if (!total) return;
    setIndex((prev) => {
      const next = (prev + dir + total) % total;
      return next;
    });
  };

  const activeItem = albumImages?.[index];
  const previewKey =
    activeItem?.thumb_key ||
    activeItem?.image_key ||
    image.thumb_key ||
    image.image_key;
  const previewSrc = previewKey ? `/media/${previewKey}` : "";
  const resolvedTotal = albumImages?.length || baseCount;
  const displayIndex = canNavigate ? Math.min(index + 1, resolvedTotal) : 1;

  return (
    <Link
      to={`/images/${image.id}`}
      className={`group block glass-card overflow-hidden transition-transform duration-200 hover:-translate-y-0.5 ${className}`}
    >
      <div className="relative aspect-[3/4] bg-white/5">
        {previewSrc ? (
          <img
            src={previewSrc}
            alt={image.title}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-white/40">
            No preview
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

        <div className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white/90">
          {isAlbum ? "Album" : "?nh"}
        </div>

        {canNavigate ? (
          <>
            <button
              type="button"
              onClick={(event) => handleNavigate(-1, event)}
              className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/40 text-white/80 flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition"
              aria-label="Previous image"
            >
              <span aria-hidden>&lt;</span>
            </button>
            <button
              type="button"
              onClick={(event) => handleNavigate(1, event)}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/40 text-white/80 flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition"
              aria-label="Next image"
            >
              <span aria-hidden>&gt;</span>
            </button>
            <div className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white/90">
              {displayIndex}/{resolvedTotal}
            </div>
          </>
        ) : null}
      </div>
      <div className="p-4 space-y-1">
        <div className="text-sm font-medium text-white/90 truncate">
          {image.title}
        </div>
        {image.description ? (
          <div className="text-xs text-white/50 truncate">
            {image.description}
          </div>
        ) : null}
        <div className="text-xs text-white/40">
          {isAlbum ? `Album ? ${resolvedTotal} ?nh` : "?nh"}
        </div>
      </div>
    </Link>
  );
}
