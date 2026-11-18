// Angebot als abgelehnt markieren (Ole, 18.11.2026: „Kann ich irgendwo Angebote ablehnen, wenn ich schon weiß, dass der
// Kunde nicht kaufen wird?“). Reine Regeln ohne Datenbank (auch im Browser nutzbar); Speichern, Verlauf, Aufgaben und
// Follow-ups: lib/vertrieb/angebot-ablehnen-server.ts.
//
// - Ablehnen: Entwurf, verschickt oder angenommen ohne eingerichtete Zahlung (kein Testangebot). Grund = Verlustgründe
//   des Vertriebs (LOSS_REASONS), damit „Kontakt auch als verloren markieren“ denselben Grund übernimmt.
// - Wieder öffnen: solange das Angebot noch gültig wäre (validUntil in der Zukunft), mit dem Status davor.
// - Offenes Angebot beim Verloren-Markieren: Entwurf oder verschickt, nicht angenommen (jüngstes zuerst).

import type { SalesLossReason } from "@/generated/prisma/enums";
import { zahlungEingerichtet } from "@/lib/angebot-zahlungserinnerung";
import { LOSS_LABEL, LOSS_REASONS } from "@/lib/vertrieb/crm";

export const ABLEHN_GRUENDE = LOSS_REASONS;
export const ablehnGrundLabel = (g: string | null | undefined): string => (g && g in LOSS_LABEL ? LOSS_LABEL[g as SalesLossReason] : "Sonstiges");

export function istAblehnGrund(v: unknown): v is SalesLossReason {
  return typeof v === "string" && LOSS_REASONS.some((r) => r.id === v);
}

export type AblehnbaresAngebot = {
  status: string;
  isTest: boolean;
  acceptedAt: Date | null;
  paymentStatus: string;
  stripeSubscriptionId: string | null;
  stripeScheduleId: string | null;
  zahlweise: string | null;
};

/** Darf das Angebot als abgelehnt markiert werden? Sonst mit Grund (für die Rückmeldung im Admin). */
export function ablehnenPruefen(o: AblehnbaresAngebot): { ok: true } | { ok: false; error: string } {
  if (o.status === "declined") return { ok: false, error: "Das Angebot ist schon als abgelehnt markiert." };
  if (o.status === "superseded") return { ok: false, error: "Diese Version wurde ersetzt, bitte die aktuelle ablehnen." };
  if (o.status === "draft" || o.status === "sent") return o.acceptedAt ? { ok: false, error: "Das Angebot ist schon angenommen." } : { ok: true };
  if (o.status === "accepted") {
    if (o.isTest) return { ok: false, error: "Angenommene Testangebote lassen sich nicht ablehnen." };
    if (zahlungEingerichtet(o)) return { ok: false, error: "Die Zahlung ist schon eingerichtet, bitte über die Kündigung gehen." };
    return { ok: true };
  }
  return { ok: false, error: "Dieses Angebot lässt sich nicht ablehnen." };
}

export const kannAblehnen = (o: AblehnbaresAngebot) => ablehnenPruefen(o).ok;

/** „Wieder öffnen“ nur, solange das Angebot noch gültig wäre. */
export function kannWiederOeffnen(o: { status: string; validUntil: Date | string }, now: Date): boolean {
  return o.status === "declined" && new Date(o.validUntil).getTime() > now.getTime();
}

/** Status vor der Ablehnung (ältere Daten ohne Merker: verschickt bzw. Entwurf). */
export function statusVorAblehnung(o: { declinedPrevStatus: string | null; sentAt: Date | null; acceptedAt: Date | null }): "draft" | "sent" | "accepted" {
  const p = o.declinedPrevStatus;
  if (p === "draft" || p === "sent" || p === "accepted") return p;
  return o.acceptedAt ? "accepted" : o.sentAt ? "sent" : "draft";
}

/** Offenes Angebot eines Kontakts (Entwurf oder verschickt, nicht angenommen), das jüngste. */
export function offenesAngebot<T extends { status: string; acceptedAt: Date | null; createdAt: Date }>(offers: T[]): T | null {
  return [...offers].filter((o) => (o.status === "draft" || o.status === "sent") && !o.acceptedAt).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
}

/** Aufgaben, die mit dem Angebot enden: Nachfassen, Zahlung offen, Fragen zum Angebot … */
export function istAngebotsAufgabe(title: string): boolean {
  return /angebot/i.test(title) || /^zahlung offen/i.test(title.trim());
}

export type AblehnGrundZahl = { grund: SalesLossReason; label: string; anzahl: number };

/** Auswertung „Abgelehnt: Grund × Anzahl“, häufigster zuerst. */
export function ablehnGruende(rows: { status: string; declineReason: string | null }[]): AblehnGrundZahl[] {
  const n = new Map<SalesLossReason, number>();
  for (const r of rows) {
    if (r.status !== "declined") continue;
    const g: SalesLossReason = istAblehnGrund(r.declineReason) ? r.declineReason : "SONSTIGES";
    n.set(g, (n.get(g) ?? 0) + 1);
  }
  return [...n.entries()]
    .map(([grund, anzahl]) => ({ grund, label: ablehnGrundLabel(grund), anzahl }))
    .sort((a, b) => b.anzahl - a.anzahl || ABLEHN_GRUENDE.findIndex((r) => r.id === a.grund) - ABLEHN_GRUENDE.findIndex((r) => r.id === b.grund));
}

export const ablehnGruendeText = (l: AblehnGrundZahl[]) => l.map((g) => `${g.label} × ${g.anzahl}`).join(", ");
