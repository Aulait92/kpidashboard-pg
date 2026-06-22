"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import {
  updateDealAction,
  type UpdateDealState,
} from "@/app/admin/crm/actions";

// Inline-Edit-Form für die wichtigsten Pflege-Felder eines Deals.
// Bewusst keine Status-Auswahl hier — dafür gibt's das Pipeline-Drag.
// Schreibt nach Airtable + DB; Status-Wechsel laufen separat über
// setDealStatusAction (Drag-Endpoint).
export function DealEditForm({
  dealId,
  initialName,
  initialCompany,
  initialOwner,
  initialValue,
  initialCloseDate,
  initialNotes,
}: {
  dealId: string;
  initialName: string;
  initialCompany: string;
  initialOwner: string;
  initialValue: string; // String, damit "" leerer Input möglich ist
  initialCloseDate: string; // YYYY-MM-DD oder ""
  initialNotes: string;
}) {
  const [state, formAction, pending] = useActionState<UpdateDealState, FormData>(
    updateDealAction,
    {},
  );

  const [name, setName] = useState(initialName);
  const [company, setCompany] = useState(initialCompany);
  const [owner, setOwner] = useState(initialOwner);
  const [value, setValue] = useState(initialValue);
  const [closeDate, setCloseDate] = useState(initialCloseDate);
  const [notes, setNotes] = useState(initialNotes);

  const [showSaved, setShowSaved] = useState(false);
  useEffect(() => {
    if (!state.ok) return;
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 2500);
    return () => clearTimeout(t);
  }, [state.ok]);

  return (
    <form
      action={formAction}
      className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]"
    >
      <input type="hidden" name="dealId" value={dealId} />
      <header className="border-b border-[color:var(--border)] px-5 py-3">
        <h2 className="text-base font-semibold">Deal bearbeiten</h2>
        <p className="mt-0.5 text-xs text-[color:var(--muted)]">
          Schreibt zurück nach Airtable und ins Dashboard. Status verschiebst
          du per Drag im Pipeline-Board.
        </p>
      </header>

      <dl className="divide-y divide-[color:var(--border)]">
        <Row label="Name">
          <input
            type="text"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={INPUT_CLS}
          />
        </Row>
        <Row label="Firma">
          <input
            type="text"
            name="company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className={INPUT_CLS}
          />
        </Row>
        <Row label="Wert (€)">
          <input
            type="text"
            inputMode="decimal"
            name="value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="z. B. 1500"
            className={INPUT_CLS}
          />
        </Row>
        <Row label="Owner">
          <input
            type="text"
            name="owner"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="Sales-Rep"
            className={INPUT_CLS}
          />
        </Row>
        <Row label="Close-Datum">
          <input
            type="date"
            name="closeDate"
            value={closeDate}
            onChange={(e) => setCloseDate(e.target.value)}
            className={INPUT_CLS}
          />
        </Row>
        <Row label="Notizen">
          <textarea
            name="notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={INPUT_CLS}
          />
        </Row>
      </dl>

      <footer className="flex items-center justify-end gap-3 border-t border-[color:var(--border)] bg-zinc-50 px-5 py-3">
        {state.error ? (
          <span className="text-xs font-medium text-rose-700">{state.error}</span>
        ) : null}
        {showSaved ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
            <Check className="h-3 w-3" /> Gespeichert
          </span>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-[color:var(--brand)] px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[color:var(--brand-dark)] disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Speichern
        </button>
      </footer>
    </form>
  );
}

const INPUT_CLS =
  "w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 px-5 py-3 sm:grid-cols-[140px_1fr] sm:items-start sm:gap-4">
      <dt className="pt-2 text-sm text-[color:var(--muted)]">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
