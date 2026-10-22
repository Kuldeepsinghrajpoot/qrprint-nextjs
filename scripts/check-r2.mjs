// Quick Cloudflare R2 connectivity check.
// Run from the project folder:  node --env-file=.env.local scripts/check-r2.mjs
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";

const clean = (v) => (v ?? "").trim().replace(/^["']|["']$/g, "");
const accountId = clean(process.env.R2_ACCOUNT_ID);
const accessKeyId = clean(process.env.R2_ACCESS_KEY_ID);
const secretAccessKey = clean(process.env.R2_SECRET_ACCESS_KEY);
const bucket = clean(process.env.R2_BUCKET_NAME) || "qrtoprint-files";
const endpoint = clean(process.env.R2_ENDPOINT) || `https://${accountId}.r2.cloudflarestorage.com`;

console.log("Account ID length :", accountId.length, accountId.length === 32 ? "(ok)" : "(should be 32!)");
console.log("Access Key ID len :", accessKeyId.length, accessKeyId.length === 32 ? "(ok)" : "(R2 access key IDs are 32 chars)");
console.log("Secret length     :", secretAccessKey.length, secretAccessKey.length === 64 ? "(ok)" : "(R2 secrets are 64 chars)");
console.log("Bucket            :", bucket);
console.log("Endpoint          :", endpoint, "\n");

const client = new S3Client({ region: "auto", endpoint, credentials: { accessKeyId, secretAccessKey } });

try {
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  console.log("✅ R2 connection OK — bucket reachable.");
} catch (e) {
  const msg = String(e?.message ?? e);
  console.log("❌ Failed:", e?.name, "-", msg, "\n");
  if (/EPROTO|handshake/i.test(msg))
    console.log("→ TLS handshake failed: Account ID is wrong (must be the 32-char Account ID), or your ISP/VPN/antivirus is blocking *.r2.cloudflarestorage.com (try a mobile hotspot or DNS 1.1.1.1).");
  else if (/403|AccessDenied|Forbidden|SignatureDoesNotMatch|InvalidAccessKeyId/i.test(msg + e?.name))
    console.log("→ Keys rejected: use the S3 'Access Key ID' + 'Secret Access Key' from R2 → Manage API tokens (not the general Cloudflare API token), with Object Read & Write on this bucket.");
  else if (/NoSuchBucket|404|NotFound/i.test(msg + e?.name))
    console.log("→ Bucket name wrong: check R2_BUCKET_NAME matches the bucket exactly.");
}
