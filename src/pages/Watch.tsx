import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../api/client";
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

  const { data, isLoading } = useQuery({
    queryKey: ["video", slug],
    queryFn: () => apiFetch<VideoDetail>(`/api/videos/${slug}`),
    enabled: Boolean(slug)
  });

  if (isLoading) {
    return <div className="min-h-screen text-white/50 p-6">Loading…</div>;
  }

  if (!data) {
    return <div className="min-h-screen text-white/50 p-6">Not found.</div>;
  }

  return (
    <div className="min-h-screen px-5 py-8 md:px-10">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-sm text-white/60 hover:text-white/90">
            Back to vault
          </Link>
          <div className="text-xs text-white/40">
            {new Date(data.created_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric"
            })}
          </div>
        </div>

        <VideoPlayer src={`/api/videos/${data.slug}/stream`} title={data.title} />
      </div>
    </div>
  );
}
