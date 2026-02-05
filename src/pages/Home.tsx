import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client";
import AudioCard from "../components/AudioCard";
import ImageCard, { ImageItem } from "../components/ImageCard";
import Loading from "../components/Loading";
import NoteCard, { NoteItem } from "../components/NoteCard";
import VideoCard, { VideoItem } from "../components/VideoCard";
import WebCard from "../components/WebCard";
import { useSearch } from "../contexts/SearchContext";
import { webMemories } from "../data/webMemories";

type AudioItem = {
  id: string;
  title: string;
  note_system_error?: number | null;
  description?: string | null;
  audio_key: string;
  thumb_key?: string | null;
  created_at: string;
};

const SectionHeader = ({
  title,
  to,
  action
}: {
  title: string;
  to?: string;
  action?: string;
}) => (
  <div className="flex items-center justify-between">
    <h2 className="text-sm uppercase tracking-[0.35em] text-white/40">
      {title}
    </h2>
    {to && action ? (
      <Link to={to} className="text-xs text-white/50 hover:text-white/80">
        {action}
      </Link>
    ) : null}
  </div>
);

export default function Home() {
  const { query } = useSearch();

  const { data: videos, isLoading: videosLoading } = useQuery({
    queryKey: ["videos"],
    queryFn: () => apiFetch<VideoItem[]>("/api/videos")
  });

  const { data: audios, isLoading: audiosLoading } = useQuery({
    queryKey: ["audios"],
    queryFn: () => apiFetch<AudioItem[]>("/api/audio")
  });

  const { data: images, isLoading: imagesLoading } = useQuery({
    queryKey: ["images"],
    queryFn: () => apiFetch<ImageItem[]>("/api/images")
  });

  const { data: notes, isLoading: notesLoading } = useQuery({
    queryKey: ["notes"],
    queryFn: () => apiFetch<NoteItem[]>("/api/notes")
  });

  const needle = query.trim().toLowerCase();

  const filteredNotes = useMemo(() => {
    if (!notes) return [];
    if (!needle) return notes;
    return notes.filter(
      (note) =>
        note.title.toLowerCase().includes(needle) ||
        note.content.toLowerCase().includes(needle)
    );
  }, [notes, needle]);

  const filteredVideos = useMemo(() => {
    if (!videos) return [];
    if (!needle) return videos;
    return videos.filter((video) =>
      video.title.toLowerCase().includes(needle)
    );
  }, [videos, needle]);

  const filteredImages = useMemo(() => {
    if (!images) return [];
    if (!needle) return images;
    return images.filter((image) =>
      [image.title, image.description || ""]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [images, needle]);

  const filteredAudios = useMemo(() => {
    if (!audios) return [];
    if (!needle) return audios;
    return audios.filter((audio) =>
      audio.title.toLowerCase().includes(needle)
    );
  }, [audios, needle]);

  const filteredWeb = useMemo(() => {
    if (!needle) return webMemories;
    return webMemories.filter((memory) =>
      [memory.title, memory.subtitle || ""]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [needle]);

  const anyLoading =
    videosLoading || audiosLoading || imagesLoading || notesLoading;

  if (anyLoading && !videos && !audios && !images && !notes) {
    return (
      <Loading
        title="Đợi xíu nha"
        subtitle="Đang gom lại ký ức để hiển thị."
      />
    );
  }

  const sections = [
    filteredVideos.length > 0,
    filteredImages.length > 0,
    filteredAudios.length > 0,
    filteredWeb.length > 0,
    filteredNotes.length > 0
  ];

  const hasContent = sections.some(Boolean);

  return (
    <div className="min-h-screen px-5 py-8 md:px-10">
      <div className="max-w-[1400px] mx-auto space-y-10">
        {filteredVideos.length > 0 ? (
          <section className="space-y-4">
            <SectionHeader title="Video" to="/videos" action="Xem riêng" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredVideos.map((video) => (
                <VideoCard key={video.id} video={video} />
              ))}
            </div>
          </section>
        ) : null}

        {filteredImages.length > 0 ? (
          <section className="space-y-4">
            <SectionHeader title="Hình ảnh" to="/images" action="Xem riêng" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {filteredImages.map((image) => (
                <ImageCard key={image.id} image={image} />
              ))}
            </div>
          </section>
        ) : null}

        {filteredAudios.length > 0 ? (
          <section className="space-y-4">
            <SectionHeader title="Âm thanh" to="/audio" action="Xem riêng" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredAudios.map((audio) => (
                <AudioCard key={audio.id} audio={audio} />
              ))}
            </div>
          </section>
        ) : null}

        {filteredWeb.length > 0 ? (
          <section className="space-y-4">
            <SectionHeader title="Web" to="/web" action="Xem riêng" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredWeb.map((memory) => (
                <WebCard key={memory.slug} memory={memory} />
              ))}
            </div>
          </section>
        ) : null}

        {filteredNotes.length > 0 ? (
          <section className="space-y-4">
            <SectionHeader title="Ghi chú" to="/notes" action="Xem riêng" />
            <div className="grid gap-4 md:grid-cols-2">
              {filteredNotes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  compact
                  href={`/notes/${note.id}`}
                />
              ))}
            </div>
          </section>
        ) : null}

        {!hasContent ? (
          <div className="glass-panel p-6 text-sm text-white/60">
            {needle
              ? "Không tìm thấy nội dung phù hợp."
              : "Chưa có nội dung nào để hiển thị."}
          </div>
        ) : null}
      </div>
    </div>
  );
}
