"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Tailwind port of the Lexical Software (Materio / MUI) building blocks.
 * Palette: Royal Indigo #4F46E5 + Slate. Font: Public Sans.
 */

export const LEX_FONT = "'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";

export const GRADIENTS = {
  indigo: "linear-gradient(120deg, #312E81 0%, #4F46E5 55%, #6366F1 100%)",
  teal: "linear-gradient(120deg, #0F766E 0%, #0D9488 60%, #2DD4BF 100%)",
  purple: "linear-gradient(120deg, #5B21B6 0%, #7C3AED 55%, #A78BFA 100%)",
  orange: "linear-gradient(120deg, #9A3412 0%, #EA580C 55%, #FB923C 100%)",
  blue: "linear-gradient(120deg, #1E3A8A 0%, #2563EB 55%, #60A5FA 100%)",
} as const;

export const CARD_SHADOW =
  "0px 3px 9px 1px rgba(51,48,60,0.03), 0px 8px 9px 0px rgba(51,48,60,0.02), 0px 1px 6px 4px rgba(51,48,60,0.01)";

// Same shadow as a Tailwind class (so :hover can override it without !important).
const CARD_SHADOW_CLASS =
  "shadow-[0px_3px_9px_1px_rgba(51,48,60,0.03),0px_8px_9px_0px_rgba(51,48,60,0.02),0px_1px_6px_4px_rgba(51,48,60,0.01)]";

/* ───────────────────────── Card ───────────────────────── */

export function Card({
  children,
  className = "",
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={`bg-white rounded-[10px] ${CARD_SHADOW_CLASS} ${
        hover ? "transition duration-150 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(79,70,229,0.14)]" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  icon,
  title,
  subtitle,
  action,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-6 pt-6 pb-4">
      <div className="flex min-w-0 items-center gap-3">
        {icon}
        <div className="min-w-0">
          <div className="text-lg font-medium leading-snug tracking-[0.15px] text-slate-900/90">{title}</div>
          {subtitle && <div className="mt-0.5 text-sm text-slate-900/50">{subtitle}</div>}
        </div>
      </div>
      {action}
    </div>
  );
}

/* ───────────────────────── Hero / stats ───────────────────────── */

export function PageHero({
  icon,
  title,
  subtitle,
  gradient = GRADIENTS.indigo,
  action,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  gradient?: string;
  action?: { label: string; onClick: () => void; icon?: string; disabled?: boolean };
}) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-4 rounded-[10px] p-6 text-white"
      style={{ background: gradient, boxShadow: CARD_SHADOW }}
    >
      <div className="flex items-center gap-4">
        <div className="flex shrink-0 items-center">{icon}</div>
        <div>
          <h1 className="text-[1.5rem] font-extrabold leading-tight text-white sm:text-[2.125rem]">{title}</h1>
          <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.88)" }}>
            {subtitle}
          </p>
        </div>
      </div>
      {action && (
        <button
          onClick={action.onClick}
          disabled={action.disabled}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-5 py-[7px] text-[0.9375rem] font-medium text-slate-800 shadow transition hover:bg-slate-100 disabled:opacity-60"
        >
          <span className="text-base leading-none">{action.icon ?? "+"}</span>
          {action.label}
        </button>
      )}
    </div>
  );
}

export function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <div className="flex items-center gap-3 p-6">
        {icon}
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-900/60">{label}</div>
          <div className="text-2xl font-extrabold leading-tight text-slate-900/90">{value}</div>
          {hint && <div className="text-xs text-slate-900/60">{hint}</div>}
        </div>
      </div>
    </Card>
  );
}

/* ───────────────────────── Chip / Avatar / Field ───────────────────────── */

export type Tone = "primary" | "success" | "warning" | "error" | "secondary" | "purple" | "info";

export const TONES: Record<Tone, { bg: string; fg: string; main: string }> = {
  primary: { bg: "rgba(79,70,229,0.16)", fg: "#4F46E5", main: "#4F46E5" },
  success: { bg: "rgba(16,185,129,0.16)", fg: "#059669", main: "#10B981" },
  warning: { bg: "rgba(245,158,11,0.16)", fg: "#D97706", main: "#F59E0B" },
  error: { bg: "rgba(244,63,94,0.16)", fg: "#E11D48", main: "#F43F5E" },
  secondary: { bg: "rgba(100,116,139,0.16)", fg: "#475569", main: "#64748B" },
  purple: { bg: "rgba(168,85,247,0.16)", fg: "#9333EA", main: "#A855F7" },
  info: { bg: "rgba(14,165,233,0.16)", fg: "#0284C7", main: "#0EA5E9" },
};

export type ChipColor = Tone;

/** MUI "light skin, rounded" chip. */
export function Chip({
  color = "secondary",
  children,
  small = false,
}: {
  color?: Tone;
  children: ReactNode;
  small?: boolean;
}) {
  const c = TONES[color];
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium whitespace-nowrap ${
        small ? "px-2 py-[1px] text-[11px]" : "px-3 py-[3px] text-[13px]"
      }`}
      style={{ background: c.bg, color: c.fg }}
    >
      {children}
    </span>
  );
}

export function Avatar({
  children,
  color = "primary",
  size = 46,
}: {
  children: ReactNode;
  color?: Tone;
  size?: number;
}) {
  const c = TONES[color];
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{ width: size, height: size, background: c.bg, color: c.fg, fontSize: size * 0.4 }}
    >
      {children}
    </div>
  );
}

export function Field({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-slate-900/60">{k}</div>
      <div className="truncate text-sm font-semibold text-slate-900/90">{v}</div>
    </div>
  );
}

/* ───────────────────────── Buttons / alerts / switch ───────────────────────── */

type BtnVariant = "contained" | "light" | "outlined" | "text";

export function Button({
  variant = "contained",
  tone = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; tone?: Tone; size?: "sm" | "md" }) {
  const c = TONES[tone];
  const pad = size === "sm" ? "px-3 py-1 text-[13px]" : "px-5 py-2 text-sm";
  const style =
    variant === "contained"
      ? { background: c.main, color: "#fff", boxShadow: `0 2px 6px ${c.main}66` }
      : variant === "light"
        ? { background: c.bg, color: c.fg }
        : variant === "outlined"
          ? { border: `1px solid ${c.main}99`, color: c.fg }
          : { color: c.fg };
  return (
    <button
      {...props}
      style={style}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 ${pad} ${className}`}
    />
  );
}

export function Alert({
  tone = "warning",
  icon,
  children,
  className = "",
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const c = TONES[tone];
  return (
    <div
      className={`flex items-start gap-3 rounded-[10px] px-4 py-3 text-sm ${className}`}
      style={{ background: c.bg.replace("0.16", "0.12"), color: c.fg }}
    >
      {icon && <span className="text-lg leading-none">{icon}</span>}
      <div className="min-w-0 grow">{children}</div>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-900/10 px-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900/90">{title}</div>
        {description && <div className="mt-0.5 text-xs text-slate-900/60">{description}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-[22px] w-[40px] shrink-0 rounded-full transition ${checked ? "bg-[#4F46E5]" : "bg-slate-300"}`}
      >
        <span
          className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? "left-[21px]" : "left-[3px]"}`}
        />
      </button>
    </div>
  );
}

/* ───────────────────────── Inputs ───────────────────────── */

const FIELD_CLS =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-[13px] text-sm text-slate-900/90 outline-none transition hover:border-slate-500 focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5]";

/** Outlined text field with a floating label, like MUI <TextField />. */
export function TextField({
  label,
  value,
  onChange,
  required,
  helper,
  type = "text",
  placeholder,
  min,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  required?: boolean;
  helper?: string;
  type?: string;
  placeholder?: string;
  min?: number;
}) {
  return (
    <div>
      <div className="relative">
        <input
          type={type}
          min={min}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          placeholder={placeholder ?? " "}
          className={`peer ${FIELD_CLS}`}
        />
        <label className="pointer-events-none absolute left-2.5 top-0 -translate-y-1/2 bg-white px-1 text-xs text-slate-900/60 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:text-sm peer-focus:top-0 peer-focus:text-xs peer-focus:text-[#4F46E5]">
          {label}
          {required && " *"}
        </label>
      </div>
      {helper && <p className="mt-1.5 px-3.5 text-xs text-slate-900/60">{helper}</p>}
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  helper,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  helper?: string;
}) {
  return (
    <TextField label={label} type="number" min={0} value={value} onChange={(v) => onChange(Number(v))} helper={helper} />
  );
}

export function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)} className={FIELD_CLS}>
        {children}
      </select>
      <label className="pointer-events-none absolute left-2.5 top-0 -translate-y-1/2 bg-white px-1 text-xs text-slate-900/60">
        {label}
      </label>
    </div>
  );
}

/** Compact number input for table cells. */
export function CellInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      min={0}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900/90 outline-none transition hover:border-slate-500 focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5]"
    />
  );
}

/* ───────────────────────── Dialog ───────────────────────── */

export function Dialog({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-[10px] bg-white shadow-2xl"
      >
        {children}
      </div>
    </div>
  );
}
