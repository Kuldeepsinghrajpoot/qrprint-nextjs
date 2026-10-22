import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
import { verifyAgentKey } from "@/lib/agentAuth";
import { sendOrderNotification, readyMessage } from "@/lib/notify";

export const runtime = "nodejs";

const schema = z.object({
  printStatus: z.enum(["printing", "ready", "failed"]),
  printerError: z.string().optional(),
  printerId: z.string().optional(),
});

/**
 * PATCH /api/agent/orders/:id/status
 * Called by the Electron Print Agent to report progress:
 *  - "printing" when the job is sent to the printer — this is an ATOMIC CLAIM:
 *    it only succeeds if the order is still "queued". If a second agent
 *    instance (e.g. a shop accidentally running the agent on two PCs) tries
 *    to claim the same order a moment later, this returns 409 Conflict and
 *    that agent skips it — preventing the same file from printing twice.
 *  - "ready" once printing completes successfully (triggers WhatsApp/SMS + is picked up by the dashboard's voice announcement)
 *  - "failed" if the printer errors out (jam, offline, etc.)
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAgentKey(req)) {
    return NextResponse.json({ error: "Invalid or missing agent key" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    await connectDB();

    let order;
    if (parsed.data.printStatus === "printing") {
      // Atomic claim: only transition queued -> printing. If another agent
      // already claimed this order, findOneAndUpdate matches nothing here.
      order = await Order.findOneAndUpdate({ _id: id, printStatus: "queued" }, parsed.data, { new: true });
      if (!order) {
        const existing = await Order.findById(id);
        if (!existing) return NextResponse.json({ error: "Order not found" }, { status: 404 });
        return NextResponse.json(
          { error: "Order already claimed by another agent/printer", printStatus: existing.printStatus },
          { status: 409 }
        );
      }
    } else {
      order = await Order.findByIdAndUpdate(id, parsed.data, { new: true });
      if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (parsed.data.printStatus === "ready") {
      await sendOrderNotification({
        phone: order.customerPhone,
        customerName: order.customerName,
        message: readyMessage(order.customerName, order.token),
      });
    }

    return NextResponse.json(order);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
