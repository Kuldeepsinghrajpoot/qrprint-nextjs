import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { Order } from "@/models/Order";
import { purgeOrderFile } from "@/lib/fileCleanup";
import { getSession } from "@/lib/session";
import { sendOrderNotification, readyMessage } from "@/lib/notify";

export const runtime = "nodejs";

const updateSchema = z.object({
  paymentStatus: z.enum(["pending", "paid", "refunded"]).optional(),
  printStatus: z.enum(["queued", "printing", "ready", "collected", "failed", "cancelled"]).optional(),
  printerId: z.string().optional(),
});

/** PATCH /api/orders/:id — dashboard actions: "Cash Received", "Mark Ready", "Collected", refund, assign printer */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized — please log in to the dashboard" }, { status: 401 });
  }

  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  try {
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    await connectDB();
    const before = await Order.findById(id).select("printStatus").lean();
    const order = await Order.findByIdAndUpdate(id, parsed.data, { new: true });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Privacy feature: once collected, delete the stored file (and clear its link from the order)
    let fileDeleted: boolean | undefined;
    if (parsed.data.printStatus === "collected" && order.fileKey) {
      const result = await purgeOrderFile(order);
      fileDeleted = result.deleted;
      if (result.deleted) {
        order.fileKey = undefined;
        order.fileUrl = undefined;
      }
    }

    // Notify the customer (WhatsApp/SMS) the moment staff mark it ready manually
    if (parsed.data.printStatus === "ready" && before?.printStatus !== "ready") {
      sendOrderNotification({
        phone: order.customerPhone,
        customerName: order.customerName,
        message: readyMessage(order.customerName, order.token),
      }).catch(() => {});
    }

    return NextResponse.json(fileDeleted === undefined ? order : { ...order.toObject(), fileDeleted });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update order";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
