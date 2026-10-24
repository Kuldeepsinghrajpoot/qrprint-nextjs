import { Order } from "@/models/Order";
import { deleteFile } from "@/lib/storage";

/**
 * Privacy: customer documents are deleted as soon as the order is collected (or cancelled).
 * On success the order's fileKey/fileUrl are cleared too, so nothing points at a deleted file and
 * "file still stored?" can be answered from the database.
 */
export async function purgeOrderFile(order: { _id: unknown; fileKey?: string | null }): Promise<{ deleted: boolean; error?: string }> {
  if (!order.fileKey) return { deleted: true };
  try {
    await deleteFile(order.fileKey);
    await Order.updateOne({ _id: order._id as never }, { $unset: { fileKey: "", fileUrl: "" } });
    return { deleted: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : "delete failed";
    console.error(`Could not delete stored file ${order.fileKey}:`, error);
    return { deleted: false, error };
  }
}

/**
 * Safety net: retries deleting files of collected/cancelled orders whose first delete failed
 * (network blip, storage hiccup). Runs from the dashboard's order list; small batch each time.
 */
export async function sweepStaleFiles(limit = 10): Promise<void> {
  const stale = await Order.find({
    shopId: "main",
    printStatus: { $in: ["collected", "cancelled"] },
    fileKey: { $exists: true, $nin: [null, ""] },
  })
    .select("_id fileKey")
    .limit(limit)
    .lean();
  for (const o of stale) await purgeOrderFile(o);
}
