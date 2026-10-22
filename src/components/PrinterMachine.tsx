"use client";

interface PrinterMachineProps {
  amountLabel: string;
}

/**
 * Animated "machine" shown while payment is processing — a printer-like
 * box with a blinking status light and a sheet of paper sliding out.
 * Purely decorative/CSS-driven (see globals.css for the keyframes).
 */
export default function PrinterMachine({ amountLabel }: PrinterMachineProps) {
  return (
    <div className="relative w-40 h-32 mx-auto mb-2">
      <div className="machine-body relative w-40 h-[90px] rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-[0_12px_24px_rgba(37,99,235,0.35)]">
        <div className="machine-light absolute top-3.5 right-4 w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_#22d3ee]" />
        <div className="absolute top-4 left-4 w-12 h-6 rounded bg-slate-900 flex items-center justify-center text-[9px] font-bold text-green-400">
          {amountLabel}
        </div>
      </div>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[90px] h-2 rounded bg-slate-900" />
      <div className="machine-paper absolute top-[-2px] left-1/2 -translate-x-1/2 w-[70px] rounded-[3px] bg-white border border-blue-100 shadow-sm overflow-hidden">
        <div className="absolute top-2 left-2 right-2 h-[3px] bg-slate-300 shadow-[0_8px_0_#cbd5e1,0_16px_0_#cbd5e1,0_24px_0_#cbd5e1]" />
      </div>
    </div>
  );
}
