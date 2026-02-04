import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiFetch } from "../api/client";
import VideoCard, { VideoItem } from "../components/VideoCard";
import Loading from "../components/Loading";
import { useSearch } from "../contexts/SearchContext";

export default function Gallery() {
  const { query } = useSearch();
  const { data, isLoading } = useQuery({
    queryKey: ["videos"],
    queryFn: () => apiFetch<VideoItem[]>("/api/videos")
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return data;
    return data.filter((video) =>
      video.title.toLowerCase().includes(needle)
    );
  }, [data, query]);

  if (isLoading) {
    return (
      <Loading
        title="Doi xi nha"
        subtitle="Dang gom lai cac ky uc de hien thi."
      />
    );
  }

  return (
    <div className="min-h-screen px-5 py-8 md:px-10">
      <div className="max-w-[1400px] mx-auto space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {filtered.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
          {filtered.length === 0 ? (
            <div className="text-white/50 text-sm">
              {query ? "No matching memories." : "No memories yet."}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
