import { describe, expect, it } from "vitest";
import { ersteFrage, erstanschreibenV9Params, frageplan } from "@/lib/whatsapp/erstanschreiben";
import { testLeadAnswers } from "@/lib/testlead";

// Termin schon über die Dankeseite des Meta-Formulars gebucht (Ole, 18.11.2026): Erstnachricht trotzdem, aber nie mit
// einer Terminfrage; nach der Antwort folgt der Komplettcheck (bot.ts).
describe("Erstanschreiben bei schon gebuchtem Termin", () => {
  const person = { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" };
  for (const source of ["Sterbegeld", "Privatschutz", "TKV Katze", "Zahnzusatz", "PKV Wechsel"]) {
    it(`${source}: keine Terminfrage, wenn gebucht`, () => {
      const f = testLeadAnswers(source);
      const gebucht = ersteFrage(source, "sie", "Ole", f, person, { gebucht: true });
      expect(gebucht).not.toMatch(/Termin mit|Videotermin|Telefonat/);
      expect(gebucht.endsWith("?")).toBe(true);
      if (frageplan(source, f).offen.length === 0) {
        expect(gebucht).toBe("Gibt es vorab noch etwas, das Herr Kannapinn für den Termin wissen sollte?");
        expect(ersteFrage(source, "sie", "Ole", f, person)).not.toBe(gebucht);
      }
      const params = erstanschreibenV9Params({ source, an: "sie", formular: f, person, kurz: "Ole", gebucht: true });
      expect(params.at(-1)!.endsWith("?")).toBe(false);
    });
  }
});
