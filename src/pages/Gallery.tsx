import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiFetchVoid, apiFetch } from "../api/client";
import VideoCard, { VideoItem } from "../components/VideoCard";
import Loading from "../components/Loading";
import { useNavigate } from "react-router-dom";

export default function Gallery() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["videos"],
    queryFn: () => apiFetch<VideoItem[]>("/api/videos")
  });

  const handleLogout = async () => {
    await apiFetchVoid("/api/auth/logout", { method: "POST" });
    navigate("/login", { replace: true });
  };

  if (isLoading) {
    return (
      <Loading
        title="Doi xi nha"
        subtitle="Dang gom lai cac ky uc de hien thi."
      />
    );
  }

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return data;
    return data.filter((video) =>
      video.title.toLowerCase().includes(needle)
    );
  }, [data, query]);

  return (
    <div className="min-h-screen px-5 py-8 md:px-10">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
          <div>
            <h1 className="text-2xl font-medium text-white">Memory Vault</h1>
            <p className="text-sm text-white/50">
              Private moments, held in quiet glass.
            </p>
          </div>

          <div className="hidden md:flex justify-center">
            <div className="relative w-full max-w-md">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                className="w-full rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 focus:outline-none focus:ring-1 focus:ring-white/20"
              />
              <button
                type="button"
                className="absolute right-1 top-1 bottom-1 px-3 rounded-full bg-white/10 text-white/70"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="currentColor"
                >
                  <path d="M10 4a6 6 0 1 0 3.7 10.7l4 4 1.4-1.4-4-4A6 6 0 0 0 10 4zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between md:justify-end gap-3">
            <button
              type="button"
              onClick={() => setMobileSearchOpen((prev) => !prev)}
              className="md:hidden h-9 w-9 rounded-full bg-white/10 text-white/70 flex items-center justify-center"
              aria-label="Search"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="currentColor"
              >
                <path d="M10 4a6 6 0 1 0 3.7 10.7l4 4 1.4-1.4-4-4A6 6 0 0 0 10 4zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" />
              </svg>
            </button>
            <button
              onClick={handleLogout}
              className="text-sm text-white/60 hover:text-white/90 transition"
            >
              Lock
            </button>
          </div>
        </header>

        {mobileSearchOpen ? (
          <div className="md:hidden">
            <div className="relative w-full">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                className="w-full rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 focus:outline-none focus:ring-1 focus:ring-white/20"
              />
              <button
                type="button"
                className="absolute right-1 top-1 bottom-1 px-3 rounded-full bg-white/10 text-white/70"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="currentColor"
                >
                  <path d="M10 4a6 6 0 1 0 3.7 10.7l4 4 1.4-1.4-4-4A6 6 0 0 0 10 4zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" />
                </svg>
              </button>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
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
