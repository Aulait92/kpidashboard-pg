import Link from "next/link";
import { connection } from "next/server";
import { requireAuth } from "@/lib/vertrieb/auth";
import { countNeueBuchungen } from "@/lib/admin-buchungen-neu";
import { reportError } from "@/lib/monitoring";
import { ZahlenTabs } from "@/components/admin/zahlen-tabs";
import { Card, CardHeader } from "@/components/ui";
import { loadLebenszyklus } from "@/lib/lebenszyklus";
import { monthLabel } from "@/lib/revenue-ledger";

export const metadata = { title: "Kündigung & Rückkehr | performancegrowth Admin" };

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const signed = (n: number) => (n === 0 ? "0 €" : `${n > 0 ? "+" : "−"}${eur(Math.abs(n))}`);
const pct = (x: number | null) => (x == null ? "–" : `${Math.round(x * 100)} %`);
const day = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
const RETENTION: Record<string, string> = { "24m": "24 Monate", "3m": "3 Monate", sofort: "sofort" };
const th = "px-2 py-1.5 text-right font-medium";
const td = "px-2 py-1.5 text-right";

// Kündigung, Ruhephase und Rückkehr (lib/lebenszyklus.ts): Reaktivierungen je Monat neben neuen Kunden und
// Kündigungen, MRR-Bewegung, ruhende Konten, Reaktivierungsquote je Kündigungsmonat, Gründe, die zurückkommen.
export default async function LebenszyklusPage() {
  await connection();
  const session = await requireAuth();
  const [d, neu] = await Promise.all([
    loadLebenszyklus(),
    countNeueBuchungen(session.userId).catch((err) => {
      reportError(err, "admin-neue-buchungen");
      return 0;
    }),
  ]);
  const s = d.stats;
  return (
    <main className="mx-auto w-full max-w-[1360px] flex-1 space-y-5 px-4 py-6 sm:px-6 lg:px-8" data-admin-lebenszyklus>
      <ZahlenTabs neueBuchungen={neu} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { k: "Ruhende Konten", v: String(s.dormantNow), sub: s.avgDormantDays != null ? `Ø ${s.avgDormantDays} Tage ruhend` : "noch keine" },
          { k: "Reaktivierungsquote", v: pct(s.rate), sub: `${s.reactivations} von ${s.cancelled} Kündigungen zurückgekommen` },
          { k: "Zeit bis zur Reaktivierung", v: s.medianDaysToReactivation != null ? `${s.medianDaysToReactivation} Tage` : "–", sub: s.avgDaysToReactivation != null ? `Median ab Vertragsende, Ø ${s.avgDaysToReactivation} Tage` : "Median ab Vertragsende" },
          { k: "MRR aus Reaktivierungen", v: eur(d.months.reduce((a, m) => a + m.reaktiviertMrr, 0)), sub: "letzte 12 Monate, Monatsbetrag bei Rückkehr" },
        ].map((x) => (
          <div key={x.k} className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white px-4 py-3">
            <div className="text-xs text-[color:var(--muted)]">{x.k}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{x.v}</div>
            <div className="mt-0.5 text-xs text-[color:var(--muted)]">{x.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Kunden je Monat" />
          <div className="overflow-x-auto px-5 pb-5">
            <table className="w-full text-[13px] tabular-nums" data-lebenszyklus-monate>
              <thead className="text-[color:var(--muted)]">
                <tr>
                  <th className="py-1.5 pr-2 text-left font-medium">Monat</th>
                  <th className={th}>Neu</th>
                  <th className={th}>Reaktiviert</th>
                  <th className={th}>Gekündigt</th>
                  <th className={th}>Netto</th>
                  <th className={th}>MRR Reaktivierung</th>
                  <th className={th}>Kündigungen eingegangen</th>
                </tr>
              </thead>
              <tbody>
                {d.months.map((m) => (
                  <tr key={m.month} className="border-t border-[color:var(--border)]">
                    <td className="py-1.5 pr-2">{monthLabel(m.month, true)}{m.month === d.current ? "*" : ""}</td>
                    <td className={td}>{m.neu}</td>
                    <td className={td}>{m.reaktiviert}</td>
                    <td className={td}>{m.gekuendigt}</td>
                    <td className={`${td} font-semibold ${m.netto < 0 ? "text-rose-700" : ""}`}>{m.netto > 0 ? `+${m.netto}` : m.netto}</td>
                    <td className={td}>{m.reaktiviertMrr ? eur(m.reaktiviertMrr) : "–"}</td>
                    <td className={td}>{m.kuendigungenEingang}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-[color:var(--muted)]">
              Neu = erster Monat mit wiederkehrendem Umsatz (Reaktivierte zählen hier nicht noch einmal). Reaktiviert = „Konto reaktivieren“ im Monat, Betrag
              = Monatsbetrag zum Zeitpunkt der Rückkehr. Gekündigt = Umsatz im Vormonat, in diesem Monat keiner. Netto = Neu + Reaktiviert − Gekündigt.
              * laufender Monat (hochgerechnet).
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="MRR-Bewegung je Monat" />
          <div className="overflow-x-auto px-5 pb-5">
            <table className="w-full text-[13px] tabular-nums" data-lebenszyklus-mrr>
              <thead className="text-[color:var(--muted)]">
                <tr>
                  <th className="py-1.5 pr-2 text-left font-medium">Monat</th>
                  <th className={th}>Neu</th>
                  <th className={th}>Erweiterung</th>
                  <th className={th}>Reaktivierung</th>
                  <th className={th}>Verkleinerung</th>
                  <th className={th}>Kündigung</th>
                  <th className={th}>MRR Ende</th>
                </tr>
              </thead>
              <tbody>
                {d.movement.map((b) => (
                  <tr key={b.to} className="border-t border-[color:var(--border)]">
                    <td className="py-1.5 pr-2">{monthLabel(b.to, true)}{b.to === d.current ? "*" : ""}</td>
                    <td className={td}>{signed(b.neu)}</td>
                    <td className={td}>{signed(b.ausbau)}</td>
                    <td className={td}>{signed(b.reaktiviert)}</td>
                    <td className={td}>{signed(b.verkleinert)}</td>
                    <td className={td}>{signed(b.gekuendigt)}</td>
                    <td className={`${td} font-semibold`}>{eur(b.end)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-[color:var(--muted)]">
              Aus dem Umsatzbuch (wie MRR-Brücke in der Übersicht). Reaktivierung = Kunde hatte früher Umsatz, im Vormonat keinen, jetzt wieder. Ruhezeiten
              nach Vertragsende zählen keinen Umsatz. Erst sichtbar, wenn die Abrechnung nach der Reaktivierung wieder läuft.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Reaktivierungsquote je Kündigungsmonat" />
          <div className="overflow-x-auto px-5 pb-5">
            {d.byCancelMonth.length ? (
              <table className="w-full text-[13px] tabular-nums" data-lebenszyklus-quote>
                <thead className="text-[color:var(--muted)]">
                  <tr>
                    <th className="py-1.5 pr-2 text-left font-medium">Kündigung im</th>
                    <th className={th}>Gekündigt</th>
                    <th className={th}>Reaktiviert</th>
                    <th className={th}>Quote</th>
                  </tr>
                </thead>
                <tbody>
                  {d.byCancelMonth.map((r) => (
                    <tr key={r.month} className="border-t border-[color:var(--border)]">
                      <td className="py-1.5 pr-2">{monthLabel(r.month, true)}</td>
                      <td className={td}>{r.cancelled}</td>
                      <td className={td}>{r.reactivated}</td>
                      <td className={`${td} font-semibold`}>{pct(r.rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-[color:var(--muted)]">Noch keine Kündigungen über den Kundenbereich.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Welche Kündigungsgründe kommen zurück?" />
          <div className="overflow-x-auto px-5 pb-5">
            {d.reasons.length ? (
              <table className="w-full text-[13px] tabular-nums" data-lebenszyklus-gruende>
                <thead className="text-[color:var(--muted)]">
                  <tr>
                    <th className="py-1.5 pr-2 text-left font-medium">Hauptgrund (Anti-Churn)</th>
                    <th className={th}>Gekündigt</th>
                    <th className={th}>Reaktiviert</th>
                    <th className={th}>Quote</th>
                  </tr>
                </thead>
                <tbody>
                  {d.reasons.map((r) => (
                    <tr key={r.label} className="border-t border-[color:var(--border)]">
                      <td className="py-1.5 pr-2">{r.label}</td>
                      <td className={td}>{r.cancelled}</td>
                      <td className={td}>{r.reactivated}</td>
                      <td className={`${td} font-semibold`}>{pct(r.rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-[color:var(--muted)]">Noch keine Daten.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Ruhende Konten" count={d.dormant.length || undefined} />
          <div className="overflow-x-auto px-5 pb-5">
            {d.dormant.length ? (
              <table className="w-full text-[13px] tabular-nums" data-lebenszyklus-ruhend>
                <thead className="text-[color:var(--muted)]">
                  <tr>
                    <th className="py-1.5 pr-2 text-left font-medium">Kunde</th>
                    <th className={th}>Ruht seit</th>
                    <th className={th}>Löschung am</th>
                    <th className={th}>Aufbewahrung</th>
                    <th className={th}>MRR vorher</th>
                    <th className="px-2 py-1.5 text-left font-medium">Grund</th>
                  </tr>
                </thead>
                <tbody>
                  {d.dormant.map((r) => (
                    <tr key={r.customerId} className="border-t border-[color:var(--border)]">
                      <td className="py-1.5 pr-2">
                        <Link href={`/admin/kunden/${r.customerId}/abrechnung`} className="font-medium text-[color:var(--brand)] hover:underline">
                          {r.name}
                        </Link>
                      </td>
                      <td className={td}>{day(r.since)}</td>
                      <td className={td}>{r.deleteAfter ? day(r.deleteAfter) : "–"}</td>
                      <td className={td}>{r.retention ? (RETENTION[r.retention] ?? r.retention) : "–"}</td>
                      <td className={td}>{r.mrr != null ? eur(r.mrr) : "–"}</td>
                      <td className="px-2 py-1.5">{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-[color:var(--muted)]">Keine ruhenden Konten.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Letzte Reaktivierungen" count={d.reactivations.length || undefined} />
          <div className="overflow-x-auto px-5 pb-5">
            {d.reactivations.length ? (
              <table className="w-full text-[13px] tabular-nums" data-lebenszyklus-reaktiviert>
                <thead className="text-[color:var(--muted)]">
                  <tr>
                    <th className="py-1.5 pr-2 text-left font-medium">Kunde</th>
                    <th className={th}>Am</th>
                    <th className={th}>MRR</th>
                    <th className={th}>Ruhte</th>
                    <th className="px-2 py-1.5 text-left font-medium">Grund der Kündigung</th>
                  </tr>
                </thead>
                <tbody>
                  {d.reactivations.map((r) => (
                    <tr key={`${r.customerId}:${r.at}`} className="border-t border-[color:var(--border)]">
                      <td className="py-1.5 pr-2">
                        <Link href={`/admin/kunden/${r.customerId}/abrechnung`} className="font-medium text-[color:var(--brand)] hover:underline">
                          {r.name}
                        </Link>
                      </td>
                      <td className={td}>{day(r.at)}</td>
                      <td className={td}>{r.mrr != null ? eur(r.mrr) : "–"}</td>
                      <td className={td}>{r.dormantDays != null ? `${r.dormantDays} Tage` : "–"}</td>
                      <td className="px-2 py-1.5">{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-[color:var(--muted)]">Noch keine Reaktivierungen.</p>
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}
