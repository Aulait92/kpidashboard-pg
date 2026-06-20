"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2 } from "lucide-react";
import { cancelLeadAction, type CancelLeadState } from "@/app/buyer/actions";
import { formatDate, formatEUR } from "@/lib/format";
import { cn } from "@/lib/utils";

export type BuyerLeadRow = {
  id: string;
  createdAt: Date;
  name: string | null;
  source: string | null;
  status: string | null;
  reached: boolean;
  closedAt: Date | null;
  revenue: number;
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
  if (leads.length === 0) {
    return (
      <div className="rounded-2xl border border-[color:var(--border)] bg-white p-6 text-sm text-[color:var(--muted)] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
        Im gewählten Zeitraum sind keine Leads für deinen Account
        eingegangen.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
      <div className="border-b border-[color:var(--border)] px-5 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--brand)]">
          Leads
        </div>
        <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
          Deine Leads im Zeitraum
        </h2>
        <p className="mt-1 text-xs text-[color:var(--muted)]">
          Storno-Button öffnet ein Fenster zur Eingabe des Grunds. Die Änderung
          läuft sofort nach Airtable und ist nicht rückgängig zu machen.
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
                    // Klicks auf interaktive Inhalte (Storno-Button, Form-
                    // Submits) sollen NICHT navigieren — sonst verliert der
                    // Buyer mit einem Klick die Storno-Aktion.
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
                      <CancelButton leadId={l.id} leadName={l.name ?? "diesen Lead"} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Storno-Button mit Inline-Reason-Dialog. Bewusst auf <dialog> verzichtet
// (Browser-Support + Styling) — stattdessen prompt() für die Reason-Eingabe,
// dann Server-Action über programmatische form-submit-Pipeline.
function CancelButton({
  leadId,
  leadName,
}: {
  leadId: string;
  leadName: string;
}) {
  const [state, formAction, pending] = useActionState<
    CancelLeadState,
    FormData
  >(cancelLeadAction, {});
  const [reasonDraft, setReasonDraft] = useState("");

  return (
    <form
      action={formAction}
      className="inline-flex items-center gap-2"
      onSubmit={(e) => {
        const reason = prompt(
          `Stornogrund für "${leadName}":\n(z. B. Falsche Daten, Doppellead, Wunsch des Kontakts …)`,
          "",
        );
        if (!reason || reason.trim().length < 3) {
          e.preventDefault();
          return;
        }
        setReasonDraft(reason.trim());
        // Hidden-Input mit der finalen Reason füllen (synchron vor submit).
        const input = e.currentTarget.elements.namedItem(
          "reason",
        ) as HTMLInputElement;
        input.value = reason.trim();
      }}
    >
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="reason" defaultValue="" />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-md border border-[color:var(--border)] px-2 py-1 text-[11px] font-medium text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Ban className="h-3 w-3" />
        )}
        Stornieren
      </button>
      {state.error && state.leadId === leadId ? (
        <span
          className="max-w-[180px] truncate text-[10px] font-medium text-rose-700"
          title={state.error}
        >
          {state.error}
        </span>
      ) : null}
      {/* Reason-Echo (Debug-Hilfe): nur sichtbar wenn Aktion gerade lief. */}
      {state.ok && state.leadId === leadId && reasonDraft ? (
        <span className="text-[10px] font-medium text-emerald-700">ok</span>
      ) : null}
    </form>
  );
}
