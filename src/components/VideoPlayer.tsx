import { useCallback, useEffect, useRef, useState } from "react";
import { useMediaQuery } from "../hooks/useMediaQuery";

function formatTime(value: number) {
  if (!Number.isFinite(value)) return "0:00";
  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function VideoPlayer({
  src,
  title
}: {
  src: string;
  title: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [isBuffering, setIsBuffering] = useState(true);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const isMobile = useMediaQuery("(max-width: 768px)");

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.volume = volume;
    videoRef.current.muted = muted;
  }, [volume, muted]);

  const togglePlay = useCallback(() => {
    const element = videoRef.current;
    if (!element) return;
    setHasInteracted(true);
    if (element.paused) {
      element.play().catch(() => undefined);
    } else {
      element.pause();
    }
  }, []);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;

    const onPlay = () => {
      setIsPlaying(true);
      setIsBuffering(false);
    };
    const onPause = () => setIsPlaying(false);
    const onTime = () => setCurrentTime(element.currentTime || 0);
    const onDuration = () => setDuration(element.duration || 0);
    const onWaiting = () => setIsBuffering(true);
    const onCanPlay = () => setIsBuffering(false);
    const onLoadStart = () => setIsBuffering(true);
    const onPlaying = () => setIsBuffering(false);
    const onProgress = () => {
      try {
        const ranges = element.buffered;
        if (ranges.length > 0) {
          setBuffered(ranges.end(ranges.length - 1));
        }
      } catch {
        setBuffered(0);
      }
    };

    element.addEventListener("play", onPlay);
    element.addEventListener("pause", onPause);
    element.addEventListener("timeupdate", onTime);
    element.addEventListener("loadedmetadata", onDuration);
    element.addEventListener("waiting", onWaiting);
    element.addEventListener("canplay", onCanPlay);
    element.addEventListener("loadstart", onLoadStart);
    element.addEventListener("playing", onPlaying);
    element.addEventListener("progress", onProgress);

    return () => {
      element.removeEventListener("play", onPlay);
      element.removeEventListener("pause", onPause);
      element.removeEventListener("timeupdate", onTime);
      element.removeEventListener("loadedmetadata", onDuration);
      element.removeEventListener("waiting", onWaiting);
      element.removeEventListener("canplay", onCanPlay);
      element.removeEventListener("loadstart", onLoadStart);
      element.removeEventListener("playing", onPlaying);
      element.removeEventListener("progress", onProgress);
    };
  }, []);

  const handleSeek = (value: number) => {
    const element = videoRef.current;
    if (!element || !Number.isFinite(value)) return;
    element.currentTime = value;
    setCurrentTime(value);
  };

  const handleSkip = (delta: number) => {
    const element = videoRef.current;
    if (!element) return;
    element.currentTime = Math.min(
      Math.max(0, element.currentTime + delta),
      duration
    );
  };

  const toggleMute = () => {
    setMuted((prev) => !prev);
  };

  useEffect(() => {
    const handleChange = () => {
      if (!document.fullscreenElement) {
        const orientation = screen.orientation;
        if (orientation?.unlock) {
          orientation.unlock();
        }
      }
    };
    document.addEventListener("fullscreenchange", handleChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleChange);
    };
  }, []);

  const toggleFullscreen = () => {
    const container = containerRef.current;
    const video = videoRef.current as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null;
    if (!container || !video) return;

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
      return;
    }

    if (isMobile && video.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
      return;
    }

    const target = container.requestFullscreen ? container : video;
    target.requestFullscreen().catch(() => undefined);

    const orientation = screen.orientation;
    if (orientation?.lock) {
      orientation.lock("landscape").catch(() => undefined);
    }
  };

  const handleVideoClick = () => {
    togglePlay();
  };

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="glass-panel w-full max-w-5xl mx-auto overflow-hidden"
    >
      <div className="relative bg-black/70">
        <video
          ref={videoRef}
          src={src}
          className="w-full aspect-video max-h-[75vh] object-contain"
          playsInline
          preload="auto"
          onClick={handleVideoClick}
        />
        {isBuffering ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="glass-soft px-4 py-3 text-xs text-white/80 flex items-center gap-3">
              <div className="loader-ring" />
              <div>
                Dang tai video
                <span className="loading-dots" aria-hidden="true">
                  <span>.</span>
                  <span>.</span>
                  <span>.</span>
                </span>
              </div>
            </div>
          </div>
        ) : null}
        {!isPlaying && !isBuffering ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <button
              onClick={togglePlay}
              className="pointer-events-auto px-4 py-2 rounded-full bg-white/10 border border-white/20 text-xs uppercase tracking-[0.25em] text-white/80"
            >
              {hasInteracted ? "Play" : "Tap to play"}
            </button>
          </div>
        ) : null}
      </div>

      <div className="w-full p-4 md:p-5 space-y-3 glass-soft border-t border-white/10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs uppercase tracking-[0.2em] text-white/40">
            {title}
          </div>
          <div className="text-xs text-white/50">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>

        <div className="relative">
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-white/20"
              style={{ width: `${bufferedPercent}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={(event) => handleSeek(Number(event.target.value))}
            className="absolute inset-0 w-full h-2 opacity-0 cursor-pointer"
          />
          <div
            className="absolute top-0 left-0 h-2 bg-white/60 rounded-full pointer-events-none"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="grid gap-3 md:flex md:items-center md:justify-between text-xs md:text-sm">
          <div className="grid grid-cols-3 gap-2 md:flex md:flex-wrap md:items-center">
            <button
              onClick={togglePlay}
              className="w-full md:w-auto px-3 py-2 rounded-lg bg-white/10 text-white/90"
            >
              {isPlaying ? "Pause" : "Play"}
            </button>
            <button
              onClick={() => handleSkip(-10)}
              className="w-full md:w-auto px-3 py-2 rounded-lg bg-white/10 text-white/80"
            >
              -10s
            </button>
            <button
              onClick={() => handleSkip(10)}
              className="w-full md:w-auto px-3 py-2 rounded-lg bg-white/10 text-white/80"
            >
              +10s
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center">
            {isMobile ? (
              <button
                onClick={toggleMute}
                className="w-full md:w-auto px-3 py-2 rounded-lg bg-white/10 text-white/80"
              >
                {muted ? "Unmute" : "Mute"}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleMute}
                  className="px-3 py-2 rounded-lg bg-white/10 text-white/80"
                >
                  {muted ? "Muted" : "Volume"}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={muted ? 0 : volume}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setVolume(next);
                    if (next > 0 && muted) setMuted(false);
                  }}
                  className="w-24"
                />
              </div>
            )}

            <button
              onClick={toggleFullscreen}
              className="w-full md:w-auto px-3 py-2 rounded-lg bg-white/10 text-white/80"
            >
              Fullscreen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
