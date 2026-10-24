"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { OrderDTO, PrinterDTO, PricingConfigDTO } from "@/types/order";
import FluentIcon from "@/components/lexical/FluentIcon";
import { CANCEL_WINDOW_MS } from "@/lib/orderTiming";
import { Alert, Avatar, Button, Card, Chip, GRADIENTS, PageHero, StatCard, Switch, type Tone } from "@/components/lexical/ui";

const POLL_INTERVAL_MS = 3000;

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: "", label: "All" },
  { key: "queued", label: "Queued (reorder)" },
  { key: "printing", label: "Printing" },
  { key: "ready", label: "Ready" },
  { key: "collected", label: "Collected" },
  { key: "cancelled", label: "Cancelled" },
  { key: "failed", label: "Failed" },
];

export default function AdminQueuePage() {
  const [orders, setOrders] = useState<OrderDTO[]>([]);
  const [printers, setPrinters] = useState<PrinterDTO[]>([]);
  const [config, setConfig] = useState<PricingConfigDTO | null>(null);
  const [filter, setFilter] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [pauseToggling, setPauseToggling] = useState(false);
  const knownReadyIds = useRef<Set<string>>(new Set());

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/orders", { cache: "no-store" });
      const data: OrderDTO[] = await res.json();
      setOrders(data);
    } catch {
      // network hiccup — next poll will retry
    }
  }, []);

  const fetchPrinters = useCallback(async () => {
    try {
      const res = await fetch("/api/printers", { cache: "no-store" });
      setPrinters(await res.json());
    } catch {
      // ignore
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/pricing", { cache: "no-store" });
      setConfig(await res.json());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: syncing with an external polling API
    fetchOrders();
    fetchPrinters();
    fetchConfig();
    const interval = setInterval(() => {
      fetchOrders();
      fetchConfig();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchOrders, fetchPrinters, fetchConfig]);

  function announce(name: string) {
    if (!voiceEnabled) return;
    if (!("speechSynthesis" in window)) return;
    const utter = new SpeechSynthesisUtterance(`${name}, aapka print ready hai`);
    utter.lang = "hi-IN";
    utter.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }

  async function updateOrder(
    id: string,
    patch: Partial<Pick<OrderDTO, "paymentStatus" | "printStatus">> & { printerId?: string }
  ) {
    setOrders((prev) => prev.map((o) => (o._id === id ? { ...o, ...patch } : o)));

    const res = await fetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const updated: OrderDTO = await res.json();

    if (patch.printStatus === "ready" && !knownReadyIds.current.has(id)) {
      knownReadyIds.current.add(id);
      setBanner(`✅ ${updated.customerName} (#${updated.token}) — Print Ready! Counter se collect karein.`);
      announce(updated.customerName);
      setTimeout(() => setBanner(null), 5000);
    }

    fetchOrders();
  }

  async function togglePause() {
    if (!config) return;
    setPauseToggling(true);
    try {
      const res = await fetch("/api/settings/pause", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printingPaused: !config.printingPaused }),
      });
      setConfig(await res.json());
    } finally {
      setPauseToggling(false);
    }
  }

  // Reordering only makes sense for the "queued" view — sorted the same
  // way the Print Agent will actually pick them up (priority jobs first,
  // then by queuePosition). Dragging updates queuePosition for everyone
  // in this list; priority orders still print before non-priority ones
  // regardless of where they sit here, since that ordering rule is fixed.
  const queuedSorted = [...orders]
    .filter((o) => o.printStatus === "queued")
    .sort((a, b) => (b.priority === a.priority ? a.queuePosition - b.queuePosition : b.priority ? 1 : -1));

  function handleDrop(dropIndex: number) {
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      return;
    }
    const reordered = [...queuedSorted];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    setDragIndex(null);

    const newPositionById = new Map(reordered.map((o, idx) => [o._id, idx]));
    setOrders((prev) =>
      prev.map((o) => (newPositionById.has(o._id) ? { ...o, queuePosition: newPositionById.get(o._id)! } : o))
    );

    fetch("/api/orders/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderIds: reordered.map((o) => o._id) }),
    }).catch(() => {});
  }

  const isReorderView = filter === "queued";
  const visibleOrders = isReorderView ? queuedSorted : filter ? orders.filter((o) => o.printStatus === filter) : orders;

  const totalOrders = orders.length;
  const pendingCash = orders.filter((o) => o.paymentStatus === "pending").length;
  const readyCount = orders.filter((o) => o.printStatus === "ready").length;
  const needsPaperChange = orders.filter(
    (o) => o.paperSize !== "A4" && !o.printerId && o.printStatus === "queued" && o.paymentStatus !== "pending"
  );
  const todayRevenue = orders
    .filter((o) => o.paymentStatus === "paid" && new Date(o.createdAt).toDateString() === new Date().toDateString())
    .reduce((sum, o) => sum + o.totalPrice, 0);

  const countFor = (key: string) => (key ? orders.filter((o) => o.printStatus === key).length : orders.length);

  return (
    <div className="space-y-6">
      <PageHero
        icon={<FluentIcon name="clipboard" size={56} />}
        gradient={GRADIENTS.indigo}
        title="Live Queue"
        subtitle="Orders update automatically every few seconds."
        action={
          config
            ? {
                label: config.printingPaused ? "Resume Printing" : "Pause Printing",
                icon: config.printingPaused ? "▶" : "⏸",
                onClick: togglePause,
                disabled: pauseToggling,
              }
            : undefined
        }
      />

      {config?.printingPaused && (
        <Alert tone="warning" icon="⏸️">
          <b>PRINTING PAUSED</b> — new orders are on hold and the Print Agent won&apos;t pick up queued jobs until you resume.
        </Alert>
      )}

      {banner && (
        <div
          className="banner-slide rounded-[10px] px-4 py-3.5 text-sm font-bold text-white"
          style={{ background: "linear-gradient(90deg, #059669 0%, #10B981 100%)", boxShadow: "0 4px 12px rgba(16,185,129,0.35)" }}
        >
          {banner}
        </div>
      )}

      {needsPaperChange.length > 0 && (
        <Alert tone="warning" icon="📄">
          <b>
            {needsPaperChange.length} order{needsPaperChange.length > 1 ? "s" : ""} waiting on special paper
          </b>{" "}
          (Photo/A3/Legal) — load the right paper tray, then assign a printer below to release{" "}
          {needsPaperChange.length > 1 ? "them" : "it"} for printing.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<FluentIcon name="clipboard" size={44} />} label="Total Orders" value={String(totalOrders)} hint={`${orders.filter((o) => o.printStatus === "queued").length} in queue`} />
        <StatCard icon={<FluentIcon name="hourglass-not-done" size={44} />} label="Cash Pending" value={String(pendingCash)} hint={pendingCash ? "Waiting for payment" : "Nothing pending"} />
        <StatCard icon={<FluentIcon name="check-mark-button" size={44} />} label="Ready" value={String(readyCount)} hint="Waiting for pickup" />
        <StatCard icon={<FluentIcon name="money-bag" size={44} />} label="Today's Revenue" value={`₹${todayRevenue}`} hint="Paid orders only" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-6">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-3.5 py-1 text-[13px] font-medium whitespace-nowrap transition ${
                  filter === f.key
                    ? "border-[#4F46E5] bg-[#4F46E5] text-white shadow-sm"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {f.label}
                <span
                  className={`rounded-full px-1.5 text-[11px] ${filter === f.key ? "bg-white/25" : "bg-slate-900/[0.06]"}`}
                >
                  {countFor(f.key)}
                </span>
              </button>
            ))}
          </div>
          <div className="w-full sm:w-72">
            <Switch
              checked={voiceEnabled}
              onChange={setVoiceEnabled}
              title="🔊 Voice announcement"
              description="Hindi voice when an order is marked ready"
            />
          </div>
        </div>
      </Card>

      {isReorderView && visibleOrders.length > 1 && (
        <Alert tone="info" icon="🖐️">
          Drag cards to reorder the print queue (e.g. move a VIP customer up). ⚡ Priority orders always print first
          regardless of position here.
        </Alert>
      )}

      <div className="space-y-4">
        {visibleOrders.length === 0 && (
          <Card>
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <FluentIcon name="clipboard" size={56} />
              <div className="mt-3 text-lg font-bold text-slate-900/90">No orders in this view yet</div>
              <p className="mt-1 text-sm text-slate-900/60">New orders will appear here automatically.</p>
            </div>
          </Card>
        )}

        {visibleOrders.map((o, index) => (
          <div
            key={o._id}
            draggable={isReorderView}
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(index)}
            className={isReorderView ? "cursor-grab active:cursor-grabbing" : ""}
          >
            <OrderCard order={o} printers={printers} onUpdate={updateOrder} onAnnounce={announce} draggableHint={isReorderView} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** "SHOP-PC-01 (Kulde), FRONT-DESK-PC" — the computer(s) a printer is installed on. */
function computersLabel(p?: PrinterDTO): string {
  return (p?.hosts ?? [])
    .map((h) => (h.username ? `${h.hostname || "Unnamed computer"} (${h.username})` : h.hostname || "Unnamed computer"))
    .join(", ");
}

/** "🖨️ HP LaserJet · 💻 SHOP-PC-01 (Kulde)" — where an order is printing / printed (or assigned to). */
function orderWhere(order: OrderDTO, printers: PrinterDTO[]): string {
  if (order.printAgentId) {
    const host = printers.flatMap((p) => p.hosts ?? []).find((h) => h.agentId === order.printAgentId);
    const pc = host ? (host.username ? `${host.hostname} (${host.username})` : host.hostname) : "";
    return [order.printedOn && `🖨️ ${order.printedOn}`, pc && `💻 ${pc}`].filter(Boolean).join(" · ");
  }
  const assigned = printers.find((p) => p._id === order.printerId);
  const pcs = computersLabel(assigned);
  return assigned ? `🖨️ ${assigned.name}${pcs ? ` · 💻 ${pcs}` : ""}` : "";
}

/** "On hold" countdown: the customer can still cancel, so the order isn't sent to the printer yet. */
function HoldChip({ createdAt }: { createdAt: string }) {
  const [, tick] = useState(0);
  const left = Math.ceil((new Date(createdAt).getTime() + CANCEL_WINDOW_MS - Date.now()) / 1000);
  useEffect(() => {
    if (left <= 0) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [left > 0]); // eslint-disable-line react-hooks/exhaustive-deps -- only (re)start while the hold is active
  if (left <= 0) return null;
  return <Chip color="info">⏳ On hold — customer can still cancel · prints in {left}s</Chip>;
}

function OrderCard({
  order,
  printers,
  onUpdate,
  onAnnounce,
  draggableHint,
}: {
  order: OrderDTO;
  printers: PrinterDTO[];
  onUpdate: (
    id: string,
    patch: Partial<Pick<OrderDTO, "paymentStatus" | "printStatus">> & { printerId?: string }
  ) => void;
  onAnnounce: (name: string) => void;
  draggableHint?: boolean;
}) {
  const needsPaperChange =
    order.paperSize !== "A4" && !order.printerId && order.printStatus === "queued" && order.paymentStatus !== "pending";

  const avatarTone: Tone =
    order.printStatus === "ready" || order.printStatus === "collected"
      ? "success"
      : order.printStatus === "failed"
        ? "error"
        : order.printStatus === "cancelled"
          ? "secondary"
          : order.printStatus === "printing"
            ? "info"
            : "primary";

  return (
    <div
      className={`rounded-[10px] bg-white p-5 shadow-[0px_3px_9px_1px_rgba(51,48,60,0.03),0px_8px_9px_0px_rgba(51,48,60,0.02),0px_1px_6px_4px_rgba(51,48,60,0.01)] transition hover:shadow-[0_10px_28px_rgba(79,70,229,0.12)] ${
        needsPaperChange ? "ring-1 ring-amber-300" : ""
      }`}
      style={{ borderLeft: `4px solid ${needsPaperChange ? "#F59E0B" : order.priority ? "#F59E0B" : "#4F46E5"}` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar color={avatarTone}>{(order.customerName || "?").trim().charAt(0).toUpperCase()}</Avatar>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[15.5px] font-bold text-slate-900/90">
              {draggableHint && <span className="text-slate-300">⠿</span>}
              {order.customerName}
              <span className="rounded-md bg-[#4F46E5]/10 px-2 py-0.5 font-mono text-[13px] font-semibold text-[#4F46E5]">
                #{order.token}
              </span>
              {order.priority && (
                <Chip color="warning" small>
                  ⚡ PRIORITY
                </Chip>
              )}
            </div>
            <div className="mt-1 text-[13px] text-slate-900/60">
              {order.printType === "bw" ? "B&W" : "Color"} · {order.paperSize} · {order.pages}×{order.copies} pages
              {order.duplex ? " · Duplex" : ""}
              {order.binding !== "none" ? ` · ${order.binding}` : ""} · <b className="text-slate-900/80">₹{order.totalPrice}</b> ·{" "}
              {new Date(order.createdAt).toLocaleTimeString()}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {order.paymentStatus === "pending" && <Chip color="warning">Cash Pending</Chip>}
              {order.paymentStatus === "paid" && <Chip color="success">Paid</Chip>}
              {order.paymentStatus === "refunded" && <Chip color="warning">Refunded</Chip>}
              {order.printStatus === "queued" && order.paymentStatus !== "pending" && <HoldChip createdAt={order.createdAt} />}
              {order.printStatus === "printing" && <Chip color="info">Printing…</Chip>}
              {order.printStatus === "ready" && <Chip color="success">Ready ✅</Chip>}
              {order.printStatus === "collected" && <Chip color="success">Collected</Chip>}
              {order.printStatus === "cancelled" && <Chip color="secondary">Cancelled by customer</Chip>}
              {order.printStatus === "failed" && (
                <Chip color="error">Failed{order.printerError ? `: ${order.printerError}` : ""}</Chip>
              )}
              {orderWhere(order, printers) && <Chip color="secondary">{orderWhere(order, printers)}</Chip>}
              {needsPaperChange && <Chip color="warning">📄 Needs {order.paperSize} paper — won&apos;t auto-print</Chip>}
              {order.requiresManualPrint && order.printStatus === "queued" && (
                <Chip color="purple">📎 Word/ZIP file — open &amp; print manually, then Mark Ready</Chip>
              )}
              {order.pageCountEstimated && (
                <Chip color="warning">⚠️ Page count estimated by customer — verify before printing</Chip>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {order.paymentStatus === "pending" && (
            <Button variant="light" tone="warning" size="sm" onClick={() => onUpdate(order._id, { paymentStatus: "paid" })}>
              💵 Cash Received
            </Button>
          )}
          {(order.printStatus === "queued" || order.printStatus === "printing") && order.paymentStatus !== "pending" && (
            <Button size="sm" onClick={() => onUpdate(order._id, { printStatus: "ready" })}>
              {order.printStatus === "printing" ? "Mark Ready (manual)" : "Mark Ready"}
            </Button>
          )}
          {order.printStatus === "ready" && (
            <>
              <Button variant="light" tone="secondary" size="sm" onClick={() => onUpdate(order._id, { printStatus: "collected" })}>
                Mark Collected
              </Button>
              <Button variant="light" tone="success" size="sm" onClick={() => onAnnounce(order.customerName)}>
                🔊 Announce again
              </Button>
            </>
          )}
          {order.fileUrl && ["queued", "printing", "ready"].includes(order.printStatus) && (
            <a href={order.fileUrl} target="_blank" rel="noreferrer" className="text-[13px] font-medium text-[#4F46E5] hover:underline">
              📄 Open file
            </a>
          )}
          {order.printStatus !== "cancelled" && (
            <a
              href={`/api/orders/${order._id}/invoice`}
              target="_blank"
              rel="noreferrer"
              className="text-[13px] font-medium text-[#4F46E5] hover:underline"
            >
              🧾 Invoice
            </a>
          )}
        </div>
      </div>

      {order.printStatus === "failed" && (
        <div className="mt-4 rounded-lg p-3.5" style={{ background: "rgba(244,63,94,0.08)" }}>
          <div className="text-[13px] font-semibold" style={{ color: "#BE123C" }}>
            Printing failed — choose what to do
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => onUpdate(order._id, { printStatus: "queued" })}>
              🔁 Retry print
            </Button>
            {order.fileUrl && (
              <a
                href={order.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-lg px-3 py-1 text-[13px] font-medium transition hover:brightness-95"
                style={{ background: "rgba(79,70,229,0.16)", color: "#4F46E5" }}
              >
                🖨️ Open file &amp; print manually
              </a>
            )}
            <Button variant="light" tone="success" size="sm" onClick={() => onUpdate(order._id, { printStatus: "ready" })}>
              ✅ Printed manually — Mark Ready
            </Button>
            {printers.length > 0 && (
              <select
                defaultValue=""
                onChange={(e) => e.target.value && onUpdate(order._id, { printerId: e.target.value, printStatus: "queued" })}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] text-slate-900/80 outline-none transition hover:border-slate-500 focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5]"
              >
                <option value="">Retry on another printer…</option>
                {printers.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} ({p.status}){computersLabel(p) ? ` — ${computersLabel(p)}` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
          {!order.fileUrl && (
            <div className="mt-2 text-xs text-slate-900/60">The file is no longer available — ask the customer to send it again.</div>
          )}
        </div>
      )}

      {printers.length > 0 && order.printStatus === "queued" && (
        <div className="mt-4 flex items-center gap-2 border-t border-slate-900/10 pt-3">
          <span className="text-xs text-slate-900/60">Printer:</span>
          <select
            defaultValue=""
            onChange={(e) => e.target.value && onUpdate(order._id, { printerId: e.target.value })}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] text-slate-900/80 outline-none transition hover:border-slate-500 focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5]"
          >
            <option value="">Assign printer…</option>
            {printers.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name} ({p.status}){computersLabel(p) ? ` — ${computersLabel(p)}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
