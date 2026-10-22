import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { Printer } from "@/models/Printer";
import { verifyAgentKey } from "@/lib/agentAuth";

export const runtime = "nodejs";

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
 *  - Printers no longer reported are marked offline (not deleted, so
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
              $set: { status: "online", lastSeenAt: now },
              $setOnInsert: {
                shopId: "main",
                name,
                systemPrinterName: name,
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

    await Printer.updateMany(
      { shopId: "main", systemPrinterName: { $nin: names } },
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
