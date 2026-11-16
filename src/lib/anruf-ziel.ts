// Anrufliste: auf einen Blick, was im Gespräch zu tun ist (Ole, 16.11.2026: „Hier muss ich noch auf einen Blick sehen,
// was ich im Gespräch tun soll. Bedarf abfragen, Termin ausmachen etc.“). Rein, ohne Datenbank, getestet.

export type AnrufZiel = { ziel: string; schritte: string[] };

/** Kurze Bedarfsfragen je Produkt (Lead-Quelle bzw. Produktname). */
export function bedarfsfragen(produkt: string | null | undefined): string {
  const p = (produkt ?? "").toLowerCase();
  if (/katze|hund|tier|tkv|pferd/.test(p) && !/privatschutz/.test(p)) return "Tierart, Alter, Kranken- oder OP-Schutz";
  if (/privatschutz|haftpflicht|hausrat|rechtsschutz|wohngeb|unfall/.test(p)) return "Welche Sparten, wer mitversichert wird, bestehende Verträge";
  if (/pkv|kranken|zahn|pflege|beihilfe/.test(p)) return "Beruf und Status, heutige Versicherung, was wichtig ist";
  if (/bu\b|berufsunf|leben|rente|vorsorge/.test(p)) return "Beruf, Einkommen, was abgesichert werden soll";
  return "Was abgesichert werden soll, bestehende Verträge";
}

export function anrufZiel(c: { kind: "callback" | "followup"; reason: string; source: string | null; known?: string | null }): AnrufZiel {
  const r = c.reason.toLowerCase();
  // Weiß der Assistent schon etwas (steht im Anrufmodus darüber), nur bestätigen statt neu abfragen (16.11.2026)
  const bedarf = (verb: string) => (c.known ? "Bekanntes kurz bestätigen, nur Fehlendes fragen" : `${verb}: ${bedarfsfragen(c.source)}`);
  if (/nicht zum termin erschienen|termin abgelehnt|termin abgesagt/.test(r)) {
    return { ziel: "Neuen Termin vereinbaren", schritte: ["Kurz nachfragen, was dazwischenkam", "Zwei Termine zur Wahl anbieten", "Termin direkt eintragen"] };
  }
  if (c.kind === "followup") {
    if (/angebot/.test(r)) return { ziel: "Entscheidung zum Angebot", schritte: ["Offene Fragen zum Angebot klären", "Abschluss machen oder nächsten Schritt festlegen"] };
    return { ziel: "Nachfassen", schritte: ["An das letzte Gespräch anknüpfen", "Nächsten Schritt festlegen"] };
  }
  if (/im chat geantwortet/.test(r)) {
    return { ziel: "Termin vereinbaren", schritte: ["Auf den Chat Bezug nehmen", bedarf("Bedarf klären"), "Termin vereinbaren, am besten per Video"] };
  }
  return {
    ziel: "Termin vereinbaren",
    schritte: [
      c.source ? `Vorstellen: Ihre Anfrage zu ${c.source}` : "Vorstellen und auf die Anfrage Bezug nehmen",
      bedarf("Bedarf kurz abfragen"),
      "Termin vereinbaren, am besten per Video",
    ],
  };
}
