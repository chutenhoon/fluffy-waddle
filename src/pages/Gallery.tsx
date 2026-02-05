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
        title="Đợi xíu nha"
        subtitle="Đang gom lại các ký ức để hiển thị."
      />
    );
  }

  return (
    <div className="min-h-screen px-5 py-8 md:px-10">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-medium text-white">Video</h1>
          <p className="text-sm text-white/50">
            Những đoạn video kỷ niệm.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
          {filtered.length === 0 ? (
            <div className="text-white/50 text-sm">
              {query ? "Không tìm thấy nội dung phù hợp." : "Chưa có video nào."}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
