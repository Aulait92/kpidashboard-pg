"use client";

// Auswahl für den Onboarding-Termin (Ole, 25.11.2026): Vorschlag aus dem Team-Kalender oder „Andere Zeit“. Ist eine andere
// Zeit eingetragen, gewinnt sie: Vorschläge ausgegraut, der Knopf nennt die tatsächlich gebuchte Zeit
// (lib/onboarding-termin-knopf.ts). Leeren stellt den Normalzustand wieder her.
import { useState } from "react";
import { terminKnopf } from "@/lib/onboarding-termin-knopf";

export function OnboardingTerminAuswahl({ slots }: { slots: { start: string; label: string }[] }) {
  const [vorschlag, setVorschlag] = useState(slots[0]?.start ?? "");
  const [andere, setAndere] = useState("");
  const [offen, setOffen] = useState(false);
  const wahl = terminKnopf({ vorschlag, andereZeit: andere });
  const andereAktiv = wahl.quelle === "andere";
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <select
          name="start"
          className="input max-w-xs disabled:cursor-not-allowed disabled:opacity-50"
          value={vorschlag}
          onChange={(e) => setVorschlag(e.target.value)}
          disabled={andereAktiv}
          aria-label="Vorgeschlagene Zeit"
          title={andereAktiv ? "Es gilt die andere Zeit unten" : undefined}
          data-termin-vorschlag
        >
          {slots.length ? slots.map((s) => <option key={s.start} value={s.start}>{s.label}</option>) : <option value="">Keine freie Zeit gefunden</option>}
        </select>
        <button className="btn-ghost" disabled={!wahl.quelle} data-termin-buchen>
          {wahl.text}
        </button>
      </div>
      <details open={offen || andereAktiv} onToggle={(e) => setOffen(e.currentTarget.open)}>
        <summary className="cursor-pointer text-slate-500">Andere Zeit</summary>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="datetime-local"
            name="andereZeit"
            step={900}
            className="input max-w-xs"
            value={andere}
            onChange={(e) => setAndere(e.target.value)}
            aria-label="Andere Zeit"
            data-termin-andere
          />
          {andereAktiv ? (
            <button type="button" className="text-sm text-sky-700 hover:underline" onClick={() => setAndere("")}>
              Vorschlag nehmen
            </button>
          ) : null}
        </div>
      </details>
    </>
  );
}
