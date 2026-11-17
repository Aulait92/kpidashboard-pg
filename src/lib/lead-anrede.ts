// Anrede und Beratername für Texte an einen Lead bzw. Kunden (Ole, 14.11.2026).
//   Anrede:  Name + Herr/Frau aus Lead.formData (Feld Anrede/Geschlecht), sonst aus dem
//            Bestandskunden mit derselben Nummer (ExistingCustomer.salutation). Nie aus dem Vornamen geraten
//            (Ole, 17.11.2026).
//   Berater: Person, z. B. „Susanne Meier schaut sich das an“. Anzeigename des zuständigen
//            Beraters (Lead.assignedUser) hat Vorrang, sonst der Kundenname ohne „Agentur“ usw.
//   Firma:   Kundenname, z. B. „Ihre Buchung bei Agentur Susanne Meier“.
// Ohne Datenbank (Unit-Tests) bzw. bei Fehlern: nur die übergebenen Angaben.

import { prisma } from "@/lib/prisma";
import { firmDisplayName, personFromCustomerName, advisorPerson, kurzNameFuerLeads } from "@/lib/advisor-name";

export { firmDisplayName, personFromCustomerName, advisorPerson };
import { formWithOverrides } from "@/lib/lead-stammdaten";
import { anredeRohAusForm, kontaktParts, namePartsFromForm, salutationOf, type AnredeKontakt, type Salutation } from "@/lib/ansprache";
import { erstinfoName, type ErstinfoWeb } from "@/lib/erstinformation-shared";

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
  /** Vorname des Vermittlers laut Profil, sonst Agenturname: „digitaler KI-Assistent von Ole“ (Erstanschreiben). */
  kurz: string;
  /**
   * Vermittler als Person für den Assistenten (Ole, 17.11.2026, lib/whatsapp/gespraech.ts vermittlerName): Name des
   * zuständigen Beraters bzw. laut Anbieterangaben, Anrede (Herr/Frau) nur aus den Anbieterangaben.
   */
  vermittler: { name: string | null; anrede: Salutation | null };
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
  const [lead, customer, profil] = await Promise.all([
    opts.leadId
      ? prisma.lead
          .findUnique({ where: { id: opts.leadId }, select: { name: true, formData: true, contactOverrides: true, phone: true, assignedUser: { select: { displayName: true } } } })
          .catch(() => null)
      : null,
    prisma.customer.findUnique({ where: { id: opts.customerId }, select: { name: true, onboarding: { select: { websiteInfo: true } } } }).catch(() => null),
    // Anbieterangaben (Erstinformation): Vor- und Nachname des Vermittlers
    prisma.erstinformation.findUnique({ where: { customerId: opts.customerId }, select: { name: true, anrede: true } }).catch(() => null),
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
  const profilName = erstinfoName(profil?.name, (customer?.onboarding?.websiteInfo ?? undefined) as ErstinfoWeb | undefined, customer?.name) || null;
  const zustaendig = lead?.assignedUser?.displayName?.replace(/\s+/g, " ").trim() || null;
  // Anrede gilt nur für die Person der Anbieterangaben (anderer Berater im Team: Vor- und Nachname)
  const vermittler = zustaendig && zustaendig !== profilName ? { name: zustaendig, anrede: null } : { name: profilName, anrede: salutationOf(profil?.anrede) };
  return {
    kontakt,
    vermittler,
    advisor: advisorPerson(customer?.name, lead?.assignedUser?.displayName),
    firm: firmDisplayName(customer?.name),
    kurz: kurzNameFuerLeads({
      assignedDisplayName: lead?.assignedUser?.displayName,
      // wie in den Anbieterangaben (gespeichert bzw. Vorschlag), damit Vorlage und Freitext denselben Vornamen tragen
      profilName: erstinfoName(profil?.name, (customer?.onboarding?.websiteInfo ?? undefined) as ErstinfoWeb | undefined, customer?.name),
      customerName: customer?.name,
    }),
  };
}
