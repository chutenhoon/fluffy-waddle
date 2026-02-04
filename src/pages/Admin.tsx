import { useMemo, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiFetchVoid, ApiError } from "../api/client";
import type { VideoItem } from "../components/VideoCard";

type CreateUploadResponse = {
  videoId: string;
  slug: string;
  r2Key: string;
  uploadId: string;
  partSize: number;
  parts: Array<{ partNumber: number; url: string }>;
  thumbnailKey?: string | null;
  thumbnailUploadUrl?: string | null;
};

type UploadPart = {
  partNumber: number;
  url: string;
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
  etag?: string;
};

type UploadSession = CreateUploadResponse;

type UploadState =
  | "idle"
  | "creating"
  | "uploading"
  | "completing"
  | "done";

const MAX_CONCURRENCY = 3;
const THUMB_SIZE = 640;

export default function Admin() {
  const [adminKey, setAdminKey] = useState(
    () => sessionStorage.getItem("vms_admin_key") || ""
  );
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [session, setSession] = useState<UploadSession | null>(null);
  const [parts, setParts] = useState<UploadPart[]>([]);
  const [status, setStatus] = useState<UploadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [thumbnailBlob, setThumbnailBlob] = useState<Blob | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [thumbnailStatus, setThumbnailStatus] = useState<
    "idle" | "generating" | "ready" | "uploading" | "error"
  >("idle");
  const [thumbnailUploaded, setThumbnailUploaded] = useState(false);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { data: videos, isLoading: videosLoading } = useQuery({
    queryKey: ["videos"],
    queryFn: () => apiFetch<VideoItem[]>("/api/videos")
  });

  const clearThumbnailPreview = () => {
    if (thumbnailPreview) {
      URL.revokeObjectURL(thumbnailPreview);
      setThumbnailPreview(null);
    }
  };

  const partSizeFor = useCallback(
    (part: UploadPart) => {
      if (!session || !file) return 0;
      const start = (part.partNumber - 1) * session.partSize;
      const end = Math.min(start + session.partSize, file.size);
      return Math.max(0, end - start);
    },
    [file, session]
  );

  const totalProgress = useMemo(() => {
    if (!file || parts.length === 0) return 0;
    const uploaded = parts.reduce(
      (sum, part) => sum + part.progress * partSizeFor(part),
      0
    );
    return Math.min(100, (uploaded / file.size) * 100);
  }, [file, parts, partSizeFor]);

  const updatePart = (partNumber: number, updates: Partial<UploadPart>) => {
    setParts((prev) =>
      prev.map((part) =>
        part.partNumber === partNumber ? { ...part, ...updates } : part
      )
    );
  };

  const handleAdminKeyChange = (value: string) => {
    setAdminKey(value);
    sessionStorage.setItem("vms_admin_key", value);
  };

  const generateThumbnail = async (videoFile: File) => {
    setThumbnailStatus("generating");
    clearThumbnailPreview();
    setThumbnailUploaded(false);

    const url = URL.createObjectURL(videoFile);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    const cleanup = () => {
      URL.revokeObjectURL(url);
    };

    const capture = () => {
      const ratio =
        video.videoWidth > 0 && video.videoHeight > 0
          ? video.videoHeight / video.videoWidth
          : 9 / 16;
      const width = THUMB_SIZE;
      const height = Math.round(width * ratio);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        cleanup();
        setThumbnailStatus("error");
        return;
      }
      ctx.drawImage(video, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          cleanup();
          if (!blob) {
            setThumbnailStatus("error");
            return;
          }
          setThumbnailBlob(blob);
          setThumbnailPreview(URL.createObjectURL(blob));
          setThumbnailStatus("ready");
        },
        "image/jpeg",
        0.8
      );
    };

    const onLoaded = () => {
      const target = Number.isFinite(video.duration)
        ? Math.min(1, Math.max(0.1, video.duration * 0.1))
        : 0;
      try {
        video.currentTime = target;
      } catch {
        capture();
      }
    };

    const onSeeked = () => capture();
    const onError = () => {
      cleanup();
      setThumbnailStatus("error");
    };

    video.addEventListener("loadedmetadata", onLoaded, { once: true });
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
  };

  const handleThumbnailFile = (fileValue: File | null) => {
    if (!fileValue) {
      setThumbnailBlob(null);
      setThumbnailStatus("idle");
      clearThumbnailPreview();
      return;
    }
    setThumbnailBlob(fileValue);
    clearThumbnailPreview();
    setThumbnailPreview(URL.createObjectURL(fileValue));
    setThumbnailStatus("ready");
    setThumbnailUploaded(false);
  };

  const handleCreate = async () => {
    if (!file || !title || !adminKey) return;
    setError(null);
    setStatus("creating");

    try {
      setThumbnailUploaded(false);
      const response = await apiFetch<CreateUploadResponse>(
        "/api/admin/uploads/create",
        {
          method: "POST",
          headers: {
            "x-admin-key": adminKey
          },
          body: JSON.stringify({
            title,
            fileName: file.name,
            sizeBytes: file.size,
            contentType: file.type,
            thumbnailContentType: thumbnailBlob?.type || undefined
          })
        }
      );

      setSession(response);
      setParts(
        response.parts.map((part) => ({
          ...part,
          status: "pending",
          progress: 0
        }))
      );

      if (thumbnailBlob && response.thumbnailUploadUrl && response.thumbnailKey) {
        setThumbnailStatus("uploading");
        const uploadResponse = await fetch(response.thumbnailUploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": thumbnailBlob.type || "image/jpeg"
          },
          body: thumbnailBlob
        });
        if (!uploadResponse.ok) {
          throw new Error("Thumbnail upload failed.");
        }
        setThumbnailUploaded(true);
        setThumbnailStatus("ready");
      }

      setStatus("idle");
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Unable to start upload.";
      setError(message);
      setStatus("idle");
      setThumbnailStatus("error");
    }
  };

  const uploadPart = (part: UploadPart, blob: Blob) => {
    return new Promise<string | null>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", part.url);

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        updatePart(part.partNumber, {
          progress: event.total > 0 ? event.loaded / event.total : 0
        });
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const etag = (xhr.getResponseHeader("ETag") ||
            xhr.getResponseHeader("etag"))?.replace(/\"/g, "");
          resolve(etag?.trim() || null);
        } else {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      };

      xhr.onerror = () =>
        reject(
          new Error(
            "Upload failed (network or CORS). Ensure the R2 bucket allows PUT from this origin."
          )
        );

      xhr.send(blob);
    });
  };

  const runUploadQueue = async (queueParts: UploadPart[]) => {
    if (!file || !session) return { failed: 0, errors: [] as string[] };
    setStatus("uploading");

    const queue = queueParts.filter((part) => part.status !== "done");
    if (queue.length === 0) {
      return { failed: 0, errors: [] as string[] };
    }
    let index = 0;
    let active = 0;
    let completed = 0;
    const errors: string[] = [];

    return new Promise<{ failed: number; errors: string[] }>((resolve) => {
      const launchNext = () => {
        while (active < MAX_CONCURRENCY && index < queue.length) {
          const part = queue[index++];
          const start = (part.partNumber - 1) * session.partSize;
          const end = Math.min(start + session.partSize, file.size);
          const blob = file.slice(start, end);

          active += 1;
          updatePart(part.partNumber, { status: "uploading", progress: 0 });

          uploadPart(part, blob)
            .then((etag) => {
              updatePart(part.partNumber, {
                status: "done",
                progress: 1,
                etag: etag || undefined
              });
            })
            .catch((err) => {
              errors.push(
                err instanceof Error ? err.message : "Upload failed."
              );
              updatePart(part.partNumber, { status: "error" });
            })
            .finally(() => {
              active -= 1;
              completed += 1;
              if (completed === queue.length) {
                resolve({ failed: errors.length, errors });
              } else {
                launchNext();
              }
            });
        }
      };

      launchNext();
    });
  };

  const handleComplete = async () => {
    if (!session || !file || !adminKey) return;
    const pending = parts.filter((part) => part.status !== "done");
    if (pending.length > 0) {
      setError("Some parts still need upload.");
      return;
    }

    setStatus("completing");
    setError(null);

    try {
      await apiFetchVoid("/api/admin/uploads/complete", {
        method: "POST",
        headers: {
          "x-admin-key": adminKey
        },
        body: JSON.stringify({
          videoId: session.videoId,
          uploadId: session.uploadId,
          r2Key: session.r2Key,
          sizeBytes: file.size,
          thumbnailKey: thumbnailUploaded ? session.thumbnailKey : null,
          totalParts: parts.length,
          parts: parts
            .filter((part) => part.etag)
            .map((part) => ({
              partNumber: part.partNumber,
              etag: part.etag
            }))
        })
      });

      setStatus("done");
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Unable to finalize upload.";
      setError(message);
      setStatus("idle");
    }
  };

  const handleUpload = async () => {
    setError(null);
    const result = await runUploadQueue(parts);
    setStatus("idle");
    if (result.failed > 0) {
      setError(
        `Failed ${result.failed} part(s). ${
          result.errors[0] ? result.errors[0] : ""
        }`.trim()
      );
    }
  };

  const handleRetryFailed = async () => {
    setError(null);
    const nextParts = parts.map((part) =>
      part.status === "error" ? { ...part, status: "pending" } : part
    );
    setParts(nextParts);
    const result = await runUploadQueue(nextParts);
    setStatus("idle");
    if (result.failed > 0) {
      setError(
        `Failed ${result.failed} part(s). ${
          result.errors[0] ? result.errors[0] : ""
        }`.trim()
      );
    }
  };

  const canStart = Boolean(
    file && title && adminKey && thumbnailStatus !== "generating"
  );

  const handleDeleteVideo = async (slug: string) => {
    if (!adminKey) {
      setError("Missing admin key.");
      return;
    }
    const ok = window.confirm("Delete this video? This cannot be undone.");
    if (!ok) return;
    setDeletingSlug(slug);
    setError(null);

    try {
      await apiFetchVoid("/api/admin/videos/delete", {
        method: "POST",
        headers: {
          "x-admin-key": adminKey
        },
        body: JSON.stringify({ slug })
      });
      await queryClient.invalidateQueries({ queryKey: ["videos"] });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Unable to delete video.";
      setError(message);
    } finally {
      setDeletingSlug(null);
    }
  };

  return (
    <div className="min-h-screen px-5 py-8 md:px-10">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-medium text-white">Admin Vault</h1>
            <p className="text-sm text-white/50">
              Upload memories with quiet precision.
            </p>
          </div>
        </div>

        <div className="glass-panel p-6 space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs text-white/40">Admin key</label>
              <input
                type="password"
                value={adminKey}
                onChange={(event) => handleAdminKeyChange(event.target.value)}
                placeholder="ADMIN_KEY"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/20"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-white/40">Title</label>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Memory title"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/20"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-white/40">Video file</label>
            <input
              type="file"
              accept="video/*"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] || null;
                setFile(nextFile);
                if (nextFile) {
                  generateThumbnail(nextFile);
                } else {
                  setThumbnailBlob(null);
                  setThumbnailStatus("idle");
                  clearThumbnailPreview();
                }
              }}
              className="w-full text-sm text-white/70"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-white/40">
              Thumbnail (optional)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(event) =>
                handleThumbnailFile(event.target.files?.[0] || null)
              }
              className="w-full text-sm text-white/70"
            />
            <div className="flex items-center gap-3 text-xs text-white/50">
              <span>Status: {thumbnailStatus}</span>
              {thumbnailUploaded ? <span>Uploaded</span> : null}
            </div>
            {thumbnailPreview ? (
              <img
                src={thumbnailPreview}
                alt="Thumbnail preview"
                className="h-24 w-40 rounded-lg object-cover border border-white/10"
              />
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleCreate}
              disabled={!canStart || status === "creating"}
              className="px-4 py-2 rounded-xl bg-white/10 text-sm text-white/90 disabled:opacity-50"
            >
              {status === "creating" ? "Preparing..." : "Prepare upload"}
            </button>
            <button
              onClick={handleUpload}
              disabled={!session || status === "uploading"}
              className="px-4 py-2 rounded-xl bg-white/10 text-sm text-white/80 disabled:opacity-50"
            >
              {status === "uploading" ? "Uploading..." : "Upload parts"}
            </button>
            <button
              onClick={handleRetryFailed}
              disabled={!session || parts.every((part) => part.status !== "error")}
              className="px-4 py-2 rounded-xl bg-white/10 text-sm text-white/70 disabled:opacity-50"
            >
              Retry failed
            </button>
            <button
              onClick={handleComplete}
              disabled={!session || status === "completing"}
              className="px-4 py-2 rounded-xl bg-white/10 text-sm text-white/80 disabled:opacity-50"
            >
              {status === "completing" ? "Finalizing..." : "Complete upload"}
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-white/50">
              <span>Overall progress</span>
              <span>{Math.round(totalProgress)}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-white/40"
                style={{ width: `${totalProgress}%` }}
              />
            </div>
          </div>

          {session ? (
            <div className="space-y-2 text-xs text-white/50">
              <div>Upload ID: {session.uploadId}</div>
              <div>Parts: {parts.length}</div>
            </div>
          ) : null}

          {error ? <div className="text-sm text-white/60">{error}</div> : null}
          {status === "done" ? (
            <div className="text-sm text-white/70">Upload complete.</div>
          ) : null}
        </div>

        {parts.length > 0 ? (
          <div className="glass-panel p-6 space-y-3">
            <div className="text-sm text-white/70">Part status</div>
            <div className="grid gap-2">
              {parts.map((part) => (
                <div
                  key={part.partNumber}
                  className="flex items-center justify-between text-xs text-white/50"
                >
                  <span>Part {part.partNumber}</span>
                  <span>
                    {part.status} - {Math.round(part.progress * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="glass-panel p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-white/70">Manage videos</div>
            {videosLoading ? (
              <div className="text-xs text-white/40">Loading...</div>
            ) : null}
          </div>

          <div className="grid gap-3">
            {videos?.map((video) => (
              <div
                key={video.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  {video.thumbnail_key ? (
                    <img
                      src={`/api/videos/${video.slug}/thumb`}
                      alt=""
                      className="h-10 w-16 rounded-md object-cover border border-white/10"
                    />
                  ) : (
                    <div className="h-10 w-16 rounded-md bg-white/5 border border-white/10" />
                  )}
                  <div>
                    <div className="text-sm text-white/90">{video.title}</div>
                    <div className="text-xs text-white/40">{video.slug}</div>
                  </div>
                </div>

                <button
                  onClick={() => handleDeleteVideo(video.slug)}
                  disabled={deletingSlug === video.slug}
                  className="px-3 py-1.5 rounded-lg bg-red-500/15 text-xs text-red-200 hover:bg-red-500/25 disabled:opacity-50"
                >
                  {deletingSlug === video.slug ? "Deleting..." : "Delete"}
                </button>
              </div>
            ))}

            {videos?.length === 0 ? (
              <div className="text-xs text-white/40">No videos yet.</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
