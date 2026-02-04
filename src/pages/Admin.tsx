import { FormEvent, useEffect, useState } from "react";
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

type AuthState = "checking" | "guest" | "authed";

export default function Admin() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [videos, setVideos] = useState<AdminVideo[]>([]);
  const [loading, setLoading] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mp4File, setMp4File] = useState<File | null>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [hlsFile, setHlsFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editingThumbKey, setEditingThumbKey] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editMp4, setEditMp4] = useState<File | null>(null);
  const [editThumb, setEditThumb] = useState<File | null>(null);
  const [editHls, setEditHls] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const loadVideos = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<AdminVideo[]>("/api/admin/videos");
      setVideos(data || []);
      setAuthState("authed");
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
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!title || !mp4File || !hlsFile) {
      setError("Title, MP4, and HLS ZIP are required.");
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("title", title);
      if (description) form.append("description", description);
      form.append("mp4", mp4File);
      if (thumbFile) form.append("thumb", thumbFile);
      form.append("hls_zip", hlsFile);

      const response = await fetch("/api/admin/videos", {
        method: "POST",
        body: form,
        credentials: "include"
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Upload failed.");
      }

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
    try {
      const form = new FormData();
      form.append("title", editTitle);
      form.append("description", editDescription);
      if (editMp4) form.append("mp4", editMp4);
      if (editThumb) form.append("thumb", editThumb);
      if (editHls) form.append("hls_zip", editHls);

      const response = await fetch(`/api/admin/videos/${editingId}`, {
        method: "PUT",
        body: form,
        credentials: "include"
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Update failed.");
      }

      setEditingId(null);
      setEditingSlug(null);
      setEditingThumbKey(null);
      await loadVideos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setSaving(false);
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

        {error ? <div className="text-sm text-white/60">{error}</div> : null}
      </div>
    </div>
  );
}
