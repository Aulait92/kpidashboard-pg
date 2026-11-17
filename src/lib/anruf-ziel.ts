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

const tag = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "numeric", month: "numeric" }).format(d);
/** Eigene Notiz statt Standardtext der App (z. B. „Nochmal anrufen“) */
const GENERISCH = /^(nochmal (anrufen|melden)|wiedervorlage|nächsten schritt festlegen|rückruf)\.?$/i;

export function anrufZiel(c: {
  kind: "callback" | "followup";
  reason: string;
  source: string | null;
  known?: string | null;
  /** Letzter Termin mit dem Kontakt (schon vorbei), für konkretes Nachfassen (Ole, 17.11.2026: „1 und 2 nichtssagend“). */
  letzterTermin?: Date | null;
}): AnrufZiel {
  const r = c.reason.toLowerCase();
  // Weiß der Assistent schon etwas (steht im Anrufmodus darüber), nur bestätigen statt neu abfragen (16.11.2026)
  const bedarf = (verb: string) => (c.known ? "Bekanntes kurz bestätigen, nur Fehlendes fragen" : `${verb}: ${bedarfsfragen(c.source)}`);
  if (/nicht zum termin erschienen|termin abgelehnt|termin abgesagt/.test(r)) {
    return { ziel: "Neuen Termin vereinbaren", schritte: ["Kurz nachfragen, was dazwischenkam", "Zwei Termine zur Wahl anbieten", "Termin direkt eintragen"] };
  }
  if (c.kind === "followup") {
    if (/angebot/.test(r)) return { ziel: "Entscheidung zum Angebot", schritte: ["Offene Fragen zum Angebot klären", "Abschluss machen oder nächsten Schritt festlegen"] };
    // Konkret statt „An das letzte Gespräch anknüpfen / Nächsten Schritt festlegen“ (Ole, 17.11.2026)
    const thema = c.source ? ` zu ${c.source}` : "";
    const notiz = c.reason.trim() && !GENERISCH.test(c.reason.trim()) ? `Ihre Notiz aufgreifen: „${c.reason.trim().slice(0, 80)}“` : null;
    if (c.letzterTermin) {
      return {
        ziel: "Entscheidung nach dem Termin",
        schritte: [
          `An den Termin vom ${tag(c.letzterTermin)}${thema} anknüpfen: „Konnten Sie schon in Ruhe drüber schauen?“`,
          ...(notiz ? [notiz] : []),
          "Direkt fragen: „Sollen wir das so festmachen?“ Bei Zögern: Was fehlt noch zur Entscheidung?",
        ],
      };
    }
    return {
      ziel: "Termin vereinbaren",
      schritte: [
        c.source ? `Auf die Anfrage${thema} Bezug nehmen` : "Auf das letzte Gespräch Bezug nehmen",
        ...(notiz ? [notiz] : [bedarf("Bedarf kurz abfragen")]),
        "Termin vereinbaren: zwei Zeiten zur Wahl anbieten, am besten per Video",
      ],
    };
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
