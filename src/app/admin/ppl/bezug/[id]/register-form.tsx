"use client";

// Registerprüfung eintragen (Ole, 20.11.2026): Nummer, Status laut Vermittlerregister, Prüfdatum. Gespeichert am Kunden.
import { useActionState } from "react";
import { Button } from "@/components/ui";
import { saveRegisterpruefungAction, type RegisterState } from "../../actions";
import { REGISTER_STATUS } from "@/lib/ppl/steuer";

const input = "mt-1 h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm text-[color:var(--foreground)] outline-none focus:border-[color:var(--brand)]";

export function RegisterForm(p: { customerId: string; registerNr: string; status: string; geprueftAm: string; heute: string }) {
  const [state, action, pending] = useActionState<RegisterState, FormData>(saveRegisterpruefungAction, {});
  return (
    <form action={action} className="grid grid-cols-1 gap-3 px-5 pb-5 sm:grid-cols-3" data-registerpruefung>
      <input type="hidden" name="customerId" value={p.customerId} />
      <label className="block text-xs font-medium text-[color:var(--muted)]">
        Registernummer
        <input name="registerNr" defaultValue={p.registerNr} placeholder="D-XXXX-XXXXX-XX" className={input} />
      </label>
      <label className="block text-xs font-medium text-[color:var(--muted)]">
        Status laut Register
        <select name="registerStatus" defaultValue={p.status} required className={input}>
          <option value="">Bitte wählen</option>
          {REGISTER_STATUS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-medium text-[color:var(--muted)]">
        Geprüft am
        <input type="date" name="geprueftAm" defaultValue={p.geprueftAm || p.heute} max={p.heute} className={input} />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <Button type="submit" variant="secondary" size="md" disabled={pending}>
          {pending ? "Speichert …" : "Prüfung speichern"}
        </Button>
        <a href="https://www.vermittlerregister.info" target="_blank" rel="noreferrer" className="text-sm font-medium text-[color:var(--brand)] hover:underline">
          Vermittlerregister öffnen
        </a>
        {state.error ? <span className="text-sm text-rose-700">{state.error}</span> : null}
        {state.ok ? <span className="text-sm text-emerald-700">Gespeichert. Wartende Bestellungen werden jetzt abgebucht.</span> : null}
      </div>
    </form>
  );
}
