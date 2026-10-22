import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

/** GET /api/qr — returns a PNG QR code that links to the customer upload page */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const targetUrl = `${appUrl}/?shop=${session.shopId}`;

  const pngBuffer = await QRCode.toBuffer(targetUrl, {
    type: "png",
    width: 480,
    margin: 2,
    color: { dark: "#1d4ed8", light: "#ffffff" },
  });

  return new NextResponse(new Uint8Array(pngBuffer), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    },
  });
}
