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
import { plausibel, unplausibel } from "@/lib/policen/auslesen/plausibel";
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
    // „kranken“ ist Voll- oder Zusatzversicherung: die Seite entscheidet
    expect(sparteVorab({ unterlage: "kranken" })).toBeNull();
    expect(sparteVorab({ unterlage: "kranken", text: "Ihre Zahnzusatzversicherung" })).toEqual({ sparte: "krankenzusatz", quelle: "text" });
    expect(sparteVorab({ unterlage: "kranken", text: "Krankheitskostenvollversicherung" })).toEqual({ sparte: "pkv", quelle: "text" });
    expect(sparteVorab({ text: "Versicherungsschein Privathaftpflicht" })).toEqual({ sparte: "haftpflicht", quelle: "text" });
    expect(sparteVorab({ unterlage: "hausrat", text: "Kraftfahrtversicherung Teilkasko" })).toBeNull();
    expect(sparteVorab({ text: "Hausrat und Privathaftpflicht im Paket" })).toBeNull();
    expect(sparteVorab({ unterlage: "haftpflicht", text: "Hausrat und Privathaftpflicht im Paket" })).toEqual({ sparte: "haftpflicht", quelle: "unterlage" });
    // Weitere Sparten (Ole, 19.11.2026)
    expect(sparteVorab({ unterlage: "unfall" })).toEqual({ sparte: "unfall", quelle: "unterlage" });
    expect(sparteVorab({ unterlage: "tier" })).toEqual({ sparte: "tier", quelle: "unterlage" });
    expect(sparteVorab({ text: "Hundehalterhaftpflicht" })).toEqual({ sparte: "tier", quelle: "text" });
    expect(sparteVorab({ text: "Tierkrankenversicherung für Ihre Katze" })).toEqual({ sparte: "tier", quelle: "text" });
    expect(sparteVorab({ text: "Reiserücktrittsversicherung Jahrespolice" })).toEqual({ sparte: "reise", quelle: "text" });
    expect(sparteVorab({ text: "Ihre Unfallversicherung" })).toEqual({ sparte: "unfall", quelle: "text" });
    // „Sonstige“ vom Vermittler, Seite nennt eine Gesundheitssparte: die gilt (Schutz nach K2)
    expect(sparteVorab({ vermittler: "sonstige", text: "Glasversicherung" })).toEqual({ sparte: "sonstige", quelle: "vermittler" });
    expect(sparteVorab({ vermittler: "sonstige", text: "Pflegetagegeld" })).toEqual({ sparte: "pflege", quelle: "text" });
    expect(sparteVorab({})).toBeNull();
    expect(spartenImText("Berufsunfähigkeitsversicherung")).toEqual(["bu"]);
  });

  it("erweiterte Stichworte: PHV, Autoversicherung, Haftpflicht und Kfz allein, Kfz-Haftpflicht ist Kfz", () => {
    expect(sparteVorab({ text: "Versicherungsschein PHV Single" })).toEqual({ sparte: "haftpflicht", quelle: "text" });
    expect(sparteVorab({ text: "Ihre Autoversicherung 2027" })).toEqual({ sparte: "kfz", quelle: "text" });
    expect(sparteVorab({ text: "Nachtrag zum Vertrag Haftpflicht, Deckungssumme 50 Mio." })).toEqual({ sparte: "haftpflicht", quelle: "text" });
    expect(sparteVorab({ text: "Beitragsrechnung Kfz, amtl. Kennzeichen" })).toEqual({ sparte: "kfz", quelle: "text" });
    // Kfz-Police mit Zeile „Haftpflicht“ bzw. „Kfz-Haftpflichtversicherung“: nur Kfz, nicht zwei Sparten
    expect(spartenImText("Kfz-Haftpflichtversicherung Teilkasko Haftpflicht 100 Mio.")).toEqual(["kfz"]);
    expect(spartenImText("Kraftfahrtversicherung, Insassen-Unfallversicherung")).toEqual(["kfz"]);
    // Haftpflicht-Komposita anderer Sparten sind keine Privathaftpflicht
    expect(sparteVorab({ text: "Haus- und Grundbesitzerhaftpflichtversicherung" })).toBeNull();
    expect(sparteVorab({ text: "Berufshaftpflichtversicherung für Architekten" })).toBeNull();
    expect(sparteVorab({ text: "Bauherrenhaftpflicht" })).toBeNull();
    expect(spartenImText("Wohngebäudeversicherung inkl. Grundbesitzerhaftpflicht")).toEqual(["wohngebaeude"]);
    // Schwache Wörter zählen nicht neben einem eindeutigen
    expect(spartenImText("Rechtsschutzversicherung Verkehr für Kfz")).toEqual(["rechtsschutz"]);
    expect(spartenImText("Privathaftpflicht, Schäden durch Kfz nicht versichert")).toEqual(["haftpflicht"]);
  });

  it("Glas allein bleibt offen, mit Hausrat bzw. Wohngebäude eindeutig", () => {
    expect(sparteVorab({ text: "Glasversicherung Glasbruch" })).toBeNull();
    expect(sparteVorab({ text: "Hausrat- und Glasversicherung" })).toEqual({ sparte: "hausrat", quelle: "text" });
    expect(sparteVorab({ text: "Wohngebäudeversicherung mit Glasbruch" })).toEqual({ sparte: "wohngebaeude", quelle: "text" });
  });

  it("PKV, BU und Leben nie aus schwachen Stichworten", () => {
    for (const t of ["Leben", "Rente 2027", "BU", "Tarif Kranken", "Beihilfe", "Vorsorge", "Gesundheit", "Haftpflicht für Ärzte"]) {
      const r = spartenImText(t);
      for (const s of ["pkv", "bu", "leben"]) expect(r, t).not.toContain(s);
    }
  });
});

describe("Plausibilitätsregeln", () => {
  const f = (x: Record<string, unknown>): Felder => Object.fromEntries(Object.entries(x).map(([k, w]) => [k, { w: w as never, s: "ok" as const }]));

  it("Ablauf vor Beginn: beide bitte prüfen", () => {
    const r = plausibel(f({ beginn: "2026-05-01", ablauf: "2025-05-01", versicherer: "HUK" }), "hausrat");
    expect(r.beginn.s).toBe("pruefen");
    expect(r.ablauf.s).toBe("pruefen");
    expect(r.versicherer.s).toBe("ok");
    expect(r.ablauf.w).toBe("2025-05-01");
    expect(unplausibel(f({ beginn: "2024-05-01", ablauf: "2025-05-01" }), "hausrat")).toEqual([]);
  });

  it("Kündigungsfrist über 12 Monate", () => {
    expect(unplausibel(f({ kuendigungsfrist_monate: 13 }), "kfz")).toEqual(["kuendigungsfrist_monate"]);
    expect(unplausibel(f({ kuendigungsfrist_monate: 12 }), "kfz")).toEqual([]);
  });

  it("Monatsbeitrag Sach über 500 €, Personenversicherung nicht", () => {
    expect(unplausibel(f({ beitrag: 6100, zahlweise: "jaehrlich" }), "haftpflicht")).toEqual(["beitrag"]);
    expect(unplausibel(f({ beitrag: 6000, zahlweise: "jaehrlich" }), "haftpflicht")).toEqual([]);
    expect(unplausibel(f({ beitrag: 900, zahlweise: "monatlich" }), "pkv")).toEqual([]);
  });

  it("Deckungssumme unter 1 Mio.", () => {
    expect(unplausibel(f({ deckungssumme: 500_000 }), "haftpflicht")).toEqual(["deckungssumme"]);
    expect(unplausibel(f({ deckungssumme: 1_000_000 }), "haftpflicht")).toEqual([]);
  });

  it("Versicherungssumme unter 1.000 €", () => {
    expect(unplausibel(f({ versicherungssumme: 650 }), "hausrat")).toEqual(["versicherungssumme"]);
    expect(unplausibel(f({ versicherungssumme: 65_000 }), "hausrat")).toEqual([]);
  });

  it("nichts auffällig: dasselbe Objekt zurück", () => {
    const x = f({ beitrag: 10, zahlweise: "monatlich" });
    expect(plausibel(x, "hausrat")).toBe(x);
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
    expect(freigegebeneSparten({ zdr: false }, {})).toEqual(["haftpflicht", "hausrat", "kfz", "wohngebaeude", "rechtsschutz", "tier", "reise", "sonstige"]);
    expect(freigegebeneSparten({ zdr: true }, {})).toEqual([
      "haftpflicht", "hausrat", "kfz", "wohngebaeude", "rechtsschutz", "unfall", "tier", "reise", "krankenzusatz", "pflege", "pkv", "bu", "leben", "sonstige",
    ]);
    expect(freigegebeneSparten({ zdr: false }, { POLICEN_AUSLESEN_SPARTEN: "hausrat,pkv" })).toEqual(["hausrat"]);
  });
  it("Einwilligung: nur KI-Textversionen (Policen per WhatsApp ab 2026-11-18.s2/.g2 mit „ohne KI“, Text (a) ab a-2026-11-17)", () => {
    expect(textVersionKi("2026-11-18.g2")).toEqual({ gesundheit: true });
    expect(textVersionKi("2026-11-18.s2")).toEqual({ gesundheit: false });
    // Auflage A9: .g1/.s1 boten die Ablehnung nur des Auslesens nicht an
    expect(textVersionKi("2026-11-18.g1")).toBeNull();
    expect(textVersionKi("2026-11-18.s1")).toBeNull();
    expect(textVersionKi("2026-12-01.g1")).toEqual({ gesundheit: true });
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
    expect(z.doppelt).toEqual([{ sparte: "haftpflicht", ids: ["a", "b"], versicherer: ["HUK", "Allianz"], monatSumme: 13 }]);
    expect(z.bausteine.map((b) => b.text)).toEqual(["Haftpflicht ohne Forderungsausfall", "Hausrat ohne Elementarschäden"]);
    expect(z.kuendigungen).toEqual([{ id: "a", sparte: "haftpflicht", versicherer: "HUK", zum: "2027-01-01", bis: "2026-11-30", jahresbetrag: 60, tageBis: 12, verpasst: null, genannt: false }]);
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
    expect(naechsteKuendigung(f({ ablauf: "2020-03-01", kuendigungsfrist_monate: 3 }), "2026-11-18")).toEqual({ zum: "2027-03-01", bis: "2026-11-30" });
    expect(naechsteKuendigung(f({ ablauf: "2020-01-01", kuendigungsfrist_monate: 3 }), "2026-11-18")).toEqual({ zum: "2028-01-01", bis: "2027-09-30" });
    expect(naechsteKuendigung(f({ naechster_kuendigungstermin: "2027-02-01", ablauf: "2020-01-01" }), "2026-11-18")).toEqual({ zum: "2027-02-01", bis: null });
    expect(naechsteKuendigung(f({}), "2026-11-18")).toBeNull();
  });

  it("Hinweistexte ohne Gedankenstriche", () => {
    const z = zusammenfassung([v("a", "haftpflicht", f({ forderungsausfall: false, schluesselverlust: false }))], now);
    for (const b of z.bausteine) expect(ohneGedankenstriche(b.text)).toBe(b.text);
  });
});
