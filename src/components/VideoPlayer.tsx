import { useCallback, useEffect, useRef, useState } from "react";
import { useMediaQuery } from "../hooks/useMediaQuery";

const HIDE_DELAY = 2500;

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
  const [showControls, setShowControls] = useState(true);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [buffered, setBuffered] = useState(0);
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
    if (element.paused) {
      element.play().catch(() => undefined);
    } else {
      element.pause();
    }
  }, []);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTime = () => setCurrentTime(element.currentTime || 0);
    const onDuration = () => setDuration(element.duration || 0);
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
    element.addEventListener("progress", onProgress);

    return () => {
      element.removeEventListener("play", onPlay);
      element.removeEventListener("pause", onPause);
      element.removeEventListener("timeupdate", onTime);
      element.removeEventListener("loadedmetadata", onDuration);
      element.removeEventListener("progress", onProgress);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let timeoutId: number | undefined;

    const scheduleHide = () => {
      if (!isPlaying) return;
      timeoutId = window.setTimeout(() => setShowControls(false), HIDE_DELAY);
    };

    const reset = () => {
      setShowControls(true);
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      scheduleHide();
    };

    reset();

    container.addEventListener("mousemove", reset);
    container.addEventListener("touchstart", reset, { passive: true });

    return () => {
      container.removeEventListener("mousemove", reset);
      container.removeEventListener("touchstart", reset);
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [isPlaying]);

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

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    } else {
      container.requestFullscreen().catch(() => undefined);
    }
  };

  const handleVideoClick = () => {
    if (isMobile && !document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => undefined);
      return;
    }
    togglePlay();
  };

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="glass-panel w-full max-w-4xl mx-auto overflow-hidden"
    >
      <div className="relative bg-black/70">
        <video
          ref={videoRef}
          src={src}
          className="w-full h-full max-h-[75vh] object-contain"
          playsInline
          onClick={handleVideoClick}
        />

        <div
          className={`absolute inset-0 flex items-end transition-opacity duration-300 ${
            showControls ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="w-full p-4 md:p-5 glass-soft">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="text-xs uppercase tracking-[0.2em] text-white/40">
                {title}
              </div>
              <div className="text-xs text-white/50">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
            </div>

            <div className="relative mb-3">
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

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-3">
                <button
                  onClick={togglePlay}
                  className="px-3 py-1.5 rounded-lg bg-white/10 text-white/90"
                >
                  {isPlaying ? "Pause" : "Play"}
                </button>
                <button
                  onClick={() => handleSkip(-10)}
                  className="px-3 py-1.5 rounded-lg bg-white/10 text-white/80"
                >
                  -10s
                </button>
                <button
                  onClick={() => handleSkip(10)}
                  className="px-3 py-1.5 rounded-lg bg-white/10 text-white/80"
                >
                  +10s
                </button>
              </div>

              <div className="flex items-center gap-3">
                {isMobile ? (
                  <button
                    onClick={toggleMute}
                    className="px-3 py-1.5 rounded-lg bg-white/10 text-white/80"
                  >
                    {muted ? "Unmute" : "Mute"}
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleMute}
                      className="px-3 py-1.5 rounded-lg bg-white/10 text-white/80"
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
                      className="w-28"
                    />
                  </div>
                )}

                <button
                  onClick={toggleFullscreen}
                  className="px-3 py-1.5 rounded-lg bg-white/10 text-white/80"
                >
                  Fullscreen
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
