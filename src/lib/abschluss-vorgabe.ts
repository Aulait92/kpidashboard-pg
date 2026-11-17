// Beitrag beim „Abschluss mit einem Tipp“ (P4, Ole 17.11.2026): ohne Eingabe des Vermittlers zuerst aus dem Angebot der
// letzten Terminvorbereitung (Summe der gewählten Tarife nach Kombi-Rabatt, Appointment.offersJson, das die Tarifauswahl
// beim Speichern mitschreibt), sonst der typische Beitrag der Sparte aus „Meine Provisionen“. So haben Zahlen, Provision
// und die Rückmeldung an Meta immer einen Wert; geschätzte Werte stehen mit „≈“ da (premiumSource „standard“).
// Sobald das Angebot aus P3 (Versand mit Kennzeichen) am Lead liegt, kommt es hier als erste Quelle dazu.

import { beitragAus, cleanAngebote } from "@/lib/angebote-daten";
import { premiumAusAngebot, standardPremium, type PremiumSource } from "@/lib/abschluss";
import { prisma } from "@/lib/prisma";
import type { ProvisionOverrides } from "@/lib/provision";

export type BeitragVorgabe = { premium: number | null; source: PremiumSource | null };

/** Monatsbeitrag des letzten Angebots am Lead (null = keins mit Beitrag). */
export async function angebotMonatsbeitrag(leadId: string): Promise<number | null> {
  const appts = await prisma.appointment.findMany({
    where: { leadId, status: { not: "cancelled" } },
    orderBy: { startsAt: "desc" },
    take: 5,
    select: { offersJson: true },
  });
  for (const a of appts) {
    if (!a.offersJson) continue;
    const end = beitragAus(cleanAngebote(a.offersJson)).endbeitrag;
    if (end != null && end > 0) return end;
  }
  return null;
}

export async function beitragVorgabe(leadId: string, sparte: string, rates?: ProvisionOverrides): Promise<BeitragVorgabe> {
  const ausAngebot = premiumAusAngebot(sparte, await angebotMonatsbeitrag(leadId).catch(() => null));
  if (ausAngebot != null) return { premium: ausAngebot, source: "angebot" };
  const std = standardPremium(sparte, rates);
  return std != null ? { premium: std, source: "standard" } : { premium: null, source: null };
}
