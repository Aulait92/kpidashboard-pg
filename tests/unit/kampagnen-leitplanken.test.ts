// Gemeinsames Anzeigenlernen mit Leitplanken (Ole, 24.11.2026): Muster aus dem Werbekonto eines anderen Kunden.
// Zugesagt: „ohne Namen, Personenfotos, Logos oder Zahlen einzelner Kunden“. Hier die festen Bausteine ohne Datenbank:
// Bildidee nur in festen Kategorien, bereinigte Muster, Anweisungen ohne Namen und Kennzahlen, feste Ausgabeprüfung,
// alte Kontexte, Sperre bei Widerspruch, Werbebibliothek. Der Ablauf mit Datenbank steht in
// tests/integration/kampagnen-leitplanken.test.ts.
import { afterEach, describe, expect, it } from "vitest";
import { BILDIDEE_FELDER, BILDIDEE_WERTE, bildideeAusBild, bildideeText, gueltigeBildidee, validateBildidee } from "@/lib/kampagnen/bildidee";
import {
  HINWEIS_ENTFERNT,
  bereinigeMusterText,
  fremdMusterAus,
  fremdMusterBlock,
  hatFremdvorlagen,
  istAltformat,
  leitplankenKontext,
  musterAnzeige,
  musterFuerWinkel,
  namensteileDerQuelle,
  ohneNamen,
  pruefeAusgabe,
  sichereKontext,
  sichereWinkelSchluessel,
  winkelFehler,
  woertlicheUebernahme,
  type QuelleDaten,
} from "@/lib/kampagnen/fremdvorlagen";
import {
  CHECK_EIGENE_GEWINNER,
  CHECK_LERNMUSTER,
  angleResearcher,
  copywriter,
  eigeneGewinnerAbschnitt,
  formAgent,
  fremdMusterAbschnitt,
  leitplankenBefunde,
  productPatterns,
  reviewer,
  reviseCopies,
  staticChecks,
  strategist,
} from "@/lib/kampagnen/agents";
import { libraryWinners } from "@/lib/kampagnen/ad-library";
import { ausgenommeneUnter, meldungLernSperre, vomLernenAusgenommen } from "@/lib/kampagnen/lern-sperre";
import type { LlmCall, LlmRequest } from "@/lib/kampagnen/llm";
import type { AdCopy, Angle, Bildidee, CampaignContext, CampaignPlan, EigenerGewinner, LeadFormDraft } from "@/lib/kampagnen/types";

// ─── Beispiel: Quelle „Lohmann“ in Musterstadt, Ziel „Schwarzkopf“ in Hamburg ───────────────

const QUELLE: QuelleDaten = {
  id: "quelle1",
  name: "Allianz Generalvertretung Max Lohmann",
  region: "Musterstadt",
  firmen: ["Lohmann Versicherungen OHG", null],
  kontakt: { name: "Allianz Agentur Lohmann", firstName: "Max", lastName: "Lohmann", leaderNames: "Max Lohmann, Petra Wiesner", city: "Musterstadt", zip: "70173" },
  team: ["Jana Kruse", null],
  adAccountId: "111",
  seiten: ["900"],
};

const BILD = "https://scontent-fra3-1.xx.fbcdn.net/v/t45.1600-4/lohmann-katze.jpg?oe=ABC123";
const fremdGewinner = (over: Partial<EigenerGewinner> = {}): EigenerGewinner => ({
  adId: "120001",
  name: "Lohmann | Katze | Tierarztrechnung",
  kampagne: "PG | Lohmann | Katze",
  ausgaben: 240.5,
  leads: 31,
  leadsQuelle: "app",
  termine: 7,
  cpl: 7.76,
  kostenJeTermin: 34.36,
  ctr: 1.83,
  primaryText:
    "Wie hoch war Ihre letzte Tierarztrechnung? Seit 2019 sind die Kosten um bis zu 30 % gestiegen, eine OP kostet schnell zweitausend Euro. Ihr Berater Max Lohmann von der Allianz in Musterstadt zeigt Ihnen in 5 Minuten, wie Sie Ihre Katze absichern. Mehr unter www.lohmann-versicherung.de, per Mail an max@lohmann-versicherung.de oder 0711 123456. #TeamLohmann Jetzt kurz Ihre Angaben eintragen, ich melde mich persönlich.",
  headline: "Katze absichern in Musterstadt",
  description: "Ihr Team Lohmann",
  cta: "LEARN_MORE",
  bildUrl: BILD,
  video: false,
  passtZumProdukt: true,
  ...over,
});

const PRODUKT = "Katzenversicherung (TKV)";
const ziel = (over: Partial<CampaignContext> = {}): CampaignContext => ({
  customerId: "ziel1",
  customerName: "Agentur Schwarzkopf",
  advisorName: "Peter Schwarzkopf",
  vermittlerTyp: "vertreter",
  insurer: "LVM",
  product: PRODUKT,
  wish: null,
  anrede: "Sie",
  city: "Hamburg",
  zip: "20095",
  region: null,
  website: null,
  privacyUrl: "https://schwarzkopf.test/datenschutz",
  pageId: "555",
  adAccountId: "222",
  dailyBudgetEur: 20,
  cplEur: 12,
  special: null,
  assistantKnowledge: null,
  patterns: productPatterns(PRODUKT),
  ...over,
});

const BILDIDEE: Bildidee = { motivart: "tier", bildaufbau: "vollflaechig", bildausschnitt: "nah", farbwelt: "hell_warm", textplatzierung: "unten", textgestaltung: "band" };
const TEILE = namensteileDerQuelle(QUELLE, ziel());
const musterListe = () => fremdMusterAus([fremdGewinner(), fremdGewinner({ adId: "120002", name: "Lohmann | Hund", passtZumProdukt: false, video: true })], { teile: TEILE, versicherer: "LVM" }, [BILDIDEE, null]);
/** Kontext im neuen Format (wie ihn loadCampaignContext bei vorlagenVon liefert). */
const fremdKontext = (over: Partial<CampaignContext> = {}): CampaignContext =>
  ziel({ eigeneGewinner: null, eigeneGewinnerHinweis: "Muster aus einem anderen Werbekonto: 2 Anzeigen als Muster (ohne Namen, Bilder und Zahlen).", fremdvorlagen: true, fremdMuster: musterListe(), vorlagenQuelleId: QUELLE.id, ...over });
/** Kontext im alten Format (Commit 6f668ea): Gewinner der Quelle ungefiltert, Hinweis nennt den Quellkunden. */
const altKontext = (over: Partial<CampaignContext> = {}): CampaignContext =>
  ziel({ eigeneGewinner: [fremdGewinner(), fremdGewinner({ adId: "120002", name: "Lohmann | Hund", passtZumProdukt: false })], eigeneGewinnerHinweis: `Vorlagen aus dem Werbekonto von ${QUELLE.name}`, wish: "stark an Lohmanns Gewinnern anlehnen", ...over });

/** Alles, was die Quelle erkennbar macht bzw. Zahl der Quelle ist. */
const VERBOTEN = [/lohmann/i, /wiesner/i, /musterstadt/i, /70173/, /fbcdn/i, /scontent/i, /120001/, /7[.,]76/, /34[.,]36/, /240[.,]5/, /1[.,]83/, /\b31 Leads/, /0711/, /2019/, /zweitausend/i];
const ohneVerbotenes = (text: string) => {
  for (const re of VERBOTEN) expect(text, `enthält ${re}`).not.toMatch(re);
};

const usage = { tokensIn: 100, tokensOut: 50, costCents: 1 };
const PLAN = { campaignName: "PG | Katze | 2026-11-24", objective: "OUTCOME_LEADS", dailyBudgetEur: 20, specialAdCategories: [], adSets: [{ name: "A", ageMin: 25, ageMax: 65, radiusKm: 30, advantageAudience: true, note: "" }], adsPerAdSet: 3, zielgruppe: "Katzenhalter in Hamburg", begruendung: "x" } as CampaignPlan;
const winkel = (insight = "Lernmuster 1, weil die Frage nach der Rechnung stoppt"): Angle[] => ["kosten", "regional", "neugier"].map((k) => ({ key: k, title: `Winkel ${k}`, hook: `Hook ${k}`, insight }));
const anzeige = (over: Partial<AdCopy> = {}): AdCopy => ({
  angleKey: "kosten",
  primaryText: "Tierarztbesuche werden teurer. Lassen Sie uns kurz darüber sprechen, wie Ihre Katze gut abgesichert ist. Tragen Sie Ihre Angaben ein, ich rufe Sie an.",
  headline: "Katze gut abgesichert",
  description: "Persönliche Beratung",
  imageHeadline: "Tierarztrechnung?",
  imageSubline: "Ihr Berater in Hamburg",
  cta: "GET_QUOTE",
  ...over,
});
const FORM: LeadFormDraft = { formName: "PG | Katze | Formular", introTitle: "Katze absichern", introParagraphs: ["Ich melde mich."], questions: [{ key: "a", label: "A?", options: ["x", "y"] }, { key: "b", label: "B?", options: ["x", "y"] }], thankYouTitle: "Danke", thankYouBody: "Bis gleich.", consentText: "Ich bin einverstanden, dass man mich zu meiner Anfrage kontaktiert. Widerruf jederzeit." };

function fangLlm(antworten: Record<string, unknown>): { llm: LlmCall; reqs: LlmRequest[] } {
  const reqs: LlmRequest[] = [];
  return {
    reqs,
    llm: async (req) => {
      reqs.push(req);
      const a = antworten[req.agent] ?? antworten[req.agent.replace(/ \(Überarbeitung\)$/, "")];
      return { text: JSON.stringify(typeof a === "function" ? (a as (n: number) => unknown)(reqs.filter((r) => r.agent === req.agent).length) : a), usage };
    },
  };
}

// ─── 1. Bildidee statt Vorlagenbild ────────────────────────────────────

describe("Bildidee: nur feste Kategorien, kein freier Text", () => {
  it("gültig nur mit genau den sechs Feldern und Schlüsseln aus der Liste", () => {
    expect(validateBildidee(BILDIDEE)).toEqual({ ok: true, value: BILDIDEE });
    expect(BILDIDEE_FELDER).toEqual(["motivart", "bildaufbau", "bildausschnitt", "farbwelt", "textplatzierung", "textgestaltung"]);
    // freier Text, Personenbeschreibung, Wortlaut aus dem Bild: alles ungültig
    expect(validateBildidee({ ...BILDIDEE, motivart: "Frau, etwa 40, blond, mit Katze auf dem Arm" }).ok).toBe(false);
    expect(validateBildidee({ ...BILDIDEE, textplatzierung: "unten: „Max Lohmann, Ihre Allianz in Musterstadt“" }).ok).toBe(false);
    expect(validateBildidee({ ...BILDIDEE, beschreibung: "Logo der Allianz oben rechts" }).ok).toBe(false);
    expect(validateBildidee({ motivart: "tier" }).ok).toBe(false);
    expect(validateBildidee("tier").ok).toBe(false);
    expect(gueltigeBildidee({ ...BILDIDEE, farbwelt: "#0038a8" })).toBeNull();
  });

  it("der Hinweistext besteht nur aus den festen Beschreibungen", () => {
    const t = bildideeText(BILDIDEE)!;
    expect(t).toBe("Motivart: Foto eines Tiers; Bildaufbau: ein Motiv füllt die ganze Fläche, der Text liegt darüber; Bildausschnitt: Nahaufnahme; Farbwelt: hell und warm; Platzierung der Texte: unten; Gestaltung der Texte: auf einem farbigen Band bzw. Balken");
    expect(bildideeText({ ...BILDIDEE, motivart: "Max Lohmann vor seinem Büro" })).toBeNull();
    expect(bildideeText(null)).toBeNull();
    // Die Liste selbst beschreibt keine Personen (kein Alter, Geschlecht, Aussehen) und enthält keine Zahlen
    const alle = Object.values(BILDIDEE_WERTE).flatMap((w) => Object.values(w)).join(" ");
    expect(alle).not.toMatch(/\d|Frau|Mann\b|blond|alt\b|jung|Jahre/);
  });

  it("Bild-Aufruf: das Bild geht nur an diesen Aufruf, zurück kommen nur Schlüssel", async () => {
    const f = fangLlm({ Bildidee: BILDIDEE });
    const r = await bildideeAusBild(f.llm, BILD);
    expect(r.value).toEqual(BILDIDEE);
    expect(r.usage).toEqual(usage);
    expect(f.reqs).toHaveLength(1);
    expect(f.reqs[0].imageUrls).toEqual([BILD]);
    // Schema: nur Aufzählungen, keine freien Textfelder
    const props = (f.reqs[0].schema as { properties: Record<string, { type: string; enum?: string[] }>; additionalProperties: boolean }).properties;
    expect((f.reqs[0].schema as { additionalProperties: boolean }).additionalProperties).toBe(false);
    for (const feld of BILDIDEE_FELDER) expect(props[feld].enum).toEqual(Object.keys(BILDIDEE_WERTE[feld]));
    expect(f.reqs[0].system).toMatch(/keine Personen/);
  });

  it("freier Text vom Modell (auch im zweiten Versuch): keine Bildidee; kein https: kein Aufruf", async () => {
    const f = fangLlm({ Bildidee: { ...BILDIDEE, motivart: "Frau mit Katze, im Bild steht Max Lohmann" } });
    const r = await bildideeAusBild(f.llm, BILD);
    expect(r.value).toBeNull();
    expect(f.reqs).toHaveLength(2);
    expect(r.usage.tokensIn).toBe(200);
    const g = fangLlm({ Bildidee: BILDIDEE });
    expect((await bildideeAusBild(g.llm, "http://unsicher.test/bild.jpg")).value).toBeNull();
    expect(g.reqs).toHaveLength(0);
    // Fehler bzw. Zeitüberschreitung des Aufrufs: ohne Bildidee weiter
    expect((await bildideeAusBild(async () => Promise.reject(new Error("400 image fetch failed")), BILD)).value).toBeNull();
    expect((await bildideeAusBild(() => new Promise(() => undefined), BILD, 20)).value).toBeNull();
  });
});

// ─── 2. Muster statt Gewinner ──────────────────────────────────────────

describe("Namensteile der Quelle", () => {
  const worte = (art?: "name" | "ort") => TEILE.filter((t) => !art || t.art === art).map((t) => t.wort.toLowerCase());

  it("aus den Kundendaten: Name, Ansprechpartner, Inhaber, Berater, Ort, PLZ; Allerweltswörter ausgenommen", () => {
    expect(worte("name").sort()).toEqual(["jana", "kruse", "lohmann", "max", "petra", "wiesner"]);
    expect(worte("ort").sort()).toEqual(["70173", "musterstadt"]);
    for (const w of ["allianz", "generalvertretung", "agentur", "versicherungen", "ohg"]) expect(worte()).not.toContain(w);
  });

  it("was auch zum Zielkunden gehört, zählt nicht (gleicher Ort, gleicher Nachname, Produktwörter)", () => {
    const quelle = { ...QUELLE, name: "Katzenversicherung Lohmann Hamburg", region: "Hamburg", kontakt: { ...QUELLE.kontakt, city: "Hamburg", zip: "20095" } };
    const t = namensteileDerQuelle(quelle, ziel({ advisorName: "Max Schwarzkopf" })).map((x) => x.wort.toLowerCase());
    expect(t).toContain("lohmann");
    for (const w of ["max", "hamburg", "20095", "katzenversicherung"]) expect(t).not.toContain(w);
  });

  it("gewöhnliche Wörter als Nachname oder Ort zählen nur im Zusammenhang", () => {
    const koch = namensteileDerQuelle({ id: "k", name: "Allianz Agentur Koch", kontakt: { firstName: "Frank", lastName: "Koch", city: "Essen" } }, ziel());
    expect(koch.every((t) => t.schwach)).toBe(true);
    const fund = (text: string) => pruefeAusgabe({ muster: [], teile: koch, copies: [anzeige({ primaryText: text })] }).length;
    expect(fund("Ob Koch oder Schreiner: Berufsunfähigkeit trifft jeden. Gutes Essen gehört dazu, frank und frei gesagt.")).toBe(0);
    expect(fund("Ihr Berater Frank Koch ist für Sie da.")).toBe(1);
    expect(fund("Die Agentur Koch berät Sie gern.")).toBe(1);
    expect(fund("Koch Versicherungen berät Sie gern.")).toBe(1);
    expect(fund("Für Katzenhalter in Essen und Umgebung.")).toBe(1);
  });
});

describe("Muster aus den Gewinnern der Quelle", () => {
  it("Mustertext: Namen, Orte, Zahlen, Links und fremder Versicherer werden Platzhalter, der Aufhänger bleibt", () => {
    const t = bereinigeMusterText(fremdGewinner().primaryText, { teile: TEILE, versicherer: "LVM" })!;
    expect(t.startsWith("Wie hoch war Ihre letzte Tierarztrechnung? Seit [Zahl] sind die Kosten um bis zu [Zahl] % gestiegen, eine OP kostet schnell [Zahl] Euro.")).toBe(true);
    expect(t).toContain("Ihr Berater [Name] von der [Versicherer] in [Ort] zeigt Ihnen in [Zahl] Minuten");
    expect(t).toContain("Mehr unter [Link], per Mail an [Link] oder [Zahl].");
    expect(t).toContain("[Hashtag]");
    expect(t).not.toMatch(/\d/);
    ohneVerbotenes(t);
    expect(t).not.toMatch(/allianz|www\.|@/i);
    // Der eigene Versicherer des Zielkunden bleibt stehen
    expect(bereinigeMusterText("Ihre Allianz vor Ort", { teile: TEILE, versicherer: "Allianz" })).toBe("Ihre Allianz vor Ort");
    expect(bereinigeMusterText("Ihre Allianz vor Ort", { teile: TEILE, versicherer: null })).toBe("Ihre [Versicherer] vor Ort");
    expect(bereinigeMusterText("  ", { teile: TEILE })).toBeNull();
  });

  it("Mustertext: auch Namen, die nicht in den Kundendaten stehen, verschwinden nach Wörtern wie „Berater“, „Team“, „Frau“", () => {
    const t = bereinigeMusterText(
      "Ihr Berater Klaus Petersen hilft Ihnen gern. Fragen Sie Frau Dr. Schulze oder das Team Nordlicht, auch Ihre Agentur Brandt & Söhne berät Sie. Ihr Versicherungsmakler in der Nähe. Ihr Karl Brandt",
      { teile: TEILE },
    )!;
    expect(t).toBe("Ihr Berater [Name] hilft Ihnen gern. Fragen Sie Frau Dr. [Name] oder das Team [Name], auch Ihre Agentur [Name] & Söhne berät Sie. Ihr Versicherungsmakler in der Nähe. Ihr [Name]");
    // gewöhnliche Sätze bleiben lesbar
    expect(bereinigeMusterText("Fragen Sie Ihren Berater. Viele Katzenhalter kennen das: Der Tierarzt wird teurer.", { teile: TEILE })).toBe("Fragen Sie Ihren Berater. Viele Katzenhalter kennen das: Der Tierarzt wird teurer.");
  });

  it("Muster enthalten nur Rang, Texte, Button und Bildidee: keine Namen, Kennzahlen, Anzeigen-ID oder Bild-Adresse", () => {
    const m = musterListe();
    expect(m).toHaveLength(2);
    expect(Object.keys(m[0]).sort()).toEqual(["bildidee", "cta", "description", "headline", "passtZumProdukt", "primaryText", "video"]);
    expect(m[0]).toMatchObject({ passtZumProdukt: true, video: false, headline: "Katze absichern in [Ort]", description: "Ihr Team [Name]", cta: "LEARN_MORE", bildidee: BILDIDEE });
    expect(m[1]).toMatchObject({ passtZumProdukt: false, video: true, bildidee: null });
    ohneVerbotenes(JSON.stringify(m));
    // Ungültige Bildidee (freier Text) wird nicht übernommen
    expect(fremdMusterAus([fremdGewinner()], { teile: TEILE }, [{ ...BILDIDEE, motivart: "Max Lohmann" }])[0].bildidee).toBeNull();
  });

  it("Zusatzwunsch nennt die Quelle nicht mehr", () => {
    expect(ohneNamen("stark an Lohmanns Gewinnern anlehnen, Fokus Freigänger", TEILE)).toBe("stark an [Name] Gewinnern anlehnen, Fokus Freigänger");
    expect(ohneNamen("Budget 30 € in Hamburg", TEILE)).toBe("Budget 30 € in Hamburg");
    expect(ohneNamen(null, TEILE)).toBeNull();
  });
});

// ─── 3. Anweisungen an die Agenten ─────────────────────────────────────

describe("Anweisungen bei Mustern aus einem anderen Werbekonto", () => {
  const antworten = {
    Stratege: { dailyBudgetEur: 20, adsPerAdSet: 3, zielgruppe: "K", begruendung: "b", adSets: [{ name: "A", ageMin: 25, ageMax: 65, radiusKm: 30, advantageAudience: true, note: "" }] },
    "Angle-Rechercheur": { angles: winkel() },
    Texter: { ads: winkel().map((w) => anzeige({ angleKey: w.key })) },
    "Formular-Agent": FORM,
    Prüfer: { status: "gruen", summary: "ok", findings: [] },
  };

  async function alleAnweisungen(c: CampaignContext) {
    const f = fangLlm(antworten);
    await strategist(f.llm, c, PLAN.campaignName);
    await angleResearcher(f.llm, c, PLAN, { fremdNamensteile: TEILE });
    await copywriter(f.llm, c, PLAN, winkel());
    await reviseCopies(f.llm, c, [anzeige()], [{ severity: "rot", area: "text", index: 0, issue: "i", fix: "f" }], ["kosten", "regional", "neugier"]);
    await formAgent(f.llm, c);
    await reviewer(f.llm, c, { plan: PLAN, copies: winkel().map((w) => anzeige({ angleKey: w.key })), form: FORM, images: [], angles: winkel(), fremdNamensteile: TEILE });
    return Object.fromEntries(f.reqs.map((r) => [r.agent, `${r.system}\n${r.user}`]));
  }

  it("Block: Rangfolge und bereinigte Texte, keine Anzeigen- und Kampagnennamen, keine Kennzahlen", () => {
    const b = fremdMusterBlock(musterListe())!;
    expect(b).toContain("Lernmuster 1 (gleiches Produkt)");
    expect(b).toContain("Lernmuster 2 (anderes Produkt, nur Aufbau und Tonfall übertragen); Video-Anzeige");
    expect(b).toContain("Primärtext: „Wie hoch war Ihre letzte Tierarztrechnung?");
    expect(b).toContain("Button: LEARN_MORE");
    expect(b).not.toMatch(/je Lead|Leads|Termine|Klickrate|Ausgaben|€|Eigener Gewinner/);
    ohneVerbotenes(b);
    expect(fremdMusterBlock([])).toBeNull();
    expect(fremdMusterAbschnitt({ anrede: "Sie", fremdMuster: null })).toBe("");
  });

  it("kein Agent erfährt Namen, Kennzahlen oder Bild der Quelle; nie „eigene Anzeigen des Kunden“", async () => {
    const p = await alleAnweisungen(fremdKontext());
    for (const [agent, text] of Object.entries(p)) {
      ohneVerbotenes(text);
      expect(text, agent).not.toMatch(/EIGENE GEWINNER|eigenen Anzeigen des Kunden|Formulierungen dürfen deshalb näher|Eigener Gewinner|eng am genannten Gewinner|je Lead,|Klickrate/);
    }
    for (const agent of ["Angle-Rechercheur", "Texter", "Texter (Überarbeitung)", "Prüfer"]) {
      expect(p[agent], agent).toContain("LERNMUSTER AUS DEM GEMEINSAMEN ANZEIGENLERNEN (gut laufende Anzeigen aus einem anderen Werbekonto");
      expect(p[agent]).toContain("es sind nicht die Anzeigen dieses Kunden");
      expect(p[agent]).toMatch(/Nichts wörtlich übernehmen/);
      expect(p[agent]).toMatch(/Keine Namen, Orte, Versicherer-Zusätze, Zahlen oder Preise aus den Mustern/);
      expect(p[agent]).toMatch(/Art des Aufhängers, den Aufbau, die Länge, den Tonfall und die Art der Aufforderung/);
    }
    expect(p["Angle-Rechercheur"]).toContain("schreibe im insight wörtlich „Lernmuster <Nummer>“");
    expect(p.Texter).toContain("Winkel mit „Lernmuster N“");
    expect(p.Texter).toContain("vollständig neu formulieren (nichts wörtlich)");
    expect(p.Prüfer).toContain(CHECK_LERNMUSTER);
    expect(p.Prüfer).not.toContain(CHECK_EIGENE_GEWINNER);
    // Stratege und Formular-Agent brauchen die Muster nicht und bekommen sie nicht
    expect(p.Stratege).not.toMatch(/Lernmuster|LERNMUSTER/);
    expect(p["Formular-Agent"]).not.toMatch(/Lernmuster|LERNMUSTER/);
  });

  it("auch ein Kontext im alten Format geht nie ungefiltert in eine Anweisung", async () => {
    const p = await alleAnweisungen(altKontext());
    for (const [agent, text] of Object.entries(p)) {
      expect(text, agent).not.toMatch(/lohmann|fbcdn|120001|7[.,]76|240[.,]5|EIGENE GEWINNER|eigenen Anzeigen des Kunden|je Lead,|Klickrate/i);
    }
    expect(p.Texter).toContain("Lernmuster 1");
    // Der Zusatzwunsch nannte die Quelle („an Lohmanns Gewinnern“)
    expect(p.Texter).toContain("Zusatzwunsch von Ole: stark an [Name] Gewinnern anlehnen");
  });

  it("Winkel: Treffer der festen Prüfung gehen als Fehler in den zweiten Versuch; Schlüssel mit Namensteil wird neutral", async () => {
    const mitName = { angles: winkel().map((w, i) => (i === 0 ? { ...w, hook: "Fragen Sie Max Lohmann nach der Tierarztrechnung" } : w)) };
    const sauber = { angles: winkel().map((w, i) => (i === 1 ? { ...w, key: "lohmann-regional" } : w)) };
    const f = fangLlm({ "Angle-Rechercheur": (n: number) => (n === 1 ? mitName : sauber) });
    const r = await angleResearcher(f.llm, fremdKontext(), PLAN, { fremdNamensteile: TEILE });
    expect(f.reqs).toHaveLength(2);
    expect(f.reqs[1].user).toMatch(/angles\[0\]\.hook enthält „Max“, „Lohmann“: Name bzw\. Ort aus einem anderen Werbekonto/);
    expect(r.value.map((a) => a.key)).toEqual(["kosten", "winkel-2", "neugier"]);
    // bleibt der Treffer, bricht der Agent ab (der Lauf scheitert mit dieser Meldung, nichts geht weiter)
    await expect(angleResearcher(fangLlm({ "Angle-Rechercheur": mitName }).llm, fremdKontext(), PLAN, { fremdNamensteile: TEILE })).rejects.toThrow(/keine gültige Antwort nach 2 Versuchen/);
    expect(winkelFehler(winkel("Lernmuster 1: zitiert „Wie hoch war Ihre letzte Tierarztrechnung? Seit 2019 sind die Kosten um bis zu 30 % gestiegen“"), { muster: musterListe(), teile: TEILE })).toEqual([]);
  });
});

describe("Eigener Gewinner-Weg bleibt unverändert", () => {
  const eigener = fremdGewinner({ name: "Katze Tierarztrechnung", kampagne: "PG | Katze", primaryText: "Wie hoch war Ihre letzte Tierarztrechnung?", headline: "Katze absichern", description: null, bildUrl: "https://scontent.example/eigen.jpg" });
  const eigen = ziel({ eigeneGewinner: [eigener], eigeneGewinnerHinweis: null });

  it("Kontext ohne Fremdvorlagen wird nicht angefasst", async () => {
    expect(hatFremdvorlagen(eigen)).toBe(false);
    expect(leitplankenKontext(eigen)).toBe(eigen);
    expect(leitplankenBefunde(eigen, [anzeige({ primaryText: "Max Lohmann aus Musterstadt" })], TEILE)).toEqual([]);
    expect(musterAnzeige(eigen)).toBeNull();
    const g = await sichereKontext(eigen, { sperre: async () => new Set(["ziel1"]), quelle: async () => { throw new Error("nicht erwartet"); } });
    expect(g).toMatchObject({ fremd: false, geaendert: false, entfernt: false, altformat: false, namensteile: [] });
    expect(g.ctx).toBe(eigen);
  });

  it("Anweisungen wie bisher: eigene Zahlen, Name der Anzeige, „eigene Anzeigen des Kunden“", async () => {
    const a = eigeneGewinnerAbschnitt(eigen);
    expect(a).toContain("EIGENE GEWINNER AUS IHREM WERBEKONTO (echte Zahlen der letzten 90 Tage, bestlaufende Anzeigen dieses Kunden, beste zuerst):");
    expect(a).toContain("Eigener Gewinner 1: „Katze Tierarztrechnung“ (gleiches Produkt); 7,76 € je Lead, 31 Leads, 7 Termine (34,36 € je Termin), Klickrate 1,83 %, 241 € Ausgaben");
    expect(a).toContain("Es sind die eigenen Anzeigen des Kunden, Formulierungen dürfen deshalb näher übernommen werden als bei fremden Anzeigen.");
    const f = fangLlm({ "Angle-Rechercheur": { angles: winkel("Eigener Gewinner 1, weil") }, Texter: { ads: winkel().map((w) => anzeige({ angleKey: w.key })) }, Prüfer: { status: "gruen", summary: "ok", findings: [] } });
    await angleResearcher(f.llm, eigen, PLAN);
    await copywriter(f.llm, eigen, PLAN, winkel("Eigener Gewinner 1, weil"));
    const bilder = winkel().map((w) => ({ angleKey: w.key, imageUrl: `https://r2.test/${w.key}.jpg` }));
    const r = await reviewer(f.llm, eigen, { plan: PLAN, copies: winkel().map((w) => anzeige({ angleKey: w.key })), form: FORM, images: bilder, angles: winkel("Eigener Gewinner 1") });
    expect(f.reqs[0].user).toContain("bauen auf den eigenen Gewinnern aus dem Werbekonto auf (Hook und Aufbau übernehmen, für das Produkt abwandeln); schreibe im insight wörtlich „Eigener Gewinner <Nummer>“ und warum.");
    expect(f.reqs[1].user).toContain("Winkel mit „Eigener Gewinner N“: Primärtext, Überschrift und Bildzeilen eng am genannten Gewinner ausrichten");
    expect(f.reqs[2].user).toContain(CHECK_EIGENE_GEWINNER);
    for (const req of f.reqs) {
      expect(req.user).toContain(a);
      expect(req.user).not.toMatch(/Lernmuster|LERNMUSTER/);
    }
    // nur der bisherige Hinweis (ein eigener Gewinner, ein Winkel dazu reicht), keine Leitplanken-Befunde
    expect(r.value.findings).toEqual([]);
  });
});

// ─── 4. Feste Ausgabeprüfung ───────────────────────────────────────────

describe("Ausgabeprüfung (fest, kein Modell)", () => {
  const pruef = (copies: AdCopy[]) => pruefeAusgabe({ muster: musterListe(), teile: TEILE, copies });

  it("saubere Anzeigen: kein Befund (eigener Name und Ort des Zielkunden sind in Ordnung)", () => {
    expect(pruef([anzeige(), anzeige({ primaryText: "Ihr Berater Peter Schwarzkopf in 20095 Hamburg ist für Sie da. max. 5 Minuten, dann wissen Sie mehr über Ihre Absicherung." })])).toEqual([]);
  });

  it("findet Namensteile der Quelle in Texten und Bildzeilen (auch Schreibweisen und Wortteile)", () => {
    const b = pruef([
      anzeige({ primaryText: "Fragen Sie Max Lohmann, er kennt sich mit Katzen aus und berät Sie gern persönlich vor Ort." }),
      anzeige({ imageSubline: "Ihr Berater in MUSTERSTADT" }),
      anzeige({ headline: "Lohmanns Tipp für Katzen" }),
      anzeige({ description: "Für 70173 und Umgebung" }),
      anzeige({ imageHeadline: "Team Wiesner hilft" }),
    ]);
    expect(b.map((f) => [f.index, f.area, f.severity])).toEqual([[0, "text", "rot"], [1, "bild", "rot"], [2, "text", "rot"], [3, "text", "rot"], [4, "bild", "rot"]]);
    expect(b[0].issue).toBe("Primärtext enthält „Max“, „Lohmann“: Name bzw. Ort aus einem anderen Werbekonto.");
    expect(b[1].issue).toMatch(/^Kleine Zeile im Bild enthält „MUSTERSTADT“/);
    expect(b[2].issue).toMatch(/„Lohmanns“/);
    expect(b[0].fix).toMatch(/streichen/);
  });

  it("findet längere wörtliche Übernahmen (ab 8 gleichen Wörtern), auch mit anderen Zahlen; kürzere nicht", () => {
    const lang = pruef([anzeige({ primaryText: "Seit 2023 sind die Kosten um bis zu 40 % gestiegen, eine OP kostet schnell 1.500 Euro. Sichern Sie Ihre Katze jetzt ab und sprechen Sie mit uns." })]);
    expect(lang).toHaveLength(1);
    expect(lang[0]).toMatchObject({ severity: "rot", area: "text", index: 0 });
    expect(lang[0].issue).toMatch(/^Primärtext übernimmt ein Lernmuster wörtlich \(1\d gleiche Wörter in Folge: „seit # sind die kosten um bis zu # gestiegen eine op kostet schnell # euro“\)\.$/);
    // Der Aufhänger selbst (sechs Wörter) darf übernommen werden
    expect(pruef([anzeige({ primaryText: "Wie hoch war Ihre letzte Tierarztrechnung? Viele Katzenhalter staunen heute über die Summe auf dem Zettel und fragen sich, wie das weitergeht." })])).toEqual([]);
    expect(woertlicheUebernahme("eins zwei drei vier fünf sechs sieben", ["eins zwei drei vier fünf sechs sieben acht"])).toBeNull();
    expect(woertlicheUebernahme("A eins zwei drei vier fünf sechs sieben acht B", ["eins zwei drei vier fünf sechs sieben acht neun"])).toBe("eins zwei drei vier fünf sechs sieben acht");
  });

  it("eigene feste Formulierungen aus den Anweisungen zählen nicht als Übernahme", () => {
    const cta = "Jetzt kurz Ihre Angaben eintragen, ich melde mich persönlich.";
    expect(woertlicheUebernahme(cta, [fremdGewinner().primaryText])).not.toBeNull();
    // leitplankenBefunde kennt die Beispiel-Aufforderung aus der Anweisung an den Texter
    expect(leitplankenBefunde(fremdKontext(), [anzeige({ primaryText: `Tierarztbesuche werden teurer, das merken viele Katzenhalter gerade. ${cta}` })], TEILE)).toEqual([]);
  });

  it("findet stehen gebliebene Platzhalter und Namensteile im Schlüssel des Winkels", () => {
    const b = pruef([anzeige({ imageSubline: "Ihr Berater in [Ort]" }), anzeige({ angleKey: "lohmann-tierarzt" }), anzeige({ angleKey: "max-rechnung" })]);
    expect(b).toHaveLength(3);
    expect(b[0].issue).toMatch(/Platzhalter \[Ort\]/);
    expect(b[1].issue).toMatch(/Schlüssel des Winkels \(„lohmann-tierarzt“\).*Anzeigennamen bei Meta/);
    expect(sichereWinkelSchluessel(winkel().map((w, i) => (i === 2 ? { ...w, key: "musterstadt-neugier" } : w)), TEILE).map((a) => a.key)).toEqual(["kosten", "regional", "winkel-3"]);
  });

  it("läuft in den festen Prüfungen des Prüfers mit (rot) und zählt die Winkel mit Lernmuster", () => {
    const eingabe = { plan: PLAN, form: FORM, images: [{ angleKey: "kosten", imageUrl: "https://r2.test/1.jpg" }] };
    const rot = staticChecks(fremdKontext(), { ...eingabe, copies: [anzeige({ headline: "Lohmann empfiehlt" })], angles: winkel(), fremdNamensteile: TEILE });
    expect(rot.filter((f) => f.severity === "rot")).toHaveLength(1);
    expect(rot[0].issue).toMatch(/^Überschrift enthält „Lohmann“/);
    const gelb = staticChecks(fremdKontext(), { ...eingabe, copies: [anzeige()], angles: winkel("frei erfunden"), fremdNamensteile: TEILE });
    expect(gelb).toEqual([expect.objectContaining({ severity: "gelb", issue: "Nur 0 Winkel orientieren sich an den Lernmustern (Soll: 2)." })]);
    expect(staticChecks(fremdKontext(), { ...eingabe, copies: [anzeige()], angles: winkel(), fremdNamensteile: TEILE })).toEqual([]);
  });
});

// ─── 5./6. Gespeicherter Kontext, alte Läufe ───────────────────────────

describe("Kontext: neues Kennzeichen und altes Format", () => {
  it("erkennt Fremdvorlagen am Kennzeichen bzw. am alten Hinweis", () => {
    expect(hatFremdvorlagen(fremdKontext())).toBe(true);
    expect(istAltformat(fremdKontext())).toBe(false);
    expect(hatFremdvorlagen(altKontext())).toBe(true);
    expect(istAltformat(altKontext({ eigeneGewinnerHinweis: `Vorlagen aus dem Werbekonto von ${QUELLE.name} · Eigene Gewinner ohne Anzeigentexte: Creatives nicht lesbar (x).` }))).toBe(true);
    expect(hatFremdvorlagen(ziel({ eigeneGewinnerHinweis: "Eigene Gewinner nicht genutzt: META_ACCESS_TOKEN fehlt." }))).toBe(false);
  });

  it("altes Format wird bereinigt: Muster statt Gewinner, neutraler Hinweis, nichts von der Quelle bleibt", () => {
    const k = leitplankenKontext(altKontext(), TEILE);
    expect(k.eigeneGewinner).toBeNull();
    expect(k.fremdvorlagen).toBe(true);
    expect(k.fremdMuster).toHaveLength(2);
    expect(k.fremdMuster![0].bildidee).toBeNull(); // das alte Bild wird nie mehr angefasst, auch nicht für eine Bildidee
    expect(k.eigeneGewinnerHinweis).toBe("Muster aus einem anderen Werbekonto: 2 Anzeigen als Muster (ohne Namen, Bilder und Zahlen).");
    expect(k.wish).toBe("stark an [Name] Gewinnern anlehnen");
    ohneVerbotenes(JSON.stringify(k));
    // gleichbleibend bei wiederholtem Aufruf
    expect(leitplankenKontext(k, TEILE)).toEqual(k);
    // ohne Zugriff auf die Kundendaten: wenigstens der Name aus dem alten Hinweis, Zahlen und Bild
    const ohneDaten = JSON.stringify(leitplankenKontext(altKontext()));
    expect(ohneDaten).not.toMatch(/lohmann|fbcdn|120001|7[.,]76|240[.,]5|2019/i);
  });

  it("Admin-Ansicht: nur Reihenfolge, Produkt-Treffer, Bildidee ja/nein, genutzt", () => {
    expect(musterAnzeige(fremdKontext(), winkel("Lernmuster 2 als Vorbild"))).toEqual([
      { passtZumProdukt: true, video: false, bildidee: true, genutzt: false },
      { passtZumProdukt: false, video: true, bildidee: false, genutzt: true },
    ]);
    // Läufe aus dem alten Format: die Winkel nennen noch „Eigener Gewinner 1“
    expect(musterAnzeige(altKontext(), winkel("Eigener Gewinner 1"))!.map((m) => m.genutzt)).toEqual([true, false]);
    expect(musterFuerWinkel(musterListe(), "ohne Bezug")?.bildidee).toEqual(BILDIDEE);
    expect(musterFuerWinkel(musterListe(), "Lernmuster 2")?.video).toBe(true);
    expect(musterFuerWinkel(null, "Lernmuster 1")).toBeNull();
  });
});

// ─── 7. Sperre bei Widerspruch ─────────────────────────────────────────

describe("Widerspruch gegen das gemeinsame Anzeigenlernen", () => {
  const quelle = async (id: string) => (id === QUELLE.id ? QUELLE : null);

  it("Abfrage: vorerst niemand ausgenommen; ersetzbar; nur gefragte IDs kommen zurück", async () => {
    expect(await vomLernenAusgenommen(["a", "b"])).toEqual(new Set());
    expect(await ausgenommeneUnter(["a", null, "b", "a", undefined])).toEqual(new Set());
    const gefragt: string[][] = [];
    const sperre = async (ids: string[]) => (gefragt.push(ids), new Set(["b", "fremd"]));
    expect(await ausgenommeneUnter(["a", null, "b", "a"], sperre)).toEqual(new Set(["b"]));
    expect(gefragt).toEqual([["a", "b"]]);
    expect(await ausgenommeneUnter([null, undefined], sperre)).toEqual(new Set());
    expect(meldungLernSperre("ziel1", new Set(["ziel1"]))).toMatch(/^vorlagenVon ist nicht möglich: Dieser Kunde ist vom gemeinsamen Anzeigenlernen ausgenommen \(Widerspruch\)/);
    expect(meldungLernSperre("ziel1", new Set(["quelle1"]))).toMatch(/Der Kunde, dessen Anzeigen als Muster dienen sollen, ist/);
    expect(meldungLernSperre("ziel1", new Set(["ziel1", "quelle1"]))).toMatch(/Beide Kunden sind/);
  });

  it("gespeicherte Muster bleiben, solange weder Quelle noch Ziel ausgenommen ist", async () => {
    const g = await sichereKontext(fremdKontext(), { sperre: async () => new Set(), quelle });
    expect(g).toMatchObject({ fremd: true, entfernt: false, altformat: false, geaendert: false, quelleId: QUELLE.id });
    expect(g.ctx.fremdMuster).toHaveLength(2);
    expect(g.namensteile.map((t) => t.wort)).toContain("Lohmann");
  });

  it.each([
    ["Quelle", "quelle1"],
    ["Ziel", "ziel1"],
  ])("gespeicherte Muster werden entfernt, wenn inzwischen %s ausgenommen ist", async (_wer, id) => {
    const g = await sichereKontext(fremdKontext({ wish: "wie bei Lohmann" }), { sperre: async () => new Set([id]), quelle });
    expect(g).toMatchObject({ fremd: false, entfernt: true, geaendert: true });
    expect(g.ctx).toMatchObject({ fremdvorlagen: false, fremdMuster: null, eigeneGewinner: null, vorlagenQuelleId: null, eigeneGewinnerHinweis: HINWEIS_ENTFERNT, wish: "wie bei [Name]" });
    expect(hatFremdvorlagen(g.ctx)).toBe(false);
    expect(leitplankenBefunde(g.ctx, [anzeige()], TEILE)).toEqual([]);
  });

  it("Quelle nicht mehr auffindbar: lässt sich nicht prüfen, also entfernen", async () => {
    const g = await sichereKontext(fremdKontext({ vorlagenQuelleId: "weg" }), { sperre: async () => new Set(), quelle });
    expect(g).toMatchObject({ fremd: false, entfernt: true });
    expect(g.ctx.fremdMuster).toBeNull();
    const ohneId = await sichereKontext(fremdKontext({ vorlagenQuelleId: null }), { sperre: async () => new Set(), quelle });
    expect(ohneId.entfernt).toBe(true);
  });

  it("altes Format: Quelle über den Namen im alten Hinweis wiederfinden, dann bereinigen bzw. bei Widerspruch entfernen", async () => {
    const gesucht: string[] = [];
    const quelleNachName = async (name: string) => (gesucht.push(name), name === QUELLE.name ? QUELLE : null);
    const g = await sichereKontext(altKontext(), { sperre: async () => new Set(), quelle, quelleNachName });
    expect(gesucht).toEqual([QUELLE.name]);
    expect(g).toMatchObject({ fremd: true, entfernt: false, altformat: true, geaendert: true, quelleId: QUELLE.id });
    expect(g.ctx).toMatchObject({ fremdvorlagen: true, eigeneGewinner: null, vorlagenQuelleId: QUELLE.id });
    ohneVerbotenes(JSON.stringify({ ...g.ctx, vorlagenQuelleId: null }));
    const gesperrt = await sichereKontext(altKontext(), { sperre: async () => new Set([QUELLE.id]), quelle, quelleNachName });
    expect(gesperrt).toMatchObject({ fremd: false, entfernt: true, altformat: true });
    ohneVerbotenes(JSON.stringify(gesperrt.ctx));
    // umbenannter bzw. gelöschter Quellkunde: nicht prüfbar, also entfernen (und der Name aus dem Hinweis ist auch weg)
    const unbekannt = await sichereKontext(altKontext(), { sperre: async () => new Set(), quelle, quelleNachName: async () => null });
    expect(unbekannt.entfernt).toBe(true);
    expect(JSON.stringify(unbekannt.ctx)).not.toMatch(/lohmann|fbcdn/i);
  });
});

describe("Werbebibliothek: Seiten ausgenommener Kunden", () => {
  const vorher = { ...process.env };
  afterEach(() => {
    process.env = { ...vorher };
  });

  it("schließt Seiten über Namen und Seiten-ID aus", async () => {
    process.env.META_AD_LIBRARY_TOKEN = "tok";
    const now = new Date("2026-11-24T12:00:00Z");
    const start = new Date(now.getTime() - 60 * 86_400_000).toISOString();
    const data = [
      { page_id: "900", page_name: "Lohmann sichert Katzen ab", ad_creative_bodies: ["Anzeige eines ausgenommenen Kunden (Seiten-ID)"], ad_delivery_start_time: start },
      { page_id: "901", page_name: "Allianz Generalvertretung Max Lohmann", ad_creative_bodies: ["Anzeige eines ausgenommenen Kunden (Name)"], ad_delivery_start_time: start },
      { page_id: "500", page_name: "Tierversicherer A", ad_creative_bodies: ["Die letzte Tierarztrechnung war zu hoch?"], ad_delivery_start_time: start },
    ];
    const urls: string[] = [];
    const fetchFn = (async (url: string) => (urls.push(url), new Response(JSON.stringify({ data }), { status: 200 }))) as unknown as typeof fetch;
    const r = await libraryWinners("TKV-Katze", { now, fetchFn, excludePages: ["Agentur Schwarzkopf", QUELLE.name], excludePageIds: ["900"] });
    expect(r.map((a) => a.page)).toEqual(["Tierversicherer A"]);
    expect(decodeURIComponent(urls[0])).toContain("fields=page_id,page_name,");
    expect((await libraryWinners("TKV-Katze", { now, fetchFn })).map((a) => a.page)).toHaveLength(3);
  });
});
