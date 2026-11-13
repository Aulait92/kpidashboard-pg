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
          <span className="block text-sm text-[color:var(--muted)]">Aus: Du siehst jeden Bericht zuerst (empfohlen für den ersten Monat). Mittel und schwach gehen nie automatisch raus.</span>
        </span>
      </label>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-semibold">Einstufung</legend>
        <Num name="goodLeadsPct" label="„Gut“ ab Leads (von der Erwartung)" value={s.goodLeadsPct} suffix="%" />
        <Num name="weakLeadsPct" label="„Schwach“ unter Leads (von der Erwartung)" value={s.weakLeadsPct} suffix="%" />
        <Num name="weakCplPct" label="„Schwach“ bei Leadpreis über (vom Ziel)" value={s.weakCplPct} suffix="%" />
        <Num name="weakNoMeetingLeads" label="„Schwach“: 0 Termine ab so vielen Leads" value={s.weakNoMeetingLeads} suffix="Leads" />
        <Num name="minResultPct" label="Datenlage unsicher unter (Leads mit Ergebnis)" value={s.minResultPct} suffix="%" />
        <Num name="minActiveDays" label="Kein Bericht bei weniger aktiven Tagen als" value={s.minActiveDays} suffix="Tage" />
      </fieldset>
      <label className="block text-sm">
        <span className="font-semibold">Ziel-Leadpreis (€)</span>
        <span className="block text-[color:var(--muted)]">Leer = aus dem Rechner (Katzenversicherung, Makler mit eigenem Wert).</span>
        <input name="targetCpl" defaultValue={s.targetCpl ?? ""} inputMode="decimal" className="input mt-1 h-9 w-32" />
      </label>
      <label className="block text-sm">
        <span className="font-semibold">Absender bzw. Signatur</span>
        <textarea name="senderName" defaultValue={s.senderName ?? ""} rows={2} placeholder={"Ole Kannapinn\nperformancegrowth"} className="input mt-1 w-full" />
      </label>
      <label className="block text-sm">
        <span className="font-semibold">Terminlink für „kurzes Gespräch“</span>
        <span className="block text-[color:var(--muted)]">https-Link, z. B. Calendly. Leer = Kundenbereich.</span>
        <input name="bookingUrl" defaultValue={s.bookingUrl ?? ""} placeholder="https://" className="input mt-1 w-full" />
      </label>
      <div className="flex items-center gap-3">
        <button className="btn-primary h-10" disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Speichern</button>
        {state.error ? <span className="text-sm text-rose-700">{state.error}</span> : null}
        {state.message ? <span className="text-sm text-emerald-700">{state.message}</span> : null}
      </div>
    </form>
  );
}
