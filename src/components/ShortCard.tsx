import { Link } from "react-router-dom";

export type ShortItem = {
  id: string;
  slug: string;
  title: string;
  created_at: string;
  status: string;
  thumbnail_key?: string | null;
};

const posterSvg = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960" viewBox="0 0 540 960">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#0d1014" />
        <stop offset="1" stop-color="#121820" />
      </linearGradient>
    </defs>
    <rect width="540" height="960" fill="url(#g)" />
  </svg>`
);

const poster = `data:image/svg+xml,${posterSvg}`;

export default function ShortCard({ short }: { short: ShortItem }) {
  const thumbSrc = `/api/shorts/${short.slug}/thumb`;

  return (
    <Link
      to={`/shorts/${short.slug}`}
      className="block group"
      aria-label={`Open ${short.title}`}
    >
      <div className="relative aspect-[9/16] overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition-transform duration-300 group-hover:translate-y-[-2px] group-hover:ring-2 group-hover:ring-sky-400/40 group-hover:border-white/20">
        <img
          src={poster}
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover"
        />
        {short.thumbnail_key ? (
          <img
            src={thumbSrc}
            alt={short.title}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}
      </div>
      <div className="mt-2 text-sm font-medium text-white/90 leading-5 max-h-10 overflow-hidden">
        {short.title}
      </div>
    </Link>
  );
}
