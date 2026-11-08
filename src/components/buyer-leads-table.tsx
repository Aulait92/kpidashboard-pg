"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import {
  StornoDialog,
  type StornogrundOption,
} from "@/components/storno-dialog";
import { formatDate, formatEUR } from "@/lib/format";
import { displayProduct, statusToneClass } from "@/lib/products";
import { cn } from "@/lib/utils";

export type { StornogrundOption };

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
  /** Nur bei Kunden mit WhatsApp-Assistent: nächster gebuchter Termin. */
  appointment?: { startsAt: Date; mode: string } | null;
  /** Nur bei Kunden mit WhatsApp-Assistent: Lead sollte angerufen werden. */
  callback?: boolean;
};

function formatAppt(d: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(d);
}

function statusText(
  l: BuyerLeadRow,
  labels: Record<string, string>,
  cancelled: boolean,
): string {
  if (cancelled) return "Storno";
  if (l.closedAt != null) return "Abschluss";
  if (!l.status) return "Neuer Lead";
  return labels[l.status] ?? l.status;
}

function isCancelled(status: string | null): boolean {
  return !!status && status.toLowerCase().startsWith("storno");
}

export function BuyerLeadsTable({
  leads,
  showLeadCost = true,
  statusLabels = {},
}: {
  leads: BuyerLeadRow[];
  /** Anzeige-Namen je Status (WhatsApp-Kunden: „In Beratung" → „Termin vereinbart"). */
  statusLabels?: Record<string, string>;
  /** Retainer-Kunden haben keinen Preis pro Lead → Spalte ausblenden. */
  showLeadCost?: boolean;
}) {
  const router = useRouter();
  const [openStorno, setOpenStorno] = useState<BuyerLeadRow | null>(null);
  const singleProduct = new Set(leads.map((l) => l.source ?? "")).size <= 1;

  if (leads.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-6 text-sm text-[color:var(--muted)] shadow-[var(--shadow-md)]">
        Im gewählten Zeitraum sind keine Leads für deinen Account
        eingegangen.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-md)]">
        <div className="flex items-baseline justify-between gap-3 border-b border-[color:var(--border)] px-5 py-3.5">
          <h2 className="text-base font-semibold tracking-tight">
            Alle Leads <span className="font-normal text-[color:var(--muted)]">· {leads.length}</span>
          </h2>
          <span className="hidden text-xs text-[color:var(--muted)] sm:inline">Zeile anklicken für Details</span>
        </div>

        {/* Handy: Karten statt Tabelle */}
        <ul className="divide-y divide-[color:var(--border)] md:hidden">
          {leads.map((l) => {
            const cancelled = isCancelled(l.status);
            const label = statusText(l, statusLabels, cancelled);
            return (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/buyer/leads/${l.id}?from=leads`)}
                  className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left active:bg-[color:var(--background)]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{l.name ?? "–"}</div>
                    <div className="mt-0.5 text-xs text-[color:var(--muted)]">
                      {formatDate(l.createdAt)}
                      {singleProduct ? "" : ` · ${displayProduct(l.source)}`}
                    </div>
                    {l.appointment ? (
                      <div className="mt-1 text-xs font-medium text-blue-700">
                        {formatAppt(new Date(l.appointment.startsAt))} Uhr ·{" "}
                        {l.appointment.mode === "video" ? "Video" : "Telefon"}
                      </div>
                    ) : l.callback ? (
                      <div className="mt-1 text-xs font-medium text-amber-700">Rückruf nötig</div>
                    ) : null}
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", statusToneClass(cancelled ? "Storno" : l.status))}>
                    {label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--brand-soft)]/30 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">
              <tr>
                <th className="px-3 py-2.5 text-left">Datum</th>
                <th className="px-3 py-2.5 text-left">Name</th>
                {singleProduct ? null : <th className="px-3 py-2.5 text-left">Produkt</th>}
                <th className="px-3 py-2.5 text-left">Status</th>
                {showLeadCost ? (
                  <th className="px-3 py-2.5 text-right">Lead-Kosten</th>
                ) : null}
                <th className="px-3 py-2.5 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => {
                const closed = l.closedAt != null;
                const cancelled = isCancelled(l.status);
                const href = `/buyer/leads/${l.id}?from=leads`;
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
                    {singleProduct ? null : (
                      <td className="px-3 py-2.5 text-[color:var(--foreground)]">
                        {displayProduct(l.source)}
                      </td>
                    )}
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                            statusToneClass(cancelled ? "Storno" : closed ? "Abschluss" : l.status),
                          )}
                        >
                          {statusText(l, statusLabels, cancelled)}
                        </span>
                        {l.appointment ? (
                          <span className="text-xs text-blue-700">
                            {formatAppt(new Date(l.appointment.startsAt))} Uhr ·{" "}
                            {l.appointment.mode === "video" ? "Video" : "Telefon"}
                          </span>
                        ) : l.callback ? (
                          <span className="text-xs font-medium text-amber-700">Rückruf nötig</span>
                        ) : null}
                      </div>
                    </td>
                    {showLeadCost ? (
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {l.revenue > 0 ? formatEUR(l.revenue) : "–"}
                      </td>
                    ) : null}
                    <td className="px-3 py-2.5 text-right">
                      {cancelled ? (
                        <span className="text-[11px] text-[color:var(--muted)]">
                          storniert
                        </span>
                      ) : l.stornoOptions.length === 0 ? null : (
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
          leadId={openStorno.id}
          leadName={openStorno.name}
          leadCreatedAt={openStorno.createdAt}
          stornoOptions={openStorno.stornoOptions}
          onClose={() => setOpenStorno(null)}
        />
      ) : null}
    </>
  );
}
