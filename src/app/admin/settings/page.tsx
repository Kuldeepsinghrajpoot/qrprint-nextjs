"use client";

import { useEffect, useState, useCallback } from "react";
import type { PricingConfigDTO, PaperSize, PrintType } from "@/types/order";
import FluentIcon from "@/components/lexical/FluentIcon";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  CellInput,
  Chip,
  GRADIENTS,
  NumberField,
  PageHero,
  Switch,
  TextField,
} from "@/components/lexical/ui";

const PAPER_SIZES: PaperSize[] = ["A4", "A3", "Legal", "Letter", "Photo"];
const PRINT_TYPES: PrintType[] = ["bw", "color"];

export default function SettingsPage() {
  const [config, setConfig] = useState<PricingConfigDTO | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/pricing", { cache: "no-store" });
    setConfig(await res.json());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    load();
  }, [load]);

  function updateRate(size: PaperSize, type: PrintType, field: "page1" | "page2to10" | "page11plus", value: number) {
    if (!config) return;
    setConfig({
      ...config,
      rates: {
        ...config.rates,
        [size]: {
          ...config.rates[size],
          [type]: { ...config.rates[size][type], [field]: value },
        },
      },
    });
  }

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setConfig(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-sm text-slate-900/60">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#4F46E5] border-t-transparent" />
        Loading settings…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        icon={<FluentIcon name="gear" size={56} />}
        gradient={GRADIENTS.orange}
        title="Pricing & Settings"
        subtitle="Changes apply instantly to the customer upload page."
        action={{ label: saving ? "Saving…" : "Save Changes", icon: "💾", onClick: handleSave, disabled: saving }}
      />

      {error && (
        <Alert tone="error" icon="⚠️">
          {error}
        </Alert>
      )}
      {saved && (
        <Alert tone="success" icon="✅">
          Settings saved — the customer page is already using the new prices.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Shop */}
        <Card>
          <CardHeader icon={<FluentIcon name="printer" size={30} />} title="Shop" subtitle="Shown on the customer page" />
          <div className="px-6 pb-6">
            <TextField label="Shop Name" value={config.shopName} onChange={(v) => setConfig({ ...config, shopName: v })} />
          </div>
        </Card>

        {/* Extra charges */}
        <div className="xl:col-span-2">
          <Card className="h-full">
            <CardHeader icon={<FluentIcon name="money-bag" size={30} />} title="Discounts & Extra Charges" subtitle="Duplex, rush, binding and lamination" />
            <div className="grid grid-cols-1 gap-5 px-6 pb-6 sm:grid-cols-2">
              <NumberField label="Duplex discount (%)" value={config.duplexDiscountPercent} onChange={(v) => setConfig({ ...config, duplexDiscountPercent: v })} />
              <NumberField label="Priority / rush fee (%)" value={config.priorityFeePercent} onChange={(v) => setConfig({ ...config, priorityFeePercent: v })} />
              <NumberField label="Spiral binding charge (₹ flat)" value={config.bindingSpiralCharge} onChange={(v) => setConfig({ ...config, bindingSpiralCharge: v })} />
              <NumberField label="Lamination charge (₹ per page)" value={config.bindingLaminationCharge} onChange={(v) => setConfig({ ...config, bindingLaminationCharge: v })} />
            </div>
          </Card>
        </div>
      </div>

      {/* Tiered pricing table */}
      <Card>
        <CardHeader icon={<FluentIcon name="ledger" size={30} />} title="Tiered Pricing (₹ per page)" subtitle="Price per page changes as the page count grows" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="bg-[#F8FAFC] text-left text-xs font-semibold uppercase tracking-wide text-slate-900/60">
                <th className="px-6 py-3">Paper Size</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Page 1</th>
                <th className="px-3 py-3">Page 2–10</th>
                <th className="px-3 py-3">Page 11+</th>
              </tr>
            </thead>
            <tbody>
              {PAPER_SIZES.map((size) =>
                PRINT_TYPES.map((type) => (
                  <tr key={`${size}-${type}`} className="border-t border-slate-900/[0.07] transition hover:bg-[#4F46E5]/[0.03]">
                    <td className="px-6 py-2.5 font-semibold text-slate-900/90">
                      {type === "bw" ? (size === "Photo" ? "📷 Photo" : size) : ""}
                    </td>
                    <td className="px-3 py-2.5">
                      <Chip color={type === "bw" ? "secondary" : "primary"} small>
                        {type === "bw" ? "B&W" : "Color"}
                      </Chip>
                    </td>
                    {(["page1", "page2to10", "page11plus"] as const).map((field) => (
                      <td key={field} className="px-3 py-2.5">
                        <CellInput value={config.rates[size][type][field]} onChange={(v) => updateRate(size, type, field, v)} />
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* GST & payments */}
        <Card>
          <CardHeader icon={<FluentIcon name="ledger" size={30} />} title="GST & Payments" subtitle="Tax and accepted payment methods" />
          <div className="space-y-3 px-6 pb-6">
            <Switch checked={config.gstEnabled} onChange={(v) => setConfig({ ...config, gstEnabled: v })} title="Enable GST" description="Adds GST to every order total" />
            {config.gstEnabled && (
              <div className="max-w-[200px]">
                <NumberField label="GST %" value={config.gstPercent} onChange={(v) => setConfig({ ...config, gstPercent: v })} />
              </div>
            )}
            <Switch checked={config.cashPaymentEnabled} onChange={(v) => setConfig({ ...config, cashPaymentEnabled: v })} title="Accept Cash payments" description="Customer pays at the counter" />
            <Switch checked={config.onlinePaymentEnabled} onChange={(v) => setConfig({ ...config, onlinePaymentEnabled: v })} title="Accept Online (UPI/Card) payments" description="Razorpay checkout on the customer page" />
          </div>
        </Card>

        {/* Queue control */}
        <Card>
          <CardHeader icon={<FluentIcon name="hourglass-not-done" size={30} />} title="Queue Control" subtitle="Lunch break or printer maintenance" />
          <div className="space-y-3 px-6 pb-6">
            <Switch
              checked={config.printingPaused}
              onChange={(v) => setConfig({ ...config, printingPaused: v })}
              title="⏸️ Pause printing"
              description="Blocks new orders and holds the queue until you resume"
            />
            <p className="text-xs text-slate-900/50">
              There&apos;s also a quick toggle for this right on the Live Queue page — no need to come here just to pause.
            </p>
          </div>
        </Card>
      </div>

      {/* Sticky save bar */}
      <div className="sticky bottom-4 z-20">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
            <span className="text-sm text-slate-900/60">Remember to save — changes go live for customers right after.</span>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "💾 Save Changes"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
