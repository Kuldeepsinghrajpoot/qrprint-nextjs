import { NextRequest } from "next/server";
import crypto from "crypto";

/**
 * The Electron Print Agent authenticates with a simple shared API key
 * (set as AGENT_API_KEY in .env.local and in the agent's config), rather
 * than the cookie-based session used by the human dashboard — the agent
 * is a background service with no browser session.
 */
export function verifyAgentKey(req: NextRequest): boolean {
  const key = req.headers.get("x-agent-key")?.trim();
  const expected = process.env.AGENT_API_KEY?.trim();
  if (!expected || !key) return false; // fail closed if not configured

  // Constant-time comparison (hash first so lengths always match).
  const a = crypto.createHash("sha256").update(key).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}
