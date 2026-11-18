import Link from "next/link";
import { Download } from "lucide-react";
import { Card, CardHeader, buttonClass } from "@/components/ui";
import { Kennzahlen } from "@/components/admin-neu/ui/kennzahlen";
import { Aufklapp } from "@/components/admin-neu/zahlen/aufklapp";
import { bindungZeilen, DEFINITIONEN, eur, kacheln, monat, pct, signed, standText } from "@/lib/investoren/darstellung";
import { MIN_KOHORTE } from "@/lib/investoren/kennzahlen";
import type { InvestorenDaten } from "@/lib/investoren/server";
import type { Sicht } from "@/lib/zahlen-sicht";
import { cn } from "@/lib/utils";

// Geld › Auswertung (Investoren-Kennzahlen, Plan K3): 5 Kacheln, Bindung, Abo vs. Pay-per-Lead, MRR-Bewegung, Marge,
// Kohorten (ab 5 Kunden), aufklappbar „So rechnen wir“ mit Datenlage. Zahlen und Worte aus lib/investoren/darstellung.ts
// (gleich in CSV und PDF). Fehlt die Grundlage, steht dort, ab wann es die Zahl gibt, statt einer erfundenen Zahl.

const PFAD = "/admin/neu/zahlen/auswertung";
const th = "px-1.5 py-1.5 text-right font-medium sm:px-2";
const td = "whitespace-nowrap px-1.5 py-1.5 text-right sm:px-2";
const thL = "py-1.5 pr-2 text-left font-medium";
const tdL = "py-1.5 pr-2 text-left";

// Kohorten: gleiche Stufen wie die Übersicht (components/admin/zahlen-view.tsx)
const SEQ = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95"];
const stufe = (p: number) => (p >= 170 ? SEQ[5] : p >= 145 ? SEQ[4] : p >= 125 ? SEQ[3] : p >= 110 ? SEQ[2] : p >= 100 ? SEQ[1] : SEQ[0]);

const BEWEGUNG = [
  { key: "neu", label: "Neu", immer: true },
  { key: "ausbau", label: "Ausbau", immer: false },
  { key: "reaktiviert", label: "Reaktiviert", immer: false },
  { key: "verkleinert", label: "Weniger", immer: false },
  { key: "gekuendigt", label: "Gekündigt", immer: true },
] as const;

function Leer({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-[color:var(--border)] px-3 py-5 text-center text-sm text-[color:var(--muted)]">{children}</p>;
}

export function ExportKnoepfe({ sicht }: { sicht: Sicht }) {
  return (
    <div className="flex gap-2" data-funktion="auswertung--export-pdf-und-csv">
      <a href={`${PFAD}/export?format=csv&sicht=${sicht}`} download className={buttonClass("secondary")}>
        CSV
      </a>
      <a href={`${PFAD}/export?format=pdf&sicht=${sicht}`} download className={buttonClass("primary")}>
        <Download className="h-3.5 w-3.5" />
        PDF
      </a>
    </div>
  );
}

export function Auswertung({ d }: { d: InvestorenDaten }) {
  const k = d.k;
  const maxAlter = Math.max(0, ...k.kohorten.gezeigt.map((c) => c.values.length));
  // MRR-Bewegung: Spalten ohne jede Bewegung weglassen (Handy, 390 px); CSV und PDF zeigen alle
  const spalten = BEWEGUNG.filter((s) => s.immer || k.bewegung.some((b) => Math.abs(b[s.key]) >= 0.5));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[color:var(--muted)]">{standText(d, false)}</p>
        <div role="radiogroup" aria-label="Sicht" className="inline-flex rounded-full border border-[color:var(--border)] bg-white p-0.5 text-sm">
          {(["kern", "gesamt"] as const).map((s) => (
            <Link
              key={s}
              href={`${PFAD}?sicht=${s}`}
              role="radio"
              aria-checked={d.sicht === s}
              replace
              scroll={false}
              className={cn("inline-flex min-h-10 items-center rounded-full px-3 sm:min-h-0 sm:py-1", d.sicht === s ? "bg-[color:var(--foreground)] font-semibold text-white" : "text-[color:var(--muted)]")}
            >
              {s === "kern" ? "Kerngeschäft" : "Gesamt"}
            </Link>
          ))}
        </div>
      </div>

      <div data-funktion="auswertung--fuenf-kennzahlen-mrr-bindung-marge-amortisation">
        <Kennzahlen werte={kacheln(d).map((x) => ({ label: x.label, wert: x.wert, hinweis: x.hinweis, details: { zeilen: x.zeilen, text: x.text } }))} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Bindung" hint={`bis ${monat(k.lastComplete)}`} />
          <div className="overflow-x-auto px-5 pb-4 pt-2" data-funktion="auswertung--bindung-3-6-12-monate-nrr-grr">
            <table className="w-full text-[13px] tabular-nums">
              <thead className="text-[color:var(--muted)]">
                <tr>
                  <th className={thL}>Nach</th>
                  <th className={th}>Kunden gehalten</th>
                  <th className={th}>Umsatz netto</th>
                  <th className={th}>brutto</th>
                </tr>
              </thead>
              <tbody>
                {bindungZeilen(k).map((b) => (
                  <tr key={b.zeitraum} className="border-t border-[color:var(--border)]">
                    <td className={tdL}>{b.zeitraum}</td>
                    {b.hinweis ? (
                      <td colSpan={3} className={cn(td, "text-left text-[color:var(--muted)]")}>
                        {b.hinweis}
                      </td>
                    ) : (
                      <>
                        <td className={td}>{b.kunden}</td>
                        <td className={cn(td, "font-semibold")}>{b.nrr}</td>
                        <td className={td}>{b.grr}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Abo und Pay-per-Lead" hint={k.stroeme ? monat(k.stroeme.monat) : undefined} />
          <div className="px-5 pb-4 pt-3" data-funktion="auswertung--abo-und-pay-per-lead-im-vergleich">
            {k.stroeme ? (
              <div className="grid grid-cols-2 gap-2.5">
                {(
                  [
                    ["Abo", "Betreuung + Software", k.stroeme.abo],
                    ["Pay-per-Lead", "verkaufte Leads", k.stroeme.ppl],
                  ] as const
                ).map(([name, unter, s]) => (
                  <div key={name} className="min-w-0 rounded-[10px] bg-[color:var(--surface-sunken)] px-3 py-2.5">
                    <div className="text-xs text-[color:var(--muted)]">
                      {name} <span className="hidden sm:inline">({unter})</span>
                    </div>
                    <div className="text-[19px] font-semibold tabular-nums tracking-tight">{eur(s.mrr)}</div>
                    <div className="mt-1 space-y-0.5 text-xs tabular-nums text-[color:var(--muted)]">
                      <div>{pct(s.anteil)} vom Umsatz</div>
                      <div>{s.kunden} {s.kunden === 1 ? "Kunde" : "Kunden"}</div>
                      <div>Marge {pct(s.marge)}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Leer>Ab dem ersten abgeschlossenen Monat.</Leer>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="MRR-Bewegung" hint="je Monat zum Vormonat" />
        <div className="overflow-x-auto px-3 pb-4 pt-2 sm:px-5" data-funktion="auswertung--mrr-bewegung-letzte-6-monate">
          {k.bewegung.length ? (
            <table className="w-full text-[13px] tabular-nums">
              <thead className="text-[color:var(--muted)]">
                <tr>
                  <th className={thL}>Monat</th>
                  {spalten.map((s) => (
                    <th key={s.key} className={th}>{s.label}</th>
                  ))}
                  <th className={th}>MRR</th>
                </tr>
              </thead>
              <tbody>
                {k.bewegung.map((b) => (
                  <tr key={b.to} className="border-t border-[color:var(--border)]">
                    <td className={cn(tdL, "whitespace-nowrap")}>{monat(b.to)}</td>
                    {spalten.map((s) => (
                      <td key={s.key} className={td}>{signed(b[s.key])}</td>
                    ))}
                    <td className={cn(td, "font-semibold")}>{eur(b.end)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Leer>Ab zwei abgeschlossenen Monaten mit Umsatz.</Leer>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Bruttomarge" hint="ohne Personal" />
          <div className="overflow-x-auto px-5 pb-4 pt-2" data-funktion="auswertung--bruttomarge-je-monat-mit-ki-kosten">
            {k.marge.monate.length ? (
              <table className="w-full text-[13px] tabular-nums">
                <thead className="text-[color:var(--muted)]">
                  <tr>
                    <th className={thL}>Monat</th>
                    <th className={th}>Umsatz</th>
                    <th className={th}>Direkt</th>
                    <th className={th}>davon KI</th>
                    <th className={th}>Marge</th>
                  </tr>
                </thead>
                <tbody>
                  {k.marge.monate.slice(-6).map((m) => (
                    <tr key={m.month} className="border-t border-[color:var(--border)]">
                      <td className={cn(tdL, "whitespace-nowrap")}>{monat(m.month)}</td>
                      <td className={td}>{eur(m.umsatz)}</td>
                      <td className={td}>{eur(m.direkt)}</td>
                      <td className={td}>{eur(m.ki)}</td>
                      <td className={cn(td, "font-semibold")}>{pct(m.marge)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Leer>Ab dem ersten abgeschlossenen Monat mit Umsatz.</Leer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Kohorten" hint="Umsatz in % des Startmonats" />
          <div className="overflow-x-auto px-5 pb-4 pt-2" data-funktion="auswertung--kohorten-ab-5-kunden">
            {k.kohorten.gezeigt.length ? (
              <>
                <table className="w-full border-separate text-[12.5px] tabular-nums" style={{ borderSpacing: 3 }}>
                  <thead className="text-[color:var(--muted)]">
                    <tr>
                      <th className="text-left font-medium">Start</th>
                      <th className="text-right font-medium">Kunden</th>
                      {Array.from({ length: maxAlter }, (_, i) => (
                        <th key={i} className="font-medium">M{i}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {k.kohorten.gezeigt.map((c) => (
                      <tr key={c.start}>
                        <td className="whitespace-nowrap">{monat(c.start)}</td>
                        <td className="text-right">{c.customers}</td>
                        {Array.from({ length: maxAlter }, (_, i) => {
                          const p = c.values[i];
                          return p == null ? (
                            <td key={i} />
                          ) : (
                            <td key={i} className="rounded-md px-1 py-1.5 text-center" style={{ background: stufe(p), color: p >= 125 ? "#fff" : "var(--foreground)" }}>
                              {p} %
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {k.kohorten.ausgeblendet ? (
                  <p className="mt-2 text-xs text-[color:var(--muted)]">
                    {k.kohorten.ausgeblendet} Startmonate mit weniger als {MIN_KOHORTE} Kunden nicht gezeigt.
                  </p>
                ) : null}
              </>
            ) : (
              <Leer>
                Ab {MIN_KOHORTE} Kunden je Startmonat.
                {k.kohorten.groesste ? ` Bisher größter: ${monat(k.kohorten.groesste.start)} mit ${k.kohorten.groesste.kunden}.` : ""}
              </Leer>
            )}
          </div>
        </Card>
      </div>

      <Aufklapp
        titel="So rechnen wir"
        hinweis={d.luecken.length ? `${d.luecken.length} ${d.luecken.length === 1 ? "Hinweis" : "Hinweise"} zur Datenlage` : undefined}
        funktion="auswertung--so-rechnen-wir-und-datenlage"
        id="so-rechnen-wir"
      >
        <Card>
          <dl className="divide-y divide-[color:var(--border)] px-5 text-sm">
            {DEFINITIONEN.map((x) => (
              <div key={x.name} className="py-2.5 sm:grid sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-3">
                <dt className="font-semibold">{x.name}</dt>
                <dd className="text-[color:var(--muted)]">{x.satz}</dd>
              </div>
            ))}
          </dl>
          {d.luecken.length ? (
            <div className="border-t border-[color:var(--border)] bg-amber-50/60 px-5 py-3">
              <h3 className="text-sm font-semibold">Datenlage</h3>
              <ul className="mt-1.5 space-y-1.5 text-sm">
                {d.luecken.map((l) => (
                  <li key={l.key} className="flex flex-wrap items-baseline gap-x-2">
                    <span>{l.text}</span>
                    {l.href ? (
                      <Link href={l.href} className="whitespace-nowrap font-medium text-[color:var(--brand)] hover:underline">
                        {l.link ?? "Öffnen"}
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      </Aufklapp>
    </div>
  );
}
