// Ansicht „Meta-Leads“ unter Verkaufen → Kontakte (Ole, 18.11.2026): alle Vermittler, die über ein Meta-Formular kamen
// (Zap oder direkt über den Meta-Webhook), mit Eingang, Stand, nächstem Schritt und Trichter für den Zeitraum.
// Nur vorhandene Daten: SalesInboundLead (Quelle META_ADS), Verlauf, Termine, Angebote, Aufgaben, Stufe.

import { prisma } from "@/lib/prisma";
import { META_CHIPS, metaLeadStand, metaTrichter, naechsterSchritt, zeitraumVon, type MetaLeadStand } from "@/lib/vertrieb/meta-leads-stand";

export type MetaLeadZeile = {
  contactId: string;
  name: string;
  person: string | null;
  ort: string | null;
  phone: string | null;
  eingang: Date;
  formular: string | null;
  anzeige: string | null;
  stand: MetaLeadStand;
  naechster: { title: string; dueAt: Date | null; rot: boolean };
};

export async function ladeMetaLeads(sp: { zeitraum?: string; stand?: string }, now = new Date()) {
  const z = zeitraumVon(sp.zeitraum, now);
  const eingaenge = await prisma.salesInboundLead.findMany({
    where: { source: "META_ADS", contactId: { not: null }, ...(z.seit ? { createdAt: { gte: z.seit } } : {}) },
    orderBy: { createdAt: "asc" },
    select: { contactId: true, createdAt: true, form: true, ad: true, campaign: true },
    take: 2000,
  });
  // Je Kontakt der erste Eingang im Zeitraum
  const erster = new Map<string, (typeof eingaenge)[number]>();
  for (const e of eingaenge) if (e.contactId && !erster.has(e.contactId)) erster.set(e.contactId, e);
  const ids = [...erster.keys()];
  const contacts = ids.length
    ? await prisma.salesContact.findMany({
        where: { id: { in: ids } },
        select: {
          id: true, name: true, firstName: true, lastName: true, city: true, zip: true, phone: true, stage: true, lossReason: true,
          activities: { select: { type: true, outcome: true, occurredAt: true }, orderBy: { occurredAt: "asc" } },
          meetings: { select: { startAt: true, status: true } },
          offers: { where: { status: { not: "superseded" } }, select: { status: true, sentAt: true, acceptedAt: true, viewedAt: true, validUntil: true } },
          tasks: { where: { doneAt: null }, select: { title: true, dueAt: true }, orderBy: { dueAt: "asc" }, take: 3 },
        },
      })
    : [];

  const zeilen: MetaLeadZeile[] = contacts.map((c) => {
    const e = erster.get(c.id)!;
    const stand = metaLeadStand({ eingang: e.createdAt, stage: c.stage, lossReason: c.lossReason, activities: c.activities, meetings: c.meetings, offers: c.offers }, now);
    const person = [c.firstName, c.lastName].filter(Boolean).join(" ") || null;
    return {
      contactId: c.id,
      name: c.name,
      person: person && person !== c.name ? person : null,
      ort: c.city ?? c.zip ?? null,
      phone: c.phone,
      eingang: e.createdAt,
      formular: e.form,
      anzeige: e.ad ?? e.campaign,
      stand,
      naechster: naechsterSchritt(c.tasks, stand.key, now),
    };
  });
  zeilen.sort((a, b) => b.eingang.getTime() - a.eingang.getTime());

  const trichter = metaTrichter(zeilen.map((x) => x.stand));
  const chip = META_CHIPS.find((c) => c.key === sp.stand) ?? null;
  const zaehler = Object.fromEntries(META_CHIPS.map((c) => [c.key, zeilen.filter((x) => c.match(x.stand.key)).length]));
  return { zeitraum: z.key, chip: chip?.key ?? null, trichter, zaehler, gesamt: zeilen.length, zeilen: chip ? zeilen.filter((x) => chip.match(x.stand.key)) : zeilen };
}
