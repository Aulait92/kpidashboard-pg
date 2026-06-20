"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2, X } from "lucide-react";
import { cancelLeadAction, type CancelLeadState } from "@/app/buyer/actions";
import { formatDate, formatEUR } from "@/lib/format";
import { cn } from "@/lib/utils";

export type StornogrundOption = {
  recordId: string;
  grund: string;
  beschreibung: string | null;
};

export type BuyerLeadRow = {
  id: string;
  createdAt: Date;
  name: string | null;
  source: string | null;
  status: string | null;
  reached: boolean;
  closedAt: Date | null;
  revenue: number;
  stornoOptions: StornogrundOption[];
};

function statusStyle(status: string | null, closed: boolean) {
  if (closed) return "bg-emerald-50 text-emerald-700";
  if (!status) return "bg-zinc-100 text-zinc-600";
  const lower = status.toLowerCase();
  if (lower.startsWith("storno")) return "bg-rose-100 text-rose-800";
  if (status === "Kein Interesse") return "bg-rose-50 text-rose-700";
  if (status === "Termin vereinbart" || status === "Angebot/Beratung läuft")
    return "bg-blue-50 text-blue-700";
  if (status === "Erreicht" || status === "Qualifiziert")
    return "bg-amber-50 text-amber-700";
  return "bg-zinc-100 text-zinc-600";
}

function isCancelled(status: string | null): boolean {
  return !!status && status.toLowerCase().startsWith("storno");
}

export function BuyerLeadsTable({ leads }: { leads: BuyerLeadRow[] }) {
  const router = useRouter();
  const [openStorno, setOpenStorno] = useState<BuyerLeadRow | null>(null);

  if (leads.length === 0) {
    return (
      <div className="rounded-2xl border border-[color:var(--border)] bg-white p-6 text-sm text-[color:var(--muted)] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
        Im gewählten Zeitraum sind keine Leads für deinen Account
        eingegangen.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
        <div className="border-b border-[color:var(--border)] px-5 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--brand)]">
            Leads
          </div>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
            Deine Leads im Zeitraum
          </h2>
          <p className="mt-1 text-xs text-[color:var(--muted)]">
            Klick auf eine Zeile öffnet die Detail-Ansicht. Storno-Button
            öffnet ein Fenster zur Auswahl des Grunds plus Bemerkung — die
            Änderung läuft sofort nach Airtable.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[640px] w-full text-sm">
            <thead className="bg-[color:var(--brand-soft)]/30 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">
              <tr>
                <th className="px-3 py-2.5 text-left">Datum</th>
                <th className="px-3 py-2.5 text-left">Name</th>
                <th className="px-3 py-2.5 text-left">Produkt</th>
                <th className="px-3 py-2.5 text-left">Status</th>
                <th className="px-3 py-2.5 text-right">Lead-Kosten</th>
                <th className="px-3 py-2.5 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => {
                const closed = l.closedAt != null;
                const cancelled = isCancelled(l.status);
                const href = `/buyer/leads/${l.id}`;
                return (
                  <tr
                    key={l.id}
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.closest("button, form, a, input")) return;
                      router.push(href);
                    }}
                    className="cursor-pointer border-b border-[color:var(--border)] transition hover:bg-[color:var(--brand-soft)]/40 last:border-b-0"
                  >
                    <td className="px-3 py-2.5 tabular-nums text-[color:var(--foreground)]">
                      {formatDate(l.createdAt)}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-[color:var(--foreground)]">
                      {l.name ?? (
                        <span className="text-[color:var(--muted)]">–</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[color:var(--foreground)]">
                      {l.source ?? "–"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                          statusStyle(l.status, closed),
                        )}
                      >
                        {cancelled
                          ? "Storno"
                          : closed
                            ? "Abschluss"
                            : (l.status ?? "Offen")}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {l.revenue > 0 ? formatEUR(l.revenue) : "–"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {cancelled ? (
                        <span className="text-[11px] text-[color:var(--muted)]">
                          storniert
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setOpenStorno(l)}
                          className="inline-flex items-center gap-1 rounded-md border border-[color:var(--border)] px-2 py-1 text-[11px] font-medium text-rose-700 transition hover:border-rose-300 hover:bg-rose-50"
                        >
                          <Ban className="h-3 w-3" />
                          Stornieren
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {openStorno ? (
        <StornoDialog
          lead={openStorno}
          onClose={() => setOpenStorno(null)}
        />
      ) : null}
    </>
  );
}

function StornoDialog({
  lead,
  onClose,
}: {
  lead: BuyerLeadRow;
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
    if (state.ok && state.leadId === lead.id) {
      onClose();
    }
  }, [state, lead.id, onClose]);

  const noOptions = lead.stornoOptions.length === 0;

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
        <input type="hidden" name="leadId" value={lead.id} />
        <input type="hidden" name="stornogrundId" value={selectedReason} />
        <header className="flex items-start justify-between border-b border-[color:var(--border)] px-5 py-4">
          <div>
            <h3 className="text-base font-semibold">Lead stornieren</h3>
            <p className="mt-0.5 text-xs text-[color:var(--muted)]">
              {lead.name ?? "Unbekannter Lead"} ·{" "}
              {formatDate(lead.createdAt)}
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
                {lead.stornoOptions.map((opt) => (
                  <option key={opt.recordId} value={opt.recordId}>
                    {opt.grund}
                  </option>
                ))}
              </select>
              {selectedReason ? (
                <p className="mt-1 text-xs text-[color:var(--muted)]">
                  {
                    lead.stornoOptions.find(
                      (o) => o.recordId === selectedReason,
                    )?.beschreibung
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

          {state.error && state.leadId === lead.id ? (
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
            disabled={pending || noOptions || !selectedReason || bemerkung.trim().length < 3}
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
