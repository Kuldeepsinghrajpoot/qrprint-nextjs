import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/mongodb";
import { Printer } from "@/models/Printer";
import { verifyAgentKey } from "@/lib/agentAuth";

export const runtime = "nodejs";

const schema = z.object({
  status: z.enum(["online", "offline", "paper_jam", "low_ink", "out_of_paper"]),
});

/**
 * PATCH /api/printers/:id/status
 * The Electron Print Agent calls this periodically (heartbeat) so the
 * shop dashboard shows real-time printer health (online/offline/jam/etc.).
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
    const printer = await Printer.findByIdAndUpdate(
      id,
      { status: parsed.data.status, lastSeenAt: new Date() },
      { new: true }
    );
    if (!printer) return NextResponse.json({ error: "Printer not found" }, { status: 404 });

    return NextResponse.json(printer);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update printer status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
