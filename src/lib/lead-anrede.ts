// Anrede und Beratername für Texte an einen Lead bzw. Kunden (Ole, 14.11.2026).
//   Anrede:  Name + Herr/Frau aus Lead.formData (Feld Anrede/Geschlecht), sonst aus dem
//            Bestandskunden mit derselben Nummer (ExistingCustomer.salutation), sonst aus einem
//            eindeutigen Vornamen (lib/vorname-anrede.ts, Ole 16.11.2026).
//   Berater: Person, z. B. „Susanne Meier schaut sich das an“. Anzeigename des zuständigen
//            Beraters (Lead.assignedUser) hat Vorrang, sonst der Kundenname ohne „Agentur“ usw.
//   Firma:   Kundenname, z. B. „Ihre Buchung bei Agentur Susanne Meier“.
// Ohne Datenbank (Unit-Tests) bzw. bei Fehlern: nur die übergebenen Angaben.

import { prisma } from "@/lib/prisma";
import { firmDisplayName, personFromCustomerName, advisorPerson } from "@/lib/advisor-name";

export { firmDisplayName, personFromCustomerName, advisorPerson };
import { formWithOverrides } from "@/lib/lead-stammdaten";
import { anredeRohAusForm, kontaktParts, namePartsFromForm, type AnredeKontakt } from "@/lib/ansprache";

/** Anrede-Angaben aus einem Lead (Name, formData). */
export function kontaktFromLead(lead: { name?: string | null; formData?: unknown; contactOverrides?: unknown } | null | undefined, fallbackName?: string | null): AnredeKontakt {
  // Im Kontakt korrigierte Angaben (lib/lead-stammdaten.ts) haben Vorrang vor dem Formular
  const form = formWithOverrides(lead?.formData, lead?.contactOverrides);
  const parts = namePartsFromForm(form);
  return {
    fullName: lead?.name ?? fallbackName ?? null,
    firstName: parts.firstName,
    lastName: parts.lastName,
    salutation: anredeRohAusForm(form),
  };
}

/** Anrede-Angaben eines Bestandskunden. */
export function kontaktFromExisting(ec: { firstName?: string | null; lastName?: string | null; salutation?: string | null }): AnredeKontakt {
  return {
    firstName: ec.firstName ?? null,
    lastName: ec.lastName ?? null,
    fullName: [ec.firstName, ec.lastName].filter(Boolean).join(" ") || null,
    // Rohwert, damit „Divers“ aus dem Import nicht durch eine Anrede aus dem Vornamen ersetzt wird
    salutation: ec.salutation ?? null,
  };
}

export type LeadAnsprechpartner = {
  kontakt: AnredeKontakt;
  /** Person für „Ihr Termin mit …“, „… schaut sich das an“. */
  advisor: string;
  /** Firmenname für „Ihre Buchung bei …“, „digitaler Assistent von …“. */
  firm: string;
};

/**
 * Anrede und Namen für Nachrichten an einen Kontakt. Fehlende Angaben (Lead ohne Anrede) werden
 * vom Bestandskunden mit derselben Nummer ergänzt.
 */
export async function ansprechpartner(opts: {
  customerId: string;
  leadId?: string | null;
  phone?: string | null;
  name?: string | null;
}): Promise<LeadAnsprechpartner> {
  const [lead, customer] = await Promise.all([
    opts.leadId
      ? prisma.lead
          .findUnique({ where: { id: opts.leadId }, select: { name: true, formData: true, contactOverrides: true, phone: true, assignedUser: { select: { displayName: true } } } })
          .catch(() => null)
      : null,
    prisma.customer.findUnique({ where: { id: opts.customerId }, select: { name: true } }).catch(() => null),
  ]);
  const kontakt = kontaktFromLead(lead, opts.name);
  const phone = opts.phone ?? lead?.phone ?? null;
  if (!kontakt.salutation && phone) {
    const ec = await prisma.existingCustomer
      .findFirst({ where: { customerId: opts.customerId, phone }, select: { firstName: true, lastName: true, salutation: true } })
      .catch(() => null);
    // Nur, wenn es dieselbe Person ist (gleiche Nummer kann auch ein Familienmitglied sein)
    const last = kontaktParts(kontakt).last.toLowerCase();
    if (ec && (!last || last === (ec.lastName ?? "").trim().toLowerCase())) {
      const e = kontaktFromExisting(ec);
      kontakt.salutation = e.salutation;
      kontakt.lastName = kontakt.lastName ?? e.lastName;
      kontakt.firstName = kontakt.firstName ?? e.firstName;
      kontakt.fullName = kontakt.fullName ?? e.fullName;
    }
  }
  return {
    kontakt,
    advisor: advisorPerson(customer?.name, lead?.assignedUser?.displayName),
    firm: firmDisplayName(customer?.name),
  };
}
