// Zahlarten beim Hinterlegen bzw. Bezahlen über Stripe Checkout (Ole, 14.11.2026):
// SEPA-Lastschrift zuerst und vorausgewählt (bei 1.190 € im Monat ca. 0,35 € statt ca. 18 €
// mit Karte), danach Karte mit Apple Pay und Google Pay. Exotische Zahlarten (Kakao Pay,
// Naver Pay, Payco, PIX, BLIK, MB Way, Bancontact, Klarna usw.) gibt es nicht.
//
// Warum eine eigene Auswahl vor Stripe: Checkout sortiert die Zahlarten selbst nach
// Relevanz; weder die Reihenfolge in allowed_payment_method_types noch eine
// Payment-Method-Configuration legt die Anzeige-Reihenfolge fest (Stripe-Doku
// „Payment method integration options“). Ab API-Version 2026-09-30 gibt es für Checkout
// auch kein payment_method_types mehr, nur noch allowed_payment_method_types als Filter.
// Deshalb wählt der Kunde bei uns (Lastschrift vorausgewählt), und Checkout bekommt genau
// diese Zahlart. Apple Pay und Google Pay laufen in Checkout über „card“.

export type Zahlart = "sepa" | "card";

export const ZAHLART_STANDARD: Zahlart = "sepa";

/** Hinweis unter der Auswahl (Ole, 14.11.2026). */
export const ZAHLART_HINWEIS = "Am einfachsten per Lastschrift, der Betrag wird monatlich automatisch eingezogen.";

export const ZAHLART_OPTIONEN: { value: Zahlart; label: string; detail: string }[] = [
  { value: "sepa", label: "Lastschrift (SEPA)", detail: "Empfohlen. Einmal die IBAN angeben, fertig." },
  { value: "card", label: "Karte, Apple Pay oder Google Pay", detail: "Kreditkarte oder Wallet auf dem Handy." },
];

/** Formularwert lesen: alles außer „card“ ist Lastschrift (Standard). */
export function parseZahlart(v: unknown): Zahlart {
  return v === "card" ? "card" : ZAHLART_STANDARD;
}

type CheckoutType = "sepa_debit" | "card";

/**
 * Filter für Checkout (allowed_payment_method_types). Ohne Wahl: Lastschrift und Karte
 * (inkl. Apple Pay und Google Pay), nichts sonst.
 */
export function allowedPaymentMethodTypes(zahlart?: Zahlart | null): CheckoutType[] {
  if (zahlart === "sepa") return ["sepa_debit"];
  if (zahlart === "card") return ["card"];
  return ["sepa_debit", "card"];
}
