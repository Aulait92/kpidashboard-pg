// Policen auslesen (Ole, 18.11.2026): Schema, Nachfilter (Gesundheitsangaben, Whitelist, Maskierung), Sparte vorab,
// Schalter und Zusammenfassung des Vergleichsblatts. Rein, ohne Datenbank und ohne KI.
import { describe, expect, it } from "vitest";
import {
  auslesenSchema,
  bereinige,
  FELDER,
  felderFuer,
  hatGesundheitsbegriff,
  korrigiere,
  maskiereNummer,
  monatsbetrag,
  normDatum,
  type Felder,
} from "@/lib/policen/auslesen/felder";
import {
  auslesenAn,
  auslesenKonfigStatus,
  freigegebeneSparten,
  maxProTag,
  OPENAI_EU_BASE_URL,
  openAiEu,
  schluesselFinger,
  tageBisAblauf,
  textVersionDecktKi,
  textVersionKi,
} from "@/lib/policen/auslesen/konfig";
import { sparteVorab, spartenImText } from "@/lib/policen/auslesen/sparte";
import { naechsteKuendigung, zusammenfassung } from "@/lib/policen/auslesen/zusammenfassung";
import { AUSLESEN_SYSTEM } from "@/lib/policen/auslesen/prompt";
import { ohneGedankenstriche } from "@/lib/gedankenstriche";

const GESUNDHEITS_FELD_RE = /zuschlag|ausschlu|diagnos|vorerkrank|gewicht|groesse|größe|raucher|gesundheit|krankheit|bmi/i;

describe("Schema", () => {
  it("strikt: alle Felder Pflicht, keine Zusatzfelder, keine Gesundheitsfelder, kein Freitext-Feld", () => {
    const s = auslesenSchema() as { properties: { felder: { properties: Record<string, unknown>; required: string[]; additionalProperties: boolean } }; required: string[]; additionalProperties: boolean };
    expect(s.additionalProperties).toBe(false);
    expect(s.required).toEqual(["sparte", "felder", "unsicher"]);
    const keys = Object.keys(s.properties.felder.properties);
    expect(s.properties.felder.required.sort()).toEqual([...keys].sort());
    expect(s.properties.felder.additionalProperties).toBe(false);
    for (const k of keys) expect(k).not.toMatch(GESUNDHEITS_FELD_RE);
    expect(keys).not.toContain("bemerkungen");
    expect(keys).not.toContain("notiz");
  });

  it("alle geforderten Felder je Sparte", () => {
    const k = (s: Parameters<typeof felderFuer>[0]) => felderFuer(s).map((f) => f.key);
    for (const s of ["haftpflicht", "hausrat", "kfz", "wohngebaeude", "rechtsschutz", "pkv", "bu", "leben"] as const) {
      expect(k(s)).toEqual(expect.arrayContaining(["versicherer", "tarifname", "versicherungsnummer", "beitrag", "zahlweise", "beginn", "ablauf", "kuendigungsfrist_monate", "naechster_kuendigungstermin"]));
    }
    expect(k("hausrat")).toEqual(expect.arrayContaining(["versicherungssumme", "wohnflaeche", "unterversicherungsverzicht", "elementar", "fahrrad", "selbstbeteiligung"]));
    expect(k("haftpflicht")).toEqual(expect.arrayContaining(["deckungssumme", "umfang", "schluesselverlust", "forderungsausfall"]));
    expect(k("kfz")).toEqual(expect.arrayContaining(["sf_haftpflicht", "sf_kasko", "kasko", "fahrleistung", "werkstattbindung"]));
    expect(k("wohngebaeude")).toEqual(expect.arrayContaining(["versicherungssumme", "wert_1914", "elementar"]));
    expect(k("rechtsschutz")).toContain("bausteine");
    expect(k("pkv")).toEqual(expect.arrayContaining(["tarifname", "selbstbehalt", "krankentagegeld"]));
    expect(k("bu")).toEqual(expect.arrayContaining(["monatsrente", "endalter", "dynamik"]));
    expect(k("leben")).toEqual(expect.arrayContaining(["versicherungssumme", "rente_monatlich", "endalter"]));
    expect(k("pkv")).not.toContain("deckungssumme");
  });

  it("Anweisung verbietet Gesundheitsangaben ausdrücklich", () => {
    expect(AUSLESEN_SYSTEM).toMatch(/niemals Gesundheitsangaben/);
    expect(AUSLESEN_SYSTEM).toMatch(/Risikozuschläge, Leistungsausschlüsse, Diagnosen, Vorerkrankungen/);
    expect(AUSLESEN_SYSTEM).toMatch(/Größe, Gewicht oder Rauchen/);
  });
});

describe("Nachfilter", () => {
  it("„böse“ PKV-Antwort: Zuschlag, Ausschluss und Diagnose verschwinden, Vertragsfelder bleiben", () => {
    const boese = {
      sparte: "pkv",
      felder: {
        versicherer: "Musterkasse Kranken AG",
        tarifname: "Komfort 600 mit Risikozuschlag 30 %",
        versicherungsnummer: "KV-2024-889977",
        beitrag: 612.4,
        zahlweise: "monatlich",
        beginn: "01.01.2020",
        selbstbehalt: 600,
        krankentagegeld: 100,
        deckungssumme: 5000000, // falsche Sparte
        risikozuschlag: 45.5,
        leistungsausschluss: "Wirbelsäule",
      },
      unsicher: ["krankentagegeld"],
      diagnosen: ["F32.1"],
      vorerkrankungen: "Rückenleiden",
    };
    const b = bereinige(boese, "pkv");
    expect(b.sparte).toBe("pkv");
    expect(Object.keys(b.felder).sort()).toEqual(["beginn", "beitrag", "krankentagegeld", "selbstbehalt", "versicherer", "versicherungsnummer", "zahlweise"]);
    expect(b.felder.versicherungsnummer.w).toBe("…9977");
    expect(b.felder.beginn.w).toBe("2020-01-01");
    expect(b.felder.krankentagegeld.s).toBe("pruefen");
    expect(b.verworfen).toBeGreaterThanOrEqual(5);
    const json = JSON.stringify(b);
    for (const w of ["zuschlag", "Zuschlag", "Wirbelsäule", "F32", "Rücken", "889977", "deckungssumme"]) expect(json).not.toContain(w);
  });

  it("Typen werden geprüft, SF-Klassen normiert, Listen nur bekannte Werte", () => {
    const b = bereinige(
      { sparte: "kfz", felder: { beitrag: "abc", sf_haftpflicht: "sf12", sf_kasko: "SF 8", kasko: "superkasko", fahrleistung: 12000.4, werkstattbindung: "ja", ablauf: "31.02.2027" }, unsicher: [] },
      "kfz",
    );
    expect(b.felder).toEqual({ sf_haftpflicht: { w: "SF 12", s: "ok" }, sf_kasko: { w: "SF 8", s: "ok" }, fahrleistung: { w: 12000, s: "ok" } });
    const r = bereinige({ sparte: "rechtsschutz", felder: { bausteine: ["privat", "verkehr", "krankheit"] }, unsicher: [] }, "rechtsschutz");
    expect(r.felder.bausteine.w).toEqual(["privat", "verkehr"]);
  });

  it("Maskierung, Daten, Gesundheitsbegriffe", () => {
    expect(maskiereNummer("12 345 678")).toBe("…5678");
    expect(maskiereNummer("12")).toBeNull();
    expect(normDatum("2027-03-01")).toBe("2027-03-01");
    expect(normDatum("1.3.2027")).toBe("2027-03-01");
    expect(normDatum("1800-01-01")).toBeNull();
    expect(hatGesundheitsbegriff("Leistungsausschluss Knie")).toBe(true);
    expect(hatGesundheitsbegriff("HUK-Coburg")).toBe(false);
    expect(hatGesundheitsbegriff("Barmenia Krankenversicherung")).toBe(false);
  });

  it("Korrektur des Vermittlers nutzt dieselben Regeln", () => {
    const alt: Felder = { beitrag: { w: 100, s: "ok" }, zahlweise: { w: "jaehrlich", s: "pruefen" } };
    const neu = korrigiere(alt, { beitrag: "120,50", tarifname: "Basis mit Zuschlag", versicherungsnummer: "AB1234567", risikozuschlag: 3, elementar: true }, "haftpflicht");
    expect(neu.beitrag).toEqual({ w: 120.5, s: "korrigiert" });
    expect(neu.tarifname).toBeUndefined();
    expect(neu.versicherungsnummer.w).toBe("…4567");
    expect(neu).not.toHaveProperty("risikozuschlag");
    expect(neu).not.toHaveProperty("elementar"); // nicht Haftpflicht
  });

  it("Monatsbetrag", () => {
    expect(monatsbetrag({ beitrag: { w: 120, s: "ok" }, zahlweise: { w: "jaehrlich", s: "ok" } })).toBe(10);
    expect(monatsbetrag({ beitrag: { w: 30, s: "ok" }, zahlweise: { w: "vierteljaehrlich", s: "ok" } })).toBe(10);
    expect(monatsbetrag({ beitrag: { w: 30, s: "ok" } })).toBeNull();
  });

  it("Felder decken alle Typen ab und haben Labels", () => {
    for (const f of FELDER) expect(f.label.length).toBeGreaterThan(1);
  });
});

describe("Sparte vorab, ohne KI", () => {
  it("Vermittler geht vor, sonst Unterlage und Seite 1; Widerspruch oder Unklarheit: nicht auslesen", () => {
    expect(sparteVorab({ vermittler: "kfz", unterlage: "hausrat" })).toEqual({ sparte: "kfz", quelle: "vermittler" });
    expect(sparteVorab({ unterlage: "hausrat", text: "Ihre Hausratversicherung" })).toEqual({ sparte: "hausrat", quelle: "unterlage" });
    expect(sparteVorab({ unterlage: "kranken" })).toEqual({ sparte: "pkv", quelle: "unterlage" });
    expect(sparteVorab({ text: "Versicherungsschein Privathaftpflicht" })).toEqual({ sparte: "haftpflicht", quelle: "text" });
    expect(sparteVorab({ unterlage: "hausrat", text: "Kraftfahrtversicherung Teilkasko" })).toBeNull();
    expect(sparteVorab({ text: "Hausrat und Privathaftpflicht im Paket" })).toBeNull();
    expect(sparteVorab({ unterlage: "haftpflicht", text: "Hausrat und Privathaftpflicht im Paket" })).toEqual({ sparte: "haftpflicht", quelle: "unterlage" });
    expect(sparteVorab({ unterlage: "unfall" })).toBeNull();
    expect(sparteVorab({ unterlage: "tier" })).toBeNull();
    expect(sparteVorab({ text: "Hundehalterhaftpflicht" })).toBeNull();
    expect(sparteVorab({})).toBeNull();
    expect(spartenImText("Berufsunfähigkeitsversicherung")).toEqual(["bu"]);
  });
});

describe("Schalter und Konfiguration", () => {
  const key = { POLICEN_OPENAI_API_KEY: "sk-test" };
  it("an, sobald der Schlüssel gesetzt ist; Notschalter; ohne Schlüssel aus", () => {
    expect(auslesenAn({})).toBe(false);
    expect(auslesenAn(key)).toBe(true);
    expect(auslesenAn({ ...key, POLICEN_AUSLESEN_AN: "0" })).toBe(false);
    expect(auslesenAn({ POLICEN_AUSLESEN_ANBIETER: "bedrock-eu" })).toBe(false);
  });
  it("fester EU-Endpunkt, Modell überschreibbar, kein Rückfall", () => {
    expect(openAiEu(key)).toMatchObject({ baseURL: "https://eu.api.openai.com/v1", model: "gpt-6.1-terra", project: null });
    expect(openAiEu({ ...key, POLICEN_OPENAI_MODEL: "gpt-6.2-sol", POLICEN_OPENAI_PROJECT: "proj_1" })).toMatchObject({ model: "gpt-6.2-sol", project: "proj_1" });
    expect(OPENAI_EU_BASE_URL).toBe("https://eu.api.openai.com/v1");
    // Bedrock gewählt, aber nicht eingerichtet: aus (kein Rückfall auf OpenAI)
    expect(auslesenAn({ ...key, POLICEN_AUSLESEN_ANBIETER: "bedrock-eu" })).toBe(false);
  });
  it("Sach sofort, PKV/BU/Leben nur mit Nachweis „keine Speicherung“", () => {
    expect(freigegebeneSparten({ zdr: false }, {})).toEqual(["haftpflicht", "hausrat", "kfz", "wohngebaeude", "rechtsschutz"]);
    expect(freigegebeneSparten({ zdr: true }, {})).toEqual(["haftpflicht", "hausrat", "kfz", "wohngebaeude", "rechtsschutz", "pkv", "bu", "leben"]);
    expect(freigegebeneSparten({ zdr: false }, { POLICEN_AUSLESEN_SPARTEN: "hausrat,pkv" })).toEqual(["hausrat"]);
  });
  it("Einwilligung: nur KI-Textversionen (Policen per WhatsApp ab 2026-11-18, Text (a) ab a-2026-11-17)", () => {
    expect(textVersionKi("2026-11-18.g1")).toEqual({ gesundheit: true });
    expect(textVersionKi("2026-11-18.s1")).toEqual({ gesundheit: false });
    expect(textVersionKi("2026-12-01.g2")).toEqual({ gesundheit: true });
    expect(textVersionKi("a-2026-11-17")).toEqual({ gesundheit: true });
    expect(textVersionDecktKi("a-2026-11-18")).toBe(true);
    expect(textVersionDecktKi("2026-11-17.3")).toBe(false);
    expect(textVersionDecktKi("2026-11-17.g1")).toBe(false);
    expect(textVersionDecktKi("a-2026-11-16")).toBe(false);
    expect(textVersionDecktKi(null)).toBe(false);
  });
  it("Bremse, Ablauf, Diagnose ohne Schlüssel", () => {
    expect(maxProTag({})).toBe(200);
    expect(maxProTag({ POLICEN_AUSLESEN_MAX_PRO_TAG: "50" })).toBe(50);
    expect(tageBisAblauf(new Date("2027-10-20T10:00:00Z"), {})).toBe(28);
    expect(tageBisAblauf(new Date("2027-10-20T10:00:00Z"), { POLICEN_OPENAI_KEY_ABLAUF: "2027-10-30" })).toBe(10);
    const st = auslesenKonfigStatus({ zdr: false, now: new Date() }, { ...key, POLICEN_OPENAI_PROJECT: "proj_geheim" });
    const json = JSON.stringify(st);
    expect(json).not.toContain("sk-test");
    expect(json).not.toContain("proj_geheim");
    expect(st).toMatchObject({ an: true, schluessel: "ja", endpunkt: "https://eu.api.openai.com/v1", modell: "gpt-6.1-terra", schluesselAblauf: "2027-11-17" });
    expect(schluesselFinger(key)).toMatch(/^[0-9a-f]{16}$/);
    expect(schluesselFinger(key)).not.toBe(schluesselFinger({ POLICEN_OPENAI_API_KEY: "sk-neu" }));
  });
});

describe("Zusammenfassung", () => {
  const v = (id: string, sparte: Parameters<typeof felderFuer>[0], felder: Felder, geprueft = false) => ({ id, sparte, felder, geprueft });
  const f = (x: Record<string, unknown>): Felder => Object.fromEntries(Object.entries(x).map(([k, w]) => [k, { w: w as never, s: "ok" as const }]));
  const now = new Date("2026-11-18T09:00:00Z");

  it("Summe Monatsbeiträge, Kündigungstermine in 3 Monaten, doppelte Sparte, fehlende Bausteine", () => {
    const z = zusammenfassung(
      [
        v("a", "haftpflicht", f({ versicherer: "HUK", beitrag: 60, zahlweise: "jaehrlich", forderungsausfall: false, schluesselverlust: true, ablauf: "2027-01-01", kuendigungsfrist_monate: 1 })),
        v("b", "haftpflicht", f({ versicherer: "Allianz", beitrag: 8, zahlweise: "monatlich" })),
        v("c", "hausrat", f({ beitrag: 120, zahlweise: "jaehrlich", elementar: false, ablauf: "2024-06-01", kuendigungsfrist_monate: 3 }), true),
        v("d", "pkv", f({ beitrag: 612.4, zahlweise: "monatlich", krankentagegeld: 0 })),
      ],
      now,
    );
    expect(z.monatSumme).toBe(5 + 8 + 10 + 612.4);
    expect(z.vertraege).toBe(4);
    expect(z.ungeprueft).toBe(3);
    expect(z.doppelt).toEqual(["haftpflicht"]);
    expect(z.bausteine.map((b) => b.text)).toEqual(["Haftpflicht ohne Forderungsausfall", "Hausrat ohne Elementarschäden"]);
    expect(z.kuendigungen).toEqual([{ id: "a", sparte: "haftpflicht", versicherer: "HUK", zum: "2027-01-01", bis: "2026-12-01" }]);
    // Keine Hinweise zu PKV/BU/Leben (kein Risiko-Scoring, K8)
    expect(z.bausteine.some((b) => /Kranken|BU|Leben/.test(b.text))).toBe(false);
  });

  it("gleiche Police doppelt geschickt zählt einmal", () => {
    const x = f({ versicherer: "HUK", versicherungsnummer: "…1234", beitrag: 60, zahlweise: "jaehrlich" });
    const z = zusammenfassung([v("a", "haftpflicht", x), v("b", "haftpflicht", x)], now);
    expect(z.vertraege).toBe(1);
    expect(z.monatSumme).toBe(5);
    expect(z.doppelt).toEqual([]);
  });

  it("nächste Kündigung: Ablauf jährlich fortgeschrieben, genannter Termin geht vor", () => {
    expect(naechsteKuendigung(f({ ablauf: "2020-03-01", kuendigungsfrist_monate: 3 }), "2026-11-18")).toEqual({ zum: "2027-03-01", bis: "2026-12-01" });
    expect(naechsteKuendigung(f({ ablauf: "2020-01-01", kuendigungsfrist_monate: 3 }), "2026-11-18")).toEqual({ zum: "2028-01-01", bis: "2027-10-01" });
    expect(naechsteKuendigung(f({ naechster_kuendigungstermin: "2027-02-01", ablauf: "2020-01-01" }), "2026-11-18")).toEqual({ zum: "2027-02-01", bis: null });
    expect(naechsteKuendigung(f({}), "2026-11-18")).toBeNull();
  });

  it("Hinweistexte ohne Gedankenstriche", () => {
    const z = zusammenfassung([v("a", "haftpflicht", f({ forderungsausfall: false, schluesselverlust: false }))], now);
    for (const b of z.bausteine) expect(ohneGedankenstriche(b.text)).toBe(b.text);
  });
});
