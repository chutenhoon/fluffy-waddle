import type { Env } from "./env";
import { presignUrl, signRequest } from "./aws";

const REGION = "auto";
const PRESIGN_EXPIRES = 3600;

function normalizeEndpoint(endpoint: string) {
  return endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
}

export function buildObjectUrl(env: Env, key: string) {
  const endpoint = normalizeEndpoint(env.R2_S3_ENDPOINT);
  const bucket = env.R2_S3_BUCKET;

  try {
    const url = new URL(endpoint);
    const path = url.pathname.replace(/\/+$/, "");
    if (path && path !== "/") {
      const segments = path.split("/").filter(Boolean);
      const last = segments[segments.length - 1];
      if (last === bucket) {
        return `${endpoint}/${key}`;
      }
    }
  } catch {
    // If the endpoint is not a valid URL, fall back to naive concatenation.
  }

  return `${endpoint}/${bucket}/${key}`;
}

export async function createMultipartUpload(
  env: Env,
  key: string,
  contentType: string
) {
  const url = `${buildObjectUrl(env, key)}?uploads`;
  const headers = await signRequest({
    method: "POST",
    url,
    headers: {
      "content-type": contentType
    },
    body: "",
    accessKeyId: env.R2_S3_ACCESS_KEY_ID,
    secretAccessKey: env.R2_S3_SECRET_ACCESS_KEY,
    region: REGION
  });

  const response = await fetch(url, {
    method: "POST",
    headers
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Create upload failed: ${body}`);
  }

  const xml = await response.text();
  const match = /<UploadId>([^<]+)<\/UploadId>/.exec(xml);
  if (!match) {
    throw new Error("UploadId not found");
  }

  return match[1];
}

export async function presignPartUpload(
  env: Env,
  key: string,
  uploadId: string,
  partNumber: number
) {
  const url = buildObjectUrl(env, key);
  return presignUrl({
    method: "PUT",
    url,
    query: {
      partNumber: partNumber.toString(),
      uploadId
    },
    accessKeyId: env.R2_S3_ACCESS_KEY_ID,
    secretAccessKey: env.R2_S3_SECRET_ACCESS_KEY,
    region: REGION,
    expires: PRESIGN_EXPIRES
  });
}

export async function completeMultipartUpload(
  env: Env,
  key: string,
  uploadId: string,
  parts: Array<{ partNumber: number; etag: string }>
) {
  const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<CompleteMultipartUpload>\n${sorted
    .map(
      (part) =>
        `  <Part><PartNumber>${part.partNumber}</PartNumber><ETag>"${part.etag}"</ETag></Part>`
    )
    .join("\n")}\n</CompleteMultipartUpload>`;

  const url = `${buildObjectUrl(env, key)}?uploadId=${encodeURIComponent(
    uploadId
  )}`;

  const headers = await signRequest({
    method: "POST",
    url,
    headers: {
      "content-type": "application/xml"
    },
    body,
    accessKeyId: env.R2_S3_ACCESS_KEY_ID,
    secretAccessKey: env.R2_S3_SECRET_ACCESS_KEY,
    region: REGION
  });

  const response = await fetch(url, {
    method: "POST",
    headers,
    body
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Complete upload failed: ${text}`);
  }
}
