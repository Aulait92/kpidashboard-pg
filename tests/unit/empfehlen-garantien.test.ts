// Empfehlungsseite /empfehlen/[code]: Garantien passend zum Produkt und Status des Empfehlers (Usability-Check 18.11.2026).
import { describe, expect, it } from "vitest";
import { garantienFuerEmpfehlung } from "@/lib/empfehlen-garantien";
import { DEFAULT_CONFIG } from "@/lib/rechner";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

const g = DEFAULT_CONFIG.guarantees;

describe("Garantien auf der Empfehlungsseite", () => {
  it("Empfehler mit Katzenversicherung: das Produkt wird genannt; Vertreter sehen die Break-even-Garantie", () => {
    const r = garantienFuerEmpfehlung(g, { person: "Jana Berger", makler: false, produkte: ["TKV-Katze", "Hausrat"] });
    expect(r.satz).toBe("Gelten für TKV-Katze, das Produkt, mit dem auch Jana Berger arbeitet. Für weitere Produkte nur, wenn sie im Angebot ausdrücklich genannt sind.");
    expect(r.karten.map((k) => k.title)).toEqual(["Lead-Garantie", "Break-even-Garantie"]);
  });

  it("Empfehler ohne Garantie-Produkt: Katze als Geltungsbereich, sein Produkt ausdrücklich nur mit Nennung im Angebot", () => {
    const r = garantienFuerEmpfehlung(g, { person: "Jana Berger", makler: false, produkte: ["Hausrat"] });
    expect(r.satz).toBe("Gelten für die Katzenversicherung (TKV-Katze). Für Hausrat (das Produkt von Jana Berger) nur, wenn es im Angebot ausdrücklich genannt ist.");
    const zwei = garantienFuerEmpfehlung(g, { person: "Jana Berger", makler: false, produkte: ["Hausrat", "Rechtsschutz"] });
    expect(zwei.satz).toContain("Für Hausrat und Rechtsschutz (die Produkte von Jana Berger) nur, wenn sie im Angebot ausdrücklich genannt sind.");
  });

  it("Makler sehen die Vertrags-Garantie statt Break-even; ohne Angebot der allgemeine Satz; ausgeschaltete fehlen", () => {
    const r = garantienFuerEmpfehlung(g, { person: "Max", makler: true, produkte: [] });
    expect(r.karten.map((k) => k.title)).toEqual(["Lead-Garantie", "Vertrags-Garantie (für Makler)"]);
    expect(r.karten[1].text).toContain("weniger als 15 Verträge");
    expect(r.satz).toBe("Gelten für die Katzenversicherung (TKV-Katze). Für weitere Produkte nur, wenn sie im Angebot ausdrücklich genannt sind.");
    const aus = garantienFuerEmpfehlung({ ...g, breakEven: { ...g.breakEven, enabled: false } }, { person: "Max", makler: true, produkte: [] });
    expect(aus.karten.map((k) => k.title)).toEqual(["Lead-Garantie"]);
    for (const k of [...r.karten, { title: "", text: r.satz }]) expect(hatGedankenstrich(k.title + k.text)).toBe(false);
  });
});
