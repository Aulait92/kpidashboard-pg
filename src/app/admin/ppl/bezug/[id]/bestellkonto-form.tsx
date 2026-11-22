"use client";

// Bestellkonto (Ole, 22.11.2026, lib/ppl/bestellkonto.ts): Hauptkunde, der für diesen Vertriebspartner die
// Wochenbestellungen aufgibt und bezahlt. Leer = der Kunde bestellt selbst.
import { useActionState } from "react";
import { Button } from "@/components/ui";
import { saveBestellkontoAction, type BestellkontoState } from "../../actions";

const input = "mt-1 h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm text-[color:var(--foreground)] outline-none focus:border-[color:var(--brand)]";

export function BestellkontoForm(p: { customerId: string; bestelltUeberId: string; kunden: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<BestellkontoState, FormData>(saveBestellkontoAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3 border-t border-[color:var(--border)] px-5 pb-5 pt-4" data-bestellkonto>
      <input type="hidden" name="customerId" value={p.customerId} />
      <label className="block min-w-[14rem] flex-1 text-xs font-medium text-[color:var(--muted)]">
        Bestellt und bezahlt über
        <select name="bestelltUeberId" defaultValue={p.bestelltUeberId} className={input}>
          <option value="">Kunde bestellt selbst</option>
          {p.kunden.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" variant="secondary" size="md" disabled={pending}>
        {pending ? "Speichert …" : "Speichern"}
      </Button>
      {state.error ? <span className="w-full text-sm text-rose-700">{state.error}</span> : null}
      {state.ok ? <span className="w-full text-sm text-emerald-700">Gespeichert.</span> : null}
    </form>
  );
}
