import type { PaperSize, PrintType } from "@/lib/pricing";

export interface RoutablePrinter {
  _id: unknown;
  type: "bw" | "color" | "both";
  status: string;
  supportedPaperSizes: string[];
}

/**
 * Picks the printer for an order from its print type:
 *   B&W order   -> the "bw" printer   (falls back to a "both" printer)
 *   Color order -> the "color" printer (falls back to a "both" printer)
 * A color job is NEVER sent to a B&W-only printer and vice-versa.
 * Among matches: dedicated printer first, then online ones first.
 * Returns null when no compatible printer exists (order is held for staff).
 */
export function pickPrinter<T extends RoutablePrinter>(printers: T[], printType: PrintType, paperSize: PaperSize): T | null {
  const rank = (p: T) => (p.type === printType ? 0 : 2) + (p.status === "online" ? 0 : 1);
  const candidates = printers
    .filter((p) => (p.type === printType || p.type === "both") && p.supportedPaperSizes.includes(paperSize))
    .sort((a, b) => rank(a) - rank(b));
  return candidates[0] ?? null;
}

/** Whether a printer can handle an order's print type (used to filter the manual-assign dropdown). */
export function printerMatchesType(printerType: "bw" | "color" | "both", printType: PrintType): boolean {
  return printerType === "both" || printerType === printType;
}
