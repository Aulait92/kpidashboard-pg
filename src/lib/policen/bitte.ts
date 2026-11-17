// PLATZHALTER aus P2 (Strecke nach der Buchung, 17.11.2026): Text und Knöpfe der Policen-Bitte. Das Policen-Modul wird
// gerade von einem eigenen Arbeitspaket umgebaut (Einwilligung nach Art. 9 DSGVO, Texte für alle Sparten); beim Merge
// gewinnt dessen Fassung dieser Datei. Die Strecke (lib/whatsapp/termin-strecke.ts) nutzt nur diese Signatur.

import { a, type Ansprache } from "@/lib/ansprache";

export type PolicenBitteEingabe = {
  an: Ansprache;
  /** Vermittler: Nominativ („Herr Kannapinn“) und Dativ („Herrn Kannapinn“) */
  vermittler: { nom: string; dat: string };
  /** Vermittler als Subjekt („er“, „sie“ bzw. Vorname) */
  er?: string;
  /** Komplettcheck „Ja“: alle Policen; sonst nur die angefragte Sparte */
  voll?: boolean;
  /** Police der angefragten Sparte („Hausrat-Police“), null = alle Policen */
  police?: string | null;
  /** Produkt aus dem Leadformular (Lead.source) */
  source?: string | null;
};

/** Text und Knöpfe der Policen-Bitte (Ole, 17.11.2026 spät). */
export function policenBitte(o: PolicenBitteEingabe): { text: string; knoepfe: string[]; fusszeile?: string } {
  const er = o.er ?? o.vermittler.nom;
  const knoepfe = ["Schicke ich gleich", "Nicht zur Hand"];
  if (!o.voll && o.police) {
    return {
      text: a(
        o.an,
        `Damit ${o.vermittler.nom} deinen Termin gut vorbereiten kann: Schick bitte vorab ein Foto deiner aktuellen ${o.police} hier in den Chat, falls vorhanden. Dann sieht ${er} vorher, ob du irgendwo doppelt zahlst oder Lücken hast, und der Termin geht deutlich schneller.`,
        `Damit ${o.vermittler.nom} Ihren Termin gut vorbereiten kann: Schicken Sie bitte vorab ein Foto Ihrer aktuellen ${o.police} hier in den Chat, falls vorhanden. Dann sieht ${er} vorher, ob Sie irgendwo doppelt zahlen oder Lücken haben, und der Termin geht deutlich schneller.`,
      ),
      knoepfe,
    };
  }
  return {
    text: a(
      o.an,
      `Damit ${o.vermittler.nom} deinen Termin gut vorbereiten kann: Schick bitte vorab Fotos oder PDFs deiner aktuellen Policen hier in den Chat, z. B. Haftpflicht, Hausrat oder Kfz. Dann sieht ${er} vorher, ob du irgendwo doppelt zahlst oder Lücken hast, und der Termin geht deutlich schneller.\nUnterlagen zu Kranken-, BU- oder Lebensversicherung bitte nicht schicken, die schaut ihr euch im Termin gemeinsam an.`,
      `Damit ${o.vermittler.nom} Ihren Termin gut vorbereiten kann: Schicken Sie bitte vorab Fotos oder PDFs Ihrer aktuellen Policen hier in den Chat, z. B. Haftpflicht, Hausrat oder Kfz. Dann sieht ${er} vorher, ob Sie irgendwo doppelt zahlen oder Lücken haben, und der Termin geht deutlich schneller.\nUnterlagen zu Kranken-, BU- oder Lebensversicherung bitte nicht schicken, die schauen Sie sich im Termin gemeinsam an.`,
    ),
    knoepfe,
  };
}

/** Ist dieser Knopftext die Einwilligung zu Gesundheitsunterlagen (verarbeitet das Policen-Modul)? */
export function istPolicenEinwilligungsKnopf(text: string | null | undefined): boolean {
  return /^(ja, einverstanden|lieber im termin)$/i.test((text ?? "").trim());
}

/**
 * Schalter: Policen-Bitte und Policen-Erinnerungen in der Termin-Strecke an? Platzhalter: nur mit POLICEN_BITTE_AN=1
 * (Standard aus, damit P2 ohne das neue Policen-Modul sauber läuft; dann entfallen Bitte und Erinnerungen).
 */
export function policenBitteAktiv(env: Record<string, string | undefined> = process.env): boolean {
  return env.POLICEN_BITTE_AN === "1";
}

/**
 * Darf der Lead an Policen erinnert werden (Rechtsprüfung A8)? Platzhalter: nur mit protokolliertem, nicht widerrufenem
 * WhatsApp-Opt-in (ConsentOptIn) für seine Nummer.
 */
export async function darfPolicenErinnern(leadId: string | null | undefined): Promise<boolean> {
  if (!leadId) return false;
  const { prisma } = await import("@/lib/prisma");
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { customerId: true, phone: true, erasedAt: true } });
  if (!lead?.phone || lead.erasedAt) return false;
  const optIn = await prisma.consentOptIn.findUnique({ where: { customerId_contactPhone: { customerId: lead.customerId, contactPhone: lead.phone } }, select: { revokedAt: true } });
  return !!optIn && !optIn.revokedAt;
}
