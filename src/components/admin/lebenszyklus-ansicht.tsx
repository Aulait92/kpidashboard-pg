import Link from "next/link";
import { Card, CardHeader } from "@/components/ui";
import { Aufklapp } from "@/components/admin-neu/zahlen/aufklapp";
import type { loadLebenszyklus } from "@/lib/lebenszyklus";
import { monthLabel } from "@/lib/revenue-ledger";
import { NOCH_KEINE_DATEN } from "@/lib/platzhalter";

// Kündigung, Ruhephase und Rückkehr (lib/lebenszyklus.ts), gemeinsam für /admin/zahlen/lebenszyklus und
// /admin/neu/zahlen/kunden: Reaktivierungen je Monat neben neuen Kunden und Kündigungen, MRR-Bewegung, ruhende Konten,
// Reaktivierungsquote je Kündigungsmonat, Gründe, die zurückkommen, Halteangebote.
// SUS-Prüfung Geld 20.11.2026: oben die Kennzahlen und die Kunden (ruhend, zurückgekommen) als Liste, die Statistik-Tabellen
// zugeklappt, Erklärungen gesammelt unter „So rechnen wir“. Spalten ohne jede Bewegung fallen weg (Handy, 390 px).

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const signed = (n: number) => (n === 0 ? "0 €" : `${n > 0 ? "+" : "−"}${eur(Math.abs(n))}`);
const pct = (x: number | null) => (x == null ? NOCH_KEINE_DATEN : `${Math.round(x * 100)} %`);
const day = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
const RETENTION: Record<string, string> = { "24m": "24 Monate", "3m": "3 Monate", sofort: "sofort" };
const th = "px-2 py-1.5 text-right font-medium";
const td = "px-2 py-1.5 text-right";

export function LebenszyklusAnsicht({
  d,
  funktionen = {},
}: {
  d: Awaited<ReturnType<typeof loadLebenszyklus>>;
  /** data-funktion je Teil (Abnahme neuer Admin) */
  funktionen?: Partial<Record<"kennzahlen" | "monate" | "mrr" | "quote" | "gruende" | "halte", string>>;
}) {
  const s = d.stats;
  // Spalten ohne jede Bewegung weglassen (wie die Investoren-Auswertung), damit die Tabellen auf 390 px passen
  const monatSpalten = [
    { key: "neu", label: "Neu", immer: true, wert: (m: (typeof d.months)[number]) => String(m.neu) },
    { key: "reaktiviert", label: "Zurück", immer: false, wert: (m: (typeof d.months)[number]) => String(m.reaktiviert) },
    { key: "gekuendigt", label: "Gekündigt", immer: true, wert: (m: (typeof d.months)[number]) => String(m.gekuendigt) },
    { key: "reaktiviertMrr", label: "MRR zurück", immer: false, wert: (m: (typeof d.months)[number]) => eur(m.reaktiviertMrr || 0) },
    { key: "kuendigungenEingang", label: "Kündigungen eingegangen", immer: false, wert: (m: (typeof d.months)[number]) => String(m.kuendigungenEingang) },
  ].filter((c) => c.immer || d.months.some((m) => Number(m[c.key as keyof typeof m] ?? 0) !== 0));
  const mrrSpalten = (
    [
      { key: "neu", label: "Neu", immer: true },
      { key: "ausbau", label: "Ausbau", immer: false },
      { key: "reaktiviert", label: "Zurück", immer: false },
      { key: "verkleinert", label: "Weniger", immer: false },
      { key: "gekuendigt", label: "Gekündigt", immer: true },
    ] as const
  ).filter((c) => c.immer || d.movement.some((b) => Math.abs(b[c.key]) >= 0.5));
  const zeile = "flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-5 py-3 text-sm";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4" data-funktion={funktionen.kennzahlen}>
        {[
          { k: "Ruhende Konten", v: String(s.dormantNow), sub: s.avgDormantDays != null ? `Ø ${s.avgDormantDays} Tage ruhend` : "keine" },
          { k: "Zurückgekommen", v: pct(s.rate), sub: `${s.reactivations} von ${s.cancelled} Kündigungen` },
          { k: "Zeit bis zur Rückkehr", v: s.medianDaysToReactivation != null ? `${s.medianDaysToReactivation} Tage` : NOCH_KEINE_DATEN, sub: "Median ab Vertragsende" },
          { k: "MRR zurückgewonnen", v: eur(d.months.reduce((a, m) => a + m.reaktiviertMrr, 0)), sub: "letzte 12 Monate" },
        ].map((x) => (
          <div key={x.k} className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 shadow-[var(--shadow-sm)]">
            <div className="text-xs text-[color:var(--muted)]">{x.k}</div>
            <div className="mt-0.5 text-xl font-semibold tabular-nums">{x.v}</div>
            <div className="mt-0.5 truncate text-xs text-[color:var(--muted)]">{x.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Ruhende Konten" count={d.dormant.length || undefined} />
          {d.dormant.length ? (
            <ul className="divide-y divide-[color:var(--border)]" data-lebenszyklus-ruhend>
              {d.dormant.map((r) => (
                <li key={r.customerId}>
                  <Link href={`/admin/neu/kunden/${r.customerId}/abrechnung`} className={`${zeile} hover:bg-[color:var(--surface-sunken)]`}>
                    <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                    {r.mrr != null ? <span className="tabular-nums">{eur(r.mrr)} vorher</span> : null}
                    <span className="w-full text-xs text-[color:var(--muted)]">
                      ruht seit {day(r.since)}
                      {r.deleteAfter ? ` · Löschung am ${day(r.deleteAfter)}` : ""}
                      {r.retention ? ` · Aufbewahrung ${RETENTION[r.retention] ?? r.retention}` : ""}
                      {r.reason ? ` · ${r.reason}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 pb-5 text-sm text-[color:var(--muted)]">Keine ruhenden Konten.</p>
          )}
        </Card>

        <Card>
          <CardHeader title="Zurückgekommen" count={d.reactivations.length || undefined} />
          {d.reactivations.length ? (
            <ul className="divide-y divide-[color:var(--border)]" data-lebenszyklus-reaktiviert>
              {d.reactivations.map((r) => (
                <li key={`${r.customerId}:${r.at}`}>
                  <Link href={`/admin/neu/kunden/${r.customerId}/abrechnung`} className={`${zeile} hover:bg-[color:var(--surface-sunken)]`}>
                    <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                    {r.mrr != null ? <span className="tabular-nums">{eur(r.mrr)}</span> : null}
                    <span className="w-full text-xs text-[color:var(--muted)]">
                      am {day(r.at)}
                      {r.dormantDays != null ? ` · ruhte ${r.dormantDays} Tage` : ""}
                      {r.reason ? ` · ${r.reason}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 pb-5 text-sm text-[color:var(--muted)]">Noch niemand zurückgekommen.</p>
          )}
        </Card>
      </div>

      <Aufklapp titel="Kunden je Monat" hinweis="neu, zurück, gekündigt">
        <Card>
          <div className="overflow-x-auto px-5 py-4">
            <table className="w-full text-[13px] tabular-nums" data-lebenszyklus-monate data-funktion={funktionen.monate}>
              <thead className="text-[color:var(--muted)]">
                <tr>
                  <th className="py-1.5 pr-2 text-left font-medium">Monat</th>
                  {monatSpalten.map((c) => (
                    <th key={c.key} className={th}>{c.label}</th>
                  ))}
                  <th className={th}>Netto</th>
                </tr>
              </thead>
              <tbody>
                {d.months.map((m) => (
                  <tr key={m.month} className="border-t border-[color:var(--border)]">
                    <td className="whitespace-nowrap py-1.5 pr-2">{monthLabel(m.month, true)}{m.month === d.current ? "*" : ""}</td>
                    {monatSpalten.map((c) => (
                      <td key={c.key} className={td}>{c.wert(m)}</td>
                    ))}
                    <td className={`${td} font-semibold ${m.netto < 0 ? "text-rose-700" : ""}`}>{m.netto > 0 ? `+${m.netto}` : m.netto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Aufklapp>

      <Aufklapp titel="MRR-Bewegung je Monat">
        <Card>
          <div className="overflow-x-auto px-5 py-4">
            <table className="w-full text-[13px] tabular-nums" data-lebenszyklus-mrr data-funktion={funktionen.mrr}>
              <thead className="text-[color:var(--muted)]">
                <tr>
                  <th className="py-1.5 pr-2 text-left font-medium">Monat</th>
                  {mrrSpalten.map((c) => (
                    <th key={c.key} className={th}>{c.label}</th>
                  ))}
                  <th className={th}>MRR</th>
                </tr>
              </thead>
              <tbody>
                {d.movement.map((b) => (
                  <tr key={b.to} className="border-t border-[color:var(--border)]">
                    <td className="whitespace-nowrap py-1.5 pr-2">{monthLabel(b.to, true)}{b.to === d.current ? "*" : ""}</td>
                    {mrrSpalten.map((c) => (
                      <td key={c.key} className={`${td} whitespace-nowrap`}>{signed(b[c.key])}</td>
                    ))}
                    <td className={`${td} whitespace-nowrap font-semibold`}>{eur(b.end)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Aufklapp>

      <Aufklapp titel="Wer kommt zurück?" hinweis="je Kündigungsmonat und Grund">
        <Card>
          <div className="space-y-4 overflow-x-auto px-5 py-4">
            <div data-funktion={funktionen.quote}>
              {d.byCancelMonth.length ? (
                <table className="w-full text-[13px] tabular-nums" data-lebenszyklus-quote>
                  <thead className="text-[color:var(--muted)]">
                    <tr>
                      <th className="py-1.5 pr-2 text-left font-medium">Kündigung im</th>
                      <th className={th}>Gekündigt</th>
                      <th className={th}>Zurück</th>
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
            <div data-funktion={funktionen.gruende}>
              {d.reasons.length ? (
                <table className="w-full text-[13px] tabular-nums" data-lebenszyklus-gruende>
                  <thead className="text-[color:var(--muted)]">
                    <tr>
                      <th className="py-1.5 pr-2 text-left font-medium">Kündigungsgrund</th>
                      <th className={th}>Gekündigt</th>
                      <th className={th}>Zurück</th>
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
              ) : null}
            </div>
          </div>
        </Card>
      </Aufklapp>

      <Aufklapp titel="Halteangebote" hinweis={d.halte.accepted ? `${d.halte.accepted} angenommen` : "noch keins angenommen"}>
        <Card>
          <div className="overflow-x-auto px-5 py-4" data-lebenszyklus-halte data-funktion={funktionen.halte}>
            <p className="mb-3 text-sm">
              {eur(d.halte.savedMrr)} Monatsbetrag gerettet, davon später gekündigt: {d.halte.cancelledLater} ({eur(d.halte.savedMrr - d.halte.stillSavedMrr)}). Rückkehrangebote: {d.winback.sent} verschickt, {d.winback.reactivated} zurück.
            </p>
            {d.halte.accepted ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {[
                  { title: "Je Grund", rows: d.halte.byReason },
                  { title: "Je Angebot", rows: d.halte.byKind },
                ].map((t) => (
                  <table key={t.title} className="w-full text-[13px] tabular-nums">
                    <thead className="text-[color:var(--muted)]">
                      <tr>
                        <th className="py-1.5 pr-2 text-left font-medium">{t.title}</th>
                        <th className={th}>Angenommen</th>
                        <th className={th}>MRR gerettet</th>
                        <th className={th}>Später gekündigt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.rows.map((r) => (
                        <tr key={r.key} className="border-t border-[color:var(--border)]">
                          <td className="py-1.5 pr-2">{r.label}</td>
                          <td className={td}>{r.accepted}</td>
                          <td className={td}>{eur(r.savedMrr)}</td>
                          <td className={`${td} ${r.cancelledLater ? "text-rose-700" : ""}`}>{r.cancelledLater}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ))}
              </div>
            ) : null}
            <Link href="/admin/neu/einstellungen/halteangebote" className="mt-1 inline-flex min-h-10 items-center text-sm font-semibold text-[color:var(--brand)] hover:underline">
              Halteangebote einstellen
            </Link>
          </div>
        </Card>
      </Aufklapp>

      <Aufklapp titel="So rechnen wir">
        <Card className="space-y-1.5 px-5 py-4 text-sm text-[color:var(--muted)]">
          <p><b>Neu</b>: erster Monat mit wiederkehrendem Umsatz. <b>Zurück</b>: „Konto reaktivieren“ im Monat, mit Monatsbetrag zum Zeitpunkt der Rückkehr.</p>
          <p><b>Gekündigt</b>: Umsatz im Vormonat, in diesem Monat keiner. <b>Netto</b> = Neu + Zurück − Gekündigt. * laufender Monat, hochgerechnet.</p>
          <p><b>MRR-Bewegung</b>: aus dem Umsatzbuch. Ruhezeiten zählen keinen Umsatz; eine Rückkehr zeigt sich, sobald die Abrechnung wieder läuft.</p>
          <p><b>MRR gerettet</b>: Monatsbetrag, der nach dem Halteangebot weiterläuft (bei „Nur Bestand“ dessen Preis). <b>Später gekündigt</b>: trotzdem über „Vertrag hier kündigen“ gekündigt.</p>
        </Card>
      </Aufklapp>
    </div>
  );
}
