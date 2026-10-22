"use client";

import { useEffect, useState, use } from "react";

interface TrackedOrder {
  token: string;
  customerName: string;
  printStatus: "queued" | "printing" | "ready" | "collected" | "failed";
  paymentStatus: "pending" | "paid" | "refunded";
  paymentMethod: "cash" | "online";
  totalPrice: number;
  pages: number;
  copies: number;
  printType: "bw" | "color";
  createdAt: string;
}

const STEPS: { key: TrackedOrder["printStatus"]; label: string }[] = [
  { key: "queued", label: "Uploaded" },
  { key: "printing", label: "Printing" },
  { key: "ready", label: "Ready for Pickup" },
  { key: "collected", label: "Collected" },
];

export default function TrackOrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const res = await fetch(`/api/track/${token}`, { cache: "no-store" });
        const data = await res.json();
        if (!active) return;
        if (!res.ok) {
          setError(data.error || "Order not found");
        } else {
          setOrder(data);
          setError(null);
        }
      } catch {
        if (active) setError("Could not load order status");
      }
    }
    poll();
    const interval = setInterval(poll, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [token]);

  const currentIndex = order ? STEPS.findIndex((s) => s.key === order.printStatus) : -1;

  return (
    <div className="flex-1 flex justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-5">
          <h1 className="text-xl font-bold text-blue-700">🖨️ Order Status</h1>
          <p className="text-sm text-slate-500 mt-1">Token #{token.toUpperCase()}</p>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          {error && <div className="text-sm text-red-600 text-center py-6">{error}</div>}

          {order && (
            <>
              <p className="text-center font-semibold mb-6">Hi {order.customerName} 👋</p>

              <div className="space-y-0">
                {STEPS.map((step, i) => {
                  const done = i <= currentIndex;
                  const isFailed = order.printStatus === "failed" && i === 1;
                  return (
                    <div key={step.key} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                            isFailed
                              ? "bg-red-500 text-white"
                              : done
                              ? "bg-blue-600 text-white"
                              : "bg-slate-200 text-slate-500"
                          }`}
                        >
                          {done && !isFailed ? "✓" : i + 1}
                        </div>
                        {i < STEPS.length - 1 && (
                          <div className={`w-0.5 flex-1 min-h-[28px] ${done ? "bg-blue-600" : "bg-slate-200"}`} />
                        )}
                      </div>
                      <div className="pb-6">
                        <div className={`text-sm font-semibold ${done ? "text-slate-800" : "text-slate-400"}`}>
                          {step.label}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {order.printStatus === "failed" && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
                  ⚠️ There was an issue printing your file. Please check with the shop counter.
                </div>
              )}

              <div className="bg-indigo-50/60 rounded-xl px-4 py-3 text-[13.5px] space-y-1.5 mt-2">
                <Row label="Print Type" value={order.printType === "bw" ? "Black & White" : "Color"} />
                <Row label="Pages × Copies" value={`${order.pages} × ${order.copies}`} />
                <Row label="Payment" value={order.paymentStatus === "paid" ? "Paid ✅" : "Pending at counter"} />
                <div className="flex justify-between pt-2 mt-1 border-t border-dashed border-slate-300 font-bold text-slate-800">
                  <span>Total</span>
                  <span>₹{order.totalPrice}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}
