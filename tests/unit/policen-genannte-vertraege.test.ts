// Policen-Bitte bei allen Produkten (Ole, 22.11.2026): Die freie Chat-Nachricht und die freie Erinnerung 1 nennen die
// Verträge, die der Lead auf die Vertragsfrage genannt hat („zum Beispiel Haftpflicht bei der Allianz und
// Hausrat“), mit dem angefragten Produkt, ohne Gesundheitssparten ohne Freigabe. Ohne genannte Verträge bleibt der Text
// wie bisher. Die freigegebenen Meta-Vorlagen (Name am Text-Hash) bleiben Wort für Wort gleich.
import { describe, expect, it } from "vitest";
import { chatNachricht, erinnerung1, vorlagenText, type FlowTextKontext } from "@/lib/policen/flow/texte";
import { flowJsonHash } from "@/lib/policen/flow/flow-json";
import { aktuelleVorlagenNamen, vorlagenName, waehleVorlage, type VorlagenStand } from "@/lib/policen/flow/server";
import { andereVertraege, genannteVertraegeBeispiel } from "@/lib/policen/andere-policen";
import { policenBitte } from "@/lib/policen/bitte";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

const SIE: FlowTextKontext = { an: "sie", name: "Herr Kannapinn", pronomen: "er", tag: "Montag", kiFertig: false, gesundheit: false };
const DU: FlowTextKontext = { ...SIE, an: "du", name: "Ole" };
const VV = (liste: { sparte: string; gesellschaft?: string }[]) => ({ at: "x", liste });
const HASH = flowJsonHash();

describe("genannte Verträge bei Nicht-Kfz-Produkten", () => {
  it("Privatschutz: angefragtes Produkt bleibt drin, mit Gesellschaft, ohne Sonstige und Gesundheit ohne Freigabe", () => {
    const vv = VV([{ sparte: "Haftpflicht", gesellschaft: "Allianz" }, { sparte: "Hausrat" }, { sparte: "Zahnzusatz", gesellschaft: "DKV" }, { sparte: "Sonstige" }]);
    expect(andereVertraege(vv, { source: "Privatschutz", mitAngefragt: true })).toEqual(["Haftpflicht bei der Allianz", "Hausrat"]);
    expect(andereVertraege(vv, { source: "Privatschutz", mitAngefragt: true, gesundheitAn: true })).toEqual(["Haftpflicht bei der Allianz", "Hausrat", "Zahnzusatz bei der DKV"]);
    // ohne mitAngefragt (Lesart „andere“) fällt das angefragte Produkt weg
    expect(andereVertraege(vv, { source: "Privatschutz" })).toEqual([]);
    expect(andereVertraege(VV([{ sparte: "Tierkranken", gesellschaft: "Uelzener" }, { sparte: "Tierhalterhaftpflicht" }]), { source: "Hundekrankenversicherung", mitAngefragt: true })).toEqual([
      "Tierhalterhaftpflicht",
      "Tierkrankenversicherung bei der Uelzener",
    ]);
  });

  it("Aufzählung ohne Ihre/deine (22.11.2026)", () => {
    expect(genannteVertraegeBeispiel("sie", ["Haftpflicht bei der Allianz"])).toBe("Haftpflicht bei der Allianz");
    expect(genannteVertraegeBeispiel("du", ["Haftpflicht bei der Allianz", "Hausrat"])).toBe("Haftpflicht bei der Allianz und Hausrat");
    expect(genannteVertraegeBeispiel("sie", ["A", "B", "C", "D"])).toBe("A, B und C");
    expect(genannteVertraegeBeispiel("sie", [])).toBeNull();
    expect(genannteVertraegeBeispiel("sie", null)).toBeNull();
  });

  it("Chat-Nachricht Privatschutz in Sie und Du", () => {
    const mit = { genannteVertraege: ["Haftpflicht bei der Allianz", "Hausrat"] };
    expect(chatNachricht({ ...SIE, ...mit }).text).toContain(
      "Wenn Herr Kannapinn Ihre Policen vorab hat, zum Beispiel Haftpflicht bei der Allianz und Hausrat, sieht er schon vor dem Termin, *ob Sie etwas doppelt zahlen",
    );
    expect(chatNachricht({ ...DU, ...mit }).text).toContain("Wenn Ole deine Policen vorab hat, zum Beispiel Haftpflicht bei der Allianz und Hausrat, sieht er schon vor dem Termin, *ob du etwas doppelt zahlst");
    // ohne genannte Verträge unverändert
    expect(chatNachricht(SIE).text).toContain("Wenn Herr Kannapinn Ihre Policen vorab hat, sieht er schon vor dem Termin,");
    expect(chatNachricht({ ...SIE, genannteVertraege: [] })).toEqual(chatNachricht(SIE));
  });

  it("Chat-Nachricht Tier und Erinnerung 1", () => {
    const tier = { ...SIE, genannteVertraege: ["Tierhalterhaftpflicht bei der Uelzener"] };
    expect(chatNachricht(tier).text).toContain("Ihre Policen vorab hat, zum Beispiel Tierhalterhaftpflicht bei der Uelzener, sieht er");
    expect(erinnerung1(tier).text).toBe(
      "Kurze Frage zu Ihrem Termin am Montag: Haben Sie Ihre Policen gerade zur Hand, zum Beispiel Tierhalterhaftpflicht bei der Uelzener? Meist reicht ein Foto der ersten Seite. Dann sieht Herr Kannapinn vorab, wann Sie kündigen können und ob Sie etwas doppelt zahlen.",
    );
    expect(erinnerung1({ ...DU, genannteVertraege: ["Hausrat"] }).text).toContain("Hast du deine Policen gerade zur Hand, zum Beispiel Hausrat?");
    expect(erinnerung1({ ...SIE, genannteVertraege: [] })).toEqual(erinnerung1(SIE));
  });

  it("Kfz unverändert: genannteVertraege wirkt dort nicht", () => {
    const kfz = { ...SIE, kfz: true };
    expect(chatNachricht({ ...kfz, genannteVertraege: ["Hausrat"] })).toEqual(chatNachricht(kfz));
    expect(erinnerung1({ ...kfz, genannteVertraege: ["Hausrat"] })).toEqual(erinnerung1(kfz));
  });

  it("ohne Gedankenstriche und unter 1.024 Zeichen", () => {
    const lang = ["Private Krankenversicherung bei der Allianz Private Krankenversicherungs-AG", "Hausrat bei der Württembergische", "Rechtsschutz bei der ARAG"];
    for (const k of [SIE, DU]) {
      for (const t of [chatNachricht({ ...k, genannteVertraege: lang }).text, erinnerung1({ ...k, genannteVertraege: lang }).text]) {
        expect(hatGedankenstrich(t)).toBe(false);
        expect(t.length).toBeLessThanOrEqual(1024);
        expect(t).not.toMatch(/Garantie/i);
      }
    }
  });

  it("Bitte ohne Formular nennt Verträge mit Gesellschaft", () => {
    const b = policenBitte({ an: "sie", vermittler: { nom: "Herr Kannapinn", dat: "Herrn Kannapinn", anrede: "Herr" }, vertraege: ["Haftpflicht bei der Allianz", "Hausrat"] });
    expect(b.text).toContain("egal ob Haftpflicht bei der Allianz oder Hausrat.");
  });
});

describe("Meta-Vorlagen unverändert", () => {
  it("Namen der allgemeinen Vorlagen (Text-Hash) wie vor der Änderung", () => {
    expect(aktuelleVorlagenNamen(HASH).filter((n) => /_(bitte|erinn1)_[0-9a-f]{6}_/.test(n))).toEqual([
      `pg_policen_bitte_${HASH.slice(0, 6)}_686b_sie`,
      `pg_policen_bitte_${HASH.slice(0, 6)}_98fc_du`,
      `pg_policen_erinn1_${HASH.slice(0, 6)}_42eb_sie`,
      `pg_policen_erinn1_${HASH.slice(0, 6)}_1a1f_du`,
    ]);
    expect(vorlagenText("bitte", "sie").text).not.toMatch(/zum Beispiel/);
    expect(vorlagenText("erinnerung1", "du").text).not.toMatch(/zum Beispiel/);
  });

  it("im Fenster mit genannten Verträgen die freie Nachricht, sonst wie bisher die Vorlage", () => {
    const stand = (namen: string[]): VorlagenStand => Object.fromEntries(namen.map((n) => [n, { status: "approved", category: "UTILITY" }])) as VorlagenStand;
    const alle = stand((["bitte", "erinnerung1", "erinnerung2"] as const).map((a) => vorlagenName(a, "sie", HASH)));
    const basis = { an: "sie" as const, jsonHash: HASH, vorlagen: alle };
    const mit = { ...SIE, genannteVertraege: ["Hausrat"] };
    expect(waehleVorlage("bitte", mit, { ...basis, fensterOffen: true })).toEqual({ weg: "flow" });
    expect(waehleVorlage("erinnerung1", mit, { ...basis, fensterOffen: true })).toEqual({ weg: "flow" });
    expect(waehleVorlage("erinnerung2", mit, { ...basis, fensterOffen: true })).toMatchObject({ weg: "vorlage", art: "erinnerung2" });
    expect(waehleVorlage("bitte", SIE, { ...basis, fensterOffen: true })).toMatchObject({ weg: "vorlage", art: "bitte" });
    // Fenster zu: nur die Vorlage geht (ohne Verträge)
    expect(waehleVorlage("bitte", mit, { ...basis, fensterOffen: false })).toMatchObject({ weg: "vorlage", art: "bitte" });
  });
});
