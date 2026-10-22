/** Upload rules shared by /api/upload and /api/upload/sign. */
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB — generous for a print job, cheap to enforce
export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
  "application/x-zip-compressed",
]);
