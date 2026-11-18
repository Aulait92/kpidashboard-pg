"use client";

// Terminarten (Ole, 18.11.2026): Video immer, Telefon bzw. vor Ort nur auf ausdrücklichen Wunsch des Kunden und nur,
// wenn hier freigegeben. Gleiche Felder in der Einrichtung (im Fragebogen-Formular) und in Einstellungen → Assistent
// (speichert sofort).

import { useState, useTransition } from "react";
import { TERMIN_FORMATE_TEXT, type TerminFormate } from "@/lib/termin-formate";

const OPTIONEN: Array<[keyof TerminFormate, string, string]> = [
  ["telefon", "format_telefon", "Telefon"],
  ["vorOrt", "format_vorOrt", "Termin vor Ort in der Agentur"],
];

/** Text und zwei Kästchen (Namen format_telefon / format_vorOrt fürs Formular). */
export function TerminFormateFelder({
  value,
  onChange,
  disabled,
  defaultValue,
}: {
  value?: TerminFormate;
  onChange?: (next: TerminFormate) => void;
  disabled?: boolean;
  defaultValue?: TerminFormate;
}) {
  return (
    <fieldset data-termin-formate>
      <legend className="text-sm font-medium">Wie sollen Termine stattfinden?</legend>
      <p className="mt-1 text-sm text-[color:var(--muted)]">{TERMIN_FORMATE_TEXT}</p>
      <div className="mt-2 flex flex-col gap-1 text-[15px] sm:flex-row sm:flex-wrap sm:gap-x-6">
        {OPTIONEN.map(([k, name, label]) => (
          <label key={k} className="flex min-h-10 cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              name={name}
              className="h-5 w-5 shrink-0 accent-[color:var(--brand)]"
              disabled={disabled}
              {...(value ? { checked: value[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange?.({ ...value, [k]: e.target.checked }) } : { defaultChecked: defaultValue?.[k] ?? false })}
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Einstellungen: Kästchen speichern sofort. */
export function TerminFormateEinstellung({
  initial,
  canEdit,
  save,
}: {
  initial: TerminFormate;
  canEdit: boolean;
  save: (f: TerminFormate) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white px-5 py-4 shadow-[var(--shadow-sm)]">
      <TerminFormateFelder
        value={value}
        disabled={!canEdit || pending}
        onChange={(next) => {
          const before = value;
          setValue(next);
          setError(null);
          setSaved(false);
          start(async () => {
            const r = await save(next);
            if (!r.ok) {
              setValue(before);
              setError(r.error ?? "Hat nicht geklappt.");
            } else setSaved(true);
          });
        }}
      />
      {error ? <p className="mt-2 text-sm font-medium text-rose-700">{error}</p> : saved ? <p className="mt-2 text-sm text-emerald-700">Gespeichert.</p> : null}
    </div>
  );
}
