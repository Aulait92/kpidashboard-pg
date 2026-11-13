"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  callInsteadAction,
  generateNowAction,
  sendReportAction,
  skipReportAction,
  toggleCustomerReportsAction,
  type ReportActionState,
} from "./actions";

function Msg({ s }: { s: ReportActionState }) {
  if (s.error) return <p className="text-sm text-rose-700">{s.error}</p>;
  if (s.message) return <p className="text-sm text-emerald-700">{s.message}</p>;
  return null;
}

/** Knöpfe am Bericht: So senden · Bearbeiten und senden · Ich rufe an · Aussetzen. */
export function ReportDecision({ id, subject, body, rating }: { id: string; subject: string; body: string; rating: string }) {
  const [sendState, send, sending] = useActionState<ReportActionState, FormData>(sendReportAction, {});
  const [callState, call, calling] = useActionState<ReportActionState, FormData>(callInsteadAction, {});
  const [skipState, skip, skipping] = useActionState<ReportActionState, FormData>(skipReportAction, {});
  const [edit, setEdit] = useState(false);
  const busy = sending || calling || skipping;
  return (
    <div className="space-y-3" data-report-decision>
      {rating === "schwach" ? (
        <p className="rounded-[var(--radius-md)] border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Empfehlung: lieber anrufen als schicken. Ein Gespräch wirkt bei einem schwachen Monat besser als ein Bericht.
        </p>
      ) : null}
      {edit ? (
        <form action={send} className="space-y-2">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="edited" value="1" />
          <label className="block text-sm font-semibold" htmlFor="b-subject">Betreff</label>
          <input id="b-subject" name="subject" defaultValue={subject} className="input w-full" required />
          <label className="block text-sm font-semibold" htmlFor="b-body">Text (Absätze mit Leerzeile trennen)</label>
          <textarea id="b-body" name="body" defaultValue={body} rows={14} className="input w-full text-sm" required />
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary h-10" disabled={busy}>{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Bearbeitet senden</button>
            <button type="button" className="btn-ghost h-10" onClick={() => setEdit(false)}>Abbrechen</button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <form action={send}>
            <input type="hidden" name="id" value={id} />
            <button className="btn-primary h-10" disabled={busy}>{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} So senden</button>
          </form>
          <button type="button" className="btn-ghost h-10" onClick={() => setEdit(true)} disabled={busy}>Bearbeiten und senden</button>
          <form action={call}>
            <input type="hidden" name="id" value={id} />
            <button className="btn-ghost h-10" disabled={busy}>{calling ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Nicht senden, ich rufe an</button>
          </form>
          <form action={skip}>
            <input type="hidden" name="id" value={id} />
            <button className="btn-ghost h-10 text-[color:var(--muted)]" disabled={busy}>Diesen Monat aussetzen</button>
          </form>
        </div>
      )}
      <Msg s={sendState} />
      <Msg s={callState} />
      <Msg s={skipState} />
    </div>
  );
}

export function CustomerReportsToggle({ id, customerId, off }: { id: string; customerId: string; off: boolean }) {
  const [state, action, pending] = useActionState<ReportActionState, FormData>(toggleCustomerReportsAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3 text-sm">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="off" value={off ? "0" : "1"} />
      <button className="btn-ghost h-9 text-sm" disabled={pending}>{off ? "Monatsberichte für diesen Kunden wieder an" : "Für diesen Kunden keine Monatsberichte"}</button>
      <Msg s={state} />
    </form>
  );
}

export function GenerateNow({ month }: { month: string }) {
  const [state, action, pending] = useActionState<ReportActionState, FormData>(generateNowAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="month" value={month} />
      <button className="btn-ghost h-9 text-sm" disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Fehlende Berichte jetzt erstellen</button>
      <Msg s={state} />
    </form>
  );
}
