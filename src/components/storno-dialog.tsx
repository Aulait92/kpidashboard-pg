"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Ban, Loader2, X } from "lucide-react";
import { cancelLeadAction, type CancelLeadState } from "@/app/buyer/actions";
import { formatDate } from "@/lib/format";

export type StornogrundOption = {
  recordId: string;
  grund: string;
  beschreibung: string | null;
};

// Native-<dialog>-Modal für den Storno-Flow. Wird sowohl aus der
// Lead-Tabelle (klein, pro Zeile) als auch aus der Lead-Detail-Ansicht
// (groß) geöffnet. Schreibt Stornogrund (Linked-Record) + Bemerkung
// nach Airtable und spiegelt den Status lokal.
export function StornoDialog({
  leadId,
  leadName,
  leadCreatedAt,
  stornoOptions,
  onClose,
}: {
  leadId: string;
  leadName: string | null;
  leadCreatedAt: Date;
  stornoOptions: StornogrundOption[];
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedReason, setSelectedReason] = useState<string>("");
  const [bemerkung, setBemerkung] = useState<string>("");
  const [state, formAction, pending] = useActionState<
    CancelLeadState,
    FormData
  >(cancelLeadAction, {});

  // Beim Mount: nativer Modal-Modus (zentriert, mit Backdrop, ESC schließt).
  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  // Erfolgreich storniert → Dialog schließen + Page revalidiert via
  // revalidatePath in der Server-Action.
  useEffect(() => {
    if (state.ok && state.leadId === leadId) {
      onClose();
    }
  }, [state, leadId, onClose]);

  const noOptions = stornoOptions.length === 0;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        // Klick auf den Backdrop (außerhalb der Inhalts-Box) schließt.
        if (e.target === dialogRef.current) onClose();
      }}
      className="m-auto w-full max-w-md rounded-2xl border border-[color:var(--border)] bg-white p-0 shadow-[0_20px_50px_-20px_rgba(15,23,42,0.4)] backdrop:bg-slate-900/40"
    >
      <form action={formAction} className="flex flex-col">
        <input type="hidden" name="leadId" value={leadId} />
        <input type="hidden" name="stornogrundId" value={selectedReason} />
        <header className="flex items-start justify-between border-b border-[color:var(--border)] px-5 py-4">
          <div>
            <h3 className="text-base font-semibold">Lead stornieren</h3>
            <p className="mt-0.5 text-xs text-[color:var(--muted)]">
              {leadName ?? "Unbekannter Lead"} · {formatDate(leadCreatedAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="rounded-md p-1 text-[color:var(--muted)] transition hover:bg-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          {noOptions ? (
            <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Für deinen Bezug sind in Airtable noch keine Stornogründe
              hinterlegt. Bitte zuerst in der Stornogründe-Tabelle Gründe
              auf den passenden Bezug verknüpfen.
            </div>
          ) : (
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--muted)]">
                Stornogrund
              </span>
              <select
                value={selectedReason}
                onChange={(e) => setSelectedReason(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none"
              >
                <option value="" disabled>
                  – auswählen –
                </option>
                {stornoOptions.map((opt) => (
                  <option key={opt.recordId} value={opt.recordId}>
                    {opt.grund}
                  </option>
                ))}
              </select>
              {selectedReason ? (
                <p className="mt-1 text-xs text-[color:var(--muted)]">
                  {
                    stornoOptions.find((o) => o.recordId === selectedReason)
                      ?.beschreibung
                  }
                </p>
              ) : null}
            </label>
          )}

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--muted)]">
              Bemerkung (Pflicht)
            </span>
            <textarea
              name="bemerkung"
              value={bemerkung}
              onChange={(e) => setBemerkung(e.target.value)}
              required
              minLength={3}
              rows={3}
              placeholder="z. B. Lead war nicht erreichbar nach 3 Versuchen, Telefonnummer ungültig"
              className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none"
            />
          </label>

          {state.error && state.leadId === leadId ? (
            <div className="rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">
              {state.error}
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[color:var(--border)] bg-zinc-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-[color:var(--muted)] transition hover:bg-zinc-100"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={
              pending ||
              noOptions ||
              !selectedReason ||
              bemerkung.trim().length < 3
            }
            className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Ban className="h-3.5 w-3.5" />
            )}
            Stornieren
          </button>
        </footer>
      </form>
    </dialog>
  );
}
