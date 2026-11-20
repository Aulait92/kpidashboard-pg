"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import type { ReportSettingsView } from "@/lib/monatsbericht/server";
import { saveReportSettingsAction, type ReportActionState } from "@/app/admin/monatsberichte/actions";

function Num({ name, label, value, suffix }: { name: string; label: string; value: number; suffix: string }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <span className="flex items-center gap-1">
        <input name={name} type="number" defaultValue={value} className="input h-9 w-24 text-right" />
        <span className="w-10 text-[color:var(--muted)]">{suffix}</span>
      </span>
    </label>
  );
}

export function ReportSettingsForm({ s }: { s: ReportSettingsView }) {
  const [state, action, pending] = useActionState<ReportActionState, FormData>(saveReportSettingsAction, {});
  return (
    <form action={action} className="space-y-6 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
      <label className="flex items-start gap-3 text-[15px]">
        <input type="checkbox" name="autoSendGood" defaultChecked={s.autoSendGood} className="mt-1 h-5 w-5" />
        <span>
          <b>Gute Berichte automatisch senden</b>
          <span className="block text-sm text-[color:var(--muted)]">Aus: Sie sehen jeden Bericht vor dem Versand. Mittel und schwach gehen nie automatisch raus.</span>
        </span>
      </label>
      {/* UX-Umbau 20.11.2026: Schwellen ändert man selten, darum eingeklappt; Standardwerte sind gesetzt */}
      <details className="group rounded-[var(--radius-md)] border border-[color:var(--border)] px-4">
        <summary className="flex min-h-12 cursor-pointer items-center text-sm font-semibold">Einstufung gut, mittel, schwach</summary>
      <fieldset className="space-y-2 pb-4">
        <Num name="goodLeadsPct" label="Gut ab (Leads von der Erwartung)" value={s.goodLeadsPct} suffix="%" />
        <Num name="weakLeadsPct" label="Schwach unter (Leads von der Erwartung)" value={s.weakLeadsPct} suffix="%" />
        <Num name="weakCplPct" label="Schwach über (Leadpreis vom Ziel)" value={s.weakCplPct} suffix="%" />
        <Num name="weakNoMeetingLeads" label="Schwach bei 0 Terminen ab" value={s.weakNoMeetingLeads} suffix="Leads" />
        <Num name="minResultPct" label="Unsicher unter (Leads mit Ergebnis)" value={s.minResultPct} suffix="%" />
        <Num name="minActiveDays" label="Kein Bericht unter (aktive Tage)" value={s.minActiveDays} suffix="Tage" />
      </fieldset>
      </details>
      <label className="block text-sm">
        <span className="font-semibold">Ziel-Leadpreis (€)</span>
        <span className="block text-[color:var(--muted)]">Leer: Wert aus dem Rechner.</span>
        <input name="targetCpl" defaultValue={s.targetCpl ?? ""} inputMode="decimal" className="input mt-1 h-9 w-32" />
      </label>
      <label className="block text-sm">
        <span className="font-semibold">Absender bzw. Signatur</span>
        <textarea name="senderName" defaultValue={s.senderName ?? ""} rows={2} placeholder={"Ole Kannapinn\nperformancegrowth"} className="input mt-1 w-full" />
      </label>
      <div className="flex items-center gap-3">
        <button className="btn-primary h-10" disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Speichern</button>
        {state.error ? <span className="text-sm text-rose-700">{state.error}</span> : null}
        {state.message ? <span className="text-sm text-emerald-700">{state.message}</span> : null}
      </div>
    </form>
  );
}
