import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { Printer } from "@/models/Printer";
import { verifyAgentKey } from "@/lib/agentAuth";

export const runtime = "nodejs";

/** Agent heartbeat is every ~20s; 2 minutes without any report = really offline. */
const PRINTER_STALE_MS = 2 * 60 * 1000;

const schema = z.object({
  printers: z.array(z.object({ name: z.string().trim().min(1).max(200) })).max(50),
});

/**
 * POST /api/agent/printers/sync
 * The Print Agent reports every (real) printer installed on the shop PC.
 *  - New printers are created automatically (type "both", A4/Legal/Letter) —
 *    staff can then adjust type / loaded paper sizes on Admin → Printers.
 *  - Printers already known keep whatever staff configured; only their
 *    status/lastSeenAt are refreshed.
 *  - Printers no longer reported for 2+ minutes are marked offline (not deleted, so
 *    historic orders and staff settings are kept).
 * Responds with the dashboard printers so the agent can map IDs automatically.
 */
export async function POST(req: NextRequest) {
  if (!verifyAgentKey(req)) {
    return NextResponse.json({ error: "Invalid or missing agent key" }, { status: 401 });
  }

  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const names = Array.from(new Set(parsed.data.printers.map((p) => p.name)));
    const now = new Date();
    await connectDB();

    if (names.length > 0) {
      await Printer.bulkWrite(
        names.map((name) => ({
          updateOne: {
            filter: { shopId: "main", systemPrinterName: name },
            update: {
              // Being INSTALLED on the PC is not the same as being ONLINE: the real status comes from the agent's
              // heartbeat (PATCH /api/printers/:id/status). Sync only records that the agent is alive; setting
              // "online" here overwrote the heartbeat's "offline" every few seconds and made printers flip.
              $set: { lastSeenAt: now },
              $setOnInsert: {
                shopId: "main",
                name,
                systemPrinterName: name,
                status: "offline", // until the first heartbeat reports the real state (seconds later)
                type: "both",
                supportedPaperSizes: ["A4", "Legal", "Letter"],
                ordersPrintedToday: 0,
              },
            },
            upsert: true,
          },
        }))
      );
    }

    // A printer missing from THIS agent's list is only marked offline if nobody has reported it recently.
    // Without this grace period, two agents (e.g. a test copy + the shop PC) or one flaky printer scan make
    // the dashboard flip between online/offline every few seconds.
    const staleBefore = new Date(now.getTime() - PRINTER_STALE_MS);
    await Printer.updateMany(
      {
        shopId: "main",
        systemPrinterName: { $nin: names },
        status: { $ne: "offline" },
        $or: [{ lastSeenAt: { $lt: staleBefore } }, { lastSeenAt: { $exists: false } }],
      },
      { $set: { status: "offline" } }
    );

    const printers = await Printer.find({ shopId: "main" })
      .select("systemPrinterName type")
      .lean();
    return NextResponse.json(
      printers.map((p) => ({ id: String(p._id), systemPrinterName: p.systemPrinterName, type: p.type }))
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to sync printers";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
