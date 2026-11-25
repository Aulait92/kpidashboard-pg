"use client";

import { terminArtKurz } from "@/lib/termin-art";

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
import { berlinTodayIso } from "@/lib/offer-pricing";
import { NextStepButton } from "@/components/next-step";
import { KeinWhatsAppBadge } from "@/components/kein-whatsapp-badge";
import { TestLeadBadge } from "@/components/test-lead-badge";
import { eingangKurz, frischUnberuehrt } from "@/lib/kontakt-liste";

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
  /** Wiedervorlage (ISO), falls gesetzt. */
  followUpAt?: string | null;
  /** Offen, aber kein nächster Schritt (lib/lead-next-step.ts). */
  noNextStep?: boolean;
  /** Termin vorbei, Ergebnis fehlt (statt „Kein nächster Schritt“) und der Termin dazu. */
  resultMissing?: boolean;
  pastAppointmentId?: string | null;
  /** Nummer (für das Kennzeichen „Kein WhatsApp“, Klick ruft an). */
  phone?: string | null;
  /** Nicht per WhatsApp erreichbar, frühe Phase (lib/kein-whatsapp-kennzeichen.ts). */
  noWhatsApp?: boolean;
  /** Testlead (lib/testlead.ts): Abzeichen „Test“. */
  isTest?: boolean;
  /** Lead hat im Chat geschrieben und wartet auf eine Antwort. */
  waiting?: boolean;
  /** Assistent ist im Gespräch (zählt als nächster Schritt). */
  botActive?: boolean;
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

function followUpText(iso: string): string {
  return `Wiedervorlage ${new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" }).format(new Date(iso))}${followUpOverdue(iso) ? " · überfällig" : ""}`;
}

/** Wiedervorlage vor heute (Berlin): rot wie auf „Heute“ (UX Runde 4). */
function followUpOverdue(iso: string): boolean {
  return berlinTodayIso(new Date(iso)) < berlinTodayIso();
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

/** Text und Farbe des nächsten Schritts; null = Knopf „Festlegen“ bzw. nichts. */
function naechsterSchritt(l: BuyerLeadRow, termin: (d: Date) => string): { text: string; cls: string } | null {
  if (l.waiting) return { text: "Antwort wartet", cls: "font-semibold text-rose-600" };
  if (l.appointment) return { text: `Termin ${termin(new Date(l.appointment.startsAt))} · ${terminArtKurz(l.appointment.mode)}`, cls: "font-medium text-blue-700" };
  if (l.followUpAt) return { text: followUpText(l.followUpAt), cls: cn("font-medium", followUpOverdue(l.followUpAt) ? "text-rose-600" : "text-violet-700") };
  if (l.callback && !l.noWhatsApp) return { text: "Rückruf nötig", cls: "font-medium text-amber-700" };
  if (l.botActive && !l.noNextStep) return { text: "Assistent schreibt", cls: "text-[color:var(--muted)]" };
  // Frisch und noch unberührt: sichtbar machen statt leerer Zelle (Reaktionszeit)
  if (!l.noNextStep && frischUnberuehrt(l)) return { text: "Noch kein Kontakt", cls: "font-semibold text-rose-600" };
  return null;
}

/** Eingang: „vor 4 Min.“ in Rot, solange ein frischer Lead noch unberührt ist und der Assistent nicht schreibt (Reaktionszeit). */
function Eingang({ l }: { l: BuyerLeadRow }) {
  const frisch = frischUnberuehrt(l) && !l.botActive;
  return (
    <span suppressHydrationWarning className={cn("tabular-nums", frisch && "font-semibold text-rose-600")} data-eingang={frisch ? "frisch" : undefined}>
      {eingangKurz(new Date(l.createdAt))}
    </span>
  );
}

function isCancelled(status: string | null): boolean {
  return !!status && status.toLowerCase().startsWith("storno");
}

export function BuyerLeadsTable({
  leads,
  showLeadCost = true,
  statusLabels = {},
  title = "Alle Kontakte",
  detailBase = "/buyer/leads/",
  detailSuffix = "?from=leads",
  empty,
}: {
  /** Leerer Zustand mit nächster Handlung (z. B. „Alle Zeiträume anzeigen“); sonst der Standardsatz. */
  empty?: React.ReactNode;
  /** Ziel beim Klick auf einen Lead: `${detailBase}${id}${detailSuffix}`. */
  detailBase?: string;
  detailSuffix?: string;
  leads: BuyerLeadRow[];
  title?: string;
  /** Anzeige-Namen je Status (WhatsApp-Kunden: „In Beratung" → „Termin vereinbart"). */
  statusLabels?: Record<string, string>;
  /** Retainer-Kunden haben keinen Preis pro Lead → Spalte ausblenden. */
  showLeadCost?: boolean;
}) {
  const router = useRouter();
  const [openStorno, setOpenStorno] = useState<BuyerLeadRow | null>(null);
  const singleProduct = new Set(leads.map((l) => l.source ?? "")).size <= 1;
  // Spalte „Lead-Kosten“ nur mit echten Kosten (UX-Runde 19.11.2026: sonst überall 0,00 €)
  const costColumn = showLeadCost && leads.some((l) => l.revenue > 0);

  if (leads.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-6 text-sm text-[color:var(--muted)] shadow-[var(--shadow-md)]">
        {empty ?? "In diesem Zeitraum sind keine Kontakte eingegangen."}
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-md)]">
        <div className="flex items-baseline justify-between gap-3 border-b border-[color:var(--border)] px-5 py-3.5">
          <h2 className="text-base font-semibold tracking-tight">
            {title} <span className="font-normal text-[color:var(--muted)]">· {leads.length}</span>
          </h2>
        </div>

        {/* Handy: Karten statt Tabelle */}
        <ul className="divide-y divide-[color:var(--border)] md:hidden">
          {leads.map((l) => {
            const cancelled = isCancelled(l.status);
            const label = statusText(l, statusLabels, cancelled);
            const schritt = naechsterSchritt(l, formatAppt);
            return (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => router.push(`${detailBase}${l.id}${detailSuffix}`)}
                  className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left active:bg-[color:var(--background)]"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{l.name ?? "Ohne Namen"}</span>
                      {l.isTest ? <TestLeadBadge /> : null}
                    </div>
                    <div className="mt-0.5 text-[13px] text-[color:var(--muted)]">
                      <Eingang l={l} />
                      {singleProduct ? "" : ` · ${displayProduct(l.source)}`}
                    </div>
                    {schritt ? <div className={cn("mt-1 text-[13px]", schritt.cls)}>{schritt.text}</div> : null}
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", statusToneClass(cancelled ? "Storno" : l.status))}>
                    {label}
                  </span>
                </button>
                {(l.noNextStep && !schritt) || (l.noWhatsApp && l.phone) ? (
                  <div className="-mt-1 flex flex-wrap items-center gap-2 px-4 pb-3">
                    {l.noWhatsApp && l.phone ? <KeinWhatsAppBadge phone={l.phone} /> : null}
                    {l.noNextStep && !schritt ? (
                      <NextStepButton leadId={l.id} name={l.name ?? "Lead"} source={l.source} resultMissing={!!l.resultMissing} appointmentId={l.pastAppointmentId ?? null} label={l.resultMissing ? "Ergebnis eintragen" : "Nächsten Schritt festlegen"} />
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--brand-soft)]/30 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">
              <tr>
                <th className="px-3 py-2.5 text-left">Eingang</th>
                <th className="px-3 py-2.5 text-left">Name</th>
                {singleProduct ? null : <th className="px-3 py-2.5 text-left">Produkt</th>}
                <th className="px-3 py-2.5 text-left">Phase</th>
                <th className="px-3 py-2.5 text-left">Nächster Schritt</th>
                {costColumn ? (
                  <th className="px-3 py-2.5 text-right">Lead-Kosten</th>
                ) : null}
                <th className="px-3 py-2.5 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => {
                const closed = l.closedAt != null;
                const cancelled = isCancelled(l.status);
                const href = `${detailBase}${l.id}${detailSuffix}`;
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
                    <td className="whitespace-nowrap px-3 py-2.5 text-[color:var(--foreground)]" title={formatDate(l.createdAt)}>
                      <Eingang l={l} />
                    </td>
                    <td className="px-3 py-2.5 font-medium text-[color:var(--foreground)]">
                      {l.name ?? (
                        <span className="text-[color:var(--muted)]">Ohne Namen</span>
                      )}
                      {l.isTest ? <TestLeadBadge className="ml-2 align-middle" /> : null}
                      {l.noWhatsApp && l.phone ? <KeinWhatsAppBadge phone={l.phone} className="ml-2 align-middle" /> : null}
                    </td>
                    {singleProduct ? null : (
                      <td className="px-3 py-2.5 text-[color:var(--foreground)]">
                        {displayProduct(l.source)}
                      </td>
                    )}
                    <td className="px-3 py-2.5">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                            statusToneClass(cancelled ? "Storno" : closed ? "Abschluss" : l.status),
                          )}
                        >
                          {statusText(l, statusLabels, cancelled)}
                        </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {(() => {
                        const schritt = naechsterSchritt(l, (d) => `${formatAppt(d)} Uhr`);
                        return schritt ? (
                          <span className={cn("text-[13px]", schritt.cls)}>{schritt.text}</span>
                        ) : l.noNextStep ? (
                          <NextStepButton leadId={l.id} name={l.name ?? "Lead"} source={l.source} resultMissing={!!l.resultMissing} appointmentId={l.pastAppointmentId ?? null} label={l.resultMissing ? "Ergebnis eintragen" : "Festlegen"} />
                        ) : null;
                      })()}
                    </td>
                    {costColumn ? (
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatEUR(l.revenue)}
                      </td>
                    ) : null}
                    <td className="px-3 py-2.5 text-right">
                      {cancelled ? (
                        <span className="text-xs text-[color:var(--muted)]">
                          storniert
                        </span>
                      ) : l.stornoOptions.length === 0 ? null : (
                        <button
                          type="button"
                          onClick={() => setOpenStorno(l)}
                          className="inline-flex items-center gap-1 rounded-md border border-[color:var(--border)] px-2 py-1 text-xs font-medium text-rose-700 transition hover:border-rose-300 hover:bg-rose-50"
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
