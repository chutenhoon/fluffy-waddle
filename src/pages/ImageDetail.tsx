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
        <Link to="/images" className="text-sm text-white/60 hover:text-white/90">
          Quay lại hình ảnh
        </Link>

        <div className="glass-panel p-5 md:p-6 space-y-4">
          <div>
            <h1 className="text-2xl font-medium text-white">{data.title}</h1>
            {data.description ? (
              <p className="text-sm text-white/50 mt-1">{data.description}</p>
            ) : null}
          </div>

          <div className="rounded-2xl overflow-hidden border border-white/10 bg-black/30">
            <img
              src={`/media/${data.image_key}`}
              alt={data.title}
              className="w-full h-auto object-contain"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
