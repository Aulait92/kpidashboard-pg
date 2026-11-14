import clsx from "clsx";
import { approveFollowupAction, planFollowupAction, redraftFollowupAction, saveFollowupAction, stopFollowupAction } from "@/app/admin/vertrieb/followup-actions";
import { ConfirmButton } from "@/components/vertrieb/confirm-button";
import { FollowupSendNow } from "@/components/vertrieb/followup-send";
import { addDays, dayKey, fmtDate, fmtDateTime, timeKey } from "@/lib/vertrieb/dates";
import { STATUS_LABEL, type FollowupStatus } from "@/lib/vertrieb/followup";

export type FollowupRow = {
  id: string;
  status: string;
  step: number;
  source: string;
  dueAt: Date;
  nextAt: Date;
  timing: string | null;
  subject: string | null;
  body1: string | null;
  body2: string | null;
  textSource: string | null;
  mail1SentAt: Date | null;
  mail2SentAt: Date | null;
  lastError: string | null;
  stoppedAt: Date | null;
  stopReason: string | null;
  activeFor: string | null;
};

const at = (d: Date) => `${fmtDate(d)}, ${timeKey(d)} Uhr`;

/** Kurzer Stand für Kopfzeile und Übersicht: „Follow-up geplant am …“ */
export function followupLine(f: FollowupRow): string {
  if (f.step === 0) return `Follow-up geplant am ${fmtDate(f.nextAt)}`;
  if (f.step === 1) return `Mail 1 gesendet am ${fmtDate(f.mail1SentAt)}, Mail 2 am ${fmtDate(f.nextAt)}`;
  return `Mail 2 gesendet am ${fmtDate(f.mail2SentAt)}, Anruf-Aufgabe ab ${fmtDate(f.nextAt)}`;
}

export function FollowupBadge({ f }: { f: FollowupRow }) {
  return (
    <span className={clsx("badge", f.status === "FREIGABE" ? "bg-amber-100 text-amber-800" : "bg-teal-100 text-teal-800")} data-followup-badge>
      {followupLine(f)}
      {f.status === "FREIGABE" ? " (wartet auf Freigabe)" : ""}
    </span>
  );
}

/** Karte „Später-Follow-up“ im Vertriebs-Kontakt */
export function FollowupCard({ contactId, followups, plannable, eaccount }: { contactId: string; followups: FollowupRow[]; plannable: boolean; eaccount: string | null }) {
  const f = followups.find((x) => x.activeFor);
  const past = followups.filter((x) => !x.activeFor).slice(0, 3);
  return (
    <section className="card" id="follow-up" data-followup-card>
      <h2 className="flex items-center justify-between border-b border-slate-100 px-4 py-3 font-medium">
        Später-Follow-up
        {f ? <span className={clsx("badge", f.status === "FREIGABE" ? "bg-amber-100 text-amber-800" : "bg-teal-100 text-teal-800")}>{STATUS_LABEL[f.status as FollowupStatus]}</span> : null}
      </h2>
      {f ? (
        <div className="space-y-3 p-4 text-sm">
          <p className="font-medium text-teal-900">
            {f.step === 0 ? `Follow-up geplant am ${at(f.nextAt)}` : followupLine(f)}
            {f.timing ? <span className="font-normal text-slate-500"> · Antwort: „{f.timing}“</span> : null}
          </p>
          <p className="text-xs text-slate-500">
            Als Antwort im selben Thread{eaccount ? ` aus ${eaccount}` : ""} mit „{f.subject ?? "Re: …"}“. Signatur des Postfachs und Verlauf werden angehängt. Mail 2 nach 5 Werktagen ohne Antwort, danach Aufgabe „Wieder melden“.
            {f.textSource ? ` Text: ${f.textSource === "KI" ? "KI" : f.textSource === "MANUELL" ? "von Hand" : "Vorlage"}.` : ""}
          </p>
          {f.lastError ? <p className="rounded bg-rose-50 px-2 py-1 text-xs text-rose-700">Letzter Versuch fehlgeschlagen: {f.lastError}</p> : null}
          {f.status === "FREIGABE" ? (
            <form action={approveFollowupAction}>
              <input type="hidden" name="id" value={f.id} />
              <button className="btn-primary">Freigeben</button>
            </form>
          ) : null}
          {f.step < 2 ? (
            <form action={saveFollowupAction} className="space-y-2" key={`${f.nextAt.getTime()}-${f.body1}-${f.body2}`}>
              <input type="hidden" name="id" value={f.id} />
              <label className="block">
                <span className="label">{f.step === 0 ? "Mail 1 am" : "Mail 2 am"}</span>
                <input type="date" name="date" defaultValue={dayKey(f.nextAt)} min={dayKey(new Date())} className="input" />
              </label>
              {f.step === 0 ? (
                <label className="block">
                  <span className="label">Mail 1</span>
                  <textarea name="body1" rows={9} defaultValue={f.body1 ?? ""} placeholder="Text wird beim nächsten Lauf erstellt." className="input font-normal" />
                </label>
              ) : null}
              <label className="block">
                <span className="label">Mail 2 (falls keine Antwort)</span>
                <textarea name="body2" rows={4} defaultValue={f.body2 ?? ""} placeholder="Text wird beim nächsten Lauf erstellt." className="input font-normal" />
              </label>
              <div className="flex flex-wrap gap-2">
                <button className="btn-ghost">Speichern</button>
                <button formAction={redraftFollowupAction} className="btn-ghost" title="Texte aus Originalmail und Antwort neu schreiben (überschreibt Änderungen)">
                  Texte neu schreiben
                </button>
              </div>
            </form>
          ) : null}
          <div className="flex flex-wrap items-start gap-2 border-t border-slate-100 pt-3">
            {f.step < 2 ? <FollowupSendNow id={f.id} step={f.step} /> : null}
            <form action={stopFollowupAction}>
              <input type="hidden" name="contactId" value={contactId} />
              <ConfirmButton message="Follow-up stoppen? Statt der Mails gibt es eine Aufgabe „Wieder melden“." className="btn-ghost text-rose-600 hover:bg-rose-50">
                Stoppen
              </ConfirmButton>
            </form>
          </div>
        </div>
      ) : (
        <div className="space-y-3 p-4 text-sm">
          {plannable ? (
            <form action={planFollowupAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="contactId" value={contactId} />
              <label>
                <span className="label">Kein Follow-up geplant. Mail 1 am</span>
                <input type="date" name="date" defaultValue={dayKey(addDays(new Date(), 91))} min={dayKey(new Date())} className="input" />
              </label>
              <button className="btn-ghost">Follow-up planen</button>
            </form>
          ) : (
            <p className="text-slate-500">Kein Follow-up möglich: keine Mail aus Instantly, auf die im selben Thread geantwortet werden kann.</p>
          )}
        </div>
      )}
      {past.length ? (
        <ul className="divide-y divide-slate-100 border-t border-slate-100 text-xs text-slate-500">
          {past.map((p) => (
            <li key={p.id} className="px-4 py-2">
              {STATUS_LABEL[p.status as FollowupStatus] ?? p.status} {p.stoppedAt ? fmtDateTime(p.stoppedAt) : ""}
              {p.stopReason ? `: ${p.stopReason}` : ""}
              {p.mail1SentAt ? ` · Mail 1 ${fmtDate(p.mail1SentAt)}` : ""}
              {p.mail2SentAt ? ` · Mail 2 ${fmtDate(p.mail2SentAt)}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
