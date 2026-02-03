import { useQuery } from "@tanstack/react-query";
import { apiFetchVoid, apiFetch } from "../api/client";
import VideoCard, { VideoItem } from "../components/VideoCard";
import { useNavigate } from "react-router-dom";

export default function Gallery() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["videos"],
    queryFn: () => apiFetch<VideoItem[]>("/api/videos")
  });

  const handleLogout = async () => {
    await apiFetchVoid("/api/auth/logout", { method: "POST" });
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen px-5 py-8 md:px-10">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-medium text-white">Memory Vault</h1>
            <p className="text-sm text-white/50">
              Private moments, held in quiet glass.
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-white/60 hover:text-white/90 transition"
          >
            Lock
          </button>
        </header>

        {isLoading ? (
          <div className="text-white/50 text-sm">Loading memories…</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {data?.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
            {data?.length === 0 ? (
              <div className="text-white/50 text-sm">No memories yet.</div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
