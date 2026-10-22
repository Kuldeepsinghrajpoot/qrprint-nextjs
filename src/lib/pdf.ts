import { PDFDocument } from "pdf-lib";

const WORD_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const ZIP_TYPES = new Set(["application/zip", "application/x-zip-compressed", "application/x-zip"]);

export function isAutoDetectable(file: File): boolean {
  return file.type === "application/pdf" || file.type.startsWith("image/");
}

export function isWordDoc(file: File): boolean {
  return WORD_TYPES.has(file.type) || /\.docx?$/i.test(file.name);
}

export function isZipFile(file: File): boolean {
  return ZIP_TYPES.has(file.type) || /\.zip$/i.test(file.name);
}

/**
 * Detects the number of pages in an uploaded file, entirely client-side
 * (no server round-trip needed just to know the page count).
 * - PDFs: parsed with pdf-lib to get the exact page count.
 * - Images (JPEG/PNG): always counted as 1 page.
 * - Word docs / ZIPs: genuinely can't be page-counted in the browser
 *   without a heavy conversion step, so this returns 0 ("unknown") and
 *   the customer page asks for an estimate instead of guessing silently.
 */
export async function detectPageCount(file: File): Promise<number> {
  if (file.type === "application/pdf") {
    try {
      const bytes = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      return pdfDoc.getPageCount();
    } catch {
      // Corrupt/encrypted/unreadable PDF — fall back to a safe default
      return 1;
    }
  }

  if (file.type.startsWith("image/")) {
    return 1;
  }

  return 0; // unknown — caller should prompt for a manual estimate
}
