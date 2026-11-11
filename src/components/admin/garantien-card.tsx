// Kundenakte: Stand der Lead- und Break-even- bzw. Vertrags-Garantie mit Bedingungen und
// bisherigen Fällen. Nur für Kunden mit Garantie-Angebot (Katze/TKV ab 11.11.2026).

import { CheckCircle2, Circle, XCircle } from "lucide-react";
import { garantieStatus } from "@/lib/garantien-server";
import { FALL_LABEL, fortschritt, GARANTIE_LABEL, monatName, STATUS_LABEL, type GarantieStatus } from "@/lib/garantien";
import { cn } from "@/lib/utils";

export const STATUS_TONE: Record<GarantieStatus, string> = {
  nicht_gestartet: "bg-slate-100 text-slate-600",
  laeuft: "bg-sky-50 text-sky-700",
  erfuellt: "bg-emerald-50 text-emerald-700",
  anspruch: "bg-amber-50 text-amber-700",
  bedingungen_fehlen: "bg-rose-50 text-rose-700",
  abgelaufen: "bg-slate-100 text-slate-600",
  nicht_anwendbar: "bg-slate-100 text-slate-600",
};

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const datum = (key: string | null) => (key ? new Date(`${key}T12:00:00Z`).toLocaleDateString("de-DE", { day: "numeric", month: "numeric", year: "numeric" }) : "–");

export async function GarantienCard({ customerId }: { customerId: string }) {
  const g = await garantieStatus(customerId).catch(() => null);
  if (!g) return null;
  return (
    <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white px-4 py-3 text-sm" data-card="garantien">
      <h2 className="mb-2 font-semibold">Garantien</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {g.ergebnisse.map((e) => {
          const k = e.kennzahlen;
          const laeuft = e.status === "laeuft" || e.status === "nicht_gestartet" || e.status === "nicht_anwendbar";
          return (
            <div key={e.art} className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{GARANTIE_LABEL[e.art]}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_TONE[e.status])}>{STATUS_LABEL[e.status]}</span>
              </div>
              <p className="mt-1 text-[color:var(--muted)]">{fortschritt(e)}</p>
              {k.start ? (
                <p className="text-xs text-[color:var(--muted)]">
                  Start {datum(k.start)} ({k.startQuelle === "meta" ? "erste Meta-Kosten" : "Go-live"}) · {laeuft ? "Prüfung nach" : "Zeitraum bis"} {datum(k.ende)}
                  {k.monat ? ` · ${e.art === "lead" ? "Folgemonat" : `Monat ${k.freiMonatNr ?? 1} von 6`}: ${monatName(k.monat)}` : ""}
                </p>
              ) : null}
              {e.bedingungen.length ? (
                <ul className="mt-2 space-y-1">
                  {e.bedingungen.map((b) => (
                    <li key={b.key} className="flex items-start gap-1.5">
                      {b.ok ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="erfüllt" />
                      ) : laeuft ? (
                        <Circle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-label="noch nicht erfüllt" />
                      ) : (
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-label="nicht erfüllt" />
                      )}
                      <span>{b.text}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
      {g.faelle.length ? (
        <div className="mt-3 border-t border-[color:var(--border)] pt-2">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">Fälle</div>
          <ul className="space-y-1">
            {g.faelle.map((f) => (
              <li key={f.id} className="flex flex-wrap gap-x-2">
                <span>{GARANTIE_LABEL[f.art]} · {monatName(f.monat)}</span>
                <span className={cn("font-semibold", f.status === "gewaehrt" ? "text-emerald-700" : f.status === "abgelehnt" ? "text-rose-700" : "text-amber-700")}>
                  {FALL_LABEL[f.status]}
                </span>
                {f.betrag ? <span className="text-[color:var(--muted)]">{eur(f.betrag)} netto</span> : null}
                {f.grund ? <span className="text-[color:var(--muted)]">„{f.grund}“</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
