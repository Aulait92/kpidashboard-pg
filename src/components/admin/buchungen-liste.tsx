"use client";

// Admin → Zahlen → Buchungen: Tabelle am Rechner, Karten am Handy.
// Klick auf eine Zeile öffnet die Kundenakte → Abrechnung; der Aufgaben-Link führt zur Aufgabe.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { Badge } from "@/components/ui";
import { ART_LABEL, statusText, type BuchungRow, type BuchungStatus } from "@/lib/admin-buchungen-shared";

const TONE: Record<BuchungStatus, "neutral" | "brand" | "success" | "warning" | "danger" | "info"> = {
  angefragt: "warning",
  aktiv: "success",
  geplant: "info",
  abgelehnt: "danger",
  beendet: "neutral",
  zurueckgenommen: "neutral",
};

const day = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(d));
const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n);
const signed = (n: number | null) => (n == null || n === 0 ? "-" : `${n > 0 ? "+" : "−"}${eur(Math.abs(n))}`);
const oneOff = (n: number | null) => (n == null || n === 0 ? "-" : n < 0 ? `−${eur(-n)}` : eur(n));
const counted = (s: BuchungStatus) => s === "aktiv" || s === "geplant" || s === "beendet";

function TaskLink({ r }: { r: BuchungRow }) {
  if (!r.task?.open) return <span className="text-[color:var(--muted)]">nein</span>;
  return (
    <Link
      href={r.task.href}
      onClick={(e) => e.stopPropagation()}
      title={r.task.title}
      className="relative z-10 inline-flex items-center gap-1 font-medium text-rose-700 hover:underline"
    >
      <ClipboardCheck className="h-3.5 w-3.5" /> ja
    </Link>
  );
}

export function BuchungenListe({ rows }: { rows: BuchungRow[] }) {
  const router = useRouter();
  if (!rows.length) {
    return <p className="px-5 py-10 text-center text-sm text-[color:var(--muted)]">Keine Buchungen für diese Auswahl.</p>;
  }
  return (
    <>
      {/* Rechner: Tabelle */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-[color:var(--border)] text-left text-xs text-[color:var(--muted)]">
            <tr>
              <th className="px-4 py-2.5 font-medium">Datum</th>
              <th className="px-3 py-2.5 font-medium">Kunde</th>
              <th className="px-3 py-2.5 font-medium">Art</th>
              <th className="px-3 py-2.5 text-right font-medium">Einmalig netto</th>
              <th className="px-3 py-2.5 text-right font-medium">Monatlich netto</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Offene Aufgabe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--border)]">
            {rows.map((r) => {
              const muted = !counted(r.status);
              return (
                <tr
                  key={r.id}
                  onClick={() => router.push(r.href)}
                  className="cursor-pointer align-top transition hover:bg-[color:var(--surface-sunken)]"
                >
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-[color:var(--muted)]">{day(r.at)}</td>
                  <td className="px-3 py-2.5">
                    <Link href={r.href} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">
                      {r.customerName}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{r.title}</div>
                    <div className="text-xs text-[color:var(--muted)]">
                      {ART_LABEL[r.art]}
                      {r.detail ? ` · ${r.detail}` : ""}
                    </div>
                  </td>
                  <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${muted ? "text-[color:var(--muted)]" : ""}`}>{oneOff(r.oneOff)}</td>
                  <td
                    className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${muted ? "text-[color:var(--muted)]" : r.monthly && r.monthly > 0 ? "text-emerald-700" : r.monthly && r.monthly < 0 ? "text-rose-700" : ""}`}
                  >
                    {signed(r.monthly)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <Badge tone={TONE[r.status]}>{statusText(r)}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <TaskLink r={r} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Handy: Karten */}
      <ul className="divide-y divide-[color:var(--border)] md:hidden">
        {rows.map((r) => {
          const muted = !counted(r.status);
          return (
            <li key={r.id} className="relative px-4 py-3">
              <Link href={r.href} className="absolute inset-0" aria-label={`${r.customerName}: ${r.title}, Abrechnung öffnen`} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.customerName}</div>
                  <div className="text-sm">{r.title}</div>
                </div>
                <Badge tone={TONE[r.status]}>{statusText(r)}</Badge>
              </div>
              <div className="mt-1 text-xs text-[color:var(--muted)]">
                {day(r.at)} · {ART_LABEL[r.art]}
                {r.detail ? ` · ${r.detail}` : ""}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm tabular-nums">
                <span className={muted ? "text-[color:var(--muted)]" : ""}>
                  <span className="text-xs text-[color:var(--muted)]">einmalig </span>
                  {oneOff(r.oneOff)}
                </span>
                <span className={muted ? "text-[color:var(--muted)]" : r.monthly && r.monthly > 0 ? "text-emerald-700" : r.monthly && r.monthly < 0 ? "text-rose-700" : ""}>
                  <span className="text-xs text-[color:var(--muted)]">monatlich </span>
                  {signed(r.monthly)}
                </span>
                {r.task?.open ? (
                  <span className="ml-auto text-xs">
                    <span className="text-[color:var(--muted)]">Aufgabe </span>
                    <TaskLink r={r} />
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
