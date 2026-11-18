// Cross-Selling (Ole, 16.11.2026, Teil A2, A7, A10): Ampel mit 4 Zuständen je Sparte, „Chance im Termin“, Hundehaftpflicht-
// Pflicht aus der PLZ, Folie „Ihr Schutz im Überblick“ aus der Tarifauswahl.
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  alterAus,
  ampelVorschau,
  chancen,
  cleanSchutz,
  cleanVorsorgeAus,
  hundePflichtLand,
  SCHUTZ_ANTWORT,
  SCHUTZ_REIHENFOLGE,
  SCHUTZ_STATUS,
  schutzVorschlag,
  schutzZeilen,
  vorsorgeThema,
  woandersInfo,
  type SchutzEintrag,
} from "@/lib/schutz-ueberblick";
import { ladeTarifkatalog } from "@/lib/tarifkatalog-laden";
import { cleanTarifauswahl, sparteNeu, startAuswahl, zuAngebote } from "@/lib/tarifauswahl";
import { folien, markeFuer } from "@/lib/praesentation";
import { hatGedankenstrich } from "@/lib/gedankenstriche";
import type { VorbereitungDaten } from "@/lib/termin-vorbereitung";

const termin = (x: { produkt?: string; angaben?: Record<string, string>; formular?: { label: string; value: string }[]; adresse?: string | null } = {}): VorbereitungDaten => ({
  lead: { name: "Dominik Schmid", telefon: null, email: null, adresse: x.adresse ?? null, produkt: x.produkt ?? "Privatschutz" },
  termin: { startsAt: new Date("2026-11-17T09:00:00Z"), mode: "video", berater: "Max Berger", meetUrl: null },
  zusammenfassung: null,
  formular: x.formular ?? [],
  angaben: x.angaben ?? {},
  vorbereitetAm: null,
});
const status = (xs: SchutzEintrag[]) => Object.fromEntries(xs.map((x) => [x.key, x.status]));

describe("Ampel mit den Verträgen aus dem Komplettcheck (Lead.vorvertraege, P2)", () => {
  const vv = (liste: { sparte: string; gesellschaft?: string | null }[], keine = false) => ({ at: "2026-11-17T10:00:00Z", liste, ...(keine ? { keine: true } : {}) });
  it("genannte Verträge sind „woanders“ mit Gesellschaft; große Produkte nur mit Komplettcheck", () => {
    const d = { ...termin(), komplettcheck: true, vorvertraege: vv([{ sparte: "Haftpflicht", gesellschaft: "HUK" }, { sparte: "Berufsunfähigkeit" }, { sparte: "Kfz", gesellschaft: "Allianz" }]) };
    const s = schutzVorschlag(d, { angebot: ["hausrat"] });
    expect(s.find((x) => x.key === "haftpflicht")).toMatchObject({ status: "woanders", versicherer: "HUK" });
    expect(s.find((x) => x.key === "bu")?.status).toBe("woanders");
    expect(s.find((x) => x.key === "kfz")).toMatchObject({ status: "woanders", versicherer: "Allianz" });
    expect(s.find((x) => x.key === "hausrat")?.status).toBe("pruefen");
    const ohne = schutzVorschlag({ ...d, komplettcheck: false }, { angebot: ["hausrat"] });
    expect(ohne.find((x) => x.key === "haftpflicht")?.status).toBe("woanders");
    expect(ohne.some((x) => x.key === "bu" || x.key === "kfz")).toBe(false);
  });
  it("Komplettcheck und „keine Versicherungen“: naheliegende Sparten sind Lücken; ohne Komplettcheck nur „prüfen“", () => {
    const d = { ...termin(), komplettcheck: true, vorvertraege: vv([], true) };
    expect(new Set(Object.values(status(schutzVorschlag(d, { angebot: [] }))))).toEqual(new Set(["luecke"]));
    expect(new Set(Object.values(status(schutzVorschlag({ ...d, komplettcheck: null }, { angebot: [] }))))).toEqual(new Set(["pruefen"]));
  });
});

describe("Ampel: Vorschlag aus Formular, Chat und Verträgen", () => {
  it("Angebot zuerst; Genanntes woanders, „sonst nichts“ heißt Lücke, Rechtsschutz und Unfall vor Haftpflicht", () => {
    const s = schutzVorschlag(termin({ angaben: { vorhanden: "alte Haftpflicht von 2012, sonst nichts", lebenssituation: "Single, Mietwohnung" } }), { angebot: ["hausrat"] });
    expect(s[0].key).toBe("hausrat");
    expect(status(s)).toEqual({ hausrat: "luecke", haftpflicht: "woanders", rechtsschutz: "luecke", unfall: "luecke" });
    expect(s.map((x) => x.key)).toEqual(["hausrat", "rechtsschutz", "unfall", "haftpflicht"]);
  });

  it("ohne Angaben: alles „prüfen“; ausdrücklich „keine Hausrat“ ist eine Lücke", () => {
    expect(new Set(Object.values(status(schutzVorschlag(termin(), { angebot: ["haftpflicht"] }))))).toEqual(new Set(["pruefen"]));
    const s = schutzVorschlag(termin({ angaben: { vorhanden: "Haftpflicht bei HUK, keine Hausrat" } }), { angebot: [] });
    expect(status(s)).toMatchObject({ haftpflicht: "woanders", hausrat: "luecke", rechtsschutz: "pruefen" });
  });

  it("Verträge bei uns: grün mit „seit“", () => {
    const s = schutzVorschlag(termin(), { angebot: [], vertraege: [{ sparte: "unfall", seit: new Date("2026-03-10T10:00:00Z") }, { sparte: "privatschutz", seit: null }] });
    expect(s.find((x) => x.key === "unfall")).toMatchObject({ status: "bei-uns", seit: "seit 03/2026" });
    // „privatschutz“ ist nicht eindeutig: keine Zuordnung
    expect(s.find((x) => x.key === "haftpflicht")?.status).toBe("pruefen");
  });

  it("Lebenslage: Eigentum → Wohngebäude, Hund → Hundehaftpflicht (Pflicht in Niedersachsen), Privatschutz mit Katze → Tier-OP", () => {
    const s = schutzVorschlag(termin({ angaben: { lebenssituation: "Familie im Eigenheim", tier: "Hund Bello, 3 Jahre" }, adresse: "30159 Hannover" }), { angebot: ["haftpflicht"] });
    expect(s.map((x) => x.key)).toEqual(expect.arrayContaining(["wohngebaeude", "tierhalter-hund", "hausrat", "hund-op"]));
    const hund = s.find((x) => x.key === "tierhalter-hund")!;
    expect(hund.oeffner).toBe("Hat Bello eine eigene Haftpflicht? Die Privathaftpflicht zahlt für Hundeschäden nicht. In Niedersachsen ist sie Pflicht.");
    const katze = schutzVorschlag(termin({ angaben: { tier: "Katze Mia" } }), { angebot: ["haftpflicht"] });
    expect(katze.map((x) => x.key)).toContain("katze-op");
    expect(katze.map((x) => x.key)).not.toContain("tierhalter-hund");
  });

  it("Tier-Lead (Katze): Privathaftpflicht als Öffner, keine Gesundheitsprodukte, keine Tierhalterhaftpflicht für Katzen", () => {
    const s = schutzVorschlag(termin({ produkt: "Katzenversicherung", angaben: { tier: "Katze Mia, Wohnungskatze" } }), { angebot: ["katze-kranken"] });
    expect(s[0].key).toBe("katze-kranken");
    expect(s.map((x) => x.key)).toEqual(expect.arrayContaining(["haftpflicht", "rechtsschutz", "unfall"]));
    expect(s.map((x) => x.key).some((k) => /pkv|bu|leben|pflege|tierhalter/.test(k))).toBe(false);
  });

  it("Du und Sie, ohne Gedankenstriche", () => {
    const sie = schutzVorschlag(termin({ angaben: { tier: "Hund" } }), { angebot: [] }, "sie");
    const du = schutzVorschlag(termin({ angaben: { tier: "Hund" } }), { angebot: [] }, "du");
    expect(sie.find((x) => x.key === "rechtsschutz")!.oeffner).toContain("bei Ihnen");
    expect(du.find((x) => x.key === "rechtsschutz")!.oeffner).toContain("bei dir");
    for (const x of [...sie, ...du]) expect(hatGedankenstrich(x.oeffner ?? "")).toBe(false);
  });
});

describe("Vorsorge-Thema (Teil C2): höchstens eins, nur aus Beruf, Lebenslage und Alter", () => {
  it("selbständig → PKV-Check; Azubi bzw. unter 30 → BU; Kinder oder Immobilie → Risikoleben; ab 50 → Pflege", () => {
    expect(vorsorgeThema(termin({ angaben: { beruf: "selbstständig, Grafikdesigner" } }))).toMatchObject({ key: "pkv", label: "PKV-Check" });
    expect(vorsorgeThema(termin({ angaben: { beruf: "Beamter" } }))?.oeffner).toContain("Dienstherr");
    expect(vorsorgeThema(termin({ angaben: { beruf: "Azubi Mechatroniker" } }))?.key).toBe("bu");
    expect(vorsorgeThema(termin({ angaben: { geburt: "01.01.2000" } }))?.key).toBe("bu");
    expect(vorsorgeThema(termin({ angaben: { kinder: "Sohn, 9", geburt: "01.01.1985" } }))?.key).toBe("risikoleben");
    expect(vorsorgeThema(termin({ angaben: { kinder: "keine", geburt: "01.01.1970" } }))?.key).toBe("pflege");
    expect(vorsorgeThema(termin({ angaben: { beruf: "Angestellte", geburt: "01.01.1985" } }))).toBeNull();
  });

  it("abgeschaltete Themen fallen weg, das nächste passende kommt; Du und Sie ohne Gedankenstriche", () => {
    const d = termin({ angaben: { beruf: "selbständig", kinder: "Tochter, 4" } });
    expect(vorsorgeThema(d, ["pkv"])?.key).toBe("risikoleben");
    expect(vorsorgeThema(d, ["pkv", "risikoleben"])).toBeNull();
    expect(vorsorgeThema(d, [], "du")?.oeffner).toContain("zahlst du");
    for (const an of ["du", "sie"] as const) expect(hatGedankenstrich(vorsorgeThema(d, [], an)!.oeffner)).toBe(false);
    expect(cleanVorsorgeAus(["pkv", "x", "pkv", 3])).toEqual(["pkv"]);
    expect(alterAus("22.08.1992", new Date("2026-08-21T12:00:00Z"))).toBe(33);
    expect(alterAus("1992-08-22", new Date("2026-08-22T12:00:00Z"))).toBe(34);
  });
});

describe("Hundehaftpflicht-Pflicht aus der PLZ", () => {
  it("eindeutige Bereiche; an Landesgrenzen und in anderen Ländern keine Angabe", () => {
    expect(hundePflichtLand("10115 Berlin")).toBe("Berlin");
    expect(hundePflichtLand("20095")).toBe("Hamburg");
    expect(hundePflichtLand("28195 Bremen")).toBe("Bremen");
    expect(hundePflichtLand("27570 Bremerhaven")).toBe("Bremen");
    expect(hundePflichtLand("24103 Kiel")).toBe("Schleswig-Holstein");
    expect(hundePflichtLand("30159")).toBe("Niedersachsen");
    expect(hundePflichtLand("39104 Magdeburg")).toBe("Sachsen-Anhalt");
    expect(hundePflichtLand("99084 Erfurt")).toBe("Thüringen");
    expect(hundePflichtLand("80331 München")).toBeNull();
    expect(hundePflichtLand("50667 Köln")).toBeNull();
    expect(hundePflichtLand("14467 Potsdam")).toBeNull();
    expect(hundePflichtLand("21481 Lauenburg")).toBeNull();
    expect(hundePflichtLand(null)).toBeNull();
  });
});

describe("Chance im Termin", () => {
  it("höchstens 2, nicht im Angebot, nicht bei uns; Pflicht und Lücken vorn", () => {
    const s: SchutzEintrag[] = [
      { key: "haftpflicht", label: "Privathaftpflicht", status: "luecke" },
      { key: "hausrat", label: "Hausrat", status: "pruefen" },
      { key: "rechtsschutz", label: "Rechtsschutz", status: "pruefen" },
      { key: "unfall", label: "Unfall", status: "bei-uns" },
      { key: "tierhalter-hund", label: "Hundehalterhaftpflicht", status: "pruefen" },
    ];
    expect(chancen(s, ["hausrat"]).map((c) => c.key)).toEqual(["tierhalter-hund", "rechtsschutz"]);
    expect(chancen(s, ["hausrat"], 6).map((c) => c.key)).not.toContain("unfall");
    expect(chancen([], [])).toEqual([]);
  });

  it("woanders: Versicherer, Ablauf, ungefährer Beitrag", () => {
    expect(woandersInfo({ versicherer: "HUK-COBURG", ablauf: "2027-03", beitrag: 8 })).toBe("bei HUK-COBURG, Ablauf 03/2027, ca. 8 € im Monat");
    expect(woandersInfo({})).toBeNull();
  });
});

describe("Überblick in Tarifauswahl, Angeboten und Folie", () => {
  const k = ladeTarifkatalog(path.join(__dirname, "..", "fixtures", "tarifkatalog"));

  it("Sparte „bei Bedarf“ (zusatz) bleibt aus Vergleich und Beitrag, steht im Überblick mit „Mit anschauen“", () => {
    const a = startAuswahl(k, ["haftpflicht"], { rolle: "vertreter", gesellschaften: ["allianz"] });
    const hausrat = sparteNeu(k, "hausrat", { rolle: "vertreter", gesellschaften: ["allianz"] })!;
    hausrat.zusatz = true;
    a.sparten.push(hausrat);
    a.schutz = [
      { key: "haftpflicht", label: "Privathaftpflicht", status: "woanders", versicherer: "HUK-COBURG" },
      { key: "hausrat", label: "Hausrat", status: "pruefen" },
      { key: "unfall", label: "Unfall", status: "luecke" },
    ];
    const c = cleanTarifauswahl(JSON.parse(JSON.stringify(a)))!;
    expect(c.sparten[1].zusatz).toBe(true);
    expect(c.schutz).toEqual(a.schutz);
    const ang = zuAngebote(c);
    expect(ang.items.filter((i) => i.sparte === "Hausrat").every((i) => i.zusatz && !i.gewaehlt)).toBe(true);
    expect(ang.schutz?.map((z) => [z.key, z.status])).toEqual([
      ["haftpflicht", "woanders"],
      ["hausrat", "pruefen"],
      ["unfall", "luecke"],
    ]);
    const fs = folien(termin(), ang, markeFuer({ name: "Allianz Agentur Test" }));
    expect(fs.some((f) => f.id.startsWith("vergleich-hausrat"))).toBe(false);
    const u = fs.find((f) => f.id === "ueberblick")!.html;
    expect(u).toContain("Mit anschauen");
    expect(u).toContain('data-schutz="unfall" data-status="luecke"');
    // Unfall hat keine Angebote: kein Knopf
    expect(u.match(/data-sparte=/g)).toHaveLength(1);
  });

  it("ohne Überblick (ältere Termine): keine neue Folie; Zeilen höchstens 6", () => {
    const a = startAuswahl(k, ["hausrat"], { rolle: "vertreter", gesellschaften: ["allianz"] });
    expect(folien(termin(), zuAngebote(a), markeFuer({ name: "X" })).some((f) => f.id === "ueberblick")).toBe(false);
    const viele = ["haftpflicht", "hausrat", "rechtsschutz", "unfall", "wohngebaeude", "tierhalter-hund", "tierhalter-pferd"].map((key): SchutzEintrag => ({ key, label: key, status: "pruefen" }));
    expect(schutzZeilen(viele, [])).toHaveLength(6);
    expect(cleanSchutz([{ key: "X Y", label: "a", status: "pruefen" }, { key: "unfall", label: "Unfall", status: "kaputt" }, { key: "unfall", label: "Unfall", status: "luecke", ablauf: "2027-13" }])).toEqual([
      { key: "unfall", label: "Unfall", status: "luecke" },
    ]);
  });
});

describe("Schutz im Überblick verständlicher (Ole, 18.11.2026)", () => {
  it("Antworten im Fenster: Ja, bei mir / Ja, woanders / Weiß nicht / Nein; Präsentation behält die Ampel-Begriffe", () => {
    expect(SCHUTZ_REIHENFOLGE.map((s) => SCHUTZ_ANTWORT[s].label)).toEqual(["Ja, bei mir", "Ja, woanders", "Weiß nicht", "Nein"]);
    expect(SCHUTZ_REIHENFOLGE.map((s) => SCHUTZ_STATUS[s].label)).toEqual(["Bei uns versichert", "Woanders versichert", "Prüfen", "Lücke"]);
    // Ein Farbsystem: Farbpunkte der Antworten = Ampel-Farben der Präsentation
    for (const s of SCHUTZ_REIHENFOLGE) expect(SCHUTZ_ANTWORT[s].farbe).toBe(SCHUTZ_STATUS[s].farbe);
  });

  it("Vorbelegung mit Quelle: Chat (Angaben, Komplettcheck) bzw. Formular; Unbekanntes ohne Quelle", () => {
    const d = {
      ...termin({ angaben: { vorhanden: "Haftpflicht bei der HUK, keinen Rechtsschutz" }, formular: [{ label: "Bestehende Versicherungen", value: "Hausrat bei der Allianz" }] }),
      komplettcheck: true,
      vorvertraege: { at: "2026-11-17T10:00:00Z", liste: [{ sparte: "Kfz", gesellschaft: "DEVK" }] },
    };
    const s = schutzVorschlag(d, { angebot: [] });
    const by = (k: string) => s.find((x) => x.key === k);
    expect(by("haftpflicht")).toMatchObject({ status: "woanders", quelle: "chat" });
    expect(by("rechtsschutz")).toMatchObject({ status: "luecke", quelle: "chat" });
    expect(by("kfz")).toMatchObject({ status: "woanders", versicherer: "DEVK", quelle: "chat" });
    expect(by("hausrat")).toMatchObject({ status: "woanders", quelle: "formular" });
    expect(by("unfall")?.status).toBe("pruefen");
    expect(by("unfall")?.quelle).toBeUndefined();
    // bleibt beim Speichern erhalten, Unsinn fällt weg
    expect(cleanSchutz([{ key: "kfz", label: "Kfz", status: "woanders", quelle: "chat" }, { key: "unfall", label: "Unfall", status: "pruefen", quelle: "ki" }])).toEqual([
      { key: "kfz", label: "Kfz", status: "woanders", quelle: "chat" },
      { key: "unfall", label: "Unfall", status: "pruefen" },
    ]);
  });

  it("Live-Vorschau der Ampel wie auf der Folie: fest im Angebot „Im Angebot“, bei Bedarf mit Ampel-Begriff", () => {
    const schutz: SchutzEintrag[] = [
      { key: "haftpflicht", label: "Privathaftpflicht", status: "woanders" },
      { key: "rechtsschutz", label: "Rechtsschutz", status: "luecke" },
      { key: "unfall", label: "Unfall", status: "pruefen" },
    ];
    const v = ampelVorschau(schutz, [{ key: "haftpflicht" }, { key: "unfall", zusatz: true }]);
    expect(v.map((z) => [z.key, z.text])).toEqual([
      ["haftpflicht", "Im Angebot"],
      ["unfall", "Prüfen"],
      ["rechtsschutz", "Lücke"],
    ]);
    expect(v[0].farbe).toBe(SCHUTZ_STATUS["bei-uns"].farbe);
  });
});

describe("„Ja, woanders“ mit Tarif aus dem Katalog (Ole, 18.11.2026)", () => {
  it("speichert Tarif und Katalogtarif, zeigt den Tarif in der Info-Zeile", () => {
    const [s] = cleanSchutz([{ key: "hausrat", label: "Hausrat", status: "woanders", versicherer: "HUK-COBURG", tarif: "Classic", katalogId: "huk-coburg/hausrat-classic", beitrag: 8, ablauf: "2027-03" }]);
    expect(s).toMatchObject({ versicherer: "HUK-COBURG", tarif: "Classic", katalogId: "huk-coburg/hausrat-classic" });
    expect(woandersInfo(s)).toBe("bei HUK-COBURG Classic, Ablauf 03/2027, ca. 8 € im Monat");
  });
  it("ohne Tarif wie bisher", () => {
    const [s] = cleanSchutz([{ key: "hausrat", label: "Hausrat", status: "woanders", versicherer: "Allianz", tarif: "  ", katalogId: 5 }]);
    expect(s.tarif).toBeUndefined();
    expect(s.katalogId).toBeUndefined();
    expect(woandersInfo(s)).toBe("bei Allianz");
  });
});
