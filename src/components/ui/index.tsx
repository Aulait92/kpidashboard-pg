// Designsystem-Bausteine für den Kundenbereich. Regeln und Beispiele:
// docs/design-system.md. Neue Oberflächen bauen NUR aus diesen Teilen
// (keine Einzel-Klassen für Buttons/Karten/Chips), damit alles gleich wirkt.

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Button ────────────────────────────────────────────────────────────
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-semibold transition active:opacity-70 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] focus-visible:ring-offset-2";
const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand-dark)]",
  secondary: "bg-[color:var(--fill)] text-[color:var(--brand)] hover:bg-[rgba(120,120,128,0.18)]",
  ghost: "text-[color:var(--brand)] hover:bg-[color:var(--fill)]",
  danger: "bg-[color:var(--fill)] text-[color:var(--red)] hover:bg-[rgba(120,120,128,0.18)]",
};
const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3.5 text-[13px]",
  md: "h-11 px-5 text-[15px]",
};

export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "sm", extra?: string) {
  return cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], extra);
}

export function Button({
  variant = "secondary",
  size = "sm",
  icon: Icon,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
}) {
  return (
    <button className={buttonClass(variant, size, className)} {...props}>
      {Icon ? <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "secondary",
  size = "sm",
  icon: Icon,
  external,
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  external?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const inner = (
    <>
      {Icon ? <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} /> : null}
      {children}
    </>
  );
  if (external || href.startsWith("tel:") || href.startsWith("http") || href.startsWith("mailto:")) {
    return (
      <a
        href={href}
        className={buttonClass(variant, size, className)}
        {...(href.startsWith("http") || external ? { target: "_blank", rel: "noreferrer" } : {})}
      >
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {inner}
    </Link>
  );
}

// ─── Card ──────────────────────────────────────────────────────────────
export function Card({
  className,
  children,
  tone = "default",
  menus = false,
}: {
  className?: string;
  children: React.ReactNode;
  tone?: "default" | "attention";
  /** true, wenn die Karte Aufklapp-Menüs enthält (sonst würden sie abgeschnitten). */
  menus?: boolean;
}) {
  return (
    <section
      className={cn(
        menus ? "" : "overflow-hidden",
        "rounded-[var(--radius-lg)] bg-[color:var(--surface)]",
        tone === "attention" ? "ring-1 ring-[color:var(--orange)]/40" : "",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  count,
  icon: Icon,
  hint,
  actions,
}: {
  title: string;
  count?: number;
  icon?: LucideIcon;
  hint?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border)] px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon ? <Icon className="h-[18px] w-[18px] shrink-0 text-[color:var(--brand)]" /> : null}
        <h2 className="truncate text-[17px] font-semibold tracking-tight">
          {title}
          {count != null ? <span className="ml-1.5 font-normal text-[color:var(--muted)]">{count}</span> : null}
        </h2>
      </div>
      {actions ?? (hint ? <span className="hidden text-xs text-[color:var(--muted)] sm:inline">{hint}</span> : null)}
    </div>
  );
}

// ─── Badge ─────────────────────────────────────────────────────────────
type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";
const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  brand: "bg-blue-50 text-blue-700 ring-blue-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-rose-50 text-rose-700 ring-rose-200",
  info: "bg-sky-50 text-sky-700 ring-sky-200",
};

export function Badge({
  tone = "neutral",
  className,
  icon: Icon,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        className ?? BADGE_TONES[tone],
      )}
    >
      {Icon ? <Icon className="h-3 w-3" /> : null}
      {children}
    </span>
  );
}

// ─── EmptyState / Skeleton ─────────────────────────────────────────────
export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <Icon className="h-10 w-10 text-[color:var(--border-strong)]" strokeWidth={1.5} />
      <div className="text-[17px] font-semibold">{title}</div>
      {text ? <p className="max-w-sm text-[15px] text-[color:var(--muted)]">{text}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("ui-skeleton rounded-[var(--radius-sm)]", className)} />;
}

/** Platzhalter, solange eine Seite lädt (Suspense-Fallback). */
export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
