// Kontingent oben auf der Bestand-Seite (Ole, 14.11.2026): Balken mit verbraucht, inklusive und
// Zusatzpaketen (mit Ablaufdatum). Unter 10 % Rest: Hinweis „Noch X Nachrichten frei“ mit „Paket dazubuchen“.
// Im Cockpit seit 19.11.2026 nur oben bei unter 20 % frei oder bei einer Pause wegen Kontingent (sonst unter „Mehr“).
// Reine Anzeige; Buchen über PackBookButton (Client).

import { AlertTriangle } from "lucide-react";
import type { BestandQuota } from "@/lib/bestand/quota";
import { PackBookButton, type PackOffer } from "@/components/bestand/packs";

const de = (n: number) => n.toLocaleString("de-DE");
const fmtDate = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

export type PackBooking = { packs: readonly PackOffer[]; months: number; individualFrom: number; readOnly: boolean; blocker: string | null };

/**
 * „Noch X Nachrichten diesen Monat“ mit Knopf (Bestand-Seite, Kampagnenstart, pausierte Kampagne). waiting = wartende
 * WhatsApp-Nachrichten laufender Kampagnen: „Danach pausieren …“ nur bei echtem Engpass (mehr wartend als frei).
 */
export function QuotaLowNotice({
  quota,
  booking,
  paused = false,
  waiting,
  variant = "primary",
}: {
  quota: BestandQuota;
  booking: PackBooking;
  paused?: boolean;
  waiting?: number;
  variant?: "primary" | "secondary";
}) {
  const engpass = waiting == null || waiting > quota.remaining;
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm sm:flex-row sm:items-center" data-quota-low>
      <AlertTriangle className="hidden h-4 w-4 shrink-0 text-amber-900 sm:block" />
      <div className="min-w-0 flex-1 text-amber-900">
        <p className="font-semibold">Noch {de(quota.remaining)} Nachrichten frei diesen Monat</p>
        <p className="text-amber-800">
          {quota.remaining <= 0
            ? paused
              ? "Pausiert, bis Sie ein Paket buchen (läuft dann sofort weiter) oder bis zum Monatsanfang."
              : "Neue Kampagnen starten wieder mit einem Zusatzpaket oder zum Monatsanfang."
            : engpass
              ? "Danach pausieren laufende Kampagnen bis zum Monatsanfang oder bis Sie ein Paket dazubuchen."
              : "Reicht für alle wartenden Nachrichten."}
        </p>
      </div>
      <PackBookButton {...booking} variant={variant} />
    </div>
  );
}

export function QuotaBar({ quota, booking, waiting, variant = "primary" }: { quota: BestandQuota; booking: PackBooking; waiting?: number; variant?: "primary" | "secondary" }) {
  const sent = quota.sentThisMonth;
  const total = Math.max(1, sent + quota.remaining);
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / total) * 100))}%`;
  const activePacks = quota.packs.filter((p) => p.remaining > 0);
  return (
    <section id="kontingent" className="mb-5 scroll-mt-20 space-y-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] px-5 py-4 shadow-[var(--shadow-sm)]" data-quota>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Nachrichten frei diesen Monat</h2>
        <span className="text-sm tabular-nums text-[color:var(--muted)]">
          <b className="text-[color:var(--foreground)]">{de(quota.remaining)}</b> von {de(total)} frei
        </span>
      </div>
      <div
        className="flex h-3 overflow-hidden rounded-full bg-[color:var(--surface-sunken)]"
        role="img"
        aria-label={`${de(sent)} verbraucht, ${de(quota.includedRemaining)} inklusive frei, ${de(quota.packRemaining)} aus Paketen frei`}
      >
        <div className="bg-[color:var(--brand)]" style={{ width: pct(sent) }} data-quota-used />
        <div className="bg-[color:var(--brand)] opacity-30" style={{ width: pct(quota.includedRemaining) }} />
        {activePacks.map((p) => (
          <div key={p.id} className="border-l border-white bg-emerald-400/70" style={{ width: pct(p.remaining) }} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-[color:var(--muted)]">
        <li className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-[3px] bg-[color:var(--brand)]" />
          Verbraucht: {de(sent)}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-[3px] bg-[color:var(--brand)] opacity-30" />
          Inklusive: {de(quota.limit)} im Monat ({de(quota.includedRemaining)} frei, WhatsApp-Gebühren enthalten)
        </li>
        {quota.packs.map((p) => (
          <li key={p.id} className="inline-flex items-center gap-1.5" data-quota-pack>
            <i className="inline-block h-2.5 w-2.5 rounded-[3px] bg-emerald-400/70" />
            Paket +{de(p.messages)}: {p.remaining > 0 ? `${de(p.remaining)} frei` : "aufgebraucht"}, gültig bis {fmtDate(p.expiresAt)}
          </li>
        ))}
      </ul>
      {quota.low ? <QuotaLowNotice quota={quota} booking={booking} paused={quota.remaining <= 0} waiting={waiting} variant={variant} /> : (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--muted)]">
          <span>Mehr Nachrichten nötig? Zusatzpakete gelten {booking.months} Monate.</span>
          <PackBookButton {...booking} variant="secondary" />
        </div>
      )}
    </section>
  );
}
