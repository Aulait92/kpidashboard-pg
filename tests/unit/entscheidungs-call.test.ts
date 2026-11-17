// Entscheidungs-Call in Texten an Interessenten (Ole, 17.11.2026): gebucht → Termin, sonst Buchungslink.
import { describe, expect, it } from "vitest";
import { entscheidungsCallHinweis, entscheidungsCallMailText, entscheidungsCallText, terminKurz } from "@/lib/vertrieb/entscheidungs-call";
import { hatGedankenstrich } from "@/lib/gedankenstriche";
import { erinnerungsMail } from "@/lib/angebot-zahlungserinnerung";

// Do 16.01.2031, 10:00 Uhr Berlin (Winterzeit)
const START = new Date("2031-01-16T09:00:00Z");
const VERSCHIEBEN = "https://app.test/termin/verwalten/abc";
const gebucht = { art: "gebucht" as const, startAt: START, telefon: false, verschiebenUrl: VERSCHIEBEN };
const link = { art: "link" as const, url: "https://app.test/termin/entscheidung?k=xyz" };

describe("Entscheidungs-Call: Texte", () => {
  it("gebucht: Termin (Berlin) statt Buchungslink, Link zum Verschieben", () => {
    expect(entscheidungsCallMailText(gebucht)).toBe(
      `Wir sprechen am Donnerstag, 16. Januar um 10:00 Uhr per Video über Ihre Fragen und den Start. Den Link finden Sie in Ihrer Kalendereinladung. Falls etwas dazwischenkommt: ${VERSCHIEBEN}`,
    );
    expect(entscheidungsCallText(gebucht)).toMatchObject({ url: VERSCHIEBEN, linkLabel: "Termin verschieben" });
    expect(entscheidungsCallMailText(gebucht, true)).toBe(
      `Wir sprechen am Donnerstag, 16. Januar um 10:00 Uhr per Video über deine Fragen und den Start. Den Link findest du in deiner Kalendereinladung. Falls etwas dazwischenkommt: ${VERSCHIEBEN}`,
    );
    // Telefon und ohne Link zum Verschieben (z. B. Calendly ohne Link)
    expect(entscheidungsCallMailText({ ...gebucht, telefon: true, verschiebenUrl: null })).toBe(
      "Wir sprechen am Donnerstag, 16. Januar um 10:00 Uhr am Telefon über Ihre Fragen und den Start. Wir rufen Sie an. Falls etwas dazwischenkommt, geben Sie uns bitte kurz Bescheid.",
    );
  });

  it("nicht gebucht: Buchungslink wie bisher; ohne Online-Buchung nichts", () => {
    expect(entscheidungsCallMailText(link)).toBe(
      `Lassen Sie uns das Angebot gemeinsam durchgehen. Hier wählen Sie direkt einen Termin für Ihren Entscheidungs-Call:\n${link.url}`,
    );
    expect(entscheidungsCallText(link)).toMatchObject({ url: link.url, linkLabel: "Termin wählen" });
    expect(entscheidungsCallText({ art: "keiner" })).toBeNull();
    expect(entscheidungsCallMailText({ art: "keiner" })).toBeNull();
  });

  it("Sie-Form ohne Du, keine Gedankenstriche", () => {
    for (const s of [gebucht, { ...gebucht, telefon: true }, { ...gebucht, verschiebenUrl: null }, link]) {
      const sie = entscheidungsCallMailText(s)!;
      const du = entscheidungsCallMailText(s, true)!;
      expect(sie).not.toMatch(/\b(du|dein|deine|dich|dir)\b/);
      expect(du).not.toMatch(/\b(Sie|Ihr|Ihre|Ihnen)\b/);
      for (const t of [sie, du]) expect(hatGedankenstrich(t), t).toBe(false);
    }
  });

  it("Hinweis im Admin: Variante, die rausgeht", () => {
    expect(terminKurz(START)).toBe("Do 16.01. 10 Uhr");
    expect(terminKurz(new Date("2031-01-16T09:30:00Z"))).toBe("Do 16.01. 10:30 Uhr");
    expect(entscheidungsCallHinweis(gebucht)).toBe("Entscheidungs-Call ist gebucht: Do 16.01. 10 Uhr, die Mail nennt den Termin");
    expect(entscheidungsCallHinweis(link)).toBe("Noch kein Entscheidungs-Call gebucht: die Mail enthält den Buchungslink");
  });

  it("Zahlungserinnerung: gebuchter Termin als eigener Absatz vor „Fragen?“", () => {
    const m = erinnerungsMail({ number: "PG-1", startIso: "2031-02-01", stufe: 1, du: false, entscheidungsCall: entscheidungsCallMailText(gebucht) });
    expect(m.paragraphs.at(-2)).toMatch(/^Wir sprechen am Donnerstag, 16\. Januar um 10:00 Uhr/);
    expect(m.paragraphs.at(-1)).toMatch(/^Fragen\?/);
    expect(erinnerungsMail({ number: "PG-1", startIso: null, stufe: 1, du: false }).paragraphs).toHaveLength(3);
  });
});
