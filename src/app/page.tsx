"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import Script from "next/script";
import { detectPageCount, isAutoDetectable, isWordDoc, isZipFile } from "@/lib/pdf";
import { enhanceScan } from "@/lib/photoTools";
import { calcOrderPrice, PrintType, PaperSize, BindingType } from "@/lib/pricing";
import PrinterMachine from "@/components/PrinterMachine";
import type { OrderDTO, PricingConfigDTO } from "@/types/order";

type Step = "upload" | "payment" | "processing" | "receipt";
type PaymentMethod = "cash" | "online";

const CANCEL_WINDOW_SECONDS = 30;

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export default function CustomerPage() {
  const [step, setStep] = useState<Step>("upload");
  const [config, setConfig] = useState<PricingConfigDTO | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pages, setPages] = useState(0);
  const [pageCountEstimated, setPageCountEstimated] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [printType, setPrintType] = useState<PrintType>("bw");
  const [paperSize, setPaperSize] = useState<PaperSize>("A4");
  const [duplex, setDuplex] = useState(false);
  const [binding, setBinding] = useState<BindingType>("none");
  const [priority, setPriority] = useState(false);
  const [copies, setCopies] = useState(1);
  const [detecting, setDetecting] = useState(false);

  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [processingText, setProcessingText] = useState("Processing payment");
  const [order, setOrder] = useState<OrderDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Order-cancellation window (right after payment, in case of a wrong file/mistake)
  const [cancelSecondsLeft, setCancelSecondsLeft] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const cancelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/settings/pricing")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setError("Could not load shop pricing. Please refresh."));
  }, []);

  // If the customer just came back from /photo-tools (collage, text/date
  // overlay, ID card front+back, or batch resize), pick up the composed
  // image it left behind and load it as this order's file.
  useEffect(() => {
    const dataUrl = sessionStorage.getItem("qrprint_photo_tool_result");
    if (!dataUrl) return;
    sessionStorage.removeItem("qrprint_photo_tool_result");

    fetch(dataUrl)
      .then((r) => r.blob())
      .then(async (blob) => {
        const f = new File([blob], "photo-tools-output.jpg", { type: "image/jpeg" });
        setFile(f);
        setPaperSize("Photo");
        setPrintType("color");
        setPageCountEstimated(false);
        const count = await detectPageCount(f);
        setPages(count);
      })
      .catch(() => {
        // If this fails for any reason, the customer can just upload normally.
      });
  }, []);

  // Keep a preview URL in sync with whichever file is selected, and clean
  // up the old one so we don't leak memory as the customer swaps files.
  useEffect(() => {
    if (!file) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: clearing the preview URL when the file is removed
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Start (and clean up) the cancellation countdown once an order is placed.
  useEffect(() => {
    if (step !== "receipt" || !order || cancelled) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: starting a countdown timer when the receipt appears
    setCancelSecondsLeft(CANCEL_WINDOW_SECONDS);
    cancelIntervalRef.current = setInterval(() => {
      setCancelSecondsLeft((s) => {
        if (s <= 1 && cancelIntervalRef.current) {
          clearInterval(cancelIntervalRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => {
      if (cancelIntervalRef.current) clearInterval(cancelIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when a new order is placed
  }, [order?._id]);

  async function handleCancelOrder() {
    if (!order) return;
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${order._id}/cancel`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not cancel this order");
      if (cancelIntervalRef.current) clearInterval(cancelIntervalRef.current);
      setCancelled(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel this order");
    } finally {
      setCancelling(false);
    }
  }

  const price = useMemo(() => {
    if (!config) return null;
    return calcOrderPrice({
      rates: config.rates,
      paperSize,
      printType,
      pages,
      copies,
      duplex,
      binding,
      priority,
      duplexDiscountPercent: config.duplexDiscountPercent,
      bindingSpiralCharge: config.bindingSpiralCharge,
      bindingLaminationCharge: config.bindingLaminationCharge,
      priorityFeePercent: config.priorityFeePercent,
      gstEnabled: config.gstEnabled,
      gstPercent: config.gstPercent,
    });
  }, [config, paperSize, printType, pages, copies, duplex, binding, priority]);

  const canContinue = name.trim().length > 0 && !!file && pages > 0 && !detecting && !!config;
  const showDuplexTip = pages > 4 && !duplex && paperSize === "A4";

  async function loadFile(f: File) {
    setFile(f);
    setError(null);
    if (isAutoDetectable(f)) {
      setDetecting(true);
      setPageCountEstimated(false);
      try {
        const count = await detectPageCount(f);
        setPages(count);
      } finally {
        setDetecting(false);
      }
    } else {
      // Word docs / ZIPs can't be auto-counted — ask the customer for an
      // estimate instead of silently guessing.
      setPages(1);
      setPageCountEstimated(true);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    await loadFile(f);
  }

  async function handleScanCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setScanning(true);
    setError(null);
    try {
      const blob = await enhanceScan(f, printType === "color" ? "color" : "bw");
      const scanned = new File([blob], "scanned-document.jpg", { type: "image/jpeg" });
      await loadFile(scanned);
    } catch {
      setError("Could not process the scan — please try again.");
    } finally {
      setScanning(false);
    }
  }

  /**
   * Uploads the chosen file. With Supabase storage the browser sends it straight to storage (so big PDFs
   * work on Vercel, which limits request bodies to 4.5 MB); otherwise it goes through /api/upload.
   */
  async function uploadSelectedFile(f: File): Promise<{ fileUrl: string; fileKey: string; fileName: string }> {
    const viaServer = async () => {
      const formData = new FormData();
      formData.append("file", f);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");
      return data as { fileUrl: string; fileKey: string; fileName: string };
    };

    const signRes = await fetch("/api/upload/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: f.name, fileType: f.type, fileSize: f.size }),
    });
    const sign = await signRes.json().catch(() => ({}));
    if (!signRes.ok) throw new Error(sign.error || "Upload failed");
    if (!sign.direct) return viaServer();

    try {
      const fd = new FormData();
      fd.append("cacheControl", "3600");
      fd.append("", f);
      const put = await fetch(sign.signedUrl, { method: "PUT", headers: { "x-upsert": "false" }, body: fd });
      if (!put.ok) throw new Error("direct upload rejected");
      return { fileUrl: sign.fileUrl, fileKey: sign.key, fileName: f.name };
    } catch {
      // Small files can still go through the server; big ones can't (Vercel 4.5 MB limit).
      if (f.size <= 4 * 1024 * 1024) return viaServer();
      throw new Error("Upload failed — please check your internet and try again.");
    }
  }

  async function submitOrder(razorpayFields?: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }) {
    setProcessingText(method === "cash" ? "Confirming order" : "Uploading file");
    const uploadData = await uploadSelectedFile(file!);

    setProcessingText(method === "cash" ? "Generating token" : "Verifying payment");
    const orderRes = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: name,
        customerPhone: phone || undefined,
        fileUrl: uploadData.fileUrl,
        fileKey: uploadData.fileKey,
        fileName: uploadData.fileName,
        printType,
        paperSize,
        duplex,
        binding,
        pages,
        pageCountEstimated,
        copies,
        priority,
        paymentMethod: method,
        ...razorpayFields,
      }),
    });
    const orderData = await orderRes.json();
    if (!orderRes.ok) {
      throw new Error(orderData.error?.formErrors?.[0] || orderData.error || "Order failed");
    }

    setProcessingText("Payment successful ✅");
    await new Promise((r) => setTimeout(r, 700));
    setOrder(orderData);
    setStep("receipt");
  }

  async function handlePay() {
    if (!method || !file || !price) return;
    setSubmitting(true);
    setError(null);
    setStep("processing");

    try {
      if (method === "online") {
        setProcessingText("Starting payment");
        const createRes = await fetch("/api/payments/razorpay/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: price.total, receipt: `qrp_${Date.now()}` }),
        });
        const createData = await createRes.json();

        if (createRes.ok && createData.configured) {
          await new Promise<void>((resolve, reject) => {
            const rzp = new window.Razorpay({
              key: createData.keyId,
              amount: createData.amount,
              currency: createData.currency,
              order_id: createData.razorpayOrderId,
              name: config?.shopName || "QRtoPrint",
              description: `Print order — ${pages} pages x ${copies}`,
              prefill: { name, contact: phone || undefined },
              theme: { color: "#2563eb" },
              handler: async (response: {
                razorpay_order_id: string;
                razorpay_payment_id: string;
                razorpay_signature: string;
              }) => {
                try {
                  await submitOrder({
                    razorpayOrderId: response.razorpay_order_id,
                    razorpayPaymentId: response.razorpay_payment_id,
                    razorpaySignature: response.razorpay_signature,
                  });
                  resolve();
                } catch (err) {
                  reject(err);
                }
              },
              modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
            });
            rzp.open();
          });
        } else {
          setProcessingText("Verifying UPI (test mode)");
          await new Promise((r) => setTimeout(r, 900));
          await submitOrder();
        }
      } else {
        await submitOrder();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("payment");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setStep("upload");
    setName("");
    setPhone("");
    setFile(null);
    setPages(0);
    setPageCountEstimated(false);
    setPrintType("bw");
    setPaperSize("A4");
    setDuplex(false);
    setBinding("none");
    setPriority(false);
    setCopies(1);
    setMethod(null);
    setOrder(null);
    setError(null);
    setCancelled(false);
    setCancelSecondsLeft(0);
  }

  return (
    <div className="flex-1 flex justify-center px-3 sm:px-4 py-5 sm:py-6">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <div className="w-full max-w-md md:max-w-lg">
        <div className="text-center mb-4 sm:mb-5">
          <h1 className="text-xl sm:text-2xl font-bold text-blue-700">🖨️ {config?.shopName || "QRtoPrint"}</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">Scan • Upload • Pay • Print</p>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-[0_10px_30px_rgba(37,99,235,0.08)] border border-slate-200">
          {error && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {config?.printingPaused && step !== "receipt" && (
            <div className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ⏸️ We&apos;re on a short break right now (lunch/printer maintenance) — new orders are temporarily paused. Please check back shortly.
            </div>
          )}

          {step === "upload" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Apna naam likhein">
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ayush" className="input" />
                </Field>
                <Field label="Mobile Number (optional)">
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98XXXXXXXX" className="input" />
                </Field>
              </div>

              {!file && (
                <Field label="Upload File">
                  <label className="block border-2 border-dashed border-indigo-200 rounded-xl p-5 sm:p-6 text-center cursor-pointer bg-indigo-50/40 hover:bg-indigo-50 transition">
                    <div className="text-2xl mb-1">📄</div>
                    <div className="text-sm font-medium">Tap to upload a file</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">PDF, Word, ZIP, JPG or PNG</div>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.zip,.jpg,.jpeg,.png"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-2 mt-2.5">
                    <button
                      type="button"
                      onClick={() => scanInputRef.current?.click()}
                      disabled={scanning}
                      className="py-2.5 rounded-xl border-[1.5px] border-slate-200 text-[12.5px] font-bold text-slate-700 hover:bg-slate-50"
                    >
                      {scanning ? "Scanning…" : "📷 Scan Document"}
                    </button>
                    <Link
                      href="/photo-tools"
                      className="py-2.5 rounded-xl border-[1.5px] border-slate-200 text-[12.5px] font-bold text-slate-700 hover:bg-slate-50 text-center"
                    >
                      🪪 Collage / ID Card
                    </Link>
                  </div>
                  <input
                    ref={scanInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleScanCapture}
                  />
                </Field>
              )}

              {file && (
                <FilePreview
                  file={file}
                  previewUrl={previewUrl}
                  detecting={detecting}
                  onRemove={() => {
                    setFile(null);
                    setPages(0);
                    setPageCountEstimated(false);
                  }}
                />
              )}

              {file && !isAutoDetectable(file) && (
                <Field label={`How many pages? ${isWordDoc(file) ? "(Word doc)" : isZipFile(file) ? "(ZIP)" : ""}`}>
                  <input
                    type="number"
                    min={1}
                    max={2000}
                    value={pages}
                    onChange={(e) => setPages(Math.max(1, Number(e.target.value)))}
                    className="input"
                  />
                  <p className="text-[11px] text-amber-600 mt-1">
                    ⚠️ We can&apos;t auto-count pages for this file type — enter your best estimate. Shop staff will confirm the exact count and adjust the price if needed.
                  </p>
                </Field>
              )}

              <Field label="Print Type">
                <ChipGroup
                  value={printType}
                  onChange={setPrintType}
                  options={[
                    { value: "bw", label: "⚫ B&W" },
                    { value: "color", label: "🎨 Color" },
                  ]}
                />
              </Field>

              <Field label="Paper Size">
                <ChipGroup
                  value={paperSize}
                  onChange={setPaperSize}
                  options={(["A4", "A3", "Legal", "Letter", "Photo"] as PaperSize[]).map((s) => ({ value: s, label: s }))}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Copies">
                  <Stepper value={copies} onChange={setCopies} min={1} max={50} />
                </Field>
                <Field label="Binding">
                  <ChipGroup
                    value={binding}
                    onChange={setBinding}
                    options={[
                      { value: "none", label: "None" },
                      { value: "spiral", label: "Spiral" },
                      { value: "lamination", label: "Laminate" },
                    ]}
                  />
                </Field>
              </div>

              <div className="flex gap-2">
                <ToggleChip active={duplex} onClick={() => setDuplex((v) => !v)} label="🔁 Double-sided" />
                <ToggleChip active={priority} onClick={() => setPriority((v) => !v)} label="⚡ Priority" />
              </div>

              {showDuplexTip && (
                <div className="text-[11.5px] text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                  💡 Tip: This document has {pages} pages — turning on <strong>Double-sided</strong> could cut your paper cost noticeably.
                </div>
              )}

              {config && price && (
                <div className="bg-indigo-50/60 rounded-xl px-4 py-3 text-sm">
                  <Row label="Pages" value={pages ? `${pages} page(s)${pageCountEstimated ? " (estimated)" : ""}` : "—"} />
                  <Row label="Base cost" value={`₹${price.baseCost}`} />
                  {price.duplexDiscount > 0 && <Row label="Duplex discount" value={`− ₹${price.duplexDiscount}`} />}
                  {price.bindingCharge > 0 && <Row label="Binding charge" value={`+ ₹${price.bindingCharge}`} />}
                  {price.priorityFee > 0 && <Row label="Priority fee" value={`+ ₹${price.priorityFee}`} />}
                  {price.gstAmount > 0 && <Row label={`GST (${config.gstPercent}%)`} value={`+ ₹${price.gstAmount}`} />}
                  <div className="flex justify-between pt-2 mt-1 border-t border-dashed border-slate-300 font-bold text-slate-800">
                    <span>Total</span>
                    <span>₹{price.total}</span>
                  </div>
                </div>
              )}

              <button disabled={!canContinue || config?.printingPaused} onClick={() => setStep("payment")} className="btn-primary">
                Continue to Payment
              </button>
            </div>
          )}

          {step === "payment" && config && price && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">Choose payment method</p>
              <div className="flex gap-3">
                {config.onlinePaymentEnabled && (
                  <PayOption label="📱 UPI / Online" active={method === "online"} onClick={() => setMethod("online")} />
                )}
                {config.cashPaymentEnabled && (
                  <PayOption label="💵 Cash" active={method === "cash"} onClick={() => setMethod("cash")} />
                )}
              </div>
              <div className="bg-indigo-50/60 rounded-xl px-4 py-3 flex justify-between font-bold text-slate-800">
                <span>Amount to pay</span>
                <span>₹{price.total}</span>
              </div>
              <button disabled={!method || submitting || config.printingPaused} onClick={handlePay} className="btn-primary">
                Pay Now
              </button>
              <button onClick={() => setStep("upload")} className="btn-secondary">
                ← Back
              </button>
            </div>
          )}

          {step === "processing" && price && (
            <div className="text-center py-4">
              <PrinterMachine amountLabel={`₹${price.total}`} />
              <div className="text-[14.5px] font-bold text-blue-700 mt-1 min-h-[20px]">
                {processingText}
                <span className="dot-anim inline-flex ml-0.5">
                  <span>.</span><span>.</span><span>.</span>
                </span>
              </div>
            </div>
          )}

          {step === "receipt" && order && cancelled && (
            <div className="text-center py-6">
              <div className="text-4xl mb-3">🗑️</div>
              <p className="font-bold text-slate-800 mb-1">Order Cancelled</p>
              <p className="text-sm text-slate-500 mb-5">
                Your order #{order.token} has been cancelled.
                {order.paymentMethod === "online" && " If you were charged, a refund has been initiated."}
              </p>
              <button onClick={reset} className="btn-primary">
                Start New Order
              </button>
            </div>
          )}

          {step === "receipt" && order && !cancelled && (
            <div>
              <div className="check-pop w-[70px] h-[70px] mx-auto mb-3 rounded-full bg-green-100 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-9 h-9">
                  <path d="M4 12l5 5L20 6" className="check-draw" stroke="#16a34a" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-center font-bold text-green-600 mb-4">Order Confirmed!</p>

              <div className="border border-dashed border-slate-300 rounded-xl px-4 py-4">
                <div className="text-center bg-indigo-50 text-blue-700 font-extrabold text-2xl tracking-wide py-2.5 rounded-lg mb-3">
                  #{order.token}
                </div>
                <Row label="Name" value={order.customerName} />
                <Row label="Date & Time" value={new Date(order.createdAt).toLocaleString()} />
                <Row label="Print Type" value={`${order.printType === "bw" ? "Black & White" : "Color"} · ${order.paperSize}`} />
                <Row label="Pages × Copies" value={`${order.pages} × ${order.copies}${order.pageCountEstimated ? " (est.)" : ""}`} />
                {order.binding !== "none" && <Row label="Binding" value={order.binding === "spiral" ? "Spiral" : "Lamination"} />}
                {order.priority && <Row label="Priority" value="⚡ Rush order" />}
                <Row label="Payment Method" value={order.paymentMethod === "cash" ? "Cash (pay at counter)" : "UPI / Online"} />
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">Status</span>
                  {order.paymentStatus === "pending" ? (
                    <span className="badge-pending">Pending at counter</span>
                  ) : (
                    <span className="badge-paid">Paid</span>
                  )}
                </div>
                <div className="flex justify-between pt-2 mt-1 font-extrabold text-slate-800">
                  <span>Total Paid</span>
                  <span>₹{order.totalPrice}</span>
                </div>
              </div>

              {cancelSecondsLeft > 0 && (
                <button
                  onClick={handleCancelOrder}
                  disabled={cancelling}
                  className="w-full mt-4 py-3 rounded-xl border-[1.5px] border-red-200 bg-red-50 text-red-600 font-bold text-sm hover:bg-red-100 transition"
                >
                  {cancelling ? "Cancelling…" : `❌ Wrong file? Cancel order (${cancelSecondsLeft}s)`}
                </button>
              )}

              <Link href={`/track/${order.token}`} className="btn-secondary block text-center mt-4">
                📍 Track my order status
              </Link>

              <p className="text-center text-xs text-slate-500 mt-4 leading-relaxed">
                🔊 Aapka naam counter par pukara jaayega jab print ready ho.
                <br />
                Ye ek digital receipt hai.
              </p>

              <button onClick={reset} className="btn-primary mt-4">
                New Order
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small reusable UI pieces
// ---------------------------------------------------------------------------

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 text-[13.5px]">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}

function PayOption({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 border-[1.5px] rounded-xl p-3 text-[13px] font-semibold transition ${
        active ? "border-blue-600 bg-indigo-50 text-blue-700" : "border-slate-200 text-slate-700"
      }`}
    >
      {label}
    </button>
  );
}

/** A row of small tappable pill buttons — used everywhere instead of native <select> dropdowns for a faster mobile tap experience. */
function ChipGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3 py-2 rounded-lg text-[12.5px] font-bold border-[1.5px] transition ${
            value === opt.value ? "border-blue-600 bg-indigo-50 text-blue-700" : "border-slate-200 text-slate-600"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ToggleChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2.5 rounded-lg text-[12.5px] font-bold border-[1.5px] transition ${
        active ? "border-blue-600 bg-indigo-50 text-blue-700" : "border-slate-200 text-slate-600"
      }`}
    >
      {active ? "✅ " : ""}
      {label}
    </button>
  );
}

/** +/- stepper for copies — friendlier to tap on mobile than a <select> with 50 options. */
function Stepper({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min: number; max: number }) {
  return (
    <div className="flex items-center border-[1.5px] border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-10 h-10 flex items-center justify-center text-lg font-bold text-slate-600 hover:bg-slate-50"
      >
        −
      </button>
      <div className="flex-1 text-center font-bold text-[13.5px]">{value}</div>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-10 h-10 flex items-center justify-center text-lg font-bold text-slate-600 hover:bg-slate-50"
      >
        +
      </button>
    </div>
  );
}

/** Shows a real preview of the selected file before the customer pays — a PDF viewer, an image, or a generic file card for types that can't be previewed inline. */
function FilePreview({
  file,
  previewUrl,
  detecting,
  onRemove,
}: {
  file: File;
  previewUrl: string | null;
  detecting: boolean;
  onRemove: () => void;
}) {
  const isPdf = file.type === "application/pdf";
  const isImage = file.type.startsWith("image/");
  const sizeLabel = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex justify-between items-center px-3 py-2 bg-slate-50 border-b border-slate-200">
        <div className="text-[12px] font-semibold text-slate-700 truncate pr-2">{file.name}</div>
        <button type="button" onClick={onRemove} className="text-[11px] font-bold text-red-500 shrink-0">
          Remove
        </button>
      </div>

      {isPdf && previewUrl && (
        <embed src={previewUrl} type="application/pdf" className="w-full h-56 sm:h-64" />
      )}
      {isImage && previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt="Preview" className="w-full max-h-56 sm:max-h-64 object-contain bg-slate-100" />
      )}
      {!isPdf && !isImage && (
        <div className="flex items-center gap-3 px-4 py-5">
          <div className="text-3xl">{file.name.match(/\.zip$/i) ? "🗜️" : "📝"}</div>
          <div className="text-[12px] text-slate-500">
            Preview not available for this file type — {sizeLabel}. Shop staff will open and verify it before printing.
          </div>
        </div>
      )}

      <div className="px-3 py-2 text-[11.5px] text-slate-500 bg-white">
        {detecting ? "Detecting pages…" : "✅ Ready"}
      </div>
    </div>
  );
}
