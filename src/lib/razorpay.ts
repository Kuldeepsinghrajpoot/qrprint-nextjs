import Razorpay from "razorpay";
import crypto from "crypto";

export function isRazorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

function getClient(): Razorpay {
  if (!isRazorpayConfigured()) {
    throw new Error("Razorpay keys not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)");
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });
}

/** Creates a Razorpay order for the given rupee amount (converted to paise). */
export async function createRazorpayOrder(amountInRupees: number, receipt: string) {
  const client = getClient();
  return client.orders.create({
    amount: Math.round(amountInRupees * 100),
    currency: "INR",
    receipt,
  });
}

/** Verifies the checkout signature returned by Razorpay after a successful payment. */
export function verifyRazorpaySignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(params.signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Issues a full refund for a captured payment — used by the order-cancellation window. */
export async function refundRazorpayPayment(paymentId: string): Promise<void> {
  const client = getClient();
  await client.payments.refund(paymentId, {});
}

/**
 * Fetches a Razorpay order so the server can check the amount the customer
 * actually paid against the price IT calculated (never trust the client's amount).
 */
export async function fetchRazorpayOrder(orderId: string) {
  const client = getClient();
  return client.orders.fetch(orderId);
}
