export type PrintType = "bw" | "color";
export type PaperSize = "A4" | "A3" | "Legal" | "Letter" | "Photo";
export type BindingType = "none" | "spiral" | "lamination";

export interface TierRate {
  page1: number;
  page2to10: number;
  page11plus: number;
}

export type RatesTable = Record<PaperSize, Record<PrintType, TierRate>>;

/** Fallback rates used only if no PricingConfig exists yet (matches the reference poster for A4). */
export const FALLBACK_RATES: RatesTable = {
  A4: { bw: { page1: 5, page2to10: 4, page11plus: 3 }, color: { page1: 10, page2to10: 6, page11plus: 4 } },
  A3: { bw: { page1: 10, page2to10: 8, page11plus: 6 }, color: { page1: 18, page2to10: 12, page11plus: 8 } },
  Legal: { bw: { page1: 6, page2to10: 5, page11plus: 4 }, color: { page1: 12, page2to10: 7, page11plus: 5 } },
  Letter: { bw: { page1: 5, page2to10: 4, page11plus: 3 }, color: { page1: 10, page2to10: 6, page11plus: 4 } },
  Photo: { bw: { page1: 15, page2to10: 12, page11plus: 10 }, color: { page1: 20, page2to10: 16, page11plus: 12 } },
};

function calcSetPrice(rate: TierRate, pages: number): number {
  if (pages <= 0) return 0;
  // Closed-form equivalent of "loop through every page and add its tier
  // rate" — kept O(1) regardless of how large `pages` is, rather than a
  // for-loop that a maliciously large value could use to peg the CPU.
  const midPages = Math.max(0, Math.min(pages, 10) - 1); // pages 2–10
  const highPages = Math.max(0, pages - 10); // pages 11+
  return rate.page1 + midPages * rate.page2to10 + highPages * rate.page11plus;
}

export interface PriceBreakdownInput {
  rates: RatesTable;
  paperSize: PaperSize;
  printType: PrintType;
  pages: number;
  copies: number;
  duplex: boolean;
  binding: BindingType;
  priority: boolean;
  duplexDiscountPercent: number;
  bindingSpiralCharge: number;
  bindingLaminationCharge: number; // per page
  priorityFeePercent: number;
  gstEnabled: boolean;
  gstPercent: number;
}

export interface PriceBreakdown {
  baseCost: number;
  duplexDiscount: number;
  bindingCharge: number;
  subtotal: number;
  priorityFee: number;
  gstAmount: number;
  total: number;
}

export function calcOrderPrice(input: PriceBreakdownInput): PriceBreakdown {
  const rate = input.rates[input.paperSize][input.printType];
  const baseCost = calcSetPrice(rate, input.pages) * Math.max(1, input.copies);

  const duplexDiscount = input.duplex
    ? Math.round((baseCost * input.duplexDiscountPercent) / 100)
    : 0;

  let bindingCharge = 0;
  if (input.binding === "spiral") bindingCharge = input.bindingSpiralCharge * input.copies;
  if (input.binding === "lamination") bindingCharge = input.bindingLaminationCharge * input.pages * input.copies;

  const subtotal = Math.max(0, baseCost - duplexDiscount + bindingCharge);
  const priorityFee = input.priority ? Math.round((subtotal * input.priorityFeePercent) / 100) : 0;
  const preTax = subtotal + priorityFee;
  const gstAmount = input.gstEnabled ? Math.round((preTax * input.gstPercent) / 100) : 0;
  const total = preTax + gstAmount;

  return { baseCost, duplexDiscount, bindingCharge, subtotal, priorityFee, gstAmount, total };
}

/** Generates a short, human-friendly order token, e.g. "A247" */
export function generateToken(): string {
  const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
  const num = Math.floor(100 + Math.random() * 899);
  return `${letter}${num}`;
}
