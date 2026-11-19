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
  nichtMehrVorhanden,
  unsicherGenannt,
  SCHUTZ_ANTWORT,
  SCHUTZ_REIHENFOLGE,
  SCHUTZ_SPARTEN,
  SCHUTZ_STATUS,
  schutzBereich,
  schutzFragenStand,
  schutzKurz,
  schutzOffen,
  zitatFuer,
  spartenSuche,
  schutzVorschlag,
  schutzZeilen,
  vorsorgeThema,
  woandersInfo,
  type SchutzEintrag,
} from "@/lib/schutz-ueberblick";
import { ladeTarifkatalog } from "@/lib/tarifkatalog-laden";
import { spartenGruppiert } from "@/lib/tarifkatalog";
import { cleanTarifauswahl, sparteNeu, startAuswahl, zuAngebote } from "@/lib/tarifauswahl";
import { vertraegeAusText } from "@/lib/whatsapp/vorvertraege";
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
  it("Antworten je Sparte: Ja, bei mir / Ja, woanders / Weiß nicht / Nein; Präsentation behält die Ampel-Begriffe", () => {
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

describe("Ein Bereich „Was hat Frau Becker schon?“ (Ole, 18.11.2026)", () => {
  it("„+ Versicherung hinzufügen“: alle Sparten erreichbar, auch PKV, BU, Rente und Kfz", () => {
    const alle = spartenSuche("");
    expect(alle.map((s) => s.key).sort()).toEqual(Object.keys(SCHUTZ_SPARTEN).sort());
    // gruppiert ohne Verlust
    expect(spartenGruppiert(alle).flatMap((g) => g.sparten).length).toBe(alle.length);
    expect(spartenSuche("PKV")[0].key).toBe("pkv");
    expect(spartenSuche("pkv").map((s) => s.key)).toEqual(["pkv"]);
    expect(spartenSuche("BU")[0].key).toBe("bu");
    expect(spartenSuche("Rente")[0].key).toBe("rente");
    expect(spartenSuche("auto")[0].key).toBe("kfz");
    expect(spartenSuche("Kranken").map((s) => s.key)).toContain("pkv");
    expect(spartenSuche("gebäude")[0].key).toBe("wohngebaeude");
    expect(spartenSuche("xyz")).toEqual([]);
    // schon eingetragene Sparten fallen weg
    expect(spartenSuche("Hausrat", ["hausrat"])).toEqual([]);
    // alle Sparten passen in den gespeicherten Überblick
    const voll = cleanSchutz(Object.entries(SCHUTZ_SPARTEN).map(([key, label]) => ({ key, label, status: "pruefen" })));
    expect(voll).toHaveLength(Object.keys(SCHUTZ_SPARTEN).length);
  });

  it("Tipp-Zeilen oben (Chancen, dann Vorsorge-Thema), dann offene, dann beantwortete", () => {
    const s: SchutzEintrag[] = [
      { key: "haftpflicht", label: "Privathaftpflicht", status: "woanders", versicherer: "HUK" },
      { key: "hausrat", label: "Hausrat", status: "pruefen" },
      { key: "rechtsschutz", label: "Rechtsschutz", status: "luecke", oeffner: "Wer zahlt bei Ihnen den Anwalt?" },
      { key: "unfall", label: "Unfall", status: "bei-uns", seit: "seit 03/2026" },
      { key: "tierhalter-hund", label: "Hundehalterhaftpflicht", status: "pruefen", oeffner: "Hat Ihr Hund eine eigene Haftpflicht?" },
      { key: "kfz", label: "Kfz", status: "pruefen" },
    ];
    const vorsorge = { key: "pkv" as const, label: "PKV-Check", oeffner: "Haben Sie das schon einmal vergleichen lassen?" };
    const z = schutzBereich(s, ["hausrat"], vorsorge);
    expect(z.map((x) => x.eintrag.key)).toEqual(["tierhalter-hund", "rechtsschutz", "pkv", "hausrat", "kfz", "haftpflicht", "unfall"]);
    expect(z.filter((x) => x.tipp).map((x) => x.tipp)).toEqual(["Hat Ihr Hund eine eigene Haftpflicht?", "Wer zahlt bei Ihnen den Anwalt?", vorsorge.oeffner]);
    // Vorsorge-Thema noch nicht im Überblick: Zeile „Weiß nicht“, gespeichert erst nach einer Antwort
    expect(z[2]).toMatchObject({ neu: true, eintrag: { key: "pkv", label: "Private Krankenversicherung", status: "pruefen" } });
    // bei uns versichert: kein Vorsorge-Tipp; ohne Überblick nur das Thema
    expect(schutzBereich([{ key: "pkv", label: "PKV", status: "bei-uns" }], [], vorsorge).some((x) => x.tipp)).toBe(false);
    expect(schutzBereich([], [], null)).toEqual([]);
    expect(schutzBereich([], [], vorsorge).map((x) => x.eintrag.key)).toEqual(["pkv"]);
  });

  it("zugeklappte Zeile: Sparte · Antwort · Versicherer, Tarif und Beitrag", () => {
    expect(schutzKurz({ key: "hausrat", label: "Hausrat", status: "woanders", versicherer: "HUK", tarif: "Classic", beitrag: 8 })).toBe("Hausrat · Ja, woanders · HUK Classic, 8 €");
    expect(schutzKurz({ key: "hausrat", label: "Hausrat", status: "woanders", versicherer: "HUK", beitrag: 8.5 })).toBe("Hausrat · Ja, woanders · HUK, 8,50 €");
    expect(schutzKurz({ key: "pkv", label: "Private Krankenversicherung", status: "woanders" })).toBe("Private Krankenversicherung · Ja, woanders");
    expect(schutzKurz({ key: "unfall", label: "Unfall", status: "bei-uns", seit: "seit 03/2026" })).toBe("Unfall · Ja, bei mir · seit 03/2026");
    expect(schutzKurz({ key: "unfall", label: "Unfall", status: "luecke" })).toBe("Unfall · Nein");
    expect(hatGedankenstrich(schutzKurz({ key: "x", label: "Kfz", status: "pruefen" }))).toBe(false);
  });

  it("Präsentation unverändert: „Ja, woanders“ bei PKV steht auf der Folie nur mit Versicherer, ohne Gesundheitsangaben", () => {
    const k = ladeTarifkatalog(path.join(__dirname, "..", "fixtures", "tarifkatalog"));
    const a = startAuswahl(k, ["haftpflicht"], { rolle: "vertreter", gesellschaften: ["allianz"] });
    a.schutz = [
      { key: "haftpflicht", label: "Privathaftpflicht", status: "pruefen" },
      { key: "pkv", label: "Private Krankenversicherung", status: "woanders", versicherer: "DKV", tarif: "BestMed", beitrag: 480 },
    ];
    const ang = zuAngebote(cleanTarifauswahl(JSON.parse(JSON.stringify(a)))!);
    const pkv = ang.schutz?.find((z) => z.key === "pkv");
    expect(pkv).toEqual({ key: "pkv", label: "Private Krankenversicherung", status: "woanders", info: "bei DKV BestMed, ca. 480 € im Monat", versicherer: "DKV" });
    const u = folien(termin(), ang, markeFuer({ name: "Allianz Agentur Test" })).find((f) => f.id === "ueberblick")!.html;
    expect(u).toContain('data-schutz="pkv" data-status="woanders"');
    expect(u).toContain("Ihr Schutz im Überblick");
  });
});

describe("Nicht mehr bestehende Verträge sind keine Verträge (Usability-Check 18.11.2026)", () => {
  it("„Rechtsschutz ausgelaufen“ ist eine Lücke, nie „Ja, woanders“", () => {
    const s = schutzVorschlag(termin({ angaben: { vorhanden: "Rechtsschutz ausgelaufen" } }), { angebot: ["rechtsschutz"] });
    expect(s.find((x) => x.key === "rechtsschutz")).toMatchObject({ status: "luecke", quelle: "chat" });
  });

  it("gekündigt, hatte mal, nicht mehr, war mal, abgelaufen: je Satzteil, Laufendes bleibt „woanders“", () => {
    const s = schutzVorschlag(
      termin({ angaben: { vorhanden: "Haftpflicht bei HUK, Unfall gekündigt, Hausrat hatte ich mal und Rechtsschutz habe ich nicht mehr" } }),
      { angebot: [] },
    );
    expect(status(s)).toMatchObject({ haftpflicht: "woanders", unfall: "luecke", hausrat: "luecke", rechtsschutz: "luecke" });
    expect(nichtMehrVorhanden("Unfall war mal bei der Allianz; Hausrat abgelaufen")).toEqual(["unfall", "hausrat"]);
    expect(nichtMehrVorhanden("Haftpflicht bei HUK")).toEqual([]);
  });

  it("überstimmt auch eine im Komplettcheck aufgeführte Sparte", () => {
    const d = { ...termin({ angaben: { vorhanden: "Rechtsschutz ist abgelaufen" } }), komplettcheck: true, vorvertraege: { at: "2026-11-17T10:00:00Z", liste: [{ sparte: "Rechtsschutz" }] } };
    expect(schutzVorschlag(d, { angebot: [] }).find((x) => x.key === "rechtsschutz")?.status).toBe("luecke");
  });

  it("im Zweifel „Weiß nicht“ (prüfen) statt „woanders“", () => {
    const s = schutzVorschlag(termin({ angaben: { vorhanden: "Haftpflicht bei HUK, Rechtsschutz weiß ich nicht, glaube Unfall über den Arbeitgeber" } }), { angebot: [] });
    expect(status(s)).toMatchObject({ haftpflicht: "woanders", rechtsschutz: "pruefen", unfall: "pruefen" });
    expect(unsicherGenannt("Hausrat?")).toEqual(["hausrat"]);
  });

  it("Folie: keine Zeile „ersetzt Ihren bisherigen Vertrag“ bei ausgelaufenem Vertrag", () => {
    const k = ladeTarifkatalog(path.join(__dirname, "..", "fixtures", "tarifkatalog"));
    const a = startAuswahl(k, ["haftpflicht"], { rolle: "vertreter", gesellschaften: ["allianz"] });
    a.schutz = schutzVorschlag(termin({ angaben: { vorhanden: "Haftpflicht ausgelaufen" } }), { angebot: ["haftpflicht"] });
    expect(a.schutz.find((x) => x.key === "haftpflicht")?.status).toBe("luecke");
    const u = folien(termin(), zuAngebote(a), markeFuer({ name: "Allianz Agentur Test" })).find((f) => f.id === "ueberblick")!.html;
    expect(u).not.toContain("ersetzt Ihren bisherigen Vertrag");
  });

  it("Rückfall ohne KI: ausgelaufene Verträge kommen nicht in die Liste", () => {
    expect(vertraegeAusText("Haftpflicht bei der HUK, Rechtsschutz ausgelaufen, Unfall hatte ich mal").map((v) => v.sparte)).toEqual(["Haftpflicht"]);
  });
});

describe("„Was hat … schon?“ nach dem Usability-Check (18.11.2026)", () => {
  it("Vorschlag mit Quelle: der Satz aus dem Chat bzw. Formular; unsicher Genanntes als Vorschlag „Weiß nicht“", () => {
    const d = termin({
      angaben: { vorhanden: "Haftpflicht bei der HUK. Rechtsschutz hatte ich mal, ist aber ausgelaufen. Unfall? weiß ich nicht" },
      formular: [{ label: "Bestehende Versicherungen", value: "Hausrat bei der Allianz" }],
    });
    const s = schutzVorschlag(d, { angebot: [] });
    const by = (k: string) => s.find((x) => x.key === k);
    expect(by("haftpflicht")).toMatchObject({ status: "woanders", quelle: "chat", zitat: "Haftpflicht bei der HUK" });
    expect(by("rechtsschutz")).toMatchObject({ status: "luecke", quelle: "chat", zitat: "Rechtsschutz hatte ich mal, ist aber ausgelaufen" });
    expect(by("unfall")).toMatchObject({ status: "pruefen", quelle: "chat", zitat: "Unfall? weiß ich nicht" });
    expect(by("hausrat")).toMatchObject({ status: "woanders", quelle: "formular", zitat: "Hausrat bei der Allianz" });
    expect(zitatFuer("x".repeat(150) + " Hausrat", "hausrat")).toHaveLength(100);
    expect(zitatFuer("nichts dazu", "hausrat")).toBeNull();
  });

  it("unbeantwortet = „prüfen“ ohne Quelle und ohne Antwort; „Weiß nicht“ gewählt zählt als beantwortet", () => {
    expect(schutzOffen({ status: "pruefen" })).toBe(true);
    expect(schutzOffen({ status: "pruefen", beantwortet: true })).toBe(false);
    expect(schutzOffen({ status: "pruefen", quelle: "chat" })).toBe(false);
    expect(schutzOffen({ status: "luecke" })).toBe(false);
    expect(cleanSchutz([{ key: "unfall", label: "Unfall", status: "pruefen", beantwortet: true, zitat: "  Unfall?   weiß nicht " }, { key: "kfz", label: "Kfz", status: "pruefen", beantwortet: "ja" }])).toEqual([
      { key: "unfall", label: "Unfall", status: "pruefen", beantwortet: true, zitat: "Unfall? weiß nicht" },
      { key: "kfz", label: "Kfz", status: "pruefen" },
    ]);
  });

  it("Ampel-Farben als Schrift auf Weiß mindestens 4,5 : 1 (WCAG AA)", () => {
    const lum = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    for (const st of SCHUTZ_REIHENFOLGE) expect(1.05 / (lum(SCHUTZ_STATUS[st].farbe) + 0.05)).toBeGreaterThanOrEqual(4.5);
    expect(SCHUTZ_STATUS["bei-uns"].farbe).toBe("#047857");
    expect(SCHUTZ_STATUS.pruefen.farbe).toBe("#b45309");
  });
});

describe("schutzFragenStand (Zähler „Was hat … schon?“, 19.11.2026)", () => {
  const e = (key: string, status: SchutzEintrag["status"], x: Partial<SchutzEintrag> = {}): SchutzEintrag => ({ key, label: SCHUTZ_SPARTEN[key] ?? key, status, ...x });
  it("zählt nur Zeilen der Folie außerhalb des festen Angebots; Vorschläge und Beantwortetes gelten als beantwortet", () => {
    const schutz = [
      e("rechtsschutz", "pruefen"), // fest im Angebot: zeigt die Folie ohnehin als „Im Angebot“
      e("unfall", "pruefen"), // offen
      e("hausrat", "pruefen", { beantwortet: true }), // „Weiß nicht“ gewählt
      e("haftpflicht", "luecke", { quelle: "chat" }), // Vorschlag aus dem Chat
      e("wohngebaeude", "pruefen"), // offen, als Chance im Angebot (bei Bedarf)
    ];
    const sparten = [{ key: "rechtsschutz" }, { key: "wohngebaeude", zusatz: true }];
    expect(schutzFragenStand(schutz, sparten)).toEqual({ beantwortet: 2, von: 4 });
    expect(schutzFragenStand([], sparten)).toEqual({ beantwortet: 0, von: 0 });
    // Vorsorge-Thema: offene Zeile im Bereich, noch nicht gespeichert
    const vorsorge = { key: "risikoleben" as const, label: "Risikoleben", oeffner: "Frage" };
    expect(schutzFragenStand(schutz, sparten, vorsorge)).toEqual({ beantwortet: 2, von: 5 });
    expect(schutzFragenStand([...schutz, e("risikoleben", "luecke", { beantwortet: true })], sparten, vorsorge)).toEqual({ beantwortet: 3, von: 5 });
  });
  it("höchstens so viele Fragen, wie Zeilen auf die Folie passen", () => {
    const viele = Object.keys(SCHUTZ_SPARTEN).slice(0, 10).map((k) => e(k, "pruefen"));
    expect(schutzFragenStand(viele, []).von).toBeLessThanOrEqual(6);
  });
});
