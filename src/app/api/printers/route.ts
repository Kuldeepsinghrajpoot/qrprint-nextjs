import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { Printer } from "@/models/Printer";
import { Order } from "@/models/Order";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["bw", "color", "both"]),
  systemPrinterName: z.string().min(1),
  supportedPaperSizes: z.array(z.enum(["A4", "A3", "Legal", "Letter", "Photo"])).min(1).default(["A4", "Legal", "Letter"]),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const printers = await Printer.find({ shopId: "main" }).sort({ createdAt: 1 });

  // "Printed today" is computed from real orders (it was a stored counter
  // that nothing ever updated). "Today" = since midnight in the shop's timezone.
  const tz = process.env.SHOP_TIMEZONE || "Asia/Kolkata";
  const now = new Date();
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  const localAsUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const offsetMs = localAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  const startOfToday = new Date(Date.UTC(+p.year, +p.month - 1, +p.day) - offsetMs);

  const stats = await Order.aggregate([
    {
      $match: {
        shopId: "main",
        printerId: { $in: printers.map((x) => x._id) },
        printStatus: { $in: ["ready", "collected"] },
        updatedAt: { $gte: startOfToday },
      },
    },
    { $group: { _id: "$printerId", orders: { $sum: 1 }, pages: { $sum: { $multiply: ["$pages", "$copies"] } } } },
  ]);
  const byPrinter = new Map(stats.map((s) => [String(s._id), s]));

  return NextResponse.json(
    printers.map((pr) => {
      const s = byPrinter.get(String(pr._id));
      // If the Print Agent has gone silent (PC off / agent closed), "online" is stale — show offline.
      const silent = pr.status === "online" && pr.lastSeenAt && now.getTime() - new Date(pr.lastSeenAt).getTime() > 2 * 60 * 1000;
      return {
        ...pr.toObject(),
        ...(silent ? { status: "offline" } : {}),
        ordersPrintedToday: s?.orders ?? 0,
        pagesPrintedToday: s?.pages ?? 0,
      };
    })
  );
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    await connectDB();
    const printer = await Printer.create({ shopId: "main", ...parsed.data, status: "offline" });
    return NextResponse.json(printer, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add printer";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
