"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import FluentIcon, { type FluentIconName } from "@/components/lexical/FluentIcon";

export interface NavItem {
  href: string;
  label: string;
  icon: FluentIconName;
  ownerOnly?: boolean;
}

export const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Insights",
    items: [{ href: "/admin/analytics", label: "Analytics", icon: "bar-chart" }],
  },
  {
    title: "Shop",
    items: [
      { href: "/admin", label: "Live Queue", icon: "clipboard" },
      { href: "/admin/printers", label: "Printers", icon: "printer" },
    ],
  },
  {
    title: "Manage",
    items: [
      { href: "/admin/settings", label: "Pricing & Settings", icon: "gear", ownerOnly: true },
      { href: "/admin/qr", label: "Shop QR Code", icon: "link" },
    ],
  },
];

export default function AdminNav({
  role,
  open,
  onClose,
}: {
  role: string;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {/* mobile backdrop */}
      {open && <div className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden" onClick={onClose} />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col bg-white shadow-[0_0_20px_rgba(51,48,60,0.06)] transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:shadow-[1px_0_0_rgba(15,23,42,0.08)] ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand */}
        <Link href="/admin" onClick={onClose} className="flex items-center gap-3 px-6 pb-5 pt-6">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-[10px]"
            style={{ background: "linear-gradient(135deg, #312E81 0%, #4F46E5 60%, #6366F1 100%)", boxShadow: "0 4px 10px rgba(79,70,229,0.4)" }}
          >
            <FluentIcon name="printer" size={26} />
          </span>
          <span>
            <span className="block text-[1.25rem] font-extrabold leading-tight tracking-tight text-slate-900/90">QRtoPrint</span>
            <span className="block text-[11px] font-medium uppercase tracking-wider text-slate-900/40">Shop Dashboard</span>
          </span>
        </Link>

        <nav className="flex-1 overflow-y-auto px-4 pb-6">
          {NAV_SECTIONS.map((section) => {
            const items = section.items.filter((i) => !i.ownerOnly || role === "owner");
            if (items.length === 0) return null;
            return (
              <div key={section.title} className="mt-4 first:mt-0">
                <div className="mb-2 flex items-center gap-2 px-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.4px] text-slate-900/40">{section.title}</span>
                  <span className="h-px grow bg-slate-900/10" />
                </div>
                <ul className="space-y-1">
                  {items.map((item) => {
                    const active = pathname === item.href;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onClose}
                          className={`flex items-center gap-3 rounded-lg px-3 py-[9px] text-[0.9375rem] transition ${
                            active
                              ? "font-medium text-white"
                              : "text-slate-900/75 hover:bg-slate-900/[0.04]"
                          }`}
                          style={
                            active
                              ? {
                                  background: "linear-gradient(72.47deg, #4F46E5 22.16%, rgba(79,70,229,0.7) 76.47%)",
                                  boxShadow: "0 2px 6px rgba(79,70,229,0.48)",
                                }
                              : undefined
                          }
                        >
                          <FluentIcon name={item.icon} size={22} />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="m-4 rounded-[10px] p-4 text-xs" style={{ background: "rgba(79,70,229,0.08)", color: "#4338CA" }}>
          <div className="mb-0.5 text-sm font-semibold">Need the customer page?</div>
          Customers scan your Shop QR to upload &amp; pay.{" "}
          <Link href="/admin/qr" onClick={onClose} className="font-semibold underline">
            Get QR →
          </Link>
        </div>
      </aside>
    </>
  );
}
