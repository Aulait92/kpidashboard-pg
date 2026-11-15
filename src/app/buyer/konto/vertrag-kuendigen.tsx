"use client";

// „Vertrag hier kündigen“ (Konto & Rechnungen): Knopf → Bestätigungsseite mit Termin → „Jetzt kündigen“ →
// Bestätigung auf der Seite und per E-Mail. Nach dem Vorbild von § 312k BGB, freiwillig auch für Unternehmer.

import { useActionState, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button, buttonClass } from "@/components/ui";
import { cancelContractAction, type CancelContractState } from "./actions";

const fmt = (iso: string) => iso.split("-").reverse().join(".");

export function VertragKuendigen({
  requested,
  nextText,
  customerName,
  email,
  readOnly,
}: {
  requested: { atIso: string; effectiveIso: string } | null;
  /** „Ihr Vertrag endet am …“ (nächstmöglicher Termin, vom Server berechnet) */
  nextText: string;
  customerName: string;
  email: string;
  readOnly: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<CancelContractState, FormData>(cancelContractAction, {});
  const done = state.ok && state.effectiveIso ? { effectiveIso: state.effectiveIso } : requested;

  if (done) {
    return (
      <div className="flex items-start gap-3 rounded-[var(--radius-md)] bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200" data-vertrag-gekuendigt>
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-semibold">Gekündigt zum {fmt(done.effectiveIso)}</div>
          <p className="mt-1">
            {requested ? `Eingegangen am ${fmt(requested.atIso)}. ` : "Die Bestätigung ist per E-Mail unterwegs. "}
            Bis dahin läuft alles wie gewohnt weiter. Haben Sie es sich anders überlegt? Schreiben Sie uns einfach.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Button disabled={readOnly} onClick={() => setOpen(true)} data-vertrag-kuendigen>
        Vertrag hier kündigen
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Vertrag kündigen">
        <form action={action} className="max-h-[70dvh] space-y-4 overflow-y-auto px-5 py-4 text-sm" data-vertrag-kuendigen-dialog>
          <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1">
            <dt className="text-[color:var(--muted)]">Vertrag</dt>
            <dd>Leadgenerierung{customerName ? `, ${customerName}` : ""}</dd>
            <dt className="text-[color:var(--muted)]">Art</dt>
            <dd>Ordentliche Kündigung zum nächstmöglichen Termin</dd>
            <dt className="text-[color:var(--muted)]">Gekündigt von</dt>
            <dd>{email}</dd>
          </dl>
          <p className="rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] px-3 py-2 font-semibold" data-vertrag-termin>
            {nextText}
          </p>
          <ul className="list-disc space-y-1 pl-5 text-[color:var(--muted)]">
            <li>Bis dahin laufen Kampagnen, Leads und Software wie gewohnt weiter. Zusatzmodule enden mit dem Vertrag.</li>
            <li>Spätestens 30 Tage nach Vertragsende löschen wir die Daten Ihrer Leads und Kunden, soweit keine gesetzliche Pflicht zur Aufbewahrung besteht.</li>
            <li>Sie bekommen sofort eine Bestätigung per E-Mail mit Eingang und Vertragsende.</li>
          </ul>
          <label className="block">
            <span className="text-[color:var(--muted)]">Grund (freiwillig)</span>
            <textarea
              name="reason"
              rows={2}
              maxLength={1000}
              className="mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 py-2 text-[15px] outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20"
            />
          </label>
          {state.error ? <p className="font-medium text-rose-700">{state.error}</p> : null}
          <button type="submit" className={buttonClass("primary", "md", "h-11 w-full")} disabled={pending || readOnly} data-vertrag-jetzt-kuendigen>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Jetzt kündigen
          </button>
          <p className="text-xs text-[color:var(--muted)]">
            Außerordentliche Kündigung oder ein anderer Termin? Schreiben Sie uns in Textform, zum Beispiel per E-Mail.
          </p>
        </form>
      </Sheet>
    </>
  );
}
