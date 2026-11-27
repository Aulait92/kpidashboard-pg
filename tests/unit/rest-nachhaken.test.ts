// Einmal nachhaken bei „Rest im Termin“ (Ole, 27.11.2026, Fall Kiefer): reine Texte und Entscheidung der Fragen-Engine
// (lib/vorbereitung/fragen.ts). Ablauf mit Datenbank: tests/integration/rest-nachhaken.test.ts.
import { describe, expect, it } from "vitest";
import {
  fehltFuerBeitrag,
  fragenPlan,
  imTerminText,
  kfzFotosSatz,
  NACHHAKEN_KNOEPFE,
  nachhakenAusText,
  nachhakenText,
  offeneFragen,
  payloadLesen,
  preisrelevant,
  restText,
  vorbereitungAusText,
  type FehltFuerBeitrag,
  type FragenQuelle,
} from "@/lib/vorbereitung/fragen";
import { SPARTEN_DEFINITIONEN } from "@/lib/vorbereitung/sparten";
import { ohneGedankenstriche } from "@/lib/gedankenstriche";

const quelle = (o: Partial<FragenQuelle> = {}): FragenQuelle => ({ formular: [], angaben: {}, erledigt: [], ...o });
const offen = (sparten: string[], q = quelle()) => offeneFragen(fragenPlan(sparten, SPARTEN_DEFINITIONEN, q), q);

const alleTexte = (): string[] => {
  const fehlt: FehltFuerBeitrag[] = [{ kfz: true }, { kfz: false, labels: ["Wohnfläche"], anzahl: 1 }, { kfz: false, labels: ["Wohnsituation", "Wohnfläche"], anzahl: 2 }, { kfz: false, labels: ["Wer wird versichert?"], anzahl: 7 }];
  return (["sie", "du"] as const).flatMap((an) => [
    ...fehlt.map((f) => nachhakenText(an, "Herr Lohmann", f)),
    restText(an, "Herr Lohmann", "Montag"),
    restText(an, "Herr Lohmann", "Montag", { kfz: true }),
    restText(an, "Herr Lohmann", "Montag", { danke: true }),
    imTerminText(an, "Herr Lohmann", "Montag", true),
    kfzFotosSatz(an, "Herr Lohmann"),
  ]);
};

describe("Was zählt für den Beitrag", () => {
  it("Pflichtfragen bis Abschnitt 3, nicht Vorverträge, Zusatzbausteine und Adresse", () => {
    const o = offen(["hausrat"]);
    expect(o.filter(preisrelevant).map((f) => f.label)).toEqual(["Geburtsdatum", "Postleitzahl", "Schäden in den letzten 5 Jahren", "Wohnsituation", "Wohnfläche"]);
    expect(o.filter((f) => !preisrelevant(f)).map((f) => f.label)).toEqual(expect.arrayContaining(["Bisheriger Vertrag (Hausrat)", "Adresse (Straße, Hausnummer)"]));
  });

  it("fehltFuerBeitrag: Bezeichnungen und Anzahl ohne Folgefragen; nichts offen: null", () => {
    expect(fehltFuerBeitrag(offen(["hausrat"]))).toEqual({ kfz: false, labels: ["Geburtsdatum", "Postleitzahl", "Schäden in den letzten 5 Jahren", "Wohnsituation", "Wohnfläche"], anzahl: 5 });
    const nurRest = offen(["hausrat"]).filter((f) => !preisrelevant(f));
    expect(fehltFuerBeitrag(nurRest)).toBeNull();
    expect(fehltFuerBeitrag([])).toBeNull();
  });
});

describe("Texte (Sie und Du)", () => {
  it("Nachhaken: Nutzen und Aufwand, Vermittler genannt, Frage am Ende", () => {
    expect(nachhakenText("sie", "Herr Lohmann", { kfz: false, labels: ["Wohnsituation", "Wohnfläche"], anzahl: 2 })).toBe(
      "Verstehe! Nur kurz: Ohne Angaben wie Wohnsituation und Wohnfläche kann Herr Lohmann im Termin noch keinen Beitrag für Sie rechnen, dann wird meist ein zweiter Termin nötig. Es sind nur noch zwei kurze Fragen. Wollen wir die noch schnell machen?",
    );
    expect(nachhakenText("du", "Klaus", { kfz: false, labels: ["Wohnfläche und Baujahr des Hauses", "Heizung"], anzahl: 1 })).toBe(
      "Verstehe! Nur kurz: Ohne Angaben wie Wohnfläche und Baujahr des Hauses kann Klaus im Termin noch keinen Beitrag für dich rechnen, dann wird meist ein zweiter Termin nötig. Es ist nur noch eine kurze Frage. Wollen wir die noch schnell machen?",
    );
    // unlesbare Bezeichnungen (Frage, Zahl) und viele Fragen: allgemein, ohne Zähler
    expect(nachhakenText("sie", "Herr Lohmann", { kfz: false, labels: ["Wer wird versichert?", "Schäden 5 Jahre (Hausrat)"], anzahl: 7 })).toBe(
      "Verstehe! Nur kurz: Ohne die letzten Angaben kann Herr Lohmann im Termin noch keinen Beitrag für Sie rechnen, dann wird meist ein zweiter Termin nötig. Es sind nur noch ein paar kurze Fragen. Wollen wir die noch schnell machen?",
    );
    // Klammerzusatz weg
    expect(nachhakenText("sie", "Herr Lohmann", { kfz: false, labels: ["Tätigkeit (Unfall)"], anzahl: 1 })).toContain("Ohne Angaben wie Tätigkeit kann");
  });

  it("Kfz: Fahrzeugschein und letzte Rechnung, zwei Fotos", () => {
    expect(nachhakenText("sie", "Herr Lohmann", { kfz: true })).toBe(
      "Verstehe! Nur kurz: Ohne Ihren Fahrzeugschein und die letzte Rechnung Ihrer Kfz-Versicherung kann Herr Lohmann im Termin noch keinen Beitrag für Sie rechnen, dann wird meist ein zweiter Termin nötig. Es sind nur zwei Fotos, das dauert eine Minute. Wollen wir das noch schnell machen?",
    );
    expect(nachhakenText("du", "Herr Lohmann", { kfz: true })).toBe(
      "Verstehe! Nur kurz: Ohne deinen Fahrzeugschein und die letzte Rechnung deiner Kfz-Versicherung kann Herr Lohmann im Termin noch keinen Beitrag für dich rechnen, dann wird meist ein zweiter Termin nötig. Es sind nur zwei Fotos, das dauert eine Minute. Wollen wir das noch schnell machen?",
    );
  });

  it("Stopp: wie bisher, mit Foto-Satz bzw. Dank nach den Angaben für den Beitrag", () => {
    expect(restText("sie", "Herr Lohmann", "Montag")).toBe("Alles klar, den Rest klärt Herr Lohmann mit Ihnen im Termin. Bis Montag!");
    expect(restText("du", "Herr Lohmann", "Montag")).toBe("Alles klar, den Rest klärt Herr Lohmann mit dir im Termin. Bis Montag!");
    expect(restText("sie", "Herr Lohmann", "Montag", { kfz: true })).toBe(
      "Alles klar, den Rest klärt Herr Lohmann mit Ihnen im Termin. Wenn Sie vorher noch kurz Fahrzeugschein und letzte Rechnung als Foto schicken, kann Herr Lohmann den Beitrag schon vorbereiten. Bis Montag!",
    );
    expect(restText("du", "Herr Lohmann", "morgen", { kfz: true })).toBe(
      "Alles klar, den Rest klärt Herr Lohmann mit dir im Termin. Wenn du vorher noch kurz Fahrzeugschein und letzte Rechnung als Foto schickst, kann Herr Lohmann den Beitrag schon vorbereiten. Bis morgen!",
    );
    expect(restText("sie", "Herr Lohmann", "Montag", { danke: true })).toBe("Danke, das reicht schon! Den Rest klärt Herr Lohmann mit Ihnen im Termin. Bis Montag!");
    expect(imTerminText("sie", "Herr Lohmann", "Montag")).toBe("Alles klar, bis Montag!");
    expect(imTerminText("du", "Herr Lohmann", "Montag", true)).toBe(
      "Alles klar! Wenn du vorher noch kurz Fahrzeugschein und letzte Rechnung als Foto schickst, kann Herr Lohmann den Beitrag schon vorbereiten. Bis Montag!",
    );
  });

  it("keine Gedankenstriche, nie „Garantie“, kein Druck; Sie- und Du-Fassung unterscheiden sich", () => {
    for (const t of alleTexte()) {
      expect(ohneGedankenstriche(t)).toBe(t);
      expect(t).not.toMatch(/[–—]/);
      expect(t).not.toMatch(/garant|sofort|letzte chance|unbedingt|muss/i);
    }
    expect(nachhakenText("sie", "X", { kfz: true })).not.toBe(nachhakenText("du", "X", { kfz: true }));
    // höchstens 2 Sätze plus Frage nach „Verstehe!“
    for (const t of alleTexte().filter((x) => x.startsWith("Verstehe!"))) {
      const saetze = t.replace(/^Verstehe! Nur kurz: /, "").split(/(?<=[.?!])\s+/);
      expect(saetze).toHaveLength(3);
      expect(saetze.at(-1)).toMatch(/\?$/);
    }
  });
});

describe("Knöpfe und getippte Antworten", () => {
  it("[Gut, machen wir] [Lieber im Termin]: vf:weiter bzw. vf:rest, Titel höchstens 20 Zeichen", () => {
    expect(NACHHAKEN_KNOEPFE.map((k) => k.title)).toEqual(["Gut, machen wir", "Lieber im Termin"]);
    expect(NACHHAKEN_KNOEPFE.every((k) => k.title.length <= 20)).toBe(true);
    expect(payloadLesen("vf:weiter")).toEqual({ weiter: true });
    expect(payloadLesen("vf:rest")).toEqual({ rest: true });
  });

  it("nachhakenAusText: ja, rest bzw. null (dann gilt der Text als Antwort auf die Frage)", () => {
    for (const t of ["Ja", "ok", "Gut, machen wir", "gerne", "Na gut", "passt"]) expect(nachhakenAusText(t)).toBe("ja");
    for (const t of ["Nein", "nö", "Lieber im Termin", "das klären wir lieber im Termin", "später", "jetzt nicht"]) expect(nachhakenAusText(t)).toBe("rest");
    for (const t of ["15.03.1985", "Gut, 75 qm", "Wohnung im 2. Stock", "Was kostet das denn ungefähr, wenn ich jetzt schon frage?"]) expect(nachhakenAusText(t)).toBeNull();
  });

  it("Frage nach der Vorbereitung: „Gut, machen wir“ getippt zählt als Ja", () => {
    expect(vorbereitungAusText("Gut, machen wir")).toBe("ja");
    expect(vorbereitungAusText("machen wir")).toBe("ja");
    expect(vorbereitungAusText("Lieber im Termin")).toBe("termin");
  });
});
