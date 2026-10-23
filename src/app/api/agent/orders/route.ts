import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
import { PricingConfig } from "@/models/PricingConfig";
import { verifyAgentKey } from "@/lib/agentAuth";
import { CANCEL_WINDOW_MS } from "@/lib/orderTiming";

export const runtime = "nodejs";

/**
 * GET /api/agent/orders
 * Polled by the Electron Print Agent (every few seconds) to find orders
 * that are paid and waiting to be sent to a physical printer.
 *
 * Orders younger than the customer cancel window (see orderTiming.ts) are held back until it ends.
 *
 * IMPORTANT — special paper sizes (Photo, A3, Legal, Letter) are held back
 * from auto-printing until a staff member manually assigns a printer from
 * the dashboard. No software can physically swap a printer's paper tray,
 * so an unassigned non-A4 order could otherwise get silently printed on
 * whatever printer/paper happens to be loaded. Requiring a manual printer
 * assignment for these forces a human to confirm the correct paper is in
 * before it prints. Plain A4 jobs (the default stock) still auto-print.
 */
export async function GET(req: NextRequest) {
  if (!verifyAgentKey(req)) {
    return NextResponse.json({ error: "Invalid or missing agent key" }, { status: 401 });
  }

  await connectDB();

  const config = await PricingConfig.findOne({ shopId: "main" }).select("printingPaused");
  if (config?.printingPaused) {
    // Shop-wide pause (lunch break / printer maintenance) — hold everything,
    // even already-queued orders, until staff resumes from the dashboard.
    return NextResponse.json([]);
  }

  const orders = await Order.find({
    shopId: "main",
    paymentStatus: "paid",
    printStatus: "queued",
    // HOLD: the customer can still cancel during the first ~35s (countdown on their receipt screen), so the
    // agent only sees an order once that window is over — it can no longer be cancelled/refunded mid-print.
    createdAt: { $lte: new Date(Date.now() - CANCEL_WINDOW_MS) },
    requiresManualPrint: { $ne: true },
    $or: [{ paperSize: "A4" }, { printerId: { $exists: true, $ne: null } }],
  })
    .sort({ priority: -1, queuePosition: 1, createdAt: 1 }) // priority/rush first, then manual queue order, then FIFO
    .limit(20)
    .lean();

  return NextResponse.json(orders);
}
