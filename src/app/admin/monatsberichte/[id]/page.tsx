import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";
import { fmtValue, monthLabel, STATUS_LABEL, type Fact, type ReportMetrics } from "@/lib/monatsbericht/shared";
import { CustomerReportsToggle, ReportDecision } from "../forms";

export const metadata = { title: "Monatsbericht | performancegrowth Admin" };

export default async function MonatsberichtPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const { id } = await params;
  const r = await prisma.monthlyReport.findUnique({ where: { id }, include: { customer: { select: { id: true, name: true, monthlyReportsOff: true } } } });
  if (!r) notFound();
  const body = r.body as { paragraphs: string[]; tips: string[]; facts: Fact[] };
  const m = r.metrics as unknown as ReportMetrics;
  const check = (r.check as { ok: boolean; issues: string[] } | null) ?? { ok: true, issues: [] };
  const reasons = (r.reasons as string[] | null) ?? [];
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8 sm:px-6">
      <div>
        <Link href={`/admin/monatsberichte?monat=${r.month}`} className="text-sm text-[color:var(--muted)] hover:underline">← Monatsberichte {monthLabel(r.month)}</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{r.customer.name}</h1>
        <p className="text-sm text-[color:var(--muted)]">
          {monthLabel(r.month)} · Status: {STATUS_LABEL[r.status] ?? r.status}
          {r.sentAt ? ` am ${r.sentAt.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}` : ""}
          {r.decidedBy ? ` (${r.decidedBy})` : ""}
        </p>
      </div>

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
        {!check.ok || check.issues.length ? (
          <div className="mt-2 text-amber-800">Prüfung: {check.issues.join(" · ")}</div>
        ) : (
          <div className="mt-2 text-emerald-700">Prüfung: keine Befunde (keine erfundenen Zahlen, kein „Garantie“, keine Versprechen).</div>
        )}
      </section>

      <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]" data-report-preview>
        <div className="text-xs text-[color:var(--muted)]">Vorschau E-Mail</div>
        <h2 className="mt-1 text-lg font-semibold">{r.subject}</h2>
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
      </section>

      {r.status === "draft" ? <ReportDecision id={r.id} subject={r.subject} body={body.paragraphs.join("\n\n")} rating={r.rating} /> : null}
      <CustomerReportsToggle id={r.id} customerId={r.customer.id} off={r.customer.monthlyReportsOff} />
    </main>
  );
}
