"use client";

import { useActionState } from "react";
import { saveKpiSettingsAction, saveRecurringCostAction, type KostenState } from "@/app/admin/zahlen/actions";

const input = "mt-1 h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm outline-none focus:border-[color:var(--brand)]";

function Result({ state }: { state: KostenState }) {
  if (state.error) return <p className="text-sm text-rose-600">{state.error}</p>;
  if (state.ok) return <p className="text-sm text-emerald-700">Gespeichert</p>;
  return null;
}

export function CostForm({ cost }: { cost: { id: string; name: string; amount: string; purpose: string; startsAt: string; endsAt: string } }) {
  const [state, action, pending] = useActionState<KostenState, FormData>(saveRecurringCostAction, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="id" value={cost.id} />
      <label className="text-sm">
        Name
        <input name="name" defaultValue={cost.name} placeholder="z. B. Instantly" className={input} required />
      </label>
      <label className="text-sm">
        Betrag pro Monat (€, netto)
        <input name="amount" defaultValue={cost.amount} inputMode="decimal" placeholder="z. B. 97" className={input} required />
      </label>
      <label className="text-sm">
        Zweck
        <select name="purpose" defaultValue={cost.purpose} className={input}>
          <option value="ppl">Direkt: Pay-per-Lead (z. B. Zapier)</option>
          <option value="software">Direkt: Software (z. B. Claude, Server)</option>
          <option value="akquise">Kundengewinnung (z. B. Instantly)</option>
          <option value="betrieb">Sonstiger Betrieb</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          Ab
          <input type="date" name="startsAt" defaultValue={cost.startsAt} className={input} required />
        </label>
        <label className="text-sm">
          Bis (optional)
          <input type="date" name="endsAt" defaultValue={cost.endsAt} className={input} />
        </label>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn-primary" disabled={pending}>{pending ? "Speichere …" : cost.id ? "Änderung speichern" : "Hinzufügen"}</button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function KpiSettingsForm({ hours, rate, campaigns, pplPilotEnd }: { hours: number; rate: number; campaigns: string; pplPilotEnd?: string | null }) {
  const [state, action, pending] = useActionState<KostenState, FormData>(saveKpiSettingsAction, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">
        Gründerzeit Vertrieb (Std./Woche)
        <input name="hours" defaultValue={hours} inputMode="numeric" className={input} />
      </label>
      <label className="text-sm">
        Kalkulatorischer Stundensatz (€)
        <input name="rate" defaultValue={String(rate).replace(".", ",")} inputMode="decimal" className={input} />
      </label>
      <label className="text-sm sm:col-span-2">
        Meta-Kampagnen der eigenen Kundengewinnung (kommagetrennt, Teil des Namens genügt)
        <input name="campaigns" defaultValue={campaigns} className={input} />
      </label>
      <label className="text-sm sm:col-span-2">
        Pay-per-Lead-Pilotphase endet mit Monat (leer = läuft noch)
        <input name="pplPilotEnd" type="month" defaultValue={pplPilotEnd ?? ""} className={input} />
        <span className="mt-1 block text-sm text-[color:var(--muted)]">Erscheint im Reiter „Pay-per-Lead“ und im Investoren-Update („Pilot Juni–… abgeschlossen“).</span>
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn-primary" disabled={pending}>{pending ? "Speichere …" : "Speichern"}</button>
        <Result state={state} />
      </div>
    </form>
  );
}
