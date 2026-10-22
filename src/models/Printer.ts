import mongoose, { Schema, Document, Model } from "mongoose";

export type PrinterType = "bw" | "color" | "both";
export type PrinterStatus = "online" | "offline" | "paper_jam" | "low_ink" | "out_of_paper";
export type PaperSize = "A4" | "A3" | "Legal" | "Letter" | "Photo";

export interface IPrinter extends Document {
  shopId: string;
  name: string;
  type: PrinterType;
  systemPrinterName: string; // exact name as registered in Windows, used by the print agent
  // Which paper sizes this physical printer is actually loaded/able to print on.
  // Critical for Photo paper specifically — most shop printers don't have a photo
  // tray loaded, so a Photo order must only auto-route to a printer that has this.
  supportedPaperSizes: PaperSize[];
  status: PrinterStatus;
  lastSeenAt?: Date;
  ordersPrintedToday: number;
  createdAt: Date;
}

const PrinterSchema = new Schema<IPrinter>(
  {
    shopId: { type: String, required: true, default: "main" },
    name: { type: String, required: true },
    type: { type: String, enum: ["bw", "color", "both"], default: "both" },
    systemPrinterName: { type: String, required: true },
    supportedPaperSizes: {
      type: [String],
      enum: ["A4", "A3", "Legal", "Letter", "Photo"],
      default: ["A4", "Legal", "Letter"],
    },
    status: {
      type: String,
      enum: ["online", "offline", "paper_jam", "low_ink", "out_of_paper"],
      default: "offline",
    },
    lastSeenAt: { type: Date },
    ordersPrintedToday: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Printer: Model<IPrinter> =
  mongoose.models.Printer || mongoose.model<IPrinter>("Printer", PrinterSchema);
