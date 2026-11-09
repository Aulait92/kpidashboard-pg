"use client";

// iOS-artige Bausteine: gruppierte Listen (Inset Grouped), Zeilen mit Avatar,
// runde Aktionsknöpfe und ein Aktionsblatt (Sheet) von unten.
// Grundsatz: eine sichtbare Hauptaktion je Zeile, alles andere per Antippen.

import Link from "next/link";
import { useEffect } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Großer Titel ──────────────────────────────────────────────────────
export function LargeTitle({ eyebrow, title, trailing }: { eyebrow?: string; title: string; trailing?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3 px-1 pt-2">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-[13px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">{eyebrow}</div>
        ) : null}
        <h1 className="truncate text-[34px] font-bold leading-tight tracking-tight">{title}</h1>
      </div>
      {trailing}
    </div>
  );
}

// ─── Gruppierte Liste ──────────────────────────────────────────────────
export function Section({
  title,
  count,
  footer,
  action,
  children,
  className,
}: {
  title?: string;
  count?: number;
  footer?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mb-7", className)}>
      {title ? (
        <div className="mb-1.5 flex items-baseline justify-between px-4">
          <h2 className="text-[20px] font-bold tracking-tight">
            {title}
            {count ? <span className="ml-2 text-[17px] font-semibold text-[color:var(--muted)]">{count}</span> : null}
          </h2>
          {action}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-[var(--radius-lg)] bg-white">{children}</div>
      {footer ? <div className="px-4 pt-1.5 text-[13px] text-[color:var(--muted)]">{footer}</div> : null}
    </section>
  );
}

const AVATAR_COLORS = ["#ff9500", "#34c759", "#007aff", "#5856d6", "#ff2d55", "#30b0c7", "#af52de", "#a2845e"];
export function Avatar({ name, size = 40, className }: { name: string; size?: number; className?: string }) {
  const initials =
    name
      .replace(/[^\p{L}\s]/gu, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center rounded-full font-semibold text-white", className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: AVATAR_COLORS[h % AVATAR_COLORS.length] }}
    >
      {initials}
    </span>
  );
}

/** Farbiges Quadrat mit Symbol (wie in den iOS-Einstellungen). */
export function IconTile({ icon: Icon, color, size = 30 }: { icon: LucideIcon; color: string; size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-[8px] text-white" style={{ width: size, height: size, background: color }}>
      <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
    </span>
  );
}

export function Row({
  leading,
  title,
  subtitle,
  detail,
  trailing,
  href,
  onClick,
  chevron,
  tone,
}: {
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Grauer Text rechts (z. B. Uhrzeit). */
  detail?: React.ReactNode;
  trailing?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  chevron?: boolean;
  tone?: "danger";
}) {
  const body = (
    <>
      {leading}
      <div className="flex min-w-0 flex-1 items-center gap-3 self-stretch border-b border-[color:var(--border)] py-2.5 pr-4 group-last/row:border-b-0">
        <div className="min-w-0 flex-1">
          <div className={cn("truncate text-[17px] leading-snug", tone === "danger" && "text-[color:var(--red)]")}>{title}</div>
          {subtitle ? <div className="truncate text-[15px] leading-snug text-[color:var(--muted)]">{subtitle}</div> : null}
        </div>
        {detail ? <div className="shrink-0 text-[15px] text-[color:var(--muted)]">{detail}</div> : null}
        {trailing}
        {chevron ? <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" strokeWidth={2.5} /> : null}
      </div>
    </>
  );
  const cls = "group/row ui-fade-in flex min-h-[56px] w-full items-center gap-3 pl-4 text-left";
  if (href) {
    return (
      <Link href={href} className={cn(cls, "ui-press")}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
        className={cn(cls, "ui-press cursor-pointer")}
      >
        {body}
      </div>
    );
  }
  return <div className={cls}>{body}</div>;
}

/** Runder Aktionsknopf in einer Zeile (z. B. grüner Hörer). */
export function RoundAction({
  icon: Icon,
  label,
  href,
  onClick,
  color = "var(--brand)",
  filled = false,
}: {
  icon: LucideIcon;
  label: string;
  href?: string;
  onClick?: () => void;
  color?: string;
  filled?: boolean;
}) {
  const cls = "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:opacity-60";
  const style = filled ? { background: color, color: "#fff" } : { background: "var(--fill)", color };
  const icon = <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />;
  if (href) {
    return (
      <a href={href} aria-label={label} title={label} className={cls} style={style} onClick={(e) => e.stopPropagation()}>
        {icon}
      </a>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cls}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {icon}
    </button>
  );
}

// ─── Aktionsblatt ──────────────────────────────────────────────────────
export type SheetAction = {
  label: string;
  icon?: LucideIcon;
  tone?: "danger" | "primary";
  href?: string;
  onSelect?: () => void;
};

export function Sheet({
  open,
  onClose,
  title,
  message,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="ui-backdrop absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className="ui-sheet relative w-full max-w-md px-2 pb-[max(env(safe-area-inset-bottom),8px)] sm:px-0 sm:pb-0"
        role="dialog"
        aria-modal="true"
      >
        {title || message ? (
          <div className="rounded-t-[14px] bg-white/95 px-4 py-3 text-center backdrop-blur">
            {title ? <div className="text-[13px] font-semibold text-[color:var(--muted)]">{title}</div> : null}
            {message ? <div className="mt-0.5 text-[13px] text-[color:var(--muted)]">{message}</div> : null}
          </div>
        ) : null}
        {children}
        <button
          type="button"
          onClick={onClose}
          className="mt-2 h-14 w-full rounded-[14px] bg-white text-[17px] font-semibold text-[color:var(--brand)] active:bg-[#e5e5ea]"
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}

/** Aktionsblatt mit einer Liste von Aktionen (iOS Action Sheet). */
export function ActionSheet({
  open,
  onClose,
  title,
  message,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  actions: SheetAction[];
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} message={message}>
      <div className={cn("overflow-hidden bg-white", title || message ? "rounded-b-[14px] border-t border-[color:var(--border)]" : "rounded-[14px]")}>
        {actions.map((a, i) => {
          const cls = cn(
            "flex h-14 w-full items-center justify-center gap-2 text-[17px] active:bg-[#e5e5ea]",
            i > 0 && "border-t border-[color:var(--border)]",
            a.tone === "danger" ? "text-[color:var(--red)]" : "text-[color:var(--brand)]",
            a.tone === "primary" && "font-semibold",
          );
          const inner = (
            <>
              {a.icon ? <a.icon className="h-5 w-5" /> : null}
              {a.label}
            </>
          );
          return a.href ? (
            <a key={a.label} href={a.href} className={cls} onClick={onClose}>
              {inner}
            </a>
          ) : (
            <button
              key={a.label}
              type="button"
              className={cls}
              onClick={() => {
                onClose();
                a.onSelect?.();
              }}
            >
              {inner}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
