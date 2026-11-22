// Auswege unter den Einrichtungsschritten Kalender, Postfach und WhatsApp („Mein Versicherer erlaubt das nicht“ usw.).
// Go-live-Prüfung 20./21.11.2026: Makler haben keinen Versicherer, der etwas verbieten könnte (W3 für den Kalender, hier
// auch für Postfach und WhatsApp). Allianz-Vertreter: im Kalender klappt die Vertreternummer immer. Reine Logik, testbar.

export type Ausweg = { kind: string; label: string };
export type AuswegSchritt = "calendar" | "mailbox" | "whatsapp";

const VERSICHERER = "Mein Versicherer erlaubt das nicht";

export function schrittAuswege(
  schritt: AuswegSchritt,
  o: { makler: boolean; allianz?: boolean; uebersprungen?: boolean },
): Ausweg[] {
  if (schritt === "calendar") {
    // Schon übersprungen, aber der Video-Link fehlt: nur der Link hilft weiter (kalenderSchrittFertig).
    return o.makler || o.allianz || o.uebersprungen ? [] : [{ kind: "skip:calendar:gesellschaft", label: VERSICHERER }];
  }
  if (schritt === "mailbox") {
    // Gleicher Ausweg (E-Mail-Funktionen aus), für Makler ohne den Versicherer als Grund
    return [{ kind: "mailbox_off", label: o.makler ? "Ohne E-Mail-Postfach arbeiten" : VERSICHERER }];
  }
  return [
    ...(o.makler ? [] : [{ kind: "skip:whatsapp:gesellschaft", label: VERSICHERER }]),
    { kind: "skip:whatsapp:nicht_noetig", label: "Ohne WhatsApp arbeiten" },
  ];
}

/** Gelber Hinweis im Postfach-Schritt („Ausschließlichkeitsvertreter …“): nur für Vertreter. */
export function zeigePostfachVersichererHinweis(vermittlerTyp: string | null | undefined): boolean {
  return vermittlerTyp !== "makler";
}
