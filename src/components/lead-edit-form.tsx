"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import {
  updateLeadDetailsAction,
  type UpdateLeadState,
} from "@/app/buyer/actions";
import { PIPELINE_PHASES, findPhaseForStatus } from "@/lib/products";

// Editier-Block direkt unter der Read-Only-Karte. Vier Felder, die der
// Buyer im Tagesgeschäft pflegt:
//   - Bearbeitungsstatus (Single-Select, ohne "Storno" — das läuft
//     separat über den StornoDialog)
//   - Kontaktversuche (Number)
//   - Erster Kontaktversuch (Date)
//   - Notizen (Long Text)
//
// Storno (Grund + optionale Bemerkung) läuft separat über den
// StornoDialog — der Button dafür sitzt im Header der Detail-Page.
export function LeadEditForm({
  leadId,
  initialBearbeitungsstatus,
  initialKontaktversuche,
  initialErsterKontaktversuch,
  initialNotizen,
}: {
  leadId: string;
  initialBearbeitungsstatus: string;
  initialKontaktversuche: number;
  initialErsterKontaktversuch: string; // YYYY-MM-DDTHH:mm (UTC) oder ""
  initialNotizen: string;
}) {
  const [state, formAction, pending] = useActionState<
    UpdateLeadState,
    FormData
  >(updateLeadDetailsAction, {});

  // Dropdown bietet die 6 Pipeline-Phasen (Neuer Lead, Nicht erreicht,
  // Im Gespräch, In Beratung, Abschluss, Kein Interesse) — gleiches
  // Vokabular wie die Spalten im Pipeline-Board. Granularen Sub-Status
  // (z. B. "Qualifiziert" innerhalb "Im Gespräch") bewahren wir, solange
  // der Buyer in derselben Phase bleibt; wechselt er die Phase, wird
  // auf den Einstiegs-Status der neuen Phase gesetzt.
  const initialPhase = findPhaseForStatus(initialBearbeitungsstatus);
  const statusIsExternal =
    initialBearbeitungsstatus !== "" && initialPhase == null;

  const [selectedPhaseKey, setSelectedPhaseKey] = useState(
    initialPhase?.key ?? "",
  );
  // Resolved-Status für den Submit: bleibt der Buyer in der Ausgangs-Phase,
  // schicken wir den unveränderten Sub-Status (z. B. "Qualifiziert"). Bei
  // Phasen-Wechsel den Default der neuen Phase. Leere Auswahl = "" → Server
  // ignoriert das Feld (kein Status-Update).
  const resolvedStatus = (() => {
    if (selectedPhaseKey === "") return "";
    const phase = PIPELINE_PHASES.find((p) => p.key === selectedPhaseKey);
    if (!phase) return "";
    if (initialPhase && phase.key === initialPhase.key) {
      return initialBearbeitungsstatus;
    }
    return phase.defaultStatus;
  })();
  const subStatusInPhase =
    initialPhase &&
    selectedPhaseKey === initialPhase.key &&
    initialBearbeitungsstatus !== initialPhase.defaultStatus
      ? initialBearbeitungsstatus
      : null;

  const [kontaktversuche, setKontaktversuche] = useState(initialKontaktversuche);
  const [ersterKontaktversuch, setErsterKontaktversuch] = useState(
    initialErsterKontaktversuch,
  );
  const [notizen, setNotizen] = useState(initialNotizen);

  // "Gespeichert"-Bestätigung nach 2.5s wieder ausblenden, damit man bei
  // mehrfachem Save jeweils die frische Bestätigung sieht.
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
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="bearbeitungsstatus" value={resolvedStatus} />

      <dl className="divide-y divide-[color:var(--border)]">
        <EditRow label="Bearbeitungsstatus">
          <div className="space-y-1.5">
            <select
              value={selectedPhaseKey}
              onChange={(e) => setSelectedPhaseKey(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none"
            >
              <option value="">– nicht gesetzt –</option>
              {statusIsExternal ? (
                <option value="" disabled>
                  {initialBearbeitungsstatus} (nicht in Pipeline)
                </option>
              ) : null}
              {PIPELINE_PHASES.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
            {subStatusInPhase ? (
              <p className="text-[11px] text-[color:var(--muted)]">
                Aktueller Sub-Status: <span className="font-medium">{subStatusInPhase}</span>
              </p>
            ) : null}
          </div>
        </EditRow>

        <EditRow label="Kontaktversuche">
          <input
            type="number"
            name="kontaktversuche"
            min={0}
            step={1}
            value={kontaktversuche}
            onChange={(e) => setKontaktversuche(Number(e.target.value) || 0)}
            className="w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none"
          />
        </EditRow>

        <EditRow label="Erster Kontaktversuch">
          <input
            type="datetime-local"
            name="ersterKontaktversuch"
            value={ersterKontaktversuch}
            onChange={(e) => setErsterKontaktversuch(e.target.value)}
            className="w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none"
          />
        </EditRow>

        <EditRow label="Notizen">
          <textarea
            name="notizen"
            rows={3}
            value={notizen}
            onChange={(e) => setNotizen(e.target.value)}
            className="w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none"
          />
        </EditRow>
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

function EditRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-1 px-5 py-3 sm:grid-cols-[200px_1fr] sm:items-start sm:gap-4">
      <dt className="pt-2 text-sm text-[color:var(--muted)]">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
