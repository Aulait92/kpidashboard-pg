import { sentReportsFor } from "@/lib/monatsbericht/server";
import { fmtValue, monthLabel, type Fact } from "@/lib/monatsbericht/shared";

/** Kundenbereich → Zahlen: gesendete Monatsberichte (ohne interne Einstufung). */
export async function MonatsberichteKunde({ customerId }: { customerId: string }) {
  const reports = await sentReportsFor(customerId).catch(() => []);
  if (!reports.length) return null;
  return (
    <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]" data-monatsberichte>
      <h2 className="text-lg font-semibold">Monatsberichte</h2>
      <p className="text-sm text-[color:var(--muted)]">Ihr Rückblick von uns – jeden Monat auch per E-Mail.</p>
      <ul className="mt-3 divide-y divide-[color:var(--border)]">
        {reports.map((r) => {
          const body = r.body as { paragraphs: string[]; tips: string[]; facts: Fact[] };
          return (
            <li key={r.id} className="py-2">
              <details>
                <summary className="cursor-pointer py-1 font-medium">
                  {monthLabel(r.month)} <span className="font-normal text-[color:var(--muted)]">· {r.subject}</span>
                </summary>
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
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
