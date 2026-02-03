import { useMemo, useState, useCallback } from "react";
import { apiFetch, apiFetchVoid, ApiError } from "../api/client";

type CreateUploadResponse = {
  videoId: string;
  slug: string;
  r2Key: string;
  uploadId: string;
  partSize: number;
  parts: Array<{ partNumber: number; url: string }>;
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

  const handleCreate = async () => {
    if (!file || !title || !adminKey) return;
    setError(null);
    setStatus("creating");

    try {
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
            contentType: file.type
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
      setStatus("idle");
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Unable to start upload.";
      setError(message);
      setStatus("idle");
    }
  };

  const uploadPart = (part: UploadPart, blob: Blob) => {
    return new Promise<string>((resolve, reject) => {
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
          const etag = xhr
            .getResponseHeader("ETag")
            ?.replace(/\"/g, "")
            .trim();
          if (!etag) {
            reject(new Error("Missing ETag"));
            return;
          }
          resolve(etag);
        } else {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      };

      xhr.onerror = () => reject(new Error("Upload failed"));

      xhr.send(blob);
    });
  };

  const runUploadQueue = async (queueParts: UploadPart[]) => {
    if (!file || !session) return;
    setStatus("uploading");

    const queue = queueParts.filter((part) => part.status !== "done");
    let index = 0;
    let active = 0;
    let completed = 0;

    return new Promise<void>((resolve) => {
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
                etag
              });
            })
            .catch(() => {
              updatePart(part.partNumber, { status: "error" });
            })
            .finally(() => {
              active -= 1;
              completed += 1;
              if (completed === queue.length) {
                resolve();
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
          parts: parts.map((part) => ({
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
    await runUploadQueue(parts);
    setStatus("idle");
  };

  const handleRetryFailed = async () => {
    setError(null);
    const nextParts = parts.map((part) =>
      part.status === "error" ? { ...part, status: "pending" } : part
    );
    setParts(nextParts);
    await runUploadQueue(nextParts);
    setStatus("idle");
  };

  const canStart = Boolean(file && title && adminKey);

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
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              className="w-full text-sm text-white/70"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleCreate}
              disabled={!canStart || status === "creating"}
              className="px-4 py-2 rounded-xl bg-white/10 text-sm text-white/90 disabled:opacity-50"
            >
              {status === "creating" ? "Preparing…" : "Prepare upload"}
            </button>
            <button
              onClick={handleUpload}
              disabled={!session || status === "uploading"}
              className="px-4 py-2 rounded-xl bg-white/10 text-sm text-white/80 disabled:opacity-50"
            >
              {status === "uploading" ? "Uploading…" : "Upload parts"}
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
              {status === "completing" ? "Finalizing…" : "Complete upload"}
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
                    {part.status} · {Math.round(part.progress * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
