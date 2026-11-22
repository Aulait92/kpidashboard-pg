// Terminsuche über 7 Tage (Ole, 22.11.2026): Erkennung ferner Terminwünsche (Wiedervorlage statt Zeiten), Zeitpunkt der
// Wiedervorlage, getippte Absagen für den Buchungslink nach zwei Runden, Texte (Sie/Du, ohne Gedankenstriche).
import { describe, expect, it } from "vitest";
import { berlinZeitpunkt, fernerTerminwunsch, mehrAls7Tage, wiedervorlageAm } from "@/lib/whatsapp/termin-vorschlaege";
import { abgelehnteRunden, buchungslinkFaellig, lehntZeitenAb } from "@/lib/whatsapp/buchungslink";
import { kalenderVollText, wiedervorlageText, WUNSCHZEIT_REGEL } from "@/lib/whatsapp/gespraech";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

// Sonntag, 22.11.2026, 10 Uhr deutscher Zeit
const NOW = new Date("2026-11-22T09:00:00Z");
const tag = (s: string | null) => fernerTerminwunsch(s, NOW)?.toISOString().slice(0, 10) ?? null;
// 0 Uhr deutscher Zeit ist im Winter 23 Uhr UTC des Vortags: als deutsches Datum lesen
const deTag = (s: string) => {
  const d = fernerTerminwunsch(s, NOW);
  return d ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(d) : null;
};

describe("Erkennung: Terminwunsch mehr als 7 Tage in der Zukunft", () => {
  it("relative Angaben: Wochen, Monate, Tage", () => {
    expect(deTag("in drei Wochen")).toBe("2026-12-13");
    expect(deTag("Ich kann erst in 3 Wochen")).toBe("2026-12-13");
    expect(deTag("in 10 Tagen")).toBe("2026-12-02");
    expect(deTag("nächsten Monat passt besser")).toBe("2026-12-01");
    expect(deTag("übernächste Woche")).toBe("2026-11-30");
    expect(deTag("in zwei Monaten")).toBe("2027-01-22");
  });
  it("Monate: im, Anfang, Mitte, Ende, nach", () => {
    expect(deTag("im Dezember")).toBe("2026-12-01");
    expect(deTag("erst im Dezember bitte")).toBe("2026-12-01");
    expect(deTag("Mitte Dezember passt besser")).toBe("2026-12-15");
    expect(deTag("Ende Dezember")).toBe("2026-12-22");
    expect(deTag("Anfang Januar")).toBe("2027-01-01");
    expect(deTag("nach Weihnachten")).toBe("2026-12-27");
    expect(deTag("im neuen Jahr")).toBe("2027-01-04");
  });
  it("Datum: am, nach, bis (Folgetag), mit Monatsname", () => {
    expect(deTag("nach meinem Urlaub am 15.12.")).toBe("2026-12-15");
    expect(deTag("Mein Urlaub endet am 15.12.")).toBe("2026-12-15");
    expect(deTag("Ich bin bis zum 10.12. im Urlaub")).toBe("2026-12-11");
    expect(deTag("vom 1.12. bis 15.12. bin ich weg")).toBe("2026-12-16");
    expect(deTag("15. Dezember ginge")).toBe("2026-12-15");
    expect(deTag("am 1.12.")).toBe("2026-12-01");
  });
  it("bis 7 Tage: kein ferner Wunsch (Zeiten ab dem Wunschtag wie bisher)", () => {
    for (const s of ["nächste Woche", "in einer Woche", "am Dienstag", "morgen um 10.30 Uhr", "am 25.11.", "am 29.11.", "im November"]) expect(tag(s)).toBeNull();
    expect(deTag("am 30.11.")).toBe("2026-11-30"); // 8 Tage
  });
  it("kein Termin gemeint bzw. zu weit weg: null", () => {
    expect(tag("Mein Vertrag läuft im Dezember aus")).toBeNull();
    expect(tag("Der Vertrag endet am 31.12.")).toBeNull();
    expect(tag("Meine Tochter ist am 15.12.2019 geboren")).toBeNull();
    expect(tag("im Mai")).toBeNull(); // mehr als 90 Tage
    expect(tag("Mai")).toBeNull();
    expect(tag("Hund ist 3 Jahre alt")).toBeNull();
    expect(tag("")).toBeNull();
    expect(tag(null)).toBeNull();
  });
  it("mehrAls7Tage zählt deutsche Kalendertage", () => {
    expect(mehrAls7Tage(berlinZeitpunkt("2026-11-29", 0), NOW)).toBe(false);
    expect(mehrAls7Tage(berlinZeitpunkt("2026-11-30", 0), NOW)).toBe(true);
  });
});

describe("Zeitpunkt der Wiedervorlage", () => {
  it("10 Uhr deutscher Zeit, Wochenende und Feiertage auf den nächsten Werktag", () => {
    expect(wiedervorlageAm(berlinZeitpunkt("2026-12-15", 0)).toISOString()).toBe("2026-12-15T09:00:00.000Z");
    expect(wiedervorlageAm(berlinZeitpunkt("2026-12-12", 0)).toISOString()).toBe("2026-12-14T09:00:00.000Z"); // Samstag
    expect(wiedervorlageAm(berlinZeitpunkt("2026-12-27", 0)).toISOString()).toBe("2026-12-28T09:00:00.000Z"); // Sonntag
    expect(wiedervorlageAm(berlinZeitpunkt("2027-01-01", 0)).toISOString()).toBe("2027-01-04T09:00:00.000Z"); // Neujahr, Fr
    expect(wiedervorlageAm(berlinZeitpunkt("2027-03-29", 0)).toISOString()).toBe("2027-03-29T08:00:00.000Z"); // Sommerzeit
  });
});

describe("Buchungslink nach zwei abgelehnten Runden (auch getippt)", () => {
  it("getippte Absagen ohne neuen Wunsch", () => {
    for (const s of ["Passt leider nicht", "passt beides nicht", "Geht bei mir leider nicht", "Beides passt nicht.", "Keine der Zeiten passt", "Da kann ich leider nicht", "Nein, beides nicht", "leider nicht", "klappt bei mir nicht"])
      expect(lehntZeitenAb(s), s).toBe(true);
  });
  it("mit neuem Wunsch, Rückfrage oder Zusage: keine Absage im Sinne der Regel", () => {
    for (const s of ["Passt nicht, aber Donnerstag ginge", "geht nicht, lieber nachmittags", "passt nicht, erst im Dezember", "Passt das auch am Abend?", "Passt gut!", "Die erste passt", "Ja gerne"])
      expect(lehntZeitenAb(s), s).toBe(false);
  });
  it("zählt Absagen nur als erste Antwort auf einen Terminvorschlag, Knopf „Andere Zeit“ immer", () => {
    const v = { direction: "internal", kind: "termin_vorschlag", body: "{}" };
    const nein = { direction: "inbound", kind: "text", body: "passt leider nicht" };
    const knopf = { direction: "inbound", kind: "interactive", body: "Andere Zeit" };
    const sonst = { direction: "inbound", kind: "text", body: "Ich habe noch eine Frage" };
    expect(abgelehnteRunden([v, nein])).toBe(1);
    expect(abgelehnteRunden([v, nein, v, nein])).toBe(2);
    expect(abgelehnteRunden([v, knopf, v, nein])).toBe(2);
    // ohne Vorschlag davor bzw. nicht die erste Antwort: zählt nicht
    expect(abgelehnteRunden([nein, v, sonst, nein])).toBe(0);
    expect(buchungslinkFaellig(abgelehnteRunden([v, nein, v, nein]))).toBe(true);
    expect(buchungslinkFaellig(abgelehnteRunden([v, nein]))).toBe(false);
  });
});

describe("Texte an den Lead", () => {
  const sie = { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" };
  const du = { nom: "Ole", dat: "Ole" };
  const am = new Date("2026-12-15T09:00:00Z");
  it("Wiedervorlage: Tag, Sie und Du, ohne Gedankenstriche", () => {
    expect(wiedervorlageText("sie", sie, am)).toBe("Alles klar, dann melde ich mich am Dienstag, 15. Dezember wieder bei Ihnen und wir suchen einen passenden Termin mit Herrn Kannapinn.");
    expect(wiedervorlageText("du", du, am)).toBe("Alles klar, dann melde ich mich am Dienstag, 15. Dezember wieder bei dir und wir suchen einen passenden Termin mit Ole.");
  });
  it("Kalender voll: Vermittler meldet sich persönlich, Einleitung des Assistenten statt Dank", () => {
    expect(kalenderVollText("sie", sie)).toBe("Vielen Dank! Herr Kannapinn meldet sich persönlich bei Ihnen, um einen passenden Termin zu finden.");
    expect(kalenderVollText("du", du)).toBe("Danke dir! Ole meldet sich persönlich bei dir, um einen passenden Termin zu finden.");
    expect(kalenderVollText("sie", sie, "Gute Frage, das klärt Herr Kannapinn gern.")).toMatch(/^Gute Frage, das klärt Herr Kannapinn gern\. Herr Kannapinn meldet sich/);
  });
  it("keine Gedankenstriche, kein Versprechen-Wort", () => {
    for (const t of [wiedervorlageText("sie", sie, am), wiedervorlageText("du", du, am), kalenderVollText("sie", sie), kalenderVollText("du", du)]) {
      expect(hatGedankenstrich(t)).toBe(false);
      expect(t).not.toMatch(/garantie/i);
    }
  });
  it("Regel für den Assistenten nennt die Wiedervorlage ab 7 Tagen", () => {
    expect(WUNSCHZEIT_REGEL).toContain("mehr als 7 Tage in der Zukunft");
    expect(WUNSCHZEIT_REGEL).toContain("Wiedervorlage");
  });
});
