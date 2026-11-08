"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, Loader2, PencilLine } from "lucide-react";
import { buttonClass, Card, CardHeader } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  updateLeadDetailsAction,
  type UpdateLeadState,
} from "@/app/buyer/actions";
import { PHASE_DOT, PIPELINE_PHASES, findPhaseIn, type PipelinePhase } from "@/lib/products";

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
  initialNotizen,
  phases = PIPELINE_PHASES,
}: {
  /** WhatsApp-Kunden: mit „Im Gespräch" (pipelinePhasesFor). */
  phases?: readonly PipelinePhase[];
  leadId: string;
  initialBearbeitungsstatus: string;
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
  const initialPhase = findPhaseIn(phases, initialBearbeitungsstatus);
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
    const phase = phases.find((p) => p.key === selectedPhaseKey);
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

  const [notizen, setNotizen] = useState(initialNotizen);

  // Rückmeldung per Toast (Designsystem) statt Inline-Text.
  const toast = useToast();
  useEffect(() => {
    if (state.ok) toast.show({ message: "Änderungen gespeichert" });
    else if (state.error) toast.show({ message: state.error, tone: "error" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const inputCls =
    "w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 py-2 text-sm transition focus:border-[color:var(--brand)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/15";

  return (
    <form action={formAction}>
      <Card>
        <CardHeader icon={PencilLine} title="Bearbeiten" />
        <input type="hidden" name="leadId" value={leadId} />
        <input type="hidden" name="bearbeitungsstatus" value={resolvedStatus} />

        <div className="space-y-5 px-5 py-5">
          <Field label="Phase">
            <div className="flex flex-wrap gap-1.5">
              {phases.map((p) => {
                const active = p.key === selectedPhaseKey;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setSelectedPhaseKey(p.key)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                      active
                        ? "border-[color:var(--foreground)] bg-[color:var(--foreground)] text-white"
                        : "border-[color:var(--border)] bg-white hover:border-[color:var(--border-strong)]",
                    )}
                  >
                    <span className={cn("h-2 w-2 rounded-full", PHASE_DOT[p.key] ?? "bg-zinc-400")} />
                    {p.label}
                  </button>
                );
              })}
            </div>
            {statusIsExternal ? (
              <p className="mt-1.5 text-[11px] text-[color:var(--muted)]">
                Aktuell: {initialBearbeitungsstatus} (keine Pipeline-Phase)
              </p>
            ) : subStatusInPhase ? (
              <p className="mt-1.5 text-[11px] text-[color:var(--muted)]">
                Genauer Status: <span className="font-medium">{subStatusInPhase}</span>
              </p>
            ) : null}
          </Field>

          <Field label="Notizen">
            <textarea
              name="notizen"
              rows={4}
              value={notizen}
              placeholder="Was wurde besprochen? Nächster Schritt?"
              onChange={(e) => setNotizen(e.target.value)}
              className={cn(inputCls, "resize-y")}
            />
          </Field>
        </div>

        <footer className="flex items-center justify-end border-t border-[color:var(--border)] px-5 py-3">
          <button type="submit" disabled={pending} className={buttonClass("primary", "md")}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Speichern
          </button>
        </footer>
      </Card>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-[color:var(--muted)]">{label}</div>
      {children}
    </div>
  );
}
