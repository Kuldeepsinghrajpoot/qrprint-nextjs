import fs from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

/**
 * Cloudflare R2 is S3-API compatible, so we use the standard AWS SDK
 * pointed at R2's endpoint. This keeps the code portable — swapping to
 * AWS S3 or Supabase Storage later only means changing env vars/endpoint.
 */
/** True when real R2 credentials are present (placeholder values from .env.local.example don't count). */
function isR2Configured(): boolean {
  const { R2_ACCOUNT_ID: a, R2_ACCESS_KEY_ID: k, R2_SECRET_ACCESS_KEY: s } = process.env;
  return Boolean(a && k && s && !a.startsWith("your_") && !k.startsWith("your_") && !s.startsWith("your_"));
}

/**
 * Supabase Storage (free plan, no credit card): used when SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY are set. Takes priority over R2 so you can leave R2 blank.
 */
function isSupabaseConfigured(): boolean {
  const url = cleanEnv(process.env.SUPABASE_URL);
  const key = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return Boolean(url && key && !url.startsWith("your_") && !key.startsWith("your_"));
}
/**
 * Local-disk storage. Active when:
 *   - STORAGE_MODE=local (works in production too — for a shop that runs the app on its own PC/server), or
 *   - in development when no cloud storage (Supabase/R2) is configured.
 * Files live in LOCAL_UPLOAD_DIR (default ./.local-uploads) and are served by /api/files/...
 * Needs a persistent disk — NOT suitable for Vercel/serverless hosting.
 */
function shouldUseLocalStorage(): boolean {
  if (cleanEnv(process.env.STORAGE_MODE).toLowerCase() === "local") return true;
  return process.env.NODE_ENV !== "production" && !isSupabaseConfigured() && !isR2Configured();
}

/** Used by /api/files to decide whether it may serve local files. */
export function isLocalStorageEnabled(): boolean {
  return shouldUseLocalStorage();
}

export const LOCAL_UPLOAD_DIR = cleanEnv(process.env.LOCAL_UPLOAD_DIR)
  ? path.resolve(cleanEnv(process.env.LOCAL_UPLOAD_DIR))
  : path.join(process.cwd(), ".local-uploads");

function localUrl(key: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/files/${key}`;
}

/** Strips stray spaces/quotes that often sneak in when pasting values into .env.local. */
function cleanEnv(v?: string): string {
  return (v ?? "").trim().replace(/^["']|["']$/g, "");
}

const SB_BUCKET = () => cleanEnv(process.env.SUPABASE_BUCKET) || "qrtoprint-files";
const sbBase = () => cleanEnv(process.env.SUPABASE_URL).replace(/\/+$/, "");
const sbKey = () => cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

/** Bucket must be PUBLIC so the Print Agent can download by URL (names are timestamped, not guessable). */
function supabasePublicUrl(key: string): string {
  return `${sbBase()}/storage/v1/object/public/${SB_BUCKET()}/${key}`;
}

async function supabaseErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.message || body.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

function getR2Client() {
  // Accept a pasted full URL / hostname too, and keep just the 32-char account ID.
  const accountId = cleanEnv(process.env.R2_ACCOUNT_ID)
    .replace(/^https?:\/\//, "")
    .replace(/\.r2\.cloudflarestorage\.com.*$/, "");
  const accessKeyId = cleanEnv(process.env.R2_ACCESS_KEY_ID);
  const secretAccessKey = cleanEnv(process.env.R2_SECRET_ACCESS_KEY);

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Cloudflare R2 credentials missing. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in .env.local"
    );
  }

  // Optional full endpoint override (needed for EU-jurisdiction buckets:
  // https://<account_id>.eu.r2.cloudflarestorage.com)
  const endpointOverride = cleanEnv(process.env.R2_ENDPOINT);

  // A wrong account ID makes Cloudflare reject the TLS handshake ("EPROTO ... alert number 40"),
  // so catch it early with a readable message instead of a cryptic SSL error.
  if (!endpointOverride && !/^[a-f0-9]{32}$/i.test(accountId)) {
    throw new Error(
      "R2_ACCOUNT_ID looks wrong — it must be the 32-character Account ID (Cloudflare Dashboard → R2 → Overview), not the bucket name, API token or a URL."
    );
  }

  return new S3Client({
    region: "auto",
    endpoint: endpointOverride || `https://${accountId}.r2.cloudflarestorage.com`,
    // Path-style (endpoint/bucket/key) avoids the "<bucket>.<account>.r2.cloudflarestorage.com"
    // hostname, which is a common cause of TLS handshake failures with R2.
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
}

const BUCKET = cleanEnv(process.env.R2_BUCKET_NAME) || "qrtoprint-files";
const PUBLIC_URL = cleanEnv(process.env.R2_PUBLIC_URL).replace(/\/$/, "") || undefined;

/** Uploads a file buffer to R2 and returns its public URL + storage key. */
export async function uploadToR2(
  fileBuffer: Buffer,
  fileName: string,
  contentType: string
): Promise<{ key: string; url: string }> {
  const key = `orders/${Date.now()}-${randomBytes(6).toString("hex")}-${fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;

  if (shouldUseLocalStorage()) {
    await fs.mkdir(path.join(LOCAL_UPLOAD_DIR, "orders"), { recursive: true });
    await fs.writeFile(path.join(LOCAL_UPLOAD_DIR, key), fileBuffer);
    return { key, url: localUrl(key) };
  }

  if (isSupabaseConfigured()) {
    const res = await fetch(`${sbBase()}/storage/v1/object/${SB_BUCKET()}/${key}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sbKey()}`,
        apikey: sbKey(),
        "Content-Type": contentType,
      },
      body: new Uint8Array(fileBuffer),
    });
    if (!res.ok) throw new Error(`Supabase upload failed: ${await supabaseErrorMessage(res)}`);
    return { key, url: supabasePublicUrl(key) };
  }

  const client = getR2Client();

  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    })
  );

  const url = PUBLIC_URL ? `${PUBLIC_URL}/${key}` : key;
  return { key, url };
}

/** Builds the public URL for a storage key server-side (never trust a client-sent URL). */
export function publicUrlForKey(key: string): string {
  if (shouldUseLocalStorage()) return localUrl(key);
  if (isSupabaseConfigured()) return supabasePublicUrl(key);
  return PUBLIC_URL ? `${PUBLIC_URL}/${key}` : key;
}

/** Deletes a file from R2 — used for the "auto-delete after print" privacy feature. */
export async function deleteFromR2(key: string): Promise<void> {
  if (shouldUseLocalStorage()) {
    await fs.rm(path.join(LOCAL_UPLOAD_DIR, key), { force: true });
    return;
  }
  if (isSupabaseConfigured()) {
    const res = await fetch(`${sbBase()}/storage/v1/object/${SB_BUCKET()}/${key}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${sbKey()}`, apikey: sbKey() },
    });
    if (!res.ok && res.status !== 404) throw new Error(`Supabase delete failed: ${await supabaseErrorMessage(res)}`);
    return;
  }
  const client = getR2Client();
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
