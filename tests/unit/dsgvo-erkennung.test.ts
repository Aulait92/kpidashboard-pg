// Betroffenenrechte ohne KI erkennen (Ole, 18.11.2026, lib/dsgvo/erkennung.ts): positiv und negativ, Abgrenzung zu
// „STOPP“ und zum Widerruf der Policen-Unterlagen, Frist und Bestätigungstext (beide Fassungen).
import { describe, expect, it } from "vitest";
import { bestaetigungText, erkenneDsgvo, fristBis } from "@/lib/dsgvo/erkennung";
import { istWiderruf } from "@/lib/policen/regeln";
import { isStopMessage } from "@/lib/whatsapp/stopp";

describe("Erkennung", () => {
  it.each([
    ["Bitte löschen Sie meine Daten.", "loeschung"],
    ["Ich möchte, dass alle meine personenbezogenen Daten gelöscht werden", "loeschung"],
    ["Recht auf Vergessenwerden nach DSGVO", "loeschung"],
    ["Entfernen Sie mich bitte aus Ihrer Datenbank", "loeschung"],
    ["Ich bitte um Auskunft über meine gespeicherten Daten gemäß Art. 15 DSGVO", "auskunft"],
    ["Welche Daten haben Sie über mich gespeichert?", "auskunft"],
    ["Woher haben Sie meine Nummer?", "auskunft"],
    ["Ich widerspreche der Nutzung meiner Daten für Werbung.", "widerspruch_werbung"],
    ["Bitte keine Werbung mehr", "widerspruch_werbung"],
    ["Hiermit widerspreche ich der Verarbeitung meiner Daten", "widerspruch_werbung"],
    ["Berichtigung meiner Daten bitte, die Adresse ist falsch", "berichtigung"],
    ["Ich verlange nach der DSGVO, dass ...", "unklar"],
  ])("%s → %s", (t, art) => {
    expect(erkenneDsgvo(t)).toBe(art);
  });

  it.each([
    "STOPP",
    "Stop",
    "keine Nachrichten mehr",
    "Widerruf",
    "Bitte löschen",
    "Bitte meine Unterlagen löschen",
    "Ich widerrufe meine Einwilligung zu den Unterlagen",
    "Ich möchte meinen alten Vertrag widerrufen",
    "Können Sie den Termin löschen?",
    "Welche Daten brauchen Sie von mir für das Angebot?",
    "Geburtsdaten meiner Kinder schicke ich gleich",
    "Ja, passt",
    "Hausrat",
    "",
  ])("kein Treffer: %s", (t) => {
    expect(erkenneDsgvo(t)).toBeNull();
  });

  it("Abgrenzung: STOPP und Policen-Widerruf bleiben bei ihren Abläufen", () => {
    expect(isStopMessage("STOPP")).toBe(true);
    expect(erkenneDsgvo("STOPP")).toBeNull();
    expect(istWiderruf("Bitte meine Unterlagen löschen")).toBe(true);
    expect(erkenneDsgvo("Bitte meine Unterlagen löschen")).toBeNull();
  });

  it("Betreff der Mail zählt mit", () => {
    expect(erkenneDsgvo("Bitte um Rückmeldung.", { betreff: "Auskunft nach Art. 15 DSGVO" })).toBe("auskunft");
  });
});

describe("Frist und Bestätigung", () => {
  it("ein Monat, am Monatsende gekürzt", () => {
    expect(fristBis(new Date("2026-11-18T10:00:00Z")).toISOString().slice(0, 10)).toBe("2026-12-18");
    expect(fristBis(new Date("2027-01-31T10:00:00Z")).toISOString().slice(0, 10)).toBe("2027-02-28");
  });
  it("Text wie vorgegeben, beide Fassungen, ohne Gedankenstriche", () => {
    expect(bestaetigungText("sie", "auskunft")).toBe("Ihre Anfrage ist angekommen, Sie bekommen innerhalb eines Monats Antwort.");
    expect(bestaetigungText("du", "loeschung")).toBe("Deine Anfrage ist angekommen, du bekommst innerhalb eines Monats Antwort.");
    expect(bestaetigungText("sie", "widerspruch_werbung")).toContain("Werbung schicken wir Ihnen ab sofort nicht mehr.");
    for (const t of [bestaetigungText("sie", "auskunft"), bestaetigungText("du", "widerspruch_werbung")]) expect(t).not.toMatch(/[–—]/);
  });
});
