// Pflichtangaben auf jeder Stripe-Rechnung (Ole, 14.11.2026): § 14 Abs. 4 UStG und die
// Angaben einer UG (Name mit Rechtsform, Anschrift, Geschäftsführer, Registergericht, HRB,
// USt-IdNr. bzw. Steuernummer). Unabhängig davon, was im Stripe-Konto steht, schreibt die
// Software das als Footer (und die Steuernummer als Zusatzfeld) auf jede Rechnung:
// als Standard am Stripe-Kunden (gilt für Abo-Rechnungen) und direkt beim Erstellen von
// Rechnungen bzw. Checkout-Rechnungen. Die Steuernummer trägt Ole unter
// Admin → Einstellungen → Rechnungsangaben ein; leer = Zeile entfällt.

import { prisma } from "@/lib/prisma";
import { PROVIDER } from "@/lib/legal-texts";

export type InvoiceCustomField = { name: string; value: string };
export type InvoiceDefaults = { footer: string; customFields: InvoiceCustomField[] };

/** Merkmal, an dem eine Rechnung mit den neuen Pflichtangaben erkannt wird. */
export const FOOTER_MARKER = PROVIDER.register;

/** Leerzeichen vereinheitlichen; leere Eingabe = null. */
export function cleanTaxNumber(raw: string | null | undefined): string | null {
  const v = (raw ?? "").replace(/\s+/g, " ").trim();
  return v || null;
}

/** USt-IdNr. (DE + 9 Ziffern) oder Steuernummer (Ziffern mit / und Leerzeichen). */
export function taxNumberKind(v: string): "ustid" | "steuernummer" {
  return /^DE\s?\d{3}\s?\d{3}\s?\d{3}$/i.test(v.trim()) ? "ustid" : "steuernummer";
}

export function taxNumberLabel(v: string): string {
  return taxNumberKind(v) === "ustid" ? "USt-IdNr." : "Steuernummer";
}

/** Eingabe prüfen: leer ist erlaubt (Zeile entfällt), sonst USt-IdNr. oder Steuernummer. */
export function validateTaxNumber(raw: string | null | undefined): { ok: true; value: string | null } | { ok: false; error: string } {
  const v = cleanTaxNumber(raw);
  if (!v) return { ok: true, value: null };
  if (/^DE/i.test(v)) {
    const compact = v.replace(/\s/g, "").toUpperCase();
    if (!/^DE\d{9}$/.test(compact)) return { ok: false, error: "Die USt-IdNr. hat die Form DE und 9 Ziffern, z. B. DE123456789." };
    return { ok: true, value: compact };
  }
  const digits = v.replace(/\D/g, "");
  if (!/^[\d\s/]+$/.test(v) || digits.length < 10 || digits.length > 13) {
    return { ok: false, error: "Bitte die USt-IdNr. (DE und 9 Ziffern) oder die Steuernummer vom Finanzamt eintragen, z. B. 29/123/45678." };
  }
  return { ok: true, value: v };
}

/**
 * Footer jeder Rechnung, z. B. „Ole Kannapinn UG (haftungsbeschränkt) · Lorenzstraße 58 ·
 * 12209 Berlin · Geschäftsführer: Ole Kannapinn · Amtsgericht Charlottenburg, HRB 172651 ·
 * USt-IdNr.: DE123456789“. Ohne Steuernummer entfällt die letzte Angabe.
 */
export function invoiceFooter(taxNumber: string | null | undefined): string {
  const tax = cleanTaxNumber(taxNumber);
  return [
    PROVIDER.name,
    PROVIDER.street,
    PROVIDER.city,
    `Geschäftsführer: ${PROVIDER.manager}`,
    PROVIDER.register,
    tax ? `${taxNumberLabel(tax)}: ${tax}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Zusatzfeld im Rechnungskopf (Stripe custom_fields): nur mit Steuernummer. */
export function invoiceCustomFields(taxNumber: string | null | undefined): InvoiceCustomField[] {
  const tax = cleanTaxNumber(taxNumber);
  return tax ? [{ name: taxNumberLabel(tax), value: tax }] : [];
}

export function invoiceDefaultsFor(taxNumber: string | null | undefined): InvoiceDefaults {
  return { footer: invoiceFooter(taxNumber), customFields: invoiceCustomFields(taxNumber) };
}

/** Gespeicherte Steuernummer (ohne Datenbank bzw. Tabelle: null, die Rechnung geht trotzdem raus). */
export async function loadTaxNumber(): Promise<string | null> {
  try {
    const row = await prisma.invoiceSettings.findUnique({ where: { id: "default" }, select: { taxNumber: true } });
    return cleanTaxNumber(row?.taxNumber);
  } catch {
    return null;
  }
}

/** Footer und Zusatzfelder mit der aktuell gespeicherten Steuernummer. */
export async function loadInvoiceDefaults(): Promise<InvoiceDefaults> {
  return invoiceDefaultsFor(await loadTaxNumber());
}

/** Für stripe.customers.create: Standard für alle Rechnungen dieses Kunden. */
export function customerInvoiceSettingsCreate(d: InvoiceDefaults) {
  return { footer: d.footer, ...(d.customFields.length ? { custom_fields: d.customFields } : {}) };
}

/** Für stripe.customers.update: "" entfernt alte Zusatzfelder, wenn die Steuernummer fehlt. */
export function customerInvoiceSettingsUpdate(d: InvoiceDefaults) {
  return { footer: d.footer, custom_fields: d.customFields.length ? d.customFields : ("" as const) };
}

/** Für invoices.create bzw. Checkout invoice_data. */
export function invoiceFooterParams(d: InvoiceDefaults) {
  return { footer: d.footer, ...(d.customFields.length ? { custom_fields: d.customFields } : {}) };
}

/** Admin-Warnung, solange keine Steuernummer eingetragen ist (null = alles da). */
export function taxNumberWarning(taxNumber: string | null | undefined): string | null {
  return cleanTaxNumber(taxNumber)
    ? null
    : "Rechnungen ohne Steuernummer: Auf Stripe-Rechnungen fehlt die USt-IdNr. bzw. Steuernummer (§ 14 Abs. 4 UStG). Bitte unter Einstellungen → Rechnungsangaben eintragen.";
}
