"use client";

// Angaben für die öffentliche Partnerliste der Funnels (Ole, 20.11.2026, docs/recht/pkv-funnel.md L2): rechtlicher
// Empfänger der Leads (Firma, Anschrift, Registernummer), wenn er vom Kontonamen abweicht. Gespeichert am Kunden.
import { useActionState } from "react";
import { Button } from "@/components/ui";
import { savePartnerAngabenAction, type PartnerAngabenState } from "../../actions";

const input = "mt-1 h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm text-[color:var(--foreground)] outline-none focus:border-[color:var(--brand)]";

export function PartnerForm(p: { customerId: string; firma: string; anschrift: string; registerNr: string }) {
  const [state, action, pending] = useActionState<PartnerAngabenState, FormData>(savePartnerAngabenAction, {});
  return (
    <form action={action} className="grid grid-cols-1 gap-3 border-t border-[color:var(--border)] px-5 pb-5 pt-4 sm:grid-cols-3" data-partner-angaben>
      <p className="text-sm font-medium sm:col-span-3">Partnerliste im Funnel</p>
      <input type="hidden" name="customerId" value={p.customerId} />
      <label className="block text-xs font-medium text-[color:var(--muted)]">
        Firma bzw. Vermittler
        <input name="partnerFirma" defaultValue={p.firma} placeholder="z. B. Muster GmbH" className={input} />
      </label>
      <label className="block text-xs font-medium text-[color:var(--muted)]">
        Anschrift
        <input name="partnerAnschrift" defaultValue={p.anschrift} placeholder="Straße 1, 12345 Ort" className={input} />
      </label>
      <label className="block text-xs font-medium text-[color:var(--muted)]">
        Registernummer § 34d
        <input name="partnerRegisterNr" defaultValue={p.registerNr} placeholder="D-XXXX-XXXXX-XX" className={input} />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <Button type="submit" variant="secondary" size="md" disabled={pending}>
          {pending ? "Speichert …" : "Für Partnerliste speichern"}
        </Button>
        {state.error ? <span className="text-sm text-rose-700">{state.error}</span> : null}
        {state.ok ? <span className="text-sm text-emerald-700">Gespeichert, die Partnerliste zeigt es sofort.</span> : null}
      </div>
    </form>
  );
}
