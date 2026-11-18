// Terminarten laden und speichern (lib/termin-formate.ts), Adresse für Termine vor Ort.

import { prisma } from "@/lib/prisma";
import { TERMIN_FORMATE_STANDARD, type TerminFormate } from "@/lib/termin-formate";

export async function loadTerminFormate(customerId: string): Promise<TerminFormate> {
  const c = await prisma.agentConfig.findUnique({ where: { customerId }, select: { allowPhone: true, allowOnsite: true } });
  return c ? { telefon: c.allowPhone, vorOrt: c.allowOnsite } : TERMIN_FORMATE_STANDARD;
}

/** Speichern (legt die Assistenten-Einstellungen an, falls es sie noch nicht gibt, z. B. in der Einrichtung). */
export async function saveTerminFormate(customerId: string, f: TerminFormate): Promise<void> {
  await prisma.agentConfig.upsert({
    where: { customerId },
    create: { customerId, allowPhone: f.telefon, allowOnsite: f.vorOrt },
    update: { allowPhone: f.telefon, allowOnsite: f.vorOrt },
  });
}

/**
 * Adresse der Agentur für Termine vor Ort: Anschrift aus den Anbieterangaben (Erstinformation), sonst null.
 * Wird bei der Buchung am Termin gespeichert (Appointment.ort), damit Bestätigung und Erinnerung sie nennen.
 */
export async function agenturOrt(customerId: string): Promise<string | null> {
  const e = await prisma.erstinformation.findUnique({ where: { customerId }, select: { anschrift: true, firma: true } }).catch(() => null);
  const adresse = e?.anschrift?.replace(/\s*\n\s*/g, ", ").trim();
  if (!adresse) return null;
  return e?.firma?.trim() ? `${e.firma.trim()}, ${adresse}` : adresse;
}
