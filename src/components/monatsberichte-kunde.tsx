import { sentReportsFor, type ReportBody } from "@/lib/monatsbericht/server";
import { Download } from "lucide-react";
import { berichtPdfName } from "@/lib/monatsbericht/pdf";
import { fmtValue, monthLabel, shiftMonth } from "@/lib/monatsbericht/shared";
import { MonatsberichtAnsicht } from "@/components/monatsbericht-ansicht";

/** Monat (JJJJ-MM, Berlin), in dem der erste Bericht kommt: Anfang des nächsten Monats. */
export function ersterBerichtMonat(now = new Date()): string {
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit" }).format(now).split("-");
  return shiftMonth(`${y}-${m}`, 1);
}

/** Kundenbereich → Zahlen: gesendete Monatsberichte (ohne interne Einstufung). */
export async function MonatsberichteKunde({ customerId }: { customerId: string }) {
  const reports = await sentReportsFor(customerId).catch(() => []);
  return (
    <section
      id="monatsberichte"
      className="scroll-mt-20 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]"
      data-monatsberichte
    >
      <h2 className="text-lg font-semibold">Monatsberichte</h2>
      {!reports.length ? (
        <div data-monatsberichte-leer>
          <p className="mt-1 text-[15px]">Ihr erster Monatsbericht kommt voraussichtlich Anfang {monthLabel(ersterBerichtMonat()).split(" ")[0]}.</p>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Darin finden Sie jeden Monat Ihre Leads, Termine, Abschlüsse und Ihren Gewinn im Vergleich zum Vormonat, dazu unsere Maßnahmen und Tipps. Sie bekommen ihn per E-Mail und finden ihn danach
            hier, auch als PDF.
          </p>
        </div>
      ) : (
        <p className="text-sm text-[color:var(--muted)]">Ihr Rückblick von uns, jeden Monat auch per E-Mail.</p>
      )}
      {reports.length ? <ul className="mt-3 divide-y divide-[color:var(--border)]">
        {reports.map((r) => {
          const body = r.body as unknown as ReportBody;
          return (
            <li key={r.id} className="py-2">
              <a
                href={`/api/buyer/monatsbericht/${r.id}/pdf`}
                download={berichtPdfName(r.month)}
                className="float-right ml-3 mt-1 inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-sm font-medium text-[color:var(--brand)] hover:bg-[color:var(--brand-soft)]"
                aria-label={`Monatsbericht ${monthLabel(r.month)} als PDF herunterladen`}
                data-bericht-pdf
              >
                <Download className="h-4 w-4" /> PDF
              </a>
              <details>
                <summary className="cursor-pointer py-1 font-medium">
                  {monthLabel(r.month)} <span className="font-normal text-[color:var(--muted)]">· {r.subject}</span>
                </summary>
                {body.version === 2 && body.model ? (
                  <div className="mt-2">
                    <MonatsberichtAnsicht model={body.model} intro={body.paragraphs} />
                  </div>
                ) : (
                  <>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {(body.facts ?? []).map((f) => (
                        <div key={f.key} className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-slate-50 px-3 py-2">
                          <div className="text-xs text-[color:var(--muted)]">{f.label}</div>
                          <div className="font-semibold tabular-nums">{fmtValue(f)}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 space-y-2 text-[15px] leading-relaxed">
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
              </details>
            </li>
          );
        })}
      </ul> : null}
    </section>
  );
}
