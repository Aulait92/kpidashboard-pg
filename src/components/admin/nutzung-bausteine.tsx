import { AlertTriangle, LifeBuoy, MessageSquareText, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { CustomerUsage, computeUsageReport } from "@/lib/usage-report";
import type { HelpQuestion } from "@/lib/hilfe-report";
import type { loadSupportRequests } from "@/lib/support-server";

// Nutzung des Kunden-CRMs (gemeinsam für /admin/nutzung und /admin/neu/zahlen/qualitaet): Hilfe-Anfragen an das Team,
// Fragen an die KI-Hilfe und je Kunde Aktivität, genutzte Funktionen, Fehler, Feedback und liegen gebliebene Aufgaben.

const ACTION_LABELS: Record<string, string> = {
  "callback.not_reached": "Rückruf: nicht erreicht",
  "callback.lost": "Rückruf: verloren",
  "outcome.offer": "Termin: Angebot gesendet",
  "outcome.closed": "Termin: Abschluss",
  "outcome.lost": "Termin: kein Interesse",
  "outcome.no_show": "Termin: nicht erschienen",
  "followup.set": "Wiedervorlage gesetzt",
  "followup.done": "Wiedervorlage erledigt",
  "chat.reply": "Chat beantwortet",
  "chat.takeover": "Chat übernommen",
  "chat.bot_on": "Assistent wieder an",
  "chat.done": "„Braucht dich“ erledigt",
  "chat.followup": "Nachfassen gesendet",
  "pipeline.move": "Pipeline verschoben",
  "lead.save": "Lead gespeichert",
  "appointment.cancel": "Termin abgesagt",
  "appointment.book_by_advisor": "Termin für Lead gebucht",
};

/** Hilfe-Anfragen an das Team (nichts, wenn keine). */
export function HilfeAnfragenKarte({ support }: { support: Awaited<ReturnType<typeof loadSupportRequests>> }) {
  return (
    <>
      {support.length ? (
        <div id="hilfe-team">
        <Card className="mb-6">
          <CardHeader title="Hilfe-Anfragen an das Team" actions={<span className="text-xs text-[color:var(--muted)]">{support.length} Anfragen</span>} />
          <ul className="divide-y divide-[color:var(--border)]">
            {support.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-5 py-3 text-sm">
                <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {r.reason}: {r.summary}
                  </div>
                  <div className="text-xs text-[color:var(--muted)]">
                    <a href={`/admin/kunden/${r.customerId}`} className="hover:underline">{r.customer}</a> · {r.channel === "whatsapp" ? "per WhatsApp" : r.channel === "email" ? "per E-Mail" : "bittet um Rückmeldung"} · {r.ref}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-[color:var(--muted)]">{formatDateTime(r.at)}</span>
              </li>
            ))}
          </ul>
        </Card>
        </div>
      ) : null}

    </>
  );
}

/** KI-Hilfe: Fragen der Vertreter mit Bewertung. */
export function KiHilfeKarte({ help }: { help: HelpQuestion[] }) {
  const helpDown = help.filter((h) => h.rating === "down").length;
  return (
    <>
      <Card className="mb-6">
        <CardHeader
          title="KI-Hilfe: Fragen der Vertreter"
          actions={
            <span className="text-xs text-[color:var(--muted)]">
              {help.length} Fragen{helpDown ? ` · ${helpDown}× nicht hilfreich` : ""}
            </span>
          }
        />
        {help.length === 0 ? (
          <EmptyState icon={Sparkles} title="Noch keine Fragen" text="Hier steht, was Vertreter die KI-Hilfe fragen – und was sie nicht verstehen." />
        ) : (
          <ul className="divide-y divide-[color:var(--border)]">
            {help.map((h) => (
              <li key={h.id} className="px-5 py-3 text-sm">
                <details>
                  <summary className="flex cursor-pointer items-start gap-2">
                    {h.rating === "down" ? <ThumbsDown className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" /> : h.rating === "up" ? <ThumbsUp className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--muted)]" />}
                    <span className="flex-1 font-medium">{h.question}</span>
                    <span className="shrink-0 text-xs text-[color:var(--muted)]">{h.customer} · {formatDateTime(h.at)}</span>
                  </summary>
                  <p className="mt-2 whitespace-pre-line pl-6 text-[color:var(--muted)]">{h.answer}</p>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>

    </>
  );
}

/** Nutzung je Kunde: liegt herum, genutzte Aktionen, Seitenaufrufe, Fehler, Feedback. */
export function NutzungJeKunde({ report }: { report: Awaited<ReturnType<typeof computeUsageReport>> }) {
  return (
    <>
      {report.customers.length === 0 ? (
        <Card>
          <EmptyState icon={MessageSquareText} title="Noch keine Kunden mit CRM-Zugang" />
        </Card>
      ) : (
        <div className="space-y-6">
          {report.customers.map((c) => (
            <CustomerCard key={c.customerId} c={c} />
          ))}
        </div>
      )}
    </>
  );
}

function CustomerCard({ c }: { c: CustomerUsage }) {
  const stalledTotal =
    c.stalled.outcomesOpen + c.stalled.followUpsOverdue + c.stalled.attentionOver24h;
  return (
    <Card>
      <CardHeader
        title={c.customerName}
        actions={
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge tone={c.activeDays === 0 ? "danger" : c.activeDays < 3 ? "warning" : "success"}>
              {c.activeDays} aktive Tage
            </Badge>
            <span className="text-[color:var(--muted)]">
              {c.lastSeen ? `zuletzt ${formatDateTime(new Date(c.lastSeen))}` : "noch nie aktiv"}
            </span>
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-5 px-5 py-4 md:grid-cols-3">
        <section>
          <h3 className="mb-2 text-xs font-semibold text-[color:var(--muted)]">Liegt herum</h3>
          <ul className="space-y-1 text-sm">
            <Stalled label="Termine ohne Ergebnis (> 1 Tag)" n={c.stalled.outcomesOpen} />
            <Stalled label="Wiedervorlagen überfällig" n={c.stalled.followUpsOverdue} />
            <Stalled label="„Braucht dich“ > 24 h offen" n={c.stalled.attentionOver24h} />
            <li className="flex justify-between text-[color:var(--muted)]">
              <span>Offene Rückrufe</span>
              <span className="tabular-nums">{c.stalled.callbacksOpen}</span>
            </li>
          </ul>
          {stalledTotal > 0 ? (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Kunde arbeitet Aufgaben nicht ab – nachfragen oder Ablauf vereinfachen.
            </p>
          ) : null}
        </section>
        <section>
          <h3 className="mb-2 text-xs font-semibold text-[color:var(--muted)]">Genutzte Aktionen</h3>
          {c.actions.length === 0 ? (
            <p className="text-sm text-[color:var(--muted)]">keine</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {c.actions.map((a) => (
                <li key={a.name} className="flex justify-between gap-2">
                  <span className="truncate">{ACTION_LABELS[a.name] ?? a.name}</span>
                  <span className="tabular-nums text-[color:var(--muted)]">{a.count}</span>
                </li>
              ))}
            </ul>
          )}
          <h3 className="mb-2 mt-4 text-xs font-semibold text-[color:var(--muted)]">Seitenaufrufe</h3>
          <ul className="space-y-1 text-sm">
            {c.pageViews.map((p) => (
              <li key={p.name} className="flex justify-between gap-2">
                <span className="truncate font-mono text-xs">{p.name}</span>
                <span className="tabular-nums text-[color:var(--muted)]">{p.count}</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="mb-2 text-xs font-semibold text-[color:var(--muted)]">Fehler</h3>
          {c.errors.length === 0 ? (
            <p className="text-sm text-[color:var(--muted)]">keine</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {c.errors.map((e) => (
                <li key={e.name} className="flex justify-between gap-2 text-rose-700">
                  <span className="truncate">{e.name}</span>
                  <span className="tabular-nums">{e.count}</span>
                </li>
              ))}
            </ul>
          )}
          <h3 className="mb-2 mt-4 text-xs font-semibold text-[color:var(--muted)]">Feedback</h3>
          {c.feedback.length === 0 ? (
            <p className="text-sm text-[color:var(--muted)]">noch keins</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {c.feedback.map((f, i) => (
                <li key={i} className="rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] px-3 py-2">
                  „{f.text}“
                  <div className="mt-0.5 text-[11px] text-[color:var(--muted)]">
                    {formatDateTime(new Date(f.at))} · {f.path ?? "–"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Card>
  );
}

function Stalled({ label, n }: { label: string; n: number }) {
  return (
    <li className={`flex justify-between ${n > 0 ? "font-medium text-amber-700" : "text-[color:var(--muted)]"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{n}</span>
    </li>
  );
}
