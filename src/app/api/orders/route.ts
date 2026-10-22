import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
import { PricingConfig, DEFAULT_RATES } from "@/models/PricingConfig";
import { Customer, pointsForAmount } from "@/models/Customer";
import { calcOrderPrice, generateToken } from "@/lib/pricing";
import { sendOrderNotification, orderPlacedMessage } from "@/lib/notify";
import { isRazorpayConfigured, verifyRazorpaySignature, fetchRazorpayOrder } from "@/lib/razorpay";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { getSession } from "@/lib/session";
import { publicUrlForKey } from "@/lib/storage";

export const runtime = "nodejs";

const createOrderSchema = z.object({
  customerName: z.string().trim().min(1, "Name is required").max(100),
  customerPhone: z.string().trim().max(20).optional(),
  // fileUrl is intentionally NOT accepted from the client: the print agent
  // downloads whatever URL is stored, so it is derived server-side from the
  // upload key. fileKey must be one our own /api/upload produced.
  fileKey: z.string().regex(/^orders\/[A-Za-z0-9._-]+$/, "Invalid file key").optional(),
  fileName: z.string().max(255).optional(),
  printType: z.enum(["bw", "color"]),
  paperSize: z.enum(["A4", "A3", "Legal", "Letter", "Photo"]).default("A4"),
  duplex: z.boolean().default(false),
  binding: z.enum(["none", "spiral", "lamination"]).default("none"),
  pages: z.number().int().min(1).max(2000, "A single order can't exceed 2000 pages"),
  pageCountEstimated: z.boolean().default(false),
  copies: z.number().int().min(1).max(50),
  priority: z.boolean().default(false),
  paymentMethod: z.enum(["cash", "online"]),
  // Present only for real Razorpay payments (omitted in simulated/test-mode flow)
  razorpayOrderId: z.string().optional(),
  razorpayPaymentId: z.string().optional(),
  razorpaySignature: z.string().optional(),
});

/** GET /api/orders — shop dashboard live queue (staff/owner login required) */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized — please log in to the dashboard" }, { status: 401 });
  }

  await connectDB();

  // Auto-cancel cash orders that have sat unpaid for too long (default 20 min),
  // so the queue doesn't get clogged by no-shows / abandoned orders.
  const timeoutMinutes = Number(process.env.CASH_AUTO_CANCEL_MINUTES || 20);
  const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);
  await Order.updateMany(
    {
      shopId: "main",
      paymentMethod: "cash",
      paymentStatus: "pending",
      printStatus: "queued",
      createdAt: { $lt: cutoff },
    },
    { $set: { printStatus: "failed", printerError: "Auto-cancelled: cash payment not confirmed in time" } }
  );

  const status = req.nextUrl.searchParams.get("printStatus");
  const filter: Record<string, unknown> = { shopId: "main" };
  if (status) filter.printStatus = status;

  const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  return NextResponse.json(orders);
}

/** POST /api/orders — customer places a new order */
export async function POST(req: NextRequest) {
  // Generous limit — a shop's customers are often on the same WiFi (shared
  // IP), so this is aimed at stopping scripted spam, not normal walk-in traffic.
  const { ok } = rateLimit(`create-order:${getClientIp(req)}`, 30, 5 * 60 * 1000);
  if (!ok) {
    return NextResponse.json({ error: "Too many orders from this network — please wait a few minutes." }, { status: 429 });
  }

  try {
    const body = await req.json();
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const data = parsed.data;

    await connectDB();

    let config = await PricingConfig.findOne({ shopId: "main" });
    if (!config) {
      config = await PricingConfig.create({ shopId: "main", shopName: "My Print Shop", rates: DEFAULT_RATES });
    }

    // The pause switch is documented as blocking new orders; enforce it here
    // too (the UI disabling the button is not a control).
    if (config.printingPaused) {
      return NextResponse.json({ error: "The shop is not accepting orders right now" }, { status: 503 });
    }

    if (data.paymentMethod === "cash" && !config.cashPaymentEnabled) {
      return NextResponse.json({ error: "Cash payment is currently disabled by the shop" }, { status: 400 });
    }
    if (data.paymentMethod === "online" && !config.onlinePaymentEnabled) {
      return NextResponse.json({ error: "Online payment is currently disabled by the shop" }, { status: 400 });
    }

    const price = calcOrderPrice({
      rates: config.rates,
      paperSize: data.paperSize,
      printType: data.printType,
      pages: data.pages,
      copies: data.copies,
      duplex: data.duplex,
      binding: data.binding,
      priority: data.priority,
      duplexDiscountPercent: config.duplexDiscountPercent,
      bindingSpiralCharge: config.bindingSpiralCharge,
      bindingLaminationCharge: config.bindingLaminationCharge,
      priorityFeePercent: config.priorityFeePercent,
      gstEnabled: config.gstEnabled,
      gstPercent: config.gstPercent,
    });

    // Determine payment status:
    // - Cash: always starts "pending" (confirmed later at the counter)
    // - Online + Razorpay configured: MUST include a valid signature to be marked "paid"
    // - Online + Razorpay NOT configured: simulated test-mode flow, marked "paid" immediately
    let paymentStatus: "pending" | "paid" = "pending";
    if (data.paymentMethod === "online") {
      if (isRazorpayConfigured()) {
        const hasSignature = data.razorpayOrderId && data.razorpayPaymentId && data.razorpaySignature;
        if (!hasSignature) {
          return NextResponse.json({ error: "Missing payment verification details" }, { status: 400 });
        }
        const valid = verifyRazorpaySignature({
          orderId: data.razorpayOrderId!,
          paymentId: data.razorpayPaymentId!,
          signature: data.razorpaySignature!,
        });
        if (!valid) {
          return NextResponse.json({ error: "Payment verification failed" }, { status: 400 });
        }

        // The signature only proves "this payment belongs to this Razorpay
        // order" — not that the amount was right. /razorpay/create takes the
        // amount from the client, so check what was actually charged against
        // the price we calculated, otherwise a ₹1 payment could buy any order.
        const rzpOrder = await fetchRazorpayOrder(data.razorpayOrderId!);
        if (Number(rzpOrder.amount) !== Math.round(price.total * 100) || rzpOrder.currency !== "INR") {
          return NextResponse.json({ error: "Payment amount does not match the order total" }, { status: 400 });
        }

        // One payment can only ever pay for one order.
        if (await Order.exists({ razorpayPaymentId: data.razorpayPaymentId })) {
          return NextResponse.json({ error: "This payment has already been used for an order" }, { status: 409 });
        }
        paymentStatus = "paid";
      } else if (process.env.NODE_ENV === "production") {
        // Never auto-mark orders paid in production just because the Razorpay
        // keys are missing/misconfigured — that would be free printing.
        return NextResponse.json({ error: "Online payments are not available right now" }, { status: 503 });
      } else {
        paymentStatus = "paid"; // dev-only simulation, no real gateway configured
      }
    }

    // Token generation: check-then-insert has a small race window under
    // concurrent requests (two customers could generate the same token
    // in the same instant). We guard against that by catching MongoDB's
    // duplicate-key error on insert and simply retrying with a fresh
    // token, rather than failing the customer's order.
    // Word docs and ZIPs can't be silently printed by the agent (no
    // reliable Windows print path for these), so they're flagged for
    // manual handling by staff, computed server-side from the filename
    // rather than trusting a client-sent flag.
    const requiresManualPrint = /\.(docx?|zip)$/i.test(data.fileName || "");

    let order;
    let token = generateToken();
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        order = await Order.create({
          token,
          shopId: "main",
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          fileUrl: data.fileKey ? publicUrlForKey(data.fileKey) : undefined,
          fileKey: data.fileKey,
          fileName: data.fileName,
          requiresManualPrint,
          printType: data.printType,
          paperSize: data.paperSize,
          duplex: data.duplex,
          binding: data.binding,
          pages: data.pages,
          pageCountEstimated: data.pageCountEstimated,
          copies: data.copies,
          priority: data.priority,
          subtotal: price.subtotal,
          priorityFee: price.priorityFee,
          gstRate: config.gstEnabled ? config.gstPercent : 0,
          gstAmount: price.gstAmount,
          totalPrice: price.total,
          paymentMethod: data.paymentMethod,
          paymentStatus,
          printStatus: "queued",
          razorpayPaymentId: data.razorpayPaymentId,
        });
        break;
      } catch (err: unknown) {
        const isDuplicateToken =
          typeof err === "object" && err !== null && "code" in err && (err as { code?: number }).code === 11000;
        if (!isDuplicateToken || attempt === 4) throw err;
        token = generateToken(); // collided with an order created moments ago — try a new one
      }
    }

    // Loyalty tracking (only if phone provided)
    if (data.customerPhone) {
      await Customer.findOneAndUpdate(
        { shopId: "main", phone: data.customerPhone },
        {
          $set: { name: data.customerName },
          $inc: {
            totalOrders: 1,
            totalSpent: price.total,
            loyaltyPoints: pointsForAmount(price.total),
          },
        },
        { upsert: true }
      );

      sendOrderNotification({
        phone: data.customerPhone,
        customerName: data.customerName,
        message: orderPlacedMessage(data.customerName, token),
      }).catch(() => {});
    }

    return NextResponse.json(order, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create order";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
