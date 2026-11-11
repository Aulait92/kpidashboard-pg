import { ArrowRight } from "lucide-react";
import type { LoginInfo } from "@/lib/login-info";

/**
 * Infokarte rechts neben dem Login (auf dem Handy darunter). Auch als Vorschau
 * in den Admin-Einstellungen genutzt (imageSrc dort ggf. als lokale Vorschau).
 */
export function LoginInfoCard({
  info,
  imageSrc,
  compact = false,
}: {
  info: Pick<LoginInfo, "badge" | "title" | "text" | "linkText" | "linkUrl">;
  imageSrc?: string | null;
  compact?: boolean;
}) {
  const external = !!info.linkUrl && /^https?:\/\//i.test(info.linkUrl);
  return (
    <section
      aria-label="Neuigkeiten"
      className={`relative flex h-full w-full flex-col overflow-hidden rounded-[28px] border border-[color:var(--border)] bg-gradient-to-br from-[#eef3ff] via-white to-[#f3f7ff] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_48px_-24px_rgba(37,99,235,0.25)] ${compact ? "" : "min-h-[420px]"}`}
    >
      <div className={`relative z-10 ${compact ? "px-6 pt-6" : "px-8 pt-10 sm:px-10"} text-center`}>
        {info.badge ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--brand)] px-3 py-1 text-xs font-semibold text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-white/80" aria-hidden="true" />
            {info.badge}
          </span>
        ) : null}
        <h2 className={`${compact ? "mt-3 text-xl" : "mt-4 text-2xl sm:text-[28px]"} font-bold leading-tight tracking-tight text-[color:var(--foreground)]`}>
          {info.title}
        </h2>
        {info.text ? (
          <p className={`mx-auto mt-3 max-w-md whitespace-pre-line ${compact ? "text-sm" : "text-[15px]"} leading-relaxed text-[color:var(--muted)]`}>{info.text}</p>
        ) : null}
        {info.linkUrl && info.linkText ? (
          <a
            href={info.linkUrl}
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-[color:var(--brand)] transition hover:bg-[color:var(--brand-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
          >
            {info.linkText}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        ) : null}
      </div>
      <div className={`relative mt-6 flex flex-1 items-end ${compact ? "px-4" : "px-6 sm:px-8"}`}>
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- Bild kommt aus der DB bzw. als lokale Vorschau
          <img
            src={imageSrc}
            alt=""
            className={`w-full rounded-t-[20px] border border-b-0 border-[color:var(--border)] object-cover object-top ${compact ? "max-h-40" : "max-h-[340px]"}`}
          />
        ) : (
          <Decoration compact={compact} />
        )}
      </div>
    </section>
  );
}

/** Ohne Bild: angedeutete App-Liste (rein dekorativ, keine Daten). */
function Decoration({ compact }: { compact: boolean }) {
  const rows = compact ? 2 : 3;
  return (
    <div aria-hidden="true" className="w-full rounded-t-[20px] border border-b-0 border-[color:var(--border)] bg-white/90 p-4 shadow-[0_-12px_32px_-24px_rgba(37,99,235,0.35)]">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--brand)]" />
        <span className="h-2 w-24 rounded-full bg-slate-200" />
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-sunken)] px-3 py-2.5">
            <span className={`h-8 w-8 shrink-0 rounded-full ${i === 0 ? "bg-[color:var(--brand-soft)]" : "bg-slate-100"}`} />
            <span className="min-w-0 flex-1 space-y-1.5">
              <span className="block h-2 w-3/5 rounded-full bg-slate-200" />
              <span className="block h-2 w-2/5 rounded-full bg-slate-100" />
            </span>
            <span className={`h-6 w-16 shrink-0 rounded-full ${i === 0 ? "bg-[color:var(--brand)]" : "bg-slate-200"}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
