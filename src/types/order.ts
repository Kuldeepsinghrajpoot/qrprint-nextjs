export type PrintType = "bw" | "color";
export type PaperSize = "A4" | "A3" | "Legal" | "Letter" | "Photo";
export type BindingType = "none" | "spiral" | "lamination";
export type PaymentMethod = "cash" | "online";
export type PaymentStatus = "pending" | "paid" | "refunded";
export type PrintStatus = "queued" | "printing" | "ready" | "collected" | "failed" | "cancelled";

export interface OrderDTO {
  _id: string;
  token: string;
  customerName: string;
  customerPhone?: string;
  fileUrl?: string;
  fileName?: string;
  requiresManualPrint: boolean;

  printType: PrintType;
  paperSize: PaperSize;
  duplex: boolean;
  binding: BindingType;
  pages: number;
  pageCountEstimated: boolean;
  copies: number;
  priority: boolean;
  queuePosition: number;

  subtotal: number;
  priorityFee: number;
  gstRate: number;
  gstAmount: number;
  totalPrice: number;

  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  printStatus: PrintStatus;
  printerId?: string;
  printerError?: string;

  createdAt: string;
}

export interface TierRate {
  page1: number;
  page2to10: number;
  page11plus: number;
}

export interface PricingConfigDTO {
  _id: string;
  shopId: string;
  shopName: string;
  rates: Record<PaperSize, Record<PrintType, TierRate>>;
  duplexDiscountPercent: number;
  bindingSpiralCharge: number;
  bindingLaminationCharge: number;
  priorityFeePercent: number;
  gstEnabled: boolean;
  gstPercent: number;
  cashPaymentEnabled: boolean;
  onlinePaymentEnabled: boolean;
  printingPaused: boolean;
}

export interface PrinterDTO {
  _id: string;
  name: string;
  type: "bw" | "color" | "both";
  systemPrinterName: string;
  supportedPaperSizes: PaperSize[];
  status: "online" | "offline" | "paper_jam" | "low_ink" | "out_of_paper";
  lastSeenAt?: string;
  ordersPrintedToday: number;
  pagesPrintedToday?: number;
}
