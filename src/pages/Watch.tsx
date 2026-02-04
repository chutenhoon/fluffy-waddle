import { useQuery } from "@tanstack/react-query";
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
    allVideos?.filter((video) => video.slug !== slug).slice(0, 6) || [];

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
    <div className="min-h-screen px-5 py-8 md:px-10">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col gap-2">
          <Link to="/" className="text-sm text-white/60 hover:text-white/90">
            Back to vault
          </Link>
          <h1 className="text-xl md:text-2xl font-medium text-white">
            {data.title}
          </h1>
        </div>

        <VideoPlayer
          src={`/api/videos/${data.slug}/stream`}
          title={data.title}
        />

        {recommendations.length > 0 ? (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm uppercase tracking-[0.2em] text-white/40">
                More to watch
              </h2>
              <Link to="/" className="text-xs text-white/50 hover:text-white/80">
                View all
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {recommendations.map((video) => (
                <VideoCard key={video.id} video={video} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
