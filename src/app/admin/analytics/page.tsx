"use client";

import { useEffect, useState, useCallback } from "react";
import FluentIcon from "@/components/lexical/FluentIcon";
import { Card, CardHeader, Chip, GRADIENTS, PageHero, StatCard } from "@/components/lexical/ui";

interface AnalyticsData {
  daily: { date: string; orders: number; revenue: number }[];
  hourCounts: number[];
  printTypeSplit: { bw: number; color: number };
  totals: { orders: number; revenue: number; pages: number; avgOrderValue: number };
}

const fmtHour = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/analytics", { cache: "no-store" });
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    load();
  }, [load]);

  if (!data) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-sm text-slate-900/60">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#4F46E5] border-t-transparent" />
        Loading analytics…
      </div>
    );
  }

  const maxRevenue = Math.max(1, ...data.daily.map((d) => d.revenue));
  const maxHour = Math.max(1, ...data.hourCounts);
  const peakHour = data.hourCounts.indexOf(Math.max(...data.hourCounts));
  const hasHourData = data.hourCounts.some((c) => c > 0);
  const totalPrintType = data.printTypeSplit.bw + data.printTypeSplit.color || 1;
  const bwPct = Math.round((data.printTypeSplit.bw / totalPrintType) * 100);
  const colorPct = 100 - bwPct;

  return (
    <div className="space-y-6">
      <PageHero
        icon={<FluentIcon name="bar-chart" size={56} />}
        gradient={GRADIENTS.purple}
        title="Analytics"
        subtitle="Last 14 days · paid orders only"
      />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<FluentIcon name="clipboard" size={44} />} label="Orders" value={String(data.totals.orders)} hint="Last 14 days" />
        <StatCard icon={<FluentIcon name="money-bag" size={44} />} label="Revenue" value={`₹${data.totals.revenue}`} hint="Paid orders" />
        <StatCard icon={<FluentIcon name="printer" size={44} />} label="Pages Printed" value={String(data.totals.pages)} hint="All printers" />
        <StatCard icon={<FluentIcon name="ledger" size={44} />} label="Avg. Order Value" value={`₹${data.totals.avgOrderValue}`} hint="Per paid order" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Revenue chart */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader
              icon={<FluentIcon name="bar-chart" size={30} />}
              title="Revenue — Last 14 Days"
              subtitle="Hover a bar to see the day's orders"
            />
            <div className="px-6 pb-6">
              <div className="relative h-56">
                {/* grid lines */}
                {[0, 25, 50, 75, 100].map((p) => (
                  <div key={p} className="absolute inset-x-0 border-t border-dashed border-slate-900/10" style={{ bottom: `${p}%` }}>
                    <span className="absolute -top-2 left-0 bg-white pr-1 text-[10px] text-slate-900/40">
                      ₹{Math.round((maxRevenue * p) / 100)}
                    </span>
                  </div>
                ))}
                <div className="absolute inset-0 flex items-end gap-1.5 pl-10">
                  {data.daily.map((d) => (
                    <div key={d.date} className="group relative flex h-full flex-1 flex-col justify-end">
                      <div
                        className="w-full rounded-t-md transition group-hover:brightness-110"
                        style={{
                          height: `${Math.max(2, (d.revenue / maxRevenue) * 100)}%`,
                          background: "linear-gradient(180deg, #6366F1 0%, #4F46E5 100%)",
                        }}
                      />
                      <div className="pointer-events-none absolute -top-12 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] text-white shadow-lg group-hover:block">
                        <div className="font-semibold">₹{d.revenue}</div>
                        <div className="text-white/70">{d.orders} orders</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-2 flex gap-1.5 pl-10">
                {data.daily.map((d) => (
                  <span key={d.date} className="flex-1 text-center text-[10px] text-slate-900/50">
                    {d.date.slice(5)}
                  </span>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* Print type donut */}
        <Card className="h-full">
          <CardHeader icon={<FluentIcon name="printer" size={30} />} title="Print Type Split" subtitle="B&W vs Color" />
          <div className="flex flex-col items-center gap-5 px-6 pb-6">
            <div
              className="relative h-44 w-44 rounded-full"
              style={{
                background: `conic-gradient(#334155 0 ${bwPct}%, #6366F1 ${bwPct}% 100%)`,
              }}
            >
              <div className="absolute inset-[22px] flex flex-col items-center justify-center rounded-full bg-white">
                <div className="text-2xl font-extrabold text-slate-900/90">{data.printTypeSplit.bw + data.printTypeSplit.color}</div>
                <div className="text-xs text-slate-900/50">print jobs</div>
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-900/70">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-700" /> B&amp;W
                </span>
                <span className="font-semibold text-slate-900/90">
                  {data.printTypeSplit.bw} <span className="font-normal text-slate-900/40">({bwPct}%)</span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-900/70">
                  <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" /> Color
                </span>
                <span className="font-semibold text-slate-900/90">
                  {data.printTypeSplit.color} <span className="font-normal text-slate-900/40">({colorPct}%)</span>
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Peak hours */}
      <Card>
        <CardHeader
          icon={<FluentIcon name="hourglass-not-done" size={30} />}
          title="Peak Hours"
          subtitle="When customers order the most"
          action={hasHourData ? <Chip color="primary">Busiest: {fmtHour(peakHour)}</Chip> : undefined}
        />
        <div className="px-6 pb-6">
          <div className="flex h-32 items-end gap-1">
            {data.hourCounts.map((c, hour) => (
              <div key={hour} className="group relative flex h-full flex-1 flex-col justify-end">
                <div
                  className="w-full rounded-t-sm transition"
                  style={{
                    height: `${c ? Math.max(4, (c / maxHour) * 100) : 0}%`,
                    background: hour === peakHour && hasHourData ? "#4F46E5" : "#A5B4FC",
                  }}
                />
                <div className="pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white shadow-lg group-hover:block">
                  {fmtHour(hour)} — {c} orders
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-1">
            {data.hourCounts.map((_, hour) => (
              <span key={hour} className="flex-1 text-center text-[10px] text-slate-900/50">
                {hour % 3 === 0 ? `${hour}h` : ""}
              </span>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
