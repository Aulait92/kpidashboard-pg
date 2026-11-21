import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { fmtValue, type ReportMetrics } from "@/lib/monatsbericht/shared";
import type { ReportBody } from "@/lib/monatsbericht/server";
import type { RawMeasure } from "@/lib/monatsbericht/bericht";
import { MonatsberichtAnsicht } from "@/components/monatsbericht-ansicht";
import { CustomerReportsToggle, ReportDecision } from "@/app/admin/monatsberichte/forms";

// Monatsbericht ansehen: interne Einstufung mit Prüfbefunden, Vorschau der E-Mail, Senden/Bearbeiten/Anrufen/Aussetzen
// und der Schalter je Kunde. Gemeinsam für /admin/monatsberichte/[id] und die Kundenakte im neuen Admin
// (/admin/neu/kunden/[id]/berichte?bericht=…).
/** `ohneSchalter`: der Schalter „keine Monatsberichte für diesen Kunden“ steht schon woanders (Kundenakte). */
export async function MonatsberichtDetail({ id, ohneSchalter = false }: { id: string; ohneSchalter?: boolean }) {
  const r = await prisma.monthlyReport.findUnique({ where: { id }, include: { customer: { select: { id: true, name: true, monthlyReportsOff: true } } } });
  if (!r) notFound();
  const body = r.body as unknown as ReportBody;
  const m = r.metrics as unknown as ReportMetrics & { rawMeasures?: RawMeasure[] };
  const check = (r.check as { ok: boolean; issues: string[] } | null) ?? { ok: true, issues: [] };
  const reasons = (r.reasons as string[] | null) ?? [];
  const raw = m.rawMeasures ?? null;
  return (
    <>
    <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-slate-50 p-4 text-sm" data-report-internal>
      <div className="font-semibold">Intern (nie für den Kunden sichtbar): {r.rating}{r.dataQuality === "unsicher" ? ", Datenlage unsicher" : ""}</div>
      <ul className="mt-1 list-disc pl-5 text-[color:var(--muted)]">
        {reasons.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <div className="mt-2 text-[color:var(--muted)]">
        Leads {m.current.leads}
        {m.expectedLeads != null ? ` von erwartet ~${m.expectedLeads}` : ""} · Werbekosten {fmtValue({ value: m.current.spend, unit: "€" })} · Termine {m.current.termine} · Abschlüsse {m.current.abschluesse}
        {m.current.ergebnisQuote != null ? ` · Ergebnisse eingetragen ${Math.round(m.current.ergebnisQuote * 100)} %` : ""} · KI-Kosten ca. {(r.costCents / 100).toFixed(2)} $
      </div>
      {raw ? (
        <div className="mt-2" data-report-raw-measures>
          <div className="font-medium">Maßnahmen im Monat (Rohdaten für die Zusammenfassung): {raw.length ? "" : "keine"}</div>
          {raw.length ? (
            <ul className="list-disc pl-5 text-[color:var(--muted)]">
              {raw.map((x) => (
                <li key={`${x.at}-${x.text}`}>
                  {new Date(x.at).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}: {x.text} ({x.source})
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-amber-800">
              Ohne Maßnahme geht der Bericht nicht automatisch raus. Maßnahme eintragen unter <Link href="/admin/neu/leads/werbekonten" className="underline">Optimierung</Link>, dann hier senden oder aussetzen.
            </p>
          )}
        </div>
      ) : null}
      {!check.ok || check.issues.length ? (
        <div className="mt-2 text-amber-800">Prüfung: {check.issues.join(" · ")}</div>
      ) : (
        <div className="mt-2 text-emerald-700">Prüfung: keine Befunde (keine erfundenen Zahlen, kein „Garantie“, keine Versprechen, keine Gedankenstriche).</div>
      )}
    </section>

    <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]" data-report-preview>
      <div className="text-xs text-[color:var(--muted)]">Vorschau E-Mail</div>
      <h2 className="mt-1 text-lg font-semibold">{r.subject}</h2>
      {body.version === 2 && body.model ? (
        <div className="mt-3">
          <MonatsberichtAnsicht model={body.model} intro={body.paragraphs} />
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(body.facts ?? []).map((f) => (
              <div key={f.key} className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-slate-50 px-3 py-2">
                <div className="text-xs text-[color:var(--muted)]">{f.label}</div>
                <div className="text-lg font-semibold tabular-nums">{fmtValue(f)}</div>
                {f.previous != null ? <div className="text-xs text-[color:var(--muted)]">Vormonat {fmtValue({ value: f.previous, unit: f.unit })}</div> : null}
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-3 text-[15px] leading-relaxed">
            {body.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            {body.tips.length ? (
              <ul className="list-disc pl-5">
                {body.tips.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </>
      )}
    </section>

    {r.status === "draft" ? <ReportDecision id={r.id} subject={r.subject} body={body.paragraphs.join("\n\n")} rating={r.rating} /> : null}
    {ohneSchalter ? null : <CustomerReportsToggle id={r.id} customerId={r.customer.id} off={r.customer.monthlyReportsOff} />}
    </>
  );
}
