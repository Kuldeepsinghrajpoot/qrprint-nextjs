import mongoose, { Schema, Document, Model } from "mongoose";

export interface ITierRate {
  page1: number;
  page2to10: number;
  page11plus: number;
}

export interface IPricingConfig extends Document {
  shopId: string;
  shopName: string;

  // Base per-page tiered rates, per paper size, per print type
  rates: {
    A4: { bw: ITierRate; color: ITierRate };
    A3: { bw: ITierRate; color: ITierRate };
    Legal: { bw: ITierRate; color: ITierRate };
    Letter: { bw: ITierRate; color: ITierRate };
    Photo: { bw: ITierRate; color: ITierRate };
  };

  // Flat add-on charges
  duplexDiscountPercent: number; // % discount on subtotal for double-side printing (paper saving)
  bindingSpiralCharge: number;
  bindingLaminationCharge: number; // per page
  priorityFeePercent: number; // % extra on subtotal for rush print

  gstEnabled: boolean;
  gstPercent: number;

  cashPaymentEnabled: boolean;
  onlinePaymentEnabled: boolean;

  // When true: customers can't place new orders, and the Print Agent stops
  // picking up already-queued ones too (covers both "lunch break" and
  // "printer under maintenance" — in both cases nothing should print).
  printingPaused: boolean;

  updatedAt: Date;
}

const tierRateSchema = {
  page1: { type: Number, required: true },
  page2to10: { type: Number, required: true },
  page11plus: { type: Number, required: true },
};

const PricingConfigSchema = new Schema<IPricingConfig>(
  {
    shopId: { type: String, required: true, unique: true, default: "main" },
    shopName: { type: String, required: true, default: "My Print Shop" },

    rates: {
      A4: {
        bw: tierRateSchema,
        color: tierRateSchema,
      },
      A3: {
        bw: tierRateSchema,
        color: tierRateSchema,
      },
      Legal: {
        bw: tierRateSchema,
        color: tierRateSchema,
      },
      Letter: {
        bw: tierRateSchema,
        color: tierRateSchema,
      },
      Photo: {
        bw: tierRateSchema,
        color: tierRateSchema,
      },
    },

    duplexDiscountPercent: { type: Number, default: 10 },
    bindingSpiralCharge: { type: Number, default: 20 },
    bindingLaminationCharge: { type: Number, default: 5 },
    priorityFeePercent: { type: Number, default: 25 },

    gstEnabled: { type: Boolean, default: false },
    gstPercent: { type: Number, default: 18 },

    cashPaymentEnabled: { type: Boolean, default: true },
    onlinePaymentEnabled: { type: Boolean, default: true },

    printingPaused: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

export const PricingConfig: Model<IPricingConfig> =
  mongoose.models.PricingConfig || mongoose.model<IPricingConfig>("PricingConfig", PricingConfigSchema);

/** Default pricing used to seed a new shop's config (matches the reference poster for A4). */
export const DEFAULT_RATES = {
  A4: {
    bw: { page1: 5, page2to10: 4, page11plus: 3 },
    color: { page1: 10, page2to10: 6, page11plus: 4 },
  },
  A3: {
    bw: { page1: 10, page2to10: 8, page11plus: 6 },
    color: { page1: 18, page2to10: 12, page11plus: 8 },
  },
  Legal: {
    bw: { page1: 6, page2to10: 5, page11plus: 4 },
    color: { page1: 12, page2to10: 7, page11plus: 5 },
  },
  Letter: {
    bw: { page1: 5, page2to10: 4, page11plus: 3 },
    color: { page1: 10, page2to10: 6, page11plus: 4 },
  },
  Photo: {
    bw: { page1: 15, page2to10: 12, page11plus: 10 },
    color: { page1: 20, page2to10: 16, page11plus: 12 },
  },
};
