// Voller Text statt Vorschau (Ole, 27.11.2026): eigene Antworten wurden mitten im Wort abgeschnitten.
import { describe, expect, it } from "vitest";
import { mailTextAus } from "@/lib/vertrieb/instantly";

const vorschau = "Hallo Herr Schmitz, im Bereich bAV haben wir bisher noch e";

describe("mailTextAus", () => {
  it("nimmt body.text, wenn vorhanden", () => {
    expect(mailTextAus({ body: { text: "Voller Text." }, content_preview: vorschau })).toBe("Voller Text.");
  });
  it("ohne body.text: Text aus dem HTML statt der Vorschau", () => {
    const t = mailTextAus({ body: { html: "<p>Hallo Herr Schmitz,</p><p>im Bereich bAV haben wir bisher noch einiges vor.</p>" }, content_preview: vorschau });
    expect(t).toContain("noch einiges vor.");
    expect(t).not.toBe(vorschau);
  });
  it("ohne body: Vorschau als letzte Möglichkeit", () => {
    expect(mailTextAus({ body: null, content_preview: vorschau })).toBe(vorschau);
  });
});
