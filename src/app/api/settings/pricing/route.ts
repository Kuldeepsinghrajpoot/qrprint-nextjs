import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { PricingConfig, DEFAULT_RATES } from "@/models/PricingConfig";
import { getSession } from "@/lib/session";
import { z } from "zod";

const tier = z.object({
  page1: z.number().min(0).max(100000),
  page2to10: z.number().min(0).max(100000),
  page11plus: z.number().min(0).max(100000),
});
const paperRates = z.object({ bw: tier, color: tier });

// Whitelist of editable fields. Previously the raw request body was passed to
// findOneAndUpdate, allowing negative/NaN prices and arbitrary field writes
// (e.g. shopId).
const pricingSchema = z
  .object({
    shopName: z.string().trim().min(1).max(100),
    rates: z.object({ A4: paperRates, A3: paperRates, Legal: paperRates, Letter: paperRates, Photo: paperRates }),
    duplexDiscountPercent: z.number().min(0).max(100),
    bindingSpiralCharge: z.number().min(0).max(100000),
    bindingLaminationCharge: z.number().min(0).max(100000),
    priorityFeePercent: z.number().min(0).max(1000),
    gstEnabled: z.boolean(),
    gstPercent: z.number().min(0).max(100),
    cashPaymentEnabled: z.boolean(),
    onlinePaymentEnabled: z.boolean(),
    printingPaused: z.boolean(),
  })
  .partial();

export const runtime = "nodejs";

/** GET /api/settings/pricing — public (customer page needs this to calculate live prices) */
export async function GET() {
  await connectDB();
  let config = await PricingConfig.findOne({ shopId: "main" });

  if (!config) {
    config = await PricingConfig.create({ shopId: "main", shopName: "My Print Shop", rates: DEFAULT_RATES });
  }

  return NextResponse.json(config);
}

/** PUT /api/settings/pricing — owner-only, updates pricing config */
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "owner") {
    return NextResponse.json({ error: "Only the shop owner can update pricing" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parsed = pricingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    await connectDB();
    const config = await PricingConfig.findOneAndUpdate({ shopId: "main" }, { $set: parsed.data }, {
      new: true,
      upsert: true,
    });
    return NextResponse.json(config);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update pricing";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
