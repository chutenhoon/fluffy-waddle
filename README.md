# Memory Video Vault

A calm, private memory vault for large personal videos. Built for Cloudflare Pages + Pages Functions with D1 metadata and R2 storage.

## Setup

1. Install dependencies:
   - `npm install`
2. Build the SPA:
   - `npm run build`
3. Deploy to Cloudflare Pages and connect the repository.
4. Bind the database and bucket in Pages settings (see bindings below).
5. Set environment variables in Pages settings (see env vars below).
6. Run the D1 migration in the Cloudflare dashboard using `migrations/0001_init.sql`.

## Bindings (Cloudflare Pages)

- D1 database binding: `DB`
- R2 bucket binding: `R2_VIDEOS`

## Environment Variables

- `VMS_KEY` - access key for the vault login
- `ADMIN_KEY` - admin key for uploads
- `SESSION_SECRET` - HMAC secret for session tokens
- `APP_NAME` - display name returned by `/api/auth/me`
- `R2_S3_ACCESS_KEY_ID` - R2 S3 access key ID
- `R2_S3_SECRET_ACCESS_KEY` - R2 S3 secret access key
- `R2_S3_ENDPOINT` - R2 S3 endpoint (ex: `https://<accountid>.r2.cloudflarestorage.com`)
- `R2_S3_BUCKET` - bucket name for video storage

## Cloudflare Pages Build Settings

Use these values to avoid a blank page in production:

- Framework preset: `Vite`
- Build command: `npm run build`
- Build output directory: `dist`
- Functions directory: `functions`

This repo includes `public/_redirects` to support SPA routing.

## Local Dev Notes

- `npm run dev` starts the Vite dev server for the SPA.
- API routes and uploads require the deployed Pages Functions environment.
- The app expects secure cookies, so login flows should be tested over HTTPS.

## Routes

Frontend
- `/login` - vault login
- `/` - video gallery
- `/watch/:slug` - video playback
- `/admin` - upload panel

API
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET  /api/auth/me`
- `GET  /api/videos`
- `GET /api/videos/:slug`
- `GET /api/videos/:slug/stream`
- `POST /api/admin/uploads/create`
- `POST /api/admin/uploads/complete`

## Data Model

Table: `videos`
- `id` TEXT PRIMARY KEY
- `slug` TEXT UNIQUE
- `title` TEXT
- `r2_key` TEXT
- `size_bytes` INTEGER
- `created_at` TEXT (ISO)
- `updated_at` TEXT (ISO)
- `status` TEXT

Additional table used for rate limiting:
- `login_attempts`

## Upload Flow

1. Admin prepares an upload at `/admin` (creates multipart upload + presigned URLs).
2. The client uploads parts directly to R2.
3. On completion, the client finalizes the upload and metadata is stored in D1.

## Streaming

Video playback is served through `/api/videos/:slug/stream` with HTTP Range support and no public caching.
