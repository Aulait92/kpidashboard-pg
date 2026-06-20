"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import {
  updateLeadDetailsAction,
  type UpdateLeadState,
} from "@/app/buyer/actions";
import type { StornogrundOption } from "@/components/buyer-leads-table";

// Editier-Block direkt unter der Read-Only-Karte. Spiegelt exakt die fünf
// Eingabe-Felder des Airtable-Customer-Interface:
//   - Kontaktversuche (Number)
//   - Erster Kontaktversuch (Date)
//   - Notizen (Long Text)
//   - Storno-Bemerkung (Long Text)
//   - Stornogrund (Linked-Record → Dropdown der für den Bezug erlaubten)
//
// Submit speichert ALLE Felder gemeinsam (eine Airtable-PATCH-Runde).
// Bewusst kein Auto-Save on-blur — vermeidet versehentliche Updates beim
// reinen Drüber-Tabben und gibt dem Buyer eine klare Bestätigung.
export function LeadEditForm({
  leadId,
  initialKontaktversuche,
  initialErsterKontaktversuch,
  initialNotizen,
  initialStornoBemerkung,
  initialStornogrundId,
  stornoOptions,
}: {
  leadId: string;
  initialKontaktversuche: number;
  initialErsterKontaktversuch: string; // YYYY-MM-DD oder ""
  initialNotizen: string;
  initialStornoBemerkung: string;
  initialStornogrundId: string | null;
  stornoOptions: StornogrundOption[];
}) {
  const [state, formAction, pending] = useActionState<
    UpdateLeadState,
    FormData
  >(updateLeadDetailsAction, {});

  const [kontaktversuche, setKontaktversuche] = useState(initialKontaktversuche);
  const [ersterKontaktversuch, setErsterKontaktversuch] = useState(
    initialErsterKontaktversuch,
  );
  const [notizen, setNotizen] = useState(initialNotizen);
  const [stornoBemerkung, setStornoBemerkung] = useState(initialStornoBemerkung);
  const [stornogrundId, setStornogrundId] = useState(initialStornogrundId ?? "");
  const [savedTick, setSavedTick] = useState(0);

  useEffect(() => {
    if (state.ok) setSavedTick((n) => n + 1);
  }, [state.ok]);

  // "Gespeichert"-Indikator nach 2.5s wieder ausblenden, damit man bei
  // mehrfachem Save jeweils die frische Bestätigung sieht.
  const [showSaved, setShowSaved] = useState(false);
  useEffect(() => {
    if (savedTick === 0) return;
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 2500);
    return () => clearTimeout(t);
  }, [savedTick]);

  return (
    <form
      action={formAction}
      className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]"
    >
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="stornogrundId" value={stornogrundId} />

      <dl className="divide-y divide-[color:var(--border)]">
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
            type="date"
            name="ersterKontaktversuch"
            value={ersterKontaktversuch}
            onChange={(e) => setErsterKontaktversuch(e.target.value)}
            placeholder="dd.mm.yyyy"
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

        <EditRow label="Storno-Bemerkung">
          <textarea
            name="stornoBemerkung"
            rows={3}
            value={stornoBemerkung}
            onChange={(e) => setStornoBemerkung(e.target.value)}
            className="w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none"
          />
        </EditRow>

        <EditRow label="Stornogrund">
          {stornoOptions.length === 0 ? (
            <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Für deinen Bezug sind in Airtable noch keine Stornogründe
              hinterlegt.
            </div>
          ) : (
            <>
              <select
                value={stornogrundId}
                onChange={(e) => setStornogrundId(e.target.value)}
                className="w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none"
              >
                <option value="">– kein Grund –</option>
                {stornoOptions.map((opt) => (
                  <option key={opt.recordId} value={opt.recordId}>
                    {opt.grund}
                  </option>
                ))}
              </select>
              {stornogrundId ? (
                <p className="mt-1 text-xs text-[color:var(--muted)]">
                  {
                    stornoOptions.find((o) => o.recordId === stornogrundId)
                      ?.beschreibung
                  }
                </p>
              ) : null}
            </>
          )}
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
