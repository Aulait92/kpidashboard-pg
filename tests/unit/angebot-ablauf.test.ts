// Angebot für den Termin (Ole, 19.11.2026): Zeilenstand je Versicherung, Zähler „x von y Beiträgen“, erste offene
// Zeile beim Öffnen und „Weiter: …“ zur nächsten offenen.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ladeTarifkatalog } from "@/lib/tarifkatalog-laden";
import { empfehlungVon, startAuswahl, type Tarifauswahl } from "@/lib/tarifauswahl";
import { beitraegeVollstaendig, ersteOffene, naechsteOffene, preiseStand, zeilenStand } from "@/lib/angebot-ablauf";

const k = ladeTarifkatalog(path.join(__dirname, "..", "fixtures", "tarifkatalog"));
const vertreter = { rolle: "vertreter" as const, gesellschaften: ["allianz"] };

/** Hausrat, Rechtsschutz, Haftpflicht ohne Beiträge */
const auswahl = (): Tarifauswahl => startAuswahl(k, ["hausrat", "rechtsschutz", "haftpflicht"], vertreter);
const beitrag = (a: Tarifauswahl, key: string, n: number | null, zahlweise: "monat" | "jahr" = "monat") => {
  const sp = a.sparten.find((s) => s.key === key)!;
  const e = empfehlungVon(sp)!;
  e.beitrag = n;
  e.zahlweise = zahlweise;
};

describe("Angebot für den Termin", () => {
  it("Zeile ist offen, bis die Empfehlung einen Beitrag hat; andere Tarife sind egal", () => {
    const a = auswahl();
    const hausrat = a.sparten.find((s) => s.key === "hausrat")!;
    expect(zeilenStand(hausrat)).toBe("offen");
    // Beitrag nur bei einem Tarif neben der Empfehlung: bleibt offen
    const andere = hausrat.tarife.find((t) => t.id !== empfehlungVon(hausrat)!.id)!;
    andere.beitrag = 9.9;
    expect(zeilenStand(hausrat)).toBe("offen");
    beitrag(a, "hausrat", 120, "jahr");
    expect(zeilenStand(hausrat)).toBe("fertig");
  });

  it("„bei Bedarf“ zählt nicht mit und blockiert „Fertig“ nicht", () => {
    const a = auswahl();
    a.sparten.find((s) => s.key === "haftpflicht")!.zusatz = true;
    expect(zeilenStand(a.sparten.find((s) => s.key === "haftpflicht")!)).toBe("bedarf");
    expect(preiseStand(a)).toEqual({ fertig: 0, von: 2 });
    beitrag(a, "hausrat", 12.4);
    expect(preiseStand(a)).toEqual({ fertig: 1, von: 2 });
    expect(beitraegeVollstaendig(a)).toBe(false);
    beitrag(a, "rechtsschutz", 21);
    expect(beitraegeVollstaendig(a)).toBe(true);
  });

  it("ohne Versicherung ist nichts fertig", () => {
    expect(beitraegeVollstaendig({ v: 1, sparten: [] })).toBe(false);
    expect(preiseStand({ v: 1, sparten: [] })).toEqual({ fertig: 0, von: 0 });
  });

  it("beim Öffnen die erste Zeile ohne Beitrag, alles fertig: keine", () => {
    const a = auswahl();
    expect(ersteOffene(a)).toBe("hausrat");
    beitrag(a, "hausrat", 12.4);
    expect(ersteOffene(a)).toBe("rechtsschutz");
    beitrag(a, "rechtsschutz", 21);
    beitrag(a, "haftpflicht", 5);
    expect(ersteOffene(a)).toBeNull();
  });

  it("„Weiter“ springt zur nächsten offenen Zeile, danach von vorn, nie auf sich selbst", () => {
    const a = auswahl();
    expect(naechsteOffene(a, "hausrat")).toBe("rechtsschutz");
    beitrag(a, "rechtsschutz", 21);
    expect(naechsteOffene(a, "hausrat")).toBe("haftpflicht");
    expect(naechsteOffene(a, "haftpflicht")).toBe("hausrat");
    beitrag(a, "hausrat", 12.4);
    expect(naechsteOffene(a, "haftpflicht")).toBeNull();
    expect(naechsteOffene(a, null)).toBe("haftpflicht");
  });
});
