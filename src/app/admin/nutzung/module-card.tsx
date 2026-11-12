import Link from "next/link";
import { Puzzle } from "lucide-react";
import { Badge, Card, CardHeader } from "@/components/ui";
import { ANNOUNCEMENT, moduleOverview } from "@/lib/empfehlung/module";
import { CANDIDATE_MIN_CLOSINGS, CANDIDATE_WINDOW_DAYS, fmtDate } from "@/lib/empfehlung/shared";
import { sendAnnouncementAction } from "./module-actions";

/** Zusatzmodule: Zähler, Kandidaten fürs Gespräch, einmalige Ankündigung (nur per Knopf). */
export async function ModuleCandidatesCard({ message }: { message: string | null }) {
  const o = await moduleOverview();
  return (
    <Card className="mb-6">
      <div id="zusatzmodule" className="scroll-mt-20" />
      <CardHeader title="Zusatzmodul Empfehlungen & Bewertungen" icon={Puzzle} />
      <div className="space-y-5 px-5 pb-5 text-sm">
        <div className="flex flex-wrap gap-2" data-admin-module-counts>
          <Badge tone="success">{o.counts.active} gebucht</Badge>
          <Badge tone="warning">{o.counts.trial} in Testphase</Badge>
          <Badge tone="neutral">{o.counts.cancelling} gekündigt</Badge>
          <Badge tone="neutral">{o.counts.free} frei</Badge>
          <Badge tone="neutral">{o.counts.inactive} ohne Modul</Badge>
        </div>

        <section>
          <h3 className="font-semibold">Kandidaten fürs Gespräch</h3>
          <p className="text-xs text-[color:var(--muted)]">
            Mindestens {CANDIDATE_MIN_CLOSINGS} Abschlüsse in {CANDIDATE_WINDOW_DAYS} Tagen, Modul nicht aktiv.
          </p>
          {o.candidates.length ? (
            <ul className="mt-2 divide-y divide-[color:var(--border)] rounded-[var(--radius-md)] border border-[color:var(--border)]" data-admin-module-candidates>
              {o.candidates.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                  <Link href={`/admin/kunden/${c.id}/abrechnung`} className="min-w-0 flex-1 font-medium hover:underline">
                    {c.name}
                  </Link>
                  <span className="tabular-nums text-[color:var(--muted)]">{c.closings} Abschlüsse</span>
                  {c.bestand ? <Badge tone="neutral">Bestand aktiv</Badge> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[color:var(--muted)]">Gerade keine.</p>
          )}
        </section>

        <section className="space-y-2 border-t border-[color:var(--border)] pt-4">
          <h3 className="font-semibold">Ankündigung (Entwurf)</h3>
          {message ? <p className="rounded-[var(--radius-sm)] bg-emerald-50 px-3 py-2 font-medium text-emerald-900">{message === "bestaetigen" ? "Bitte das Häkchen setzen." : message}</p> : null}
          <div className="rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] p-3">
            <div className="font-medium">Betreff: {ANNOUNCEMENT.subject}</div>
            {ANNOUNCEMENT.paragraphs.map((p) => (
              <p key={p} className="mt-2">
                {p}
              </p>
            ))}
            <p className="mt-2 text-xs text-[color:var(--muted)]">Knopf in der Mail: „Jetzt kostenlos testen“ → Konto &amp; Rechnungen.</p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3">
            <div className="text-xs font-medium text-[color:var(--muted)]">In-App-Hinweis in „Heute“ (nach dem Versand, wegklickbar)</div>
            <p className="mt-1">{ANNOUNCEMENT.inApp}</p>
          </div>
          {o.announcement ? (
            <p className="text-[color:var(--muted)]" data-admin-announcement-sent>
              Verschickt am {fmtDate(o.announcement.sentAt)} an {o.announcement.sentCount} Kunden{o.announcement.sentBy ? ` (${o.announcement.sentBy})` : ""}.
            </p>
          ) : (
            <form action={sendAnnouncementAction} className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="confirm" className="h-4 w-4" />
                <span>An {o.audience} aktive Kunden ohne Modul senden (einmalig)</span>
              </label>
              <button className="h-9 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-3 text-sm font-semibold text-white">Ankündigung senden</button>
            </form>
          )}
        </section>
      </div>
    </Card>
  );
}
