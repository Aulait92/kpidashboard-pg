import { describe, expect, it } from "vitest";
import { anrufLaeuft, anstossNachTelefonat, bedarfFelder, bedarfStand, felderMit, offenePunkte, CALL_PAUSE_MAX_MS } from "@/lib/telefonat";

const now = new Date("2026-11-17T10:00:00Z");

describe("Telefonat: Pause des Assistenten", () => {
  it("läuft nach „Anrufen“ bis zum Ergebnis, höchstens 12 Stunden", () => {
    expect(anrufLaeuft({ callStartedAt: null }, now)).toBe(false);
    expect(anrufLaeuft({ callStartedAt: new Date(now.getTime() - 5 * 60_000) }, now)).toBe(true);
    expect(anrufLaeuft({ callStartedAt: new Date(now.getTime() - CALL_PAUSE_MAX_MS + 1000) }, now)).toBe(true);
    expect(anrufLaeuft({ callStartedAt: new Date(now.getTime() - CALL_PAUSE_MAX_MS - 1000) }, now)).toBe(false);
    expect(anrufLaeuft(null, now)).toBe(false);
  });
});

describe("Telefonat: Bedarf strukturiert", () => {
  it("Privatschutz: Punkte je Sparte, Bekanntes aus Chat und Formular vorbelegt, „offen“ zählt als offen", () => {
    const f = bedarfFelder({
      produkt: "Privatschutz",
      formular: [
        { label: "Versicherungsinteresse", value: "Haftpflicht, Hausrat" },
        { label: "Lebenssituation", value: "Familie mit Kindern" },
      ],
      angaben: { versichern: "Familie", geburt: "offen" },
    });
    const keys = f.map((x) => x.key);
    expect(keys).toEqual(["lebenssituation", "versichern", "geburt", "vorhanden", "wohnflaeche", "beruf", "vorschaeden"]);
    expect(f.find((x) => x.key === "lebenssituation")!.wert).toBe("Familie mit Kindern");
    expect(f.find((x) => x.key === "versichern")!.wert).toBe("Familie");
    expect(f.find((x) => x.key === "geburt")!.wert).toBeNull();
    // Rechtsschutz nicht gefragt: keine Rechtsschutz-Bereiche
    expect(keys).not.toContain("bereiche");
    expect(offenePunkte(f)).toEqual(["Geburtsdatum", "Bestehende Verträge", "Wohnfläche, ständig bewohnt", "Beruf", "Vorschäden (5 Jahre)"]);
  });

  it("Tierkrankenversicherung: Tier, Schutz, Halter, Vorversicherung", () => {
    const f = bedarfFelder({ produkt: "TKV-Katze", formular: [], angaben: { tarifwunsch: "nur OP" } });
    expect(f.map((x) => x.key)).toEqual(["tier", "tarifwunsch", "geburt", "vorhanden"]);
    expect(offenePunkte(f)).not.toContain("Gewünschter Schutz (OP oder voll)");
  });

  it("andere Produkte: allgemeine Punkte", () => {
    const f = bedarfFelder({ produkt: "Baufinanzierung", formular: [], angaben: null });
    expect(f.map((x) => x.key)).toEqual(["interesse", "lebenssituation", "vorhanden", "anlass", "einwaende"]);
  });

  it("Stand ohne Auswahl: alles erfasst = komplett, etwas = teilweise, nichts = nein; Auswahl hat Vorrang", () => {
    const f = bedarfFelder({ produkt: "TKV-Katze", formular: [], angaben: { tarifwunsch: "nur OP", vorhanden: "keine" } });
    expect(bedarfStand(f, {})).toBe("nein");
    expect(bedarfStand(f, { geburt: "1.2.1990" })).toBe("teilweise");
    expect(bedarfStand(f, { geburt: "1.2.1990", tier: "Katze Bernd, gesund" })).toBe("komplett");
    expect(bedarfStand(f, { geburt: "offen" })).toBe("nein");
    expect(bedarfStand(f, {}, "komplett")).toBe("komplett");
    expect(offenePunkte(felderMit(f, { geburt: "1.2.1990" }))).toEqual(["Tiere und Gesundheit (24 Monate)"]);
  });
});

describe("Telefonat: Anstoß für den Assistenten", () => {
  it("Bezug aufs Telefonat, Termin, nur die offenen Punkte; ohne Angaben vorsichtig", () => {
    const t = anstossNachTelefonat({ berater: "Susanne", termin: new Date("2026-11-20T09:00:00Z"), offen: ["Geburtsdatum", "Wohnfläche"], stand: null });
    expect(t).toContain("Wie besprochen sehen wir uns am");
    expect(t).toContain("Frag NUR diese noch offenen Punkte");
    expect(t).toContain("Geburtsdatum; Wohnfläche");
    expect(t).toContain("erfinde nichts");
    expect(anstossNachTelefonat({ berater: "Susanne", termin: null, offen: ["Beruf"], stand: "teilweise" })).toContain("schon geklärt");
    expect(anstossNachTelefonat({ berater: "Susanne", termin: null, offen: ["Beruf"], stand: "nein" })).toContain("nur der Termin vereinbart");
  });
});
