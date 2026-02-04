import { FormEvent, useEffect, useState } from "react";
import { unzip } from "fflate";
import { apiFetch, apiFetchVoid, ApiError } from "../api/client";
import Loading from "../components/Loading";

type AdminVideo = {
  id: string;
  slug: string;
  title: string;
  thumb_key?: string | null;
  created_at: string;
  updated_at: string;
  status: string;
};

type AdminVideoDetail = AdminVideo & {
  description?: string | null;
  pc_key?: string | null;
  hls_master_key?: string | null;
  thumb_key?: string | null;
};

type AdminAudio = {
  id: string;
  title: string;
  note_system_error?: number | null;
  description?: string | null;
  audio_key?: string | null;
  thumb_key?: string | null;
  created_at: string;
  updated_at: string;
};

type AuthState = "checking" | "guest" | "authed";

type HlsEntry = {
  path: string;
  data: Uint8Array;
  contentType: string;
};

type PresignResponse = {
  uploadUrl: string;
  objectKey: string;
};

const HLS_CONCURRENCY = 3;
const HLS_MASTER_NAME = "index.m3u8";
const EXT_CONTENT_TYPES: Record<string, string> = {
  m3u8: "application/vnd.apple.mpegurl",
  ts: "video/mp2t",
  m4s: "video/iso.segment",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};

function contentTypeForPath(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return EXT_CONTENT_TYPES[ext] || "application/octet-stream";
}

function pickThumbnailTime(duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) return 0.1;
  const maxSeek = Math.min(duration * 0.2, 30);
  const minSeek = Math.min(duration * 0.05, 3);
  const safeMax = Math.max(minSeek + 0.1, maxSeek);
  const target = minSeek + Math.random() * (safeMax - minSeek);
  return Math.min(Math.max(0.1, target), Math.max(0.1, duration - 0.1));
}

async function generateThumbnailFromVideo(file: File) {
  return new Promise<Blob>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
    };

    const fail = (message: string) => {
      cleanup();
      reject(new Error(message));
    };

    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";

    video.addEventListener("error", () => {
      fail("Failed to load video for thumbnail.");
    });

    video.addEventListener("loadedmetadata", () => {
      const target = pickThumbnailTime(video.duration);
      try {
        video.currentTime = target;
      } catch {
        fail("Failed to seek video for thumbnail.");
      }
    });

    video.addEventListener("seeked", () => {
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      const maxWidth = 1280;
      const scale = Math.min(1, maxWidth / width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        fail("Failed to render thumbnail.");
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            fail("Failed to encode thumbnail.");
            return;
          }
          cleanup();
          resolve(blob);
        },
        "image/jpeg",
        0.85
      );
    });

    video.src = url;
    video.load();
  });
}

function normalizeZipPath(value: string) {
  let path = value.replace(/\\/g, "/");
  while (path.startsWith("./")) {
    path = path.slice(2);
  }
  path = path.replace(/^\/+/, "");
  return path;
}

async function unzipFile(file: File) {
  const buffer = new Uint8Array(await file.arrayBuffer());
  return new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(buffer, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(data as Record<string, Uint8Array>);
    });
  });
}

function extractHlsEntries(files: Record<string, Uint8Array>) {
  const entries: Array<{ path: string; data: Uint8Array }> = [];
  for (const [rawName, data] of Object.entries(files)) {
    const name = normalizeZipPath(rawName);
    if (!name || name.endsWith("/")) continue;
    if (name.startsWith("__MACOSX/")) continue;
    if (name.includes("\0") || name.includes("..")) {
      throw new Error("Invalid HLS ZIP entry.");
    }
    entries.push({ path: name, data });
  }

  if (entries.length === 0) {
    throw new Error("HLS ZIP is empty.");
  }

  const names = entries.map((entry) => entry.path);
  const hasRootIndex = names.includes(HLS_MASTER_NAME);
  let basePrefix = "";
  if (!hasRootIndex) {
    const topLevels = new Set(names.map((name) => name.split("/")[0]));
    if (topLevels.size !== 1) {
      throw new Error("HLS ZIP must contain index.m3u8 at root or in a single folder.");
    }
    const [folder] = Array.from(topLevels);
    if (!names.includes(`${folder}/${HLS_MASTER_NAME}`)) {
      throw new Error("HLS ZIP missing index.m3u8.");
    }
    basePrefix = `${folder}/`;
  }

  const normalized: HlsEntry[] = [];
  for (const entry of entries) {
    if (basePrefix && !entry.path.startsWith(basePrefix)) {
      throw new Error("HLS ZIP contains unexpected files.");
    }
    const relative = basePrefix ? entry.path.slice(basePrefix.length) : entry.path;
    if (!relative || relative.endsWith("/")) continue;
    if (relative.startsWith("/") || relative.includes("..")) {
      throw new Error("Invalid HLS ZIP entry.");
    }
    normalized.push({
      path: relative,
      data: entry.data,
      contentType: contentTypeForPath(relative)
    });
  }

  if (!normalized.some((entry) => entry.path === HLS_MASTER_NAME)) {
    throw new Error("HLS ZIP missing index.m3u8.");
  }

  return normalized;
}

function thumbExtension(file: File) {
  const type = file.type.toLowerCase();
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/jpeg") return "jpg";
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (ext === "jpeg") return "jpg";
  if (ext === "jpg" || ext === "png" || ext === "webp") return ext;
  return "jpg";
}

function thumbContentType(file: File, ext: string) {
  if (file.type) return file.type;
  return EXT_CONTENT_TYPES[ext] || "image/jpeg";
}

function audioExtension(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (ext === "mp3" || ext === "m4a" || ext === "wav" || ext === "ogg") {
    return ext;
  }
  if (file.type === "audio/mpeg") return "mp3";
  if (file.type === "audio/mp4") return "m4a";
  if (file.type === "audio/wav") return "wav";
  if (file.type === "audio/ogg") return "ogg";
  return "mp3";
}

function audioContentType(file: File, ext: string) {
  if (file.type) return file.type;
  return EXT_CONTENT_TYPES[ext] || "audio/mpeg";
}

async function requestPresign(params: {
  videoId?: string;
  audioId?: string;
  path: string;
  contentType: string;
}) {
  return apiFetch<PresignResponse>("/api/admin/uploads/presign", {
    method: "POST",
    body: JSON.stringify(params)
  });
}

async function uploadToR2(
  target: { videoId?: string; audioId?: string },
  path: string,
  body: Blob | Uint8Array | File,
  contentType: string
) {
  const { uploadUrl, objectKey } = await requestPresign({
    ...target,
    path,
    contentType
  });
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType
    },
    body
  });
  if (!response.ok) {
    throw new Error(`Upload failed for ${path}.`);
  }
  return objectKey;
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
  onProgress?: (done: number, total: number) => void
) {
  let index = 0;
  let done = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const current = index++;
        if (current >= items.length) return;
        await worker(items[current], current);
        done += 1;
        if (onProgress) {
          onProgress(done, items.length);
        }
      }
    }
  );
  await Promise.all(runners);
}

export default function Admin() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [videos, setVideos] = useState<AdminVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [audios, setAudios] = useState<AdminAudio[]>([]);
  const [audioLoading, setAudioLoading] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mp4File, setMp4File] = useState<File | null>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [hlsFile, setHlsFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editingThumbKey, setEditingThumbKey] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editMp4, setEditMp4] = useState<File | null>(null);
  const [editThumb, setEditThumb] = useState<File | null>(null);
  const [editHls, setEditHls] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const [audioTitle, setAudioTitle] = useState("");
  const [audioNote, setAudioNote] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioThumb, setAudioThumb] = useState<File | null>(null);
  const [creatingAudio, setCreatingAudio] = useState(false);

  const [editingAudioId, setEditingAudioId] = useState<string | null>(null);
  const [editAudioTitle, setEditAudioTitle] = useState("");
  const [editAudioNote, setEditAudioNote] = useState(false);
  const [editAudioFile, setEditAudioFile] = useState<File | null>(null);
  const [editAudioThumb, setEditAudioThumb] = useState<File | null>(null);
  const [savingAudio, setSavingAudio] = useState(false);

  const loadVideos = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<AdminVideo[]>("/api/admin/videos");
      setVideos(data || []);
      setAuthState("authed");
      await loadAudios();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuthState("guest");
      } else {
        setError(err instanceof Error ? err.message : "Failed to load.");
        setAuthState("guest");
      }
    } finally {
      setLoading(false);
    }
  };

  const loadAudios = async () => {
    setAudioLoading(true);
    try {
      const data = await apiFetch<AdminAudio[]>("/api/admin/audios");
      setAudios(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audio.");
    } finally {
      setAudioLoading(false);
    }
  };

  useEffect(() => {
    loadVideos();
  }, []);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await apiFetchVoid("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ key })
      });
      setAuthState("authed");
      await loadVideos();
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Login failed.";
      setError(message);
    }
  };

  const handleLogout = async () => {
    await apiFetchVoid("/api/admin/logout", { method: "POST" });
    setAuthState("guest");
    setVideos([]);
    setAudios([]);
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    const cleanedTitle = title.trim();
    if (!cleanedTitle || !mp4File || !hlsFile) {
      setError("Title, MP4, and HLS ZIP are required.");
      return;
    }

    setCreating(true);
    setError(null);
    setUploadStatus(null);

    try {
      const videoId = crypto.randomUUID();

      setUploadStatus("Uploading MP4...");
      const pcContentType = mp4File.type || "video/mp4";
      const pcKey = await uploadToR2(
        { videoId },
        "pc.mp4",
        mp4File,
        pcContentType
      );

      let thumbKey: string | null = null;
      if (thumbFile) {
        const ext = thumbExtension(thumbFile);
        const thumbType = thumbContentType(thumbFile, ext);
        setUploadStatus("Uploading thumbnail...");
        thumbKey = await uploadToR2(
          { videoId },
          `thumb.${ext}`,
          thumbFile,
          thumbType
        );
      } else {
        setUploadStatus("Generating thumbnail...");
        const autoThumb = await generateThumbnailFromVideo(mp4File);
        setUploadStatus("Uploading thumbnail...");
        thumbKey = await uploadToR2(
          { videoId },
          "thumb.jpg",
          autoThumb,
          "image/jpeg"
        );
      }

      setUploadStatus("Extracting HLS ZIP...");
      const extracted = extractHlsEntries(await unzipFile(hlsFile));
      setUploadStatus(`Uploading HLS 0/${extracted.length} files`);
      await runWithConcurrency(
        extracted,
        HLS_CONCURRENCY,
        async (entry) => {
          const blob = new Blob([entry.data], { type: entry.contentType });
          await uploadToR2(
            { videoId },
            `hls/${entry.path}`,
            blob,
            entry.contentType
          );
        },
        (done, total) => {
          setUploadStatus(`Uploading HLS ${done}/${total} files`);
        }
      );

      const payload = {
        id: videoId,
        title: cleanedTitle,
        description: description.trim() || null,
        pc_key: pcKey,
        thumb_key: thumbKey || undefined,
        hls_master_key: `videos/${videoId}/hls/index.m3u8`,
        size_bytes: mp4File.size
      };

      setUploadStatus("Saving metadata...");
      await apiFetchVoid("/api/admin/videos", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      setTitle("");
      setDescription("");
      setMp4File(null);
      setThumbFile(null);
      setHlsFile(null);
      await loadVideos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setCreating(false);
      setUploadStatus(null);
    }
  };

  const handleEdit = async (id: string) => {
    setError(null);
    setEditingId(id);
    setSaving(true);
    try {
      const data = await apiFetch<AdminVideoDetail>(`/api/admin/videos/${id}`);
      setEditTitle(data.title);
      setEditDescription(data.description || "");
      setEditingSlug(data.slug);
      setEditingThumbKey(data.thumb_key || null);
      setEditMp4(null);
      setEditThumb(null);
      setEditHls(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
      setEditingId(null);
      setEditingSlug(null);
      setEditingThumbKey(null);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingId) return;

    setSaving(true);
    setError(null);
    setUploadStatus(null);
    try {
      const payload: Record<string, unknown> = {
        title: editTitle.trim(),
        description: editDescription.trim()
      };

      if (editMp4) {
        setUploadStatus("Uploading MP4...");
        const pcContentType = editMp4.type || "video/mp4";
        const pcKey = await uploadToR2(
          { videoId: editingId },
          "pc.mp4",
          editMp4,
          pcContentType
        );
        payload.pc_key = pcKey;
        payload.size_bytes = editMp4.size;
      }

      if (editThumb) {
        const ext = thumbExtension(editThumb);
        const thumbType = thumbContentType(editThumb, ext);
        setUploadStatus("Uploading thumbnail...");
        const thumbKey = await uploadToR2(
          { videoId: editingId },
          `thumb.${ext}`,
          editThumb,
          thumbType
        );
        payload.thumb_key = thumbKey;
      }

      if (editHls) {
        setUploadStatus("Extracting HLS ZIP...");
        const extracted = extractHlsEntries(await unzipFile(editHls));
        setUploadStatus(`Uploading HLS 0/${extracted.length} files`);
        await runWithConcurrency(
          extracted,
          HLS_CONCURRENCY,
          async (entry) => {
            const blob = new Blob([entry.data], { type: entry.contentType });
            await uploadToR2(
              { videoId: editingId },
              `hls/${entry.path}`,
              blob,
              entry.contentType
            );
          },
          (done, total) => {
            setUploadStatus(`Uploading HLS ${done}/${total} files`);
          }
        );
        payload.hls_master_key = `videos/${editingId}/hls/index.m3u8`;
      }

      setUploadStatus("Saving metadata...");
      await apiFetchVoid(`/api/admin/videos/${editingId}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });

      setEditingId(null);
      setEditingSlug(null);
      setEditingThumbKey(null);
      await loadVideos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setSaving(false);
      setUploadStatus(null);
    }
  };

  const handleCreateAudio = async (event: FormEvent) => {
    event.preventDefault();
    const cleanedTitle = audioTitle.trim();
    if (!cleanedTitle || !audioFile) {
      setError("Title and audio file are required.");
      return;
    }

    setCreatingAudio(true);
    setError(null);
    setUploadStatus(null);

    try {
      const audioId = crypto.randomUUID();
      const ext = audioExtension(audioFile);
      const audioType = audioContentType(audioFile, ext);
      setUploadStatus("Uploading audio...");
      const audioKey = await uploadToR2(
        { audioId },
        `audio.${ext}`,
        audioFile,
        audioType
      );

      let thumbKey: string | null = null;
      if (audioThumb) {
        const thumbExt = thumbExtension(audioThumb);
        const thumbType = thumbContentType(audioThumb, thumbExt);
        setUploadStatus("Uploading thumbnail...");
        thumbKey = await uploadToR2(
          { audioId },
          `thumb.${thumbExt}`,
          audioThumb,
          thumbType
        );
      }

      await apiFetchVoid("/api/admin/audios", {
        method: "POST",
        body: JSON.stringify({
          id: audioId,
          title: cleanedTitle,
          note_system_error: audioNote ? 1 : 0,
          audio_key: audioKey,
          thumb_key: thumbKey || undefined
        })
      });

      setAudioTitle("");
      setAudioNote(false);
      setAudioFile(null);
      setAudioThumb(null);
      await loadAudios();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setCreatingAudio(false);
      setUploadStatus(null);
    }
  };

  const handleEditAudio = async (id: string) => {
    setError(null);
    setEditingAudioId(id);
    setSavingAudio(true);
    try {
      const data = await apiFetch<AdminAudio>(`/api/admin/audios/${id}`);
      setEditAudioTitle(data.title);
      setEditAudioNote(Boolean(data.note_system_error));
      setEditAudioFile(null);
      setEditAudioThumb(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
      setEditingAudioId(null);
    } finally {
      setSavingAudio(false);
    }
  };

  const handleSaveAudio = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingAudioId) return;

    setSavingAudio(true);
    setError(null);
    setUploadStatus(null);

    try {
      const payload: Record<string, unknown> = {
        title: editAudioTitle.trim(),
        note_system_error: editAudioNote ? 1 : 0
      };

      if (editAudioFile) {
        const ext = audioExtension(editAudioFile);
        const audioType = audioContentType(editAudioFile, ext);
        setUploadStatus("Uploading audio...");
        const audioKey = await uploadToR2(
          { audioId: editingAudioId },
          `audio.${ext}`,
          editAudioFile,
          audioType
        );
        payload.audio_key = audioKey;
      }

      if (editAudioThumb) {
        const thumbExt = thumbExtension(editAudioThumb);
        const thumbType = thumbContentType(editAudioThumb, thumbExt);
        setUploadStatus("Uploading thumbnail...");
        const thumbKey = await uploadToR2(
          { audioId: editingAudioId },
          `thumb.${thumbExt}`,
          editAudioThumb,
          thumbType
        );
        payload.thumb_key = thumbKey;
      }

      setUploadStatus("Saving metadata...");
      await apiFetchVoid(`/api/admin/audios/${editingAudioId}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });

      setEditingAudioId(null);
      await loadAudios();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setSavingAudio(false);
      setUploadStatus(null);
    }
  };

  if (authState === "checking") {
    return (
      <Loading
        title="Doi xi nha"
        subtitle="Dang kiem tra quyen admin."
      />
    );
  }

  if (authState === "guest") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="glass-panel w-full max-w-sm p-8 space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-medium text-white">Admin Access</h1>
            <p className="text-sm text-white/50">
              Enter the admin panel key.
            </p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder="Admin key"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/20"
              required
            />
            <button
              type="submit"
              className="w-full rounded-xl bg-white/10 text-white/90 py-3 text-sm font-medium hover:bg-white/20 transition"
            >
              Unlock admin
            </button>
          </form>
          {error ? <p className="text-sm text-white/60">{error}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-5 py-8 md:px-10">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-medium text-white">Admin Vault</h1>
            <p className="text-sm text-white/50">
              Create and manage video assets.
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-white/60 hover:text-white/90 transition"
          >
            Logout
          </button>
        </div>

        <div className="glass-panel p-6 space-y-4">
          <div className="text-sm text-white/70">Create new video</div>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Title"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/20"
                required
              />
              <input
                type="text"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Description (optional)"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/20"
              />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-xs text-white/50 space-y-1">
                <span>PC MP4 (required)</span>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(event) =>
                    setMp4File(event.target.files?.[0] || null)
                  }
                  className="w-full text-sm text-white/70"
                  required
                />
              </label>
              <label className="text-xs text-white/50 space-y-1">
                <span>Thumbnail (optional)</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    setThumbFile(event.target.files?.[0] || null)
                  }
                  className="w-full text-sm text-white/70"
                />
              </label>
              <label className="text-xs text-white/50 space-y-1">
                <span>HLS ZIP (required)</span>
                <input
                  type="file"
                  accept=".zip"
                  onChange={(event) =>
                    setHlsFile(event.target.files?.[0] || null)
                  }
                  className="w-full text-sm text-white/70"
                  required
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 rounded-xl bg-white/10 text-sm text-white/90 disabled:opacity-50"
            >
              {creating ? "Uploading..." : "Create video"}
            </button>
            {creating && uploadStatus ? (
              <div className="text-xs text-white/50">{uploadStatus}</div>
            ) : null}
          </form>
        </div>

        {editingId ? (
          <div className="glass-panel p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-white/70">Edit video</div>
              <button
                onClick={() => {
                  setEditingId(null);
                  setEditingSlug(null);
                  setEditingThumbKey(null);
                }}
                className="text-xs text-white/50 hover:text-white/80"
              >
                Cancel
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  placeholder="Title"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/20"
                  required
                />
                <input
                  type="text"
                  value={editDescription}
                  onChange={(event) => setEditDescription(event.target.value)}
                  placeholder="Description"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/20"
                />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="text-xs text-white/50 space-y-1">
                  <span>Replace MP4</span>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(event) =>
                      setEditMp4(event.target.files?.[0] || null)
                    }
                    className="w-full text-sm text-white/70"
                  />
                </label>
                <label className="text-xs text-white/50 space-y-1">
                  <span>Replace thumbnail</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) =>
                      setEditThumb(event.target.files?.[0] || null)
                    }
                    className="w-full text-sm text-white/70"
                  />
                </label>
                <label className="text-xs text-white/50 space-y-1">
                  <span>Replace HLS ZIP</span>
                  <input
                    type="file"
                    accept=".zip"
                    onChange={(event) =>
                      setEditHls(event.target.files?.[0] || null)
                    }
                    className="w-full text-sm text-white/70"
                  />
                </label>
              </div>
              {editingSlug && editingThumbKey ? (
                <img
                  src={`/api/videos/${editingSlug}/thumb`}
                  alt=""
                  className="h-24 w-40 rounded-lg object-cover border border-white/10"
                />
              ) : null}
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-white/10 text-sm text-white/90 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
              {saving && uploadStatus ? (
                <div className="text-xs text-white/50">{uploadStatus}</div>
              ) : null}
            </form>
          </div>
        ) : null}

        <div className="glass-panel p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-white/70">Videos</div>
            {loading ? (
              <div className="text-xs text-white/40">Loading...</div>
            ) : null}
          </div>

          <div className="grid gap-3">
            {videos.map((video) => (
              <div
                key={video.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  {video.thumb_key ? (
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
                  onClick={() => handleEdit(video.id)}
                  className="px-3 py-1.5 rounded-lg bg-white/10 text-xs text-white/80 hover:bg-white/20"
                >
                  Edit
                </button>
              </div>
            ))}
            {videos.length === 0 && !loading ? (
              <div className="text-xs text-white/40">No videos yet.</div>
            ) : null}
          </div>
        </div>

        <div className="glass-panel p-6 space-y-4">
          <div className="text-sm text-white/70">Create new audio</div>
          <form onSubmit={handleCreateAudio} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <input
                type="text"
                value={audioTitle}
                onChange={(event) => setAudioTitle(event.target.value)}
                placeholder="Title"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/20"
                required
              />
              <label className="text-xs text-white/60 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={audioNote}
                  onChange={(event) => setAudioNote(event.target.checked)}
                  className="h-4 w-4"
                />
                Do lỗi hệ thống không ghi lại được hình ảnh
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs text-white/50 space-y-1">
                <span>Audio file (required)</span>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(event) =>
                    setAudioFile(event.target.files?.[0] || null)
                  }
                  className="w-full text-sm text-white/70"
                  required
                />
              </label>
              <label className="text-xs text-white/50 space-y-1">
                <span>Thumbnail (optional)</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    setAudioThumb(event.target.files?.[0] || null)
                  }
                  className="w-full text-sm text-white/70"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={creatingAudio}
              className="px-4 py-2 rounded-xl bg-white/10 text-sm text-white/90 disabled:opacity-50"
            >
              {creatingAudio ? "Uploading..." : "Create audio"}
            </button>
            {creatingAudio && uploadStatus ? (
              <div className="text-xs text-white/50">{uploadStatus}</div>
            ) : null}
          </form>
        </div>

        {editingAudioId ? (
          <div className="glass-panel p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-white/70">Edit audio</div>
              <button
                onClick={() => setEditingAudioId(null)}
                className="text-xs text-white/50 hover:text-white/80"
              >
                Cancel
              </button>
            </div>
            <form onSubmit={handleSaveAudio} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <input
                  type="text"
                  value={editAudioTitle}
                  onChange={(event) => setEditAudioTitle(event.target.value)}
                  placeholder="Title"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/90 focus:outline-none focus:ring-1 focus:ring-white/20"
                  required
                />
                <label className="text-xs text-white/60 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editAudioNote}
                    onChange={(event) => setEditAudioNote(event.target.checked)}
                    className="h-4 w-4"
                  />
                  Do lỗi hệ thống không ghi lại được hình ảnh
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs text-white/50 space-y-1">
                  <span>Replace audio</span>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(event) =>
                      setEditAudioFile(event.target.files?.[0] || null)
                    }
                    className="w-full text-sm text-white/70"
                  />
                </label>
                <label className="text-xs text-white/50 space-y-1">
                  <span>Replace thumbnail</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) =>
                      setEditAudioThumb(event.target.files?.[0] || null)
                    }
                    className="w-full text-sm text-white/70"
                  />
                </label>
              </div>
              <button
                type="submit"
                disabled={savingAudio}
                className="px-4 py-2 rounded-xl bg-white/10 text-sm text-white/90 disabled:opacity-50"
              >
                {savingAudio ? "Saving..." : "Save changes"}
              </button>
              {savingAudio && uploadStatus ? (
                <div className="text-xs text-white/50">{uploadStatus}</div>
              ) : null}
            </form>
          </div>
        ) : null}

        <div className="glass-panel p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-white/70">Audios</div>
            {audioLoading ? (
              <div className="text-xs text-white/40">Loading...</div>
            ) : null}
          </div>

          <div className="grid gap-3">
            {audios.map((audio) => (
              <div
                key={audio.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  {audio.thumb_key ? (
                    <img
                      src={`/media/${audio.thumb_key}`}
                      alt=""
                      className="h-10 w-10 rounded-md object-cover border border-white/10"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-xs text-white/40">
                      Audio
                    </div>
                  )}
                  <div>
                    <div className="text-sm text-white/90">{audio.title}</div>
                    {audio.note_system_error ? (
                      <div className="text-xs text-white/40">
                        Do lỗi hệ thống không ghi lại được hình ảnh
                      </div>
                    ) : null}
                  </div>
                </div>
                <button
                  onClick={() => handleEditAudio(audio.id)}
                  className="px-3 py-1.5 rounded-lg bg-white/10 text-xs text-white/80 hover:bg-white/20"
                >
                  Edit
                </button>
              </div>
            ))}
            {audios.length === 0 && !audioLoading ? (
              <div className="text-xs text-white/40">No audios yet.</div>
            ) : null}
          </div>
        </div>

        {error ? <div className="text-sm text-white/60">{error}</div> : null}
      </div>
    </div>
  );
}
