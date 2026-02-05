import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../api/client";
import Loading from "../components/Loading";

type ImageDetail = {
  id: string;
  title: string;
  description?: string | null;
  image_key: string;
  thumb_key?: string | null;
  created_at: string;
};

export default function ImageDetail() {
  const { id } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["image", id],
    queryFn: () => apiFetch<ImageDetail>(`/api/images/${id}`),
    enabled: Boolean(id)
  });

  if (isLoading) {
    return (
      <Loading
        title="Đợi xíu nha"
        subtitle="Đang tải hình ảnh."
      />
    );
  }

  if (!data) {
    return <div className="min-h-screen text-white/50 p-6">Not found.</div>;
  }

  return (
    <div className="min-h-screen px-5 py-8 md:px-10">
      <div className="max-w-[1000px] mx-auto space-y-6">
        <Link
          to="/images"
          className="inline-flex self-start items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/70 hover:bg-white/10"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <path d="M14.7 5.3 9 11l5.7 5.7-1.4 1.4L6.2 11l7.1-7.1 1.4 1.4z" />
          </svg>
          Quay lại hình ảnh
        </Link>

        <div className="glass-panel p-5 md:p-6 space-y-4">
          <div>
            <h1 className="text-2xl font-medium text-white">{data.title}</h1>
            {data.description ? (
              <p className="text-sm text-white/50 mt-1">{data.description}</p>
            ) : null}
          </div>

          <div className="rounded-2xl overflow-hidden border border-white/10 bg-black/30 flex items-center justify-center p-3 md:p-4">
            <img
              src={`/media/${data.image_key}`}
              alt={data.title}
              className="max-h-[70vh] w-auto max-w-full object-contain"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
