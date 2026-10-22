"use client";

import { useEffect, useState } from "react";
import FluentIcon from "@/components/lexical/FluentIcon";
import { Alert, Card, CardHeader, GRADIENTS, PageHero } from "@/components/lexical/ui";

const STEPS = [
  { icon: "🖨️", title: "Print the QR", text: "Download the PNG and print it at A5 size or bigger." },
  { icon: "🪪", title: "Laminate & stick", text: "Laminate it and place it on the counter or shop window." },
  { icon: "📱", title: "Customers scan", text: "They scan with the phone camera, upload the file and pay." },
];

export default function QrPage() {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [appUrl, setAppUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading window.location requires the client-only effect
    setAppUrl(process.env.NEXT_PUBLIC_APP_URL || window.location.origin);
    setQrUrl(`/api/qr?t=${Date.now()}`);
  }, []);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${appUrl}/`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked — user can still select the text
    }
  }

  return (
    <div className="space-y-6">
      <PageHero
        icon={<FluentIcon name="link" size={56} />}
        gradient={GRADIENTS.blue}
        title="Shop QR Code"
        subtitle="Print this and stick it on the counter — customers scan to upload & pay."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Card className="h-full">
            <div className="flex flex-col items-center p-6 text-center">
              <div
                className="rounded-2xl p-3"
                style={{ background: "linear-gradient(135deg, #4F46E5 0%, #6366F1 50%, #A78BFA 100%)" }}
              >
                <div className="rounded-xl bg-white p-3">
                  {qrUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- dynamically generated PNG from our own API, not a static asset
                    <img src={qrUrl} alt="Shop QR code" className="h-60 w-60 rounded-lg sm:h-64 sm:w-64" />
                  ) : (
                    <div className="h-60 w-60 animate-pulse rounded-lg bg-slate-100 sm:h-64 sm:w-64" />
                  )}
                </div>
              </div>

              <div className="mt-5 flex w-full items-center gap-2 rounded-lg bg-slate-900/[0.04] px-3 py-2 text-left">
                <span className="min-w-0 grow truncate text-[13px] text-slate-900/70">{appUrl}/</span>
                <button onClick={copyLink} className="shrink-0 text-[13px] font-semibold text-[#4F46E5] hover:underline">
                  {copied ? "Copied ✓" : "Copy"}
                </button>
              </div>

              <a
                href={qrUrl ?? "#"}
                download="shop-qr.png"
                className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#4F46E5] px-5 py-2 text-sm font-medium text-white shadow-[0_2px_6px_rgba(79,70,229,0.4)] transition hover:brightness-95"
              >
                ⬇ Download PNG
              </a>
            </div>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader icon={<FluentIcon name="clipboard" size={30} />} title="How it works" subtitle="Three steps to start taking orders" />
            <div className="space-y-4 px-6 pb-6">
              {STEPS.map((s, i) => (
                <div key={s.title} className="flex items-start gap-4">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg"
                    style={{ background: "rgba(79,70,229,0.12)" }}
                  >
                    {s.icon}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900/90">
                      Step {i + 1} · {s.title}
                    </div>
                    <div className="mt-0.5 text-sm text-slate-900/60">{s.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Alert tone="primary" icon="💡">
            Tip: Print this at a large size (A5 or bigger) and laminate it for the counter — customers scan it with their
            phone camera to open the upload page directly.
          </Alert>
        </div>
      </div>
    </div>
  );
}
