import { Link } from "react-router-dom";

export type ImageItem = {
  id: string;
  title: string;
  description?: string | null;
  image_key: string;
  thumb_key?: string | null;
  created_at: string;
};

export default function ImageCard({ image }: { image: ImageItem }) {
  const previewSrc = image.thumb_key
    ? `/media/${image.thumb_key}`
    : `/media/${image.image_key}`;

  return (
    <Link
      to={`/images/${image.id}`}
      className="block glass-card overflow-hidden transition-transform duration-200 hover:-translate-y-0.5"
    >
      <div className="relative aspect-[4/3] bg-white/5">
        <img
          src={previewSrc}
          alt={image.title}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
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
      </div>
    </Link>
  );
}
