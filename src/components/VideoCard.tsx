import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useIntersection } from "../hooks/useIntersection";

export type VideoItem = {
  id: string;
  slug: string;
  title: string;
  created_at: string;
  status: string;
};

const posterSvg = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#0d1014" />
        <stop offset="1" stop-color="#121820" />
      </linearGradient>
    </defs>
    <rect width="640" height="360" fill="url(#g)" />
  </svg>`
);

const poster = `data:image/svg+xml,${posterSvg}`;

export default function VideoCard({ video }: { video: VideoItem }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  const isVisible = useIntersection(cardRef, {
    rootMargin: "200px",
    threshold: 0.2
  });

  useEffect(() => {
    if (isVisible) {
      setShouldLoad(true);
    }
  }, [isVisible]);

  const src = useMemo(
    () => `/api/videos/${video.slug}/stream`,
    [video.slug]
  );

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !shouldLoad) return;
    if (element.src) return;
    element.src = src;
    element.play().catch(() => undefined);
  }, [shouldLoad, src]);

  const dateText = useMemo(() => {
    const date = new Date(video.created_at);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }, [video.created_at]);

  return (
    <Link
      to={`/watch/${video.slug}`}
      className="block group"
      aria-label={`Open ${video.title}`}
    >
      <div
        ref={cardRef}
        className="glass-card overflow-hidden transition-transform duration-300 group-hover:translate-y-[-2px]"
      >
        <div className="relative aspect-video bg-black/40">
          <video
            ref={videoRef}
            muted
            loop
            playsInline
            preload={shouldLoad ? "metadata" : "none"}
            poster={poster}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
        </div>
        <div className="p-4 space-y-1">
          <div className="text-sm font-medium text-white/90 truncate">
            {video.title}
          </div>
          <div className="text-xs text-white/50">{dateText}</div>
        </div>
      </div>
    </Link>
  );
}
