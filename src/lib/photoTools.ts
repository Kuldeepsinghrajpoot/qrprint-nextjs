/**
 * All photo editing here runs entirely in the browser using the native
 * Canvas API — no extra libraries needed. Each function produces a single
 * composed JPEG Blob, which then flows through the normal upload → price →
 * pay → print pipeline exactly like any other uploaded file.
 */

export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      resolve(img);
      // Keep the object URL alive only as long as needed for drawing.
    };
    img.onerror = reject;
    img.src = url;
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not export image"))), "image/jpeg", quality);
  });
}

/** Draws `img` into a cell of size (cellW x cellH) using "cover" cropping (fills the cell, crops overflow). */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, cellW: number, cellH: number) {
  const imgRatio = img.width / img.height;
  const cellRatio = cellW / cellH;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;

  if (imgRatio > cellRatio) {
    // Image is wider than the cell — crop the sides
    sw = img.height * cellRatio;
    sx = (img.width - sw) / 2;
  } else {
    // Image is taller than the cell — crop top/bottom
    sh = img.width / cellRatio;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, cellW, cellH);
}

/** Draws `img` into a cell using "contain" fitting (shows the whole image, letterboxed — never crops). Used for ID cards where cropping would cut off part of the card. */
function drawContain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, cellW: number, cellH: number) {
  const imgRatio = img.width / img.height;
  const cellRatio = cellW / cellH;
  let drawW = cellW, drawH = cellH;

  if (imgRatio > cellRatio) {
    drawH = cellW / imgRatio;
  } else {
    drawW = cellH * imgRatio;
  }
  const dx = x + (cellW - drawW) / 2;
  const dy = y + (cellH - drawH) / 2;
  ctx.drawImage(img, dx, dy, drawW, drawH);
}

// ---------------------------------------------------------------------------
// A. Scan Document — makes a phone-camera photo of a document look more
//    like a proper flatbed scan (grayscale + contrast boost)
// ---------------------------------------------------------------------------

export async function enhanceScan(file: File, mode: "bw" | "color" = "bw"): Promise<Blob> {
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const contrast = 1.35; // punch up contrast so text reads crisp, like a scanner
  const intercept = 128 * (1 - contrast);

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];
    if (mode === "bw") {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = g = b = gray;
    }
    data[i] = clamp255(r * contrast + intercept);
    data[i + 1] = clamp255(g * contrast + intercept);
    data[i + 2] = clamp255(b * contrast + intercept);
  }

  ctx.putImageData(imageData, 0, 0);
  return canvasToJpegBlob(canvas, 0.9);
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, v));
}

// ---------------------------------------------------------------------------
// B. ID Card — front & back on a single sheet (e.g. Aadhaar, PAN, driving
//    licence). Uses "contain" so no part of the card ever gets cropped off.
// ---------------------------------------------------------------------------

export async function composeIdCardFrontBack(front: File, back: File, sheet: "A4" | "Photo" = "A4"): Promise<Blob> {
  const CANVAS_W = 1600;
  const CANVAS_H = sheet === "A4" ? Math.round((CANVAS_W * 29.7) / 21) : CANVAS_W;
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const [frontImg, backImg] = await Promise.all([loadImage(front), loadImage(back)]);

  const margin = 40;
  const labelHeight = 36;
  const cellH = (CANVAS_H - margin * 3) / 2 - labelHeight;
  const cellW = CANVAS_W - margin * 2;

  ctx.font = "bold 28px sans-serif";
  ctx.fillStyle = "#334155";
  ctx.textBaseline = "top";

  ctx.fillText("FRONT", margin, margin);
  drawContain(ctx, frontImg, margin, margin + labelHeight, cellW, cellH);

  const secondY = margin + labelHeight + cellH + margin;
  ctx.fillText("BACK", margin, secondY);
  drawContain(ctx, backImg, margin, secondY + labelHeight, cellW, cellH);

  return canvasToJpegBlob(canvas);
}

export interface CollageLayout {
  cols: number;
  rows: number;
}

export const COLLAGE_LAYOUTS: Record<string, CollageLayout> = {
  "2 photos (1×2)": { cols: 2, rows: 1 },
  "3 photos (1×3)": { cols: 3, rows: 1 },
  "4 photos (2×2)": { cols: 2, rows: 2 },
  "6 photos (2×3)": { cols: 3, rows: 2 },
  "9 photos (3×3)": { cols: 3, rows: 3 },
};

export async function composeCollage(files: File[], layout: CollageLayout, gapPx = 12): Promise<Blob> {
  const CANVAS_SIZE = 1600;
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cellW = (CANVAS_SIZE - gapPx * (layout.cols + 1)) / layout.cols;
  const cellH = (CANVAS_SIZE - gapPx * (layout.rows + 1)) / layout.rows;

  const images = await Promise.all(files.slice(0, layout.cols * layout.rows).map(loadImage));

  images.forEach((img, i) => {
    const col = i % layout.cols;
    const row = Math.floor(i / layout.cols);
    const x = gapPx + col * (cellW + gapPx);
    const y = gapPx + row * (cellH + gapPx);
    drawCover(ctx, img, x, y, cellW, cellH);
  });

  return canvasToJpegBlob(canvas);
}

// ---------------------------------------------------------------------------
// 2. Text / date-stamp overlay on a single photo
// ---------------------------------------------------------------------------

export interface TextOverlayOptions {
  text: string;
  includeDate: boolean;
  position: "top" | "bottom";
  color: string; // e.g. "#ffffff"
}

export async function composeTextOverlay(file: File, options: TextOverlayOptions): Promise<Blob> {
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

  const label = [options.text.trim(), options.includeDate ? new Date().toLocaleDateString() : ""]
    .filter(Boolean)
    .join("  •  ");

  if (label) {
    const fontSize = Math.max(18, Math.round(img.width * 0.035));
    ctx.font = `bold ${fontSize}px sans-serif`;
    const padding = fontSize * 0.8;
    const textWidth = ctx.measureText(label).width;
    const boxHeight = fontSize + padding;
    const y = options.position === "top" ? 0 : canvas.height - boxHeight;

    // Semi-transparent strip behind the text so it stays readable on any photo
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, y, canvas.width, boxHeight);

    ctx.fillStyle = options.color || "#ffffff";
    ctx.textBaseline = "middle";
    ctx.fillText(label, (canvas.width - textWidth) / 2, y + boxHeight / 2);
  }

  return canvasToJpegBlob(canvas);
}

// ---------------------------------------------------------------------------
// 3. Batch resize — multiple photos, each cropped to a fixed size (e.g.
//    passport photo), auto-arranged onto one printable sheet
// ---------------------------------------------------------------------------

export const SIZE_PRESETS_CM: Record<string, { w: number; h: number }> = {
  "Passport (3.5 × 4.5 cm)": { w: 3.5, h: 4.5 },
  "Stamp size (2 × 2.5 cm)": { w: 2, h: 2.5 },
  "Postcard (10 × 15 cm)": { w: 10, h: 15 },
};

const SHEET_SIZES_CM: Record<"A4" | "Photo", { w: number; h: number }> = {
  A4: { w: 21, h: 29.7 },
  Photo: { w: 10, h: 15 },
};

const DPI = 300;
const cmToPx = (cm: number) => Math.round((cm * DPI) / 2.54);

export interface BatchResizeResult {
  blob: Blob;
  fitted: number;
  total: number;
}

export async function composeBatchResize(
  files: File[],
  targetSizeCm: { w: number; h: number },
  sheet: "A4" | "Photo",
  gapPx = 10
): Promise<BatchResizeResult> {
  const sheetCm = SHEET_SIZES_CM[sheet];
  const sheetWPx = cmToPx(sheetCm.w);
  const sheetHPx = cmToPx(sheetCm.h);
  const cellWPx = cmToPx(targetSizeCm.w);
  const cellHPx = cmToPx(targetSizeCm.h);

  const cols = Math.max(1, Math.floor((sheetWPx + gapPx) / (cellWPx + gapPx)));
  const rows = Math.max(1, Math.floor((sheetHPx + gapPx) / (cellHPx + gapPx)));
  const maxFit = cols * rows;

  const canvas = document.createElement("canvas");
  canvas.width = sheetWPx;
  canvas.height = sheetHPx;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const toRender = files.slice(0, maxFit);
  const images = await Promise.all(toRender.map(loadImage));

  images.forEach((img, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gapPx + col * (cellWPx + gapPx);
    const y = gapPx + row * (cellHPx + gapPx);
    drawCover(ctx, img, x, y, cellWPx, cellHPx);
    ctx.strokeStyle = "#d1d5db";
    ctx.strokeRect(x, y, cellWPx, cellHPx);
  });

  const blob = await canvasToJpegBlob(canvas);
  return { blob, fitted: toRender.length, total: files.length };
}
