// Impressum des Vermittlers fehlt (Rechtsvorprüfung 16.11.2026): Die Endkundenseiten zeigen dann statt „Impressum“
// den Link „Anbieterangaben (Erstinformation)“ (components/lead-legal-footer.tsx). Dazu einmalig je Kunde eine
// Admin-Aufgabe (Vertrieb → Aufgaben), damit wir die Impressum-Adresse nachtragen. Der Vermittler kann sie in der
// Einrichtung (Schritt Erstinformation) selbst eintragen; dann wird eine offene Aufgabe erledigt.

import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";

export const IMPRESSUM_FEHLT_TASK = "Impressum-URL fehlt";

const marker = (customerId: string) => `Kunden-ID ${customerId}`;

/** Bereits geprüft in diesem Prozess (Fußzeile wird bei jedem Seitenaufruf gerendert): keine Abfrage je Aufruf. */
const geprueft = new Set<string>();

/** Nur für Tests: Merker leeren. */
export const _resetImpressumFehltCache = () => geprueft.clear();

/**
 * Admin-Aufgabe „Impressum-URL fehlt“ für diesen Kunden anlegen, einmalig: Gibt es schon eine (offen oder erledigt),
 * passiert nichts. Gleichzeitige Aufrufe sind per Advisory-Lock je Kunde abgesichert. Testkunden: keine Aufgabe.
 */
export async function impressumFehltAufgabe(customerId: string, now = new Date()): Promise<"created" | "skipped"> {
  if (geprueft.has(customerId)) return "skipped";
  try {
    const res = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`impressum-fehlt:${customerId}`}))`;
      const c = await tx.customer.findUnique({
        where: { id: customerId },
        select: { name: true, isTest: true, salesContact: { select: { id: true } }, onboarding: { select: { salesContactId: true } } },
      });
      if (!c || c.isTest) return "skipped" as const;
      const vorhanden = await tx.salesTask.findFirst({ where: { title: { startsWith: IMPRESSUM_FEHLT_TASK }, note: { contains: marker(customerId) } }, select: { id: true } });
      if (vorhanden) return "skipped" as const;
      await tx.salesTask.create({
        data: {
          contactId: c.salesContact?.id ?? c.onboarding?.salesContactId ?? null,
          type: "SONSTIGES",
          title: `${IMPRESSUM_FEHLT_TASK}: ${c.name}`,
          note: [
            "Auf den Seiten für Endkunden (Buchung, Termin verwalten, Empfehlung) fehlt das Impressum des Vermittlers; dort steht deshalb „Anbieterangaben (Erstinformation)“.",
            "Impressum-Adresse im Onboarding (Website auslesen) nachtragen oder den Kunden bitten, sie in der Einrichtung einzutragen.",
            `${marker(customerId)} · Kundenakte: /admin/neu/kunden/${customerId}`,
          ].join("\n"),
          dueAt: now,
        },
      });
      return "created" as const;
    });
    geprueft.add(customerId);
    return res;
  } catch (err) {
    reportError(err, "impressum-fehlt-aufgabe", { customer: customerId });
    return "skipped";
  }
}

/** Impressum ist jetzt da: offene Aufgabe erledigen. */
export async function impressumFehltErledigt(customerId: string, now = new Date()): Promise<void> {
  await prisma.salesTask.updateMany({
    where: { doneAt: null, title: { startsWith: IMPRESSUM_FEHLT_TASK }, note: { contains: marker(customerId) } },
    data: { doneAt: now },
  });
}

const httpUrl = (v: unknown): string | null => (typeof v === "string" && /^https?:\/\//i.test(v.trim()) ? v.trim() : null);

/** Impressum-Adresse aus Onboarding.websiteInfo (null = fehlt). */
export const impressumUrlAus = (websiteInfo: unknown): string | null => httpUrl((websiteInfo as { impressumUrl?: unknown } | null)?.impressumUrl);

/** Eingabe des Vermittlers prüfen: Adresse mit oder ohne https://, höchstens 300 Zeichen. */
export function impressumUrlPruefen(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const t = raw.trim().slice(0, 300);
  if (!t) return { ok: false, error: "Bitte die Adresse Ihres Impressums eintragen." };
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    if (!/\.[a-z]{2,}$/i.test(u.hostname)) throw new Error("host");
    return { ok: true, url: u.toString() };
  } catch {
    return { ok: false, error: "Das sieht nicht nach einer Webadresse aus, z. B. agentur-muster.de/impressum." };
  }
}

/** Impressum-Adresse speichern (Onboarding.websiteInfo.impressumUrl, übrige Angaben bleiben) und Aufgabe erledigen. */
export async function impressumUrlSpeichern(customerId: string, raw: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const p = impressumUrlPruefen(raw);
  if (!p.ok) return p;
  const ob = await prisma.onboarding.findUnique({ where: { customerId }, select: { id: true, websiteInfo: true } });
  if (!ob) return { ok: false, error: "Kein Onboarding gefunden." };
  const web = ob.websiteInfo && typeof ob.websiteInfo === "object" && !Array.isArray(ob.websiteInfo) ? (ob.websiteInfo as Record<string, unknown>) : {};
  await prisma.onboarding.update({ where: { id: ob.id }, data: { websiteInfo: { ...web, impressumUrl: p.url } } });
  await impressumFehltErledigt(customerId);
  geprueft.delete(customerId);
  return p;
}
