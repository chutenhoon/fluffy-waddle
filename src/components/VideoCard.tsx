import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useIntersection } from "../hooks/useIntersection";
import { useMediaQuery } from "../hooks/useMediaQuery";

export type VideoItem = {
  id: string;
  slug: string;
  title: string;
  created_at: string;
  status: string;
  thumbnail_key?: string | null;
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
  const [thumbLoaded, setThumbLoaded] = useState(false);
  const [thumbError, setThumbError] = useState(false);
  const [previewActive, setPreviewActive] = useState(false);
  const [fallbackFrameReady, setFallbackFrameReady] = useState(false);
  const isMobile = useMediaQuery("(max-width: 768px)");

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

  const hasThumb = Boolean(video.thumbnail_key);
  const showVideoFallback = !hasThumb && !isMobile;

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !previewActive || !shouldLoad) return;
    if (!element.src) {
      element.src = src;
    }
    element.play().catch(() => undefined);
  }, [previewActive, shouldLoad, src]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !shouldLoad || !showVideoFallback) return;
    if (!element.src) {
      element.src = src;
      element.load();
    }

    const onLoaded = () => {
      const target = Math.min(1, Math.max(0.1, element.duration * 0.05 || 0.1));
      if (element.currentTime < target) {
        try {
          element.currentTime = target;
        } catch {
          setFallbackFrameReady(true);
        }
      }
    };

    const onSeeked = () => {
      setFallbackFrameReady(true);
      element.pause();
    };

    element.addEventListener("loadedmetadata", onLoaded);
    element.addEventListener("seeked", onSeeked);

    return () => {
      element.removeEventListener("loadedmetadata", onLoaded);
      element.removeEventListener("seeked", onSeeked);
    };
  }, [shouldLoad, showVideoFallback, src]);

  const handlePreviewStart = () => {
    if (isMobile) return;
    if (!shouldLoad) setShouldLoad(true);
    setPreviewActive(true);
  };

  const handlePreviewStop = () => {
    if (isMobile) return;
    setPreviewActive(false);
    const element = videoRef.current;
    if (element) {
      element.pause();
      if (!showVideoFallback) {
        element.currentTime = 0;
      }
    }
  };

  const thumbSrc = `/api/videos/${video.slug}/thumb`;
  const videoVisible = previewActive || (showVideoFallback && fallbackFrameReady);
  const preloadMode =
    shouldLoad && (previewActive || showVideoFallback) ? "auto" : "none";

  return (
    <Link
      to={`/watch/${video.slug}`}
      className="block group"
      aria-label={`Open ${video.title}`}
    >
      <div
        ref={cardRef}
        className="glass-card overflow-hidden transition-transform duration-300 group-hover:translate-y-[-2px]"
        onMouseEnter={handlePreviewStart}
        onMouseLeave={handlePreviewStop}
        onFocus={handlePreviewStart}
        onBlur={handlePreviewStop}
      >
        <div className="relative aspect-video bg-black/40">
          {(hasThumb && !thumbLoaded && !thumbError) ||
          (!hasThumb && !fallbackFrameReady) ? (
            <div className="absolute inset-0 bg-white/5 animate-pulse" />
          ) : null}

          <img
            src={poster}
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover"
          />

          {hasThumb && !thumbError ? (
            <img
              src={thumbSrc}
              alt={video.title}
              loading="eager"
              onLoad={() => setThumbLoaded(true)}
              onError={() => {
                setThumbError(true);
                setThumbLoaded(true);
              }}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
                thumbLoaded ? "opacity-100" : "opacity-0"
              }`}
            />
          ) : null}

          <video
            ref={videoRef}
            muted
            loop
            playsInline
            preload={preloadMode}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
              videoVisible ? "opacity-100" : "opacity-0"
            }`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
        </div>
        <div className="p-4">
          <div className="text-sm font-medium text-white/90 truncate">
            {video.title}
          </div>
        </div>
      </div>
    </Link>
  );
}
