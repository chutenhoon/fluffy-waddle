import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../api/client";
import VideoCard, { VideoItem } from "../components/VideoCard";
import Loading from "../components/Loading";
import VideoPlayer from "../components/VideoPlayer";

type VideoDetail = {
  id: string;
  slug: string;
  title: string;
  created_at: string;
  size_bytes: number;
  status: string;
};

export default function Watch() {
  const { slug } = useParams();
  const [theaterMode, setTheaterMode] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["video", slug],
    queryFn: () => apiFetch<VideoDetail>(`/api/videos/${slug}`),
    enabled: Boolean(slug)
  });

  const { data: allVideos } = useQuery({
    queryKey: ["videos"],
    queryFn: () => apiFetch<VideoItem[]>("/api/videos")
  });

  const recommendations =
    allVideos?.filter((video) => video.slug !== slug) || [];

  const sidebarVideos = useMemo(
    () => recommendations.slice(0, 10),
    [recommendations]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("vms_theater_mode");
    if (saved) {
      setTheaterMode(saved === "1");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("vms_theater_mode", theaterMode ? "1" : "0");
  }, [theaterMode]);

  if (isLoading) {
    return (
      <Loading
        title="Doi xi nha"
        subtitle="Dang tai video de phat muot hon."
      />
    );
  }

  if (!data) {
    return <div className="min-h-screen text-white/50 p-6">Not found.</div>;
  }

  return (
    <div className="min-h-screen px-5 py-6 md:px-10">
      <div
        className={`mx-auto space-y-6 ${
          theaterMode ? "max-w-[1600px]" : "max-w-[1320px]"
        }`}
      >
        <div className="flex flex-col gap-2">
          <Link to="/" className="text-sm text-white/60 hover:text-white/90">
            Back to vault
          </Link>
          <h1 className="text-xl md:text-2xl font-medium text-white">
            {data.title}
          </h1>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className={`space-y-6 ${theaterMode ? "lg:flex lg:justify-center" : ""}`}>
            <VideoPlayer
              src={`/api/videos/${data.slug}/stream`}
              theaterMode={theaterMode}
              onToggleTheater={() => setTheaterMode((prev) => !prev)}
            />
          </div>

          {sidebarVideos.length > 0 ? (
            <aside className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs uppercase tracking-[0.3em] text-white/40">
                  More to watch
                </h2>
                <Link
                  to="/"
                  className="text-xs text-white/50 hover:text-white/80"
                >
                  View all
                </Link>
              </div>
              <div className="grid gap-4">
                {sidebarVideos.map((video) => (
                  <VideoCard key={video.id} video={video} />
                ))}
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}
