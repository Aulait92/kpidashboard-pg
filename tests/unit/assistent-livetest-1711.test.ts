// Live-Test Ole, 17.11.2026: freie Wunschzeit direkt buchen; Buchungsnachricht kurz, die Adresse kommt erst am Schluss.
import { describe, expect, it } from "vitest";
import { abschlussText, buchungsText, EMAIL_KNOEPFE, knoepfeFuerText, terminRegeln, vermittlerName, WUNSCHZEIT_REGEL } from "@/lib/whatsapp/gespraech";

const person = vermittlerName("sie", { name: "Ole Kannapinn", anrede: "Herr", fallback: "Ole" });

describe("Live-Test 17.11.2026", () => {
  it("Wunschzeit frei: direkt buchen, keine zweite Zeit; Regel steht im Prompt", () => {
    expect(WUNSCHZEIT_REGEL).toMatch(/buche sie direkt mit book_appointment/);
    expect(WUNSCHZEIT_REGEL).toMatch(/biete keine zweite Zeit an/);
    const r = terminRegeln({ an: "sie", person, videoOnly: true, beispiel: "…", emailBekannt: true });
    expect(r).toContain(WUNSCHZEIT_REGEL);
  });

  it("Buchungsnachricht kurz (höchstens 3 Zeilen), ohne Adresse; die Adresse wird am Schluss bestätigt (Knöpfe)", () => {
    const t = buchungsText({ an: "sie", start: new Date("2026-11-18T10:00:00Z"), mode: "video", meetUrl: "https://meet.example/x", person });
    expect(t).toBe("Ihr Videotermin ist gebucht: *Mittwoch, 18.11. um 11 Uhr*. Herr Kannapinn hält sich die Zeit nur für Sie frei und bereitet Ihre Beiträge vor.\nIhr Link: https://meet.example/x");
    expect(t.split("\n").length).toBeLessThanOrEqual(3);
    expect(t).not.toMatch(/Einladung|Handy-Browser|dazwischenkommt|[–—]/);
    const schluss = abschlussText({ an: "sie", person, bereitlegen: [], email: "ole@example.de", nachFragen: true });
    expect(schluss).toContain("Zum Schluss: Die Einladung mit Kalendereintrag geht an ole@example.de. Stimmt die Adresse?");
    expect(knoepfeFuerText(schluss)).toEqual(EMAIL_KNOEPFE);
    expect(EMAIL_KNOEPFE.map((k) => k.title)).toEqual(["Ja, stimmt", "Andere Adresse"]);
  });
});
