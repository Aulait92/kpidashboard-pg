// Erinnerung 1 an Kfz-Leads und Kfz-Vorlagen (Ole, 22.11.2026): Fahrzeugschein und letzte Rechnung wie die Kfz-Bitte,
// andere Policen nur bei Komplettcheck Ja bzw. genannten Verträgen, Knopf „Unterlagen senden“. Im Fenster die
// Flow-Nachricht, außerhalb die Kfz-Vorlage, bis zur Freigabe die allgemeine. Bestehende Vorlagennamen, Flow JSON und
// Einwilligung bleiben unverändert.
import { describe, expect, it } from "vitest";
import {
  chatNachricht,
  erinnerung1,
  erinnerungFusszeile,
  flowKnopf,
  formularDaten,
  formularWortlaut,
  KNOPF_NEIN_DANKE,
  KNOPF_POLICEN_SENDEN,
  KNOPF_SPAETER,
  KNOPF_UNTERLAGEN_SENDEN,
  kfzVorlagenArt,
  textHash,
  vorlageGerendert,
  vorlagenParameter,
  vorlagenText,
  VORLAGEN_ARTEN_KFZ,
  type FlowTextKontext,
  type VorlagenArt,
} from "@/lib/policen/flow/texte";
import { flowJsonHash } from "@/lib/policen/flow/flow-json";
import { aktuelleVorlagenNamen, VORLAGEN_ARTEN, vorlagenAntrag, vorlagenName, waehleVorlage, type VorlagenStand } from "@/lib/policen/flow/server";
import { policenVortagSatz } from "@/lib/whatsapp/termin-strecke";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

const KFZ: FlowTextKontext = { an: "sie", name: "Herr Kannapinn", pronomen: "er", tag: "Montag", kiFertig: false, gesundheit: false, kfz: true };
const KFZ_DU: FlowTextKontext = { ...KFZ, an: "du", name: "Ole" };
const MIT: Partial<FlowTextKontext> = { andereVertraege: ["Haftpflicht bei Allianz"], komplettcheck: true };
const HASH = flowJsonHash();

describe("Erinnerung 1 an Kfz-Leads", () => {
  it("Sie ohne andere Verträge", () => {
    expect(erinnerung1(KFZ)).toEqual({
      text: "Kurze Frage zu Ihrem Termin am Montag: Haben Sie Ihren Fahrzeugschein und die letzte Rechnung Ihrer Kfz-Versicherung gerade zur Hand? Je ein Foto reicht (beim Fahrzeugschein die Vorderseite). Dann kann Herr Kannapinn Ihren Beitrag schon vor dem Termin rechnen.",
      fusszeile: "Kein Interesse? Tippen Sie „Nein, danke“ oder STOP.",
    });
    expect(erinnerung1({ ...KFZ, komplettcheck: false }).text).not.toMatch(/anderen Policen/);
  });

  it("Sie mit genannten Verträgen, Du mit Komplettcheck ohne genannte Verträge", () => {
    expect(erinnerung1({ ...KFZ, ...MIT }).text).toBe(
      "Kurze Frage zu Ihrem Termin am Montag: Haben Sie Ihren Fahrzeugschein und die letzte Rechnung Ihrer Kfz-Versicherung gerade zur Hand? Je ein Foto reicht (beim Fahrzeugschein die Vorderseite). Dann kann Herr Kannapinn Ihren Beitrag schon vor dem Termin rechnen.\n\n*Gern auch Ihre anderen Policen*, zum Beispiel Ihre Haftpflicht bei Allianz. Dann sieht er auch, ob Sie etwas doppelt zahlen.",
    );
    expect(erinnerung1({ ...KFZ_DU, komplettcheck: true })).toEqual({
      text: "Kurze Frage zu deinem Termin am Montag: Hast du deinen Fahrzeugschein und die letzte Rechnung deiner Kfz-Versicherung gerade zur Hand? Je ein Foto reicht (beim Fahrzeugschein die Vorderseite). Dann kann Ole deinen Beitrag schon vor dem Termin rechnen.\n\n*Gern auch deine anderen Policen*, zum Beispiel Haftpflicht oder Hausrat. Dann sieht er auch, ob du etwas doppelt zahlst.",
      fusszeile: erinnerungFusszeile("du"),
    });
    // Nie Kfz als „andere“ Police, ohne Pronomen der Name
    expect(erinnerung1({ ...KFZ, komplettcheck: true }).text).not.toMatch(/zum Beispiel[^.]*Kfz/);
    expect(erinnerung1({ ...KFZ, ...MIT, pronomen: null }).text).toContain("Dann sieht Herr Kannapinn auch, ob Sie");
  });

  it("Sie und Du sauber getrennt, ohne Gedankenstriche, Meta-Grenzen", () => {
    const lang = { ...KFZ, ...MIT, name: "Frau Mustermann-Langenscheidt", tag: "Donnerstag, 26.11.", andereVertraege: ["Private Krankenversicherung bei Allianz Private Krankenversicherungs-AG", "Hausrat bei Württembergische", "Rechtsschutz bei ARAG"] };
    for (const k of [KFZ, { ...KFZ, ...MIT }, lang]) {
      const t = erinnerung1(k).text;
      expect(t).not.toMatch(/\b(du|dein(e[nmr]?)?|dich|dir)\b/);
      expect(hatGedankenstrich(t)).toBe(false);
      expect(t.length).toBeLessThanOrEqual(1024);
    }
    for (const k of [KFZ_DU, { ...KFZ_DU, ...MIT }]) {
      const t = erinnerung1(k).text;
      expect(t).not.toMatch(/\b(Sie|Ihre[nmr]?|Ihnen)\b/);
      expect(hatGedankenstrich(t)).toBe(false);
    }
  });

  it("ohne Kfz bleibt Erinnerung 1 wie bisher, Knopf „Unterlagen senden“ nur für Kfz", () => {
    expect(erinnerung1({ ...KFZ, kfz: false, ...MIT }).text).toBe(
      "Kurze Frage zu Ihrem Termin am Montag: Haben Sie Ihre Policen gerade zur Hand? Meist reicht ein Foto der ersten Seite. Dann sieht Herr Kannapinn vorab, wann Sie kündigen können und ob Sie etwas doppelt zahlen.",
    );
    expect(flowKnopf(KFZ)).toBe(KNOPF_UNTERLAGEN_SENDEN);
    expect(flowKnopf({ kfz: false })).toBe(KNOPF_POLICEN_SENDEN);
  });
});

describe("Kfz-Vorlagen", () => {
  it("Art je Lead: ohne bzw. mit anderen Policen, nur Bitte und Erinnerung 1", () => {
    expect(kfzVorlagenArt("erinnerung1", KFZ)).toBe("erinnerung1_kfz");
    expect(kfzVorlagenArt("erinnerung1", { ...KFZ, ...MIT })).toBe("erinnerung1_kfz_andere");
    expect(kfzVorlagenArt("bitte", { ...KFZ, komplettcheck: true })).toBe("bitte_kfz_andere");
    expect(kfzVorlagenArt("bitte", KFZ)).toBe("bitte_kfz");
    expect(kfzVorlagenArt("erinnerung2", KFZ)).toBeNull();
    expect(kfzVorlagenArt("bitte", { ...KFZ, kfz: false })).toBeNull();
  });

  it("Meta-Grenzen: Text 1.024, Fußzeile 60, Knöpfe, Platzhalter fortlaufend und nicht am Rand, Beispiele passen", () => {
    for (const art of VORLAGEN_ARTEN_KFZ) {
      for (const an of ["sie", "du"] as const) {
        const t = vorlagenText(art, an);
        expect(t.text.length).toBeLessThanOrEqual(1024);
        expect((t.fusszeile ?? "").length).toBeLessThanOrEqual(60);
        expect(t.text).not.toMatch(/^\s*\{\{|\}\}\s*$/);
        expect(hatGedankenstrich(t.text)).toBe(false);
        // Platzhalter in der Reihenfolge des ersten Auftretens 1, 2, 3 …
        const erste = [...new Set([...t.text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))];
        expect(erste).toEqual(erste.map((_, i) => i + 1));
        expect(t.beispiele.length).toBe(erste.length);
        expect(vorlagenParameter(art, an === "du" ? KFZ_DU : KFZ).length).toBe(erste.length);
        expect(t.knopf1).toBe(KNOPF_UNTERLAGEN_SENDEN);
        expect(t.knopf2).toBe(art.startsWith("bitte") ? KNOPF_SPAETER : KNOPF_NEIN_DANKE);
        const req = vorlagenAntrag(art, an, { flowId: "123", jsonHash: HASH });
        expect(req.name).toMatch(/^pg_policen_(bitte_kfz|bitte_kfz_andere|erinn1_kfz|erinn1_kfz_andere)_e19b92_[0-9a-f]{4}_(sie|du)$/);
        expect(req.category).toBe("UTILITY");
        const buttons = (req.components.find((c) => c.type === "BUTTONS") as { buttons: { type: string; text: string }[] }).buttons;
        expect(buttons.map((b) => [b.type, b.text])).toEqual([
          ["FLOW", KNOPF_UNTERLAGEN_SENDEN],
          ["QUICK_REPLY", t.knopf2],
        ]);
        expect(buttons.every((b) => b.text.length <= 25)).toBe(true);
      }
    }
  });

  it("gerendert: Erinnerung 1 genau wie die Nachricht im Fenster, Bitte bis auf „im Komplettcheck“", () => {
    for (const k of [KFZ, KFZ_DU, { ...KFZ, ...MIT }, { ...KFZ_DU, komplettcheck: true }, { ...KFZ, ...MIT, pronomen: null }]) {
      const e = vorlageGerendert(kfzVorlagenArt("erinnerung1", k)!, k);
      expect(e).toEqual(erinnerung1(k));
      const b = vorlageGerendert(kfzVorlagenArt("bitte", k)!, k);
      expect(`${b.text}\n\n${b.fusszeile}`).toBe(chatNachricht(k).text.replace(" im Komplettcheck", ""));
    }
    expect(vorlageGerendert("bitte_kfz_andere", { ...KFZ, ...MIT }).text).toContain("*Laden Sie gern auch Ihre anderen Policen hoch*, zum Beispiel Ihre Haftpflicht bei Allianz. Dann sieht er, ob Sie etwas doppelt zahlen.");
    expect(vorlageGerendert("bitte_kfz", KFZ).fusszeile).toBe("Ihr Termin findet auch ohne Unterlagen statt.");
  });

  it("bestehende Vorlagen unverändert (Namen und Antrag), neue Arten nur angehängt, Flow JSON gleich", () => {
    expect(HASH).toBe("e19b92080615af92b80f453defec461979210cc33cb0cb67a43ee1fbc9f97c48");
    const bisher: [VorlagenArt, "sie" | "du", string][] = [
      ["bitte", "sie", "pg_policen_bitte_e19b92_686b_sie"],
      ["bitte", "du", "pg_policen_bitte_e19b92_98fc_du"],
      ["erinnerung1", "sie", "pg_policen_erinn1_e19b92_42eb_sie"],
      ["erinnerung1", "du", "pg_policen_erinn1_e19b92_1a1f_du"],
      ["erinnerung2", "sie", "pg_policen_erinn2_e19b92_f919_sie"],
      ["erinnerung2", "du", "pg_policen_erinn2_e19b92_b0e4_du"],
    ];
    for (const [art, an, name] of bisher) {
      expect(vorlagenName(art, an, HASH)).toBe(name);
      const buttons = (vorlagenAntrag(art, an, { flowId: "1", jsonHash: HASH }).components.find((c) => c.type === "BUTTONS") as { buttons: { text: string }[] }).buttons;
      expect(buttons[0].text).toBe(KNOPF_POLICEN_SENDEN);
    }
    const namen = aktuelleVorlagenNamen(HASH);
    expect(namen.slice(0, 4)).toEqual(bisher.slice(0, 4).map((x) => x[2]));
    expect(VORLAGEN_ARTEN).toEqual(["bitte", "erinnerung1", ...VORLAGEN_ARTEN_KFZ]);
    expect(namen.length).toBe(12);
    expect(new Set(namen).size).toBe(12);
    // Einwilligung im Formular für Kfz genau wie für alle (kein neuer Wortlaut)
    const u = "https://x.de/d";
    expect(textHash(formularWortlaut(formularDaten({ ...KFZ, ...MIT }, u)))).toBe(textHash(formularWortlaut(formularDaten({ ...KFZ, kfz: false }, u))));
  });
});

describe("Wahl beim Senden", () => {
  const st = (namen: string[], o: { status?: string; category?: string } = {}): VorlagenStand =>
    Object.fromEntries(namen.map((n) => [n, { status: o.status ?? "approved", category: o.category ?? "utility", grund: null }]));
  const name = (art: VorlagenArt, an: "sie" | "du" = "sie") => vorlagenName(art, an, HASH);
  const alle = st([...VORLAGEN_ARTEN, "erinnerung2" as const].map((a) => name(a)));
  const basis = { an: "sie" as const, jsonHash: HASH };

  it("Kfz im Fenster: freigegebene Kfz-Vorlage (beide Knöpfe), sonst Flow-Nachricht, nie die allgemeine Vorlage", () => {
    for (const art of ["bitte", "erinnerung1"] as const) {
      const r = waehleVorlage(art, KFZ, { ...basis, fensterOffen: true, vorlagen: alle });
      expect(r && r.weg === "vorlage" && r.art.endsWith("_kfz") || (r && r.weg === "vorlage" && r.art.includes("_kfz"))).toBe(true);
      const nurAllgemein = st([name(art)]);
      expect(waehleVorlage(art, KFZ, { ...basis, fensterOffen: true, vorlagen: nurAllgemein })).toEqual({ weg: "flow" });
    }
  });

  it("Kfz außerhalb: freigegebene Kfz-Vorlage passend zu den anderen Policen", () => {
    expect(waehleVorlage("erinnerung1", KFZ, { ...basis, fensterOffen: false, vorlagen: alle })).toEqual({ weg: "vorlage", art: "erinnerung1_kfz", name: name("erinnerung1_kfz") });
    expect(waehleVorlage("erinnerung1", { ...KFZ, ...MIT }, { ...basis, fensterOffen: false, vorlagen: alle })).toEqual({ weg: "vorlage", art: "erinnerung1_kfz_andere", name: name("erinnerung1_kfz_andere") });
    expect(waehleVorlage("bitte", { ...KFZ, ...MIT }, { ...basis, fensterOffen: false, vorlagen: alle })).toEqual({ weg: "vorlage", art: "bitte_kfz_andere", name: name("bitte_kfz_andere") });
    // Außerhalb zählt auch eine als Marketing eingestufte Vorlage
    expect(waehleVorlage("erinnerung1", KFZ, { ...basis, fensterOffen: false, vorlagen: st([name("erinnerung1_kfz")], { category: "marketing" }) })).toMatchObject({ art: "erinnerung1_kfz" });
  });

  it("Kfz außerhalb, Kfz-Vorlage noch nicht freigegeben bzw. abgelehnt: allgemeine Vorlage wie bisher, sonst nichts", () => {
    const offen = { ...st([name("erinnerung1")]), ...st([name("erinnerung1_kfz")], { status: "pending" }) };
    expect(waehleVorlage("erinnerung1", KFZ, { ...basis, fensterOffen: false, vorlagen: offen })).toEqual({ weg: "vorlage", art: "erinnerung1", name: name("erinnerung1") });
    const abgelehnt = { ...st([name("bitte")]), ...st([name("bitte_kfz")], { status: "rejected" }) };
    expect(waehleVorlage("bitte", KFZ, { ...basis, fensterOffen: false, vorlagen: abgelehnt })).toEqual({ weg: "vorlage", art: "bitte", name: name("bitte") });
    expect(waehleVorlage("erinnerung1", KFZ, { ...basis, fensterOffen: false, vorlagen: {} })).toBeNull();
  });

  it("ohne Kfz unverändert: Vorlage zuerst (im Fenster nur UTILITY), sonst Flow im Fenster, außerhalb nichts", () => {
    const k = { ...KFZ, kfz: false };
    expect(waehleVorlage("erinnerung1", k, { ...basis, fensterOffen: true, vorlagen: alle })).toEqual({ weg: "vorlage", art: "erinnerung1", name: name("erinnerung1") });
    expect(waehleVorlage("erinnerung1", k, { ...basis, fensterOffen: true, vorlagen: st([name("erinnerung1")], { category: "marketing" }) })).toEqual({ weg: "flow" });
    expect(waehleVorlage("bitte", k, { ...basis, fensterOffen: false, vorlagen: st([name("bitte")], { category: "marketing" }) })).toMatchObject({ art: "bitte" });
    expect(waehleVorlage("bitte", k, { ...basis, fensterOffen: false, vorlagen: {} })).toBeNull();
    expect(waehleVorlage("weitere", k, { ...basis, fensterOffen: true, vorlagen: alle })).toEqual({ weg: "flow" });
    expect(waehleVorlage("weitere", k, { ...basis, fensterOffen: false, vorlagen: alle })).toBeNull();
    // Du-Lead nutzt die Du-Vorlage
    expect(waehleVorlage("erinnerung1", KFZ_DU, { an: "du", jsonHash: HASH, fensterOffen: false, vorlagen: st([name("erinnerung1_kfz", "du")]) })).toMatchObject({ art: "erinnerung1_kfz", name: name("erinnerung1_kfz", "du") });
  });
});

describe("Vortags-Satz für Kfz", () => {
  it("„Unterlagen“ statt „Policen“, sonst unverändert", () => {
    expect(policenVortagSatz("sie", { nom: "Herr Kannapinn" }, true)).toBe(
      "Wenn Sie mögen, schicken Sie vorab Ihre Unterlagen hier in den Chat (Fotos reichen), dann kann sich Herr Kannapinn schon vorbereiten. Geht aber auch ohne.",
    );
    expect(policenVortagSatz("du", { nom: "Ole" }, true)).toBe("Wenn du magst, schick vorab deine Unterlagen hier in den Chat (Fotos reichen), dann kann sich Ole schon vorbereiten. Geht aber auch ohne.");
    expect(policenVortagSatz("sie", { nom: "Herr Kannapinn" })).toBe(
      "Wenn Sie mögen, schicken Sie vorab Ihre Policen hier in den Chat (ein Foto reicht), dann kann sich Herr Kannapinn schon vorbereiten. Geht aber auch ohne.",
    );
  });
});
