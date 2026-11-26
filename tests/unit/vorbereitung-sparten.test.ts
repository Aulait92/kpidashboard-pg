// Fragen-Engine der Terminvorbereitung mit den Allianz-Sparten (Ole, 26.11.2026; lib/vorbereitung/fragen.ts und
// sparten.ts): Bündel ohne Dubletten, gemeinsame Vorversicherungsfrage, Folgefragen, Mehrfachauswahl, Wiederholung je
// Tier bzw. Person, Unfall ohne Invalidität, Tierkranken mit OP/Voll, Bekanntes aus dem Formular. Rein, ohne Datenbank.
import { describe, expect, it } from "vitest";
import {
  anzahlHauptfragen,
  antwortAuswerten,
  feldWert,
  frageNachricht,
  fragenPlan,
  mehrfachWeiterNachricht,
  offeneFragen,
  payloadLesen,
  vorvertraegeAuswerten,
  vorvertragAuswerten,
  type Antwort,
  type FragenQuelle,
  type GeplanteFrage,
} from "@/lib/vorbereitung/fragen";
import { aktiveSparten, buendelGewuenscht, engineSparten, fragenAktiv, SPARTEN_DEFINITIONEN } from "@/lib/vorbereitung/sparten";

const JETZT = new Date("2026-11-26T09:00:00.000Z");
const FORM = [
  { label: "Geburtsdatum", value: "01.01.1985" },
  { label: "PLZ", value: "10115" },
];
const quelle = (formular = FORM, angaben: Record<string, string> = {}): FragenQuelle => ({ formular, angaben, erledigt: [], antworten: {} });
const hauptfragen = (sparten: string[], q = quelle()) => anzahlHauptfragen(offeneFragen(fragenPlan(sparten, SPARTEN_DEFINITIONEN, q), q));

/**
 * Gespräch nachspielen: je offene Frage eine Antwort (Text bzw. Knopf aus antwort(f)), bis nichts mehr offen ist.
 * Gibt die gestellten Fragen (Sie-Fassung, ohne Fortschritt) und den Stand zurück.
 */
function lauf(sparten: string[], antwort: (f: GeplanteFrage) => { text?: string; knopf?: string }, q = quelle(), an: "sie" | "du" = "sie") {
  const antworten: Record<string, Antwort> = {};
  const erledigt: string[] = [];
  const gestellt: { id: string; text: string; folge: boolean; offen: number }[] = [];
  for (let n = 0; n < 80; n++) {
    const qq: FragenQuelle = { ...q, erledigt, antworten };
    const offen = offeneFragen(fragenPlan(sparten, SPARTEN_DEFINITIONEN, qq), qq);
    const f = offen[0];
    if (!f) break;
    gestellt.push({ id: f.id, text: an === "sie" ? f.frage.sie : f.frage.du, folge: !!f.folge, offen: anzahlHauptfragen(offen) });
    const x = antwort(f);
    const r = antwortAuswerten(f, x.text ?? null, x.knopf ?? null, JETZT);
    if (r.art === "wert") antworten[f.id] = { wert: r.wert, ...(r.opt ? { opt: r.opt } : {}), ...(r.teile ? { teile: r.teile } : {}) };
    erledigt.push(f.id);
  }
  return { gestellt, antworten, ids: gestellt.map((g) => g.id) };
}

/** Normalfall: „nein“ bzw. die erste Antwort, Zahlen, Daten und Namen plausibel. */
function normal(f: GeplanteFrage): { text?: string; knopf?: string } {
  if (f.typ === "knoepfe" || f.typ === "liste") return { knopf: f.optionen![0].id };
  if (f.typ === "mehrfach") return { knopf: (f.optionen!.find((o) => o.exklusiv) ?? f.optionen![0]).id };
  if (f.typ === "datum") return { text: "15.03.2021" };
  if (f.typ === "zahl") return { text: String(f.min ?? 1) };
  if (f.typ === "zusammengesetzt") return { text: "140 qm, 1985" };
  if (f.key === "adresse") return { text: "Musterweg 5" };
  if (f.key === "vorvertrag") return { text: "HUK bis 03/2027" };
  if (f.key === "vorvertraege") return { text: "alles bei der HUK bis 03/2027" };
  return { text: "Bello" };
}

describe("Normalfall je Sparte (Formular mit Geburtsdatum und PLZ)", () => {
  it("Anzahl der Hauptfragen wie in der Fragereihenfolge (Vorvertrag je Sparte einzeln, Bündel gemeinsam)", () => {
    expect(hauptfragen(["haftpflicht"])).toBe(4);
    expect(hauptfragen(["hausrat"])).toBe(6);
    expect(hauptfragen(["rechtsschutz"])).toBe(6);
    expect(hauptfragen(["wohngebaeude"])).toBe(12);
    expect(hauptfragen(["unfall"])).toBe(3);
    expect(hauptfragen(["kfz"])).toBe(1);
    // Normalfall durchgespielt (Tierart und Folgefragen erst nach der Antwort bekannt)
    const tk = lauf(["tierkranken"], normal);
    expect(tk.gestellt.filter((g) => !g.folge)).toHaveLength(8);
    const thv = lauf(["tierhalter"], normal);
    expect(thv.gestellt.filter((g) => !g.folge)).toHaveLength(4);
  });
  it("Bündel Haftpflicht, Hausrat, Rechtsschutz: 9 Fragen, mit Wohngebäude (eine Wohneinheit) 15", () => {
    const b = lauf(["haftpflicht", "hausrat", "rechtsschutz"], normal);
    expect(b.gestellt.filter((g) => !g.folge)).toHaveLength(9);
    const w = lauf(["haftpflicht", "hausrat", "rechtsschutz", "wohngebaeude"], normal);
    expect(w.gestellt.filter((g) => !g.folge)).toHaveLength(15);
  });
});

describe("Bündel ohne Dubletten", () => {
  const sparten = ["haftpflicht", "hausrat", "rechtsschutz", "wohngebaeude"];
  const b = lauf(sparten, normal);
  it("jede Frage einmal, gemeinsame Fragen einmal, feste Abschnitte", () => {
    expect(new Set(b.ids).size).toBe(b.ids.length);
    expect(b.ids).toEqual([
      "gemeinsam.versicherte",
      "gemeinsam.beruf",
      "gemeinsam.schaeden",
      "wohngebaeude.gebaeude",
      "wohngebaeude.einheiten",
      "wohngebaeude.nutzung",
      "wohngebaeude.keller",
      "wohngebaeude.merkmale",
      "wohngebaeude.heizung",
      "wohngebaeude.solar",
      "wohngebaeude.neben",
      "rechtsschutz.bereiche",
      "gemeinsam.vorvertraege",
      "gemeinsam.bausteine",
      "gemeinsam.adresse",
    ]);
    expect(b.gestellt[2].text).toBe("Gab es in den letzten 5 Jahren einen Schaden bei der Haftpflicht, beim Hausrat oder am Haus, oder einen Rechtsstreit bzw. eine Rechtsberatung?");
  });
  it("eine Wohneinheit: Wohnsituation und Wohnfläche des Hausrats aus dem Wohngebäude (nicht gefragt, übernommen)", () => {
    const q: FragenQuelle = { ...quelle(), erledigt: b.ids, antworten: b.antworten };
    const plan = fragenPlan(sparten, SPARTEN_DEFINITIONEN, q);
    expect(plan.find((f) => f.id === "hausrat.lage")?.abgeleitetWert).toEqual({ wert: "Haus, Eigentum", opt: ["haus-eigen"] });
    expect(plan.find((f) => f.id === "hausrat.flaeche")?.abgeleitetWert).toEqual({ wert: "140 m²" });
  });
  it("Fortschritt zählt Hauptfragen, wird kleiner, Folgefragen ohne Zähler", () => {
    expect(b.gestellt[0].offen).toBe(17);
    expect(b.gestellt.at(-1)!.offen).toBe(1);
    const ja = lauf(["haftpflicht", "hausrat"], (f) => (f.key === "schaeden" ? { knopf: "ja" } : f.key === "schaeden_hausrat" ? { text: "1" } : normal(f)));
    const folgen = ja.gestellt.filter((g) => g.folge).map((g) => g.text);
    expect(folgen).toEqual(["Wie viele Haftpflichtschäden waren es? 0, wenn keiner.", "Wie viele Hausratschäden waren es? 0, wenn keiner.", "Was war das für ein Schaden?"]);
    const f = fragenPlan(["haftpflicht", "hausrat"], SPARTEN_DEFINITIONEN, { ...quelle(), antworten: { "gemeinsam.schaeden": { wert: "ja", opt: ["ja"] } }, erledigt: ["gemeinsam.schaeden"] }).find(
      (x) => x.id === "gemeinsam.schaeden_haftpflicht",
    )!;
    expect(frageNachricht(f, "sie", 5).text).toBe("Wie viele Haftpflichtschäden waren es? 0, wenn keiner.");
    // nur eine Sparte: ohne „0, wenn keiner“
    const einzeln = lauf(["haftpflicht"], (x) => (x.key === "schaeden" ? { knopf: "ja" } : normal(x)));
    expect(einzeln.gestellt.find((g) => g.id === "gemeinsam.schaeden_haftpflicht")?.text).toBe("Wie viele Haftpflichtschäden waren es?");
  });
  it("„Bündel gewünscht“ bei mindestens zwei Privatschutz-Sparten; Sparten der Rechner zusammengefasst", () => {
    expect(buendelGewuenscht(["haftpflicht", "hausrat"])).toBe(true);
    expect(buendelGewuenscht(["haftpflicht", "tierkranken"])).toBe(false);
    expect(engineSparten(["hund-kranken", "hund-op", "tierhalter-hund", "haftpflicht"])).toEqual(["tierkranken", "tierhalter", "haftpflicht"]);
  });
});

describe("Vorversicherung (Ole, 26.11.2026: im Bündel eine gemeinsame Frage, optional, Teilantworten)", () => {
  it("Bündel: eine Frage für alle Sparten, einzeln: je Sparte", () => {
    const plan = fragenPlan(["haftpflicht", "hausrat", "unfall"], SPARTEN_DEFINITIONEN, quelle());
    const v = plan.filter((f) => f.feld === "vorhanden");
    expect(v.map((f) => f.id)).toEqual(["gemeinsam.vorvertraege"]);
    expect(v[0].frage.sie).toBe("Wo sind Sie für Haftpflicht, Hausrat und Unfall aktuell versichert und bis wann laufen die Verträge? Ungefähr reicht, zum Beispiel: Haftpflicht HUK bis 03/2027, Hausrat noch nicht.");
    expect(v[0].frage.du).toBe("Wo bist du für Haftpflicht, Hausrat und Unfall aktuell versichert und bis wann laufen die Verträge? Ungefähr reicht, zum Beispiel: Haftpflicht HUK bis 03/2027, Hausrat noch nicht.");
    expect(v[0].pflicht).toBe(false);
    expect(frageNachricht(v[0], "du", 2).buttons?.map((b) => b.title)).toEqual(["Nicht versichert", "Weiß ich nicht", "Rest im Termin"]);
    const einzeln = fragenPlan(["hausrat"], SPARTEN_DEFINITIONEN, quelle()).filter((f) => f.feld === "vorhanden");
    expect(einzeln.map((f) => f.id)).toEqual(["hausrat.vorvertrag"]);
  });
  it("Teilantworten: Versicherer ohne Datum, nur Datum, „weiß ich nicht“ bleibt offen, kein Nachbohren", () => {
    const v = fragenPlan(["haftpflicht", "hausrat"], SPARTEN_DEFINITIONEN, quelle()).find((f) => f.id === "gemeinsam.vorvertraege")!;
    expect(antwortAuswerten(v, "Haftpflicht bei der HUK, Hausrat weiß ich gerade nicht", null, JETZT)).toEqual({
      art: "wert",
      wert: "Haftpflicht bei der HUK, Hausrat weiß ich gerade nicht",
      opt: ["ja"],
      offen: ["Ablauf der bisherigen Verträge"],
    });
    expect(antwortAuswerten(v, "Weiß ich gerade nicht", null, JETZT)).toEqual({ art: "offen" });
    expect(antwortAuswerten(v, null, "weissnicht", JETZT)).toEqual({ art: "offen" });
    expect(antwortAuswerten(v, null, "nein", JETZT)).toMatchObject({ art: "wert", wert: "noch nicht versichert" });
    expect(vorvertraegeAuswerten("Beides bei der Allianz", JETZT)).toEqual({ art: "wert", wert: "Beides bei der Allianz", opt: ["ja"], offen: ["Ablauf der bisherigen Verträge"] });
    expect(vorvertraegeAuswerten("Haftpflicht HUK bis 03/2027", JETZT)).toEqual({ art: "wert", wert: "Haftpflicht HUK bis 03/2027", opt: ["ja"] });
    expect(vorvertragAuswerten("bei der HUK", JETZT, "Hausrat")).toEqual({ art: "wert", wert: "HUK-Coburg, Ablauf offen", opt: ["ja"], offen: ["Ablauf Hausrat"] });
    expect(vorvertragAuswerten("läuft bis März 2027", JETZT, "Hausrat")).toEqual({ art: "wert", wert: "Ablauf 03/2027, Versicherer offen", opt: ["ja"], offen: ["Versicherer Hausrat"] });
    expect(vorvertragAuswerten("bei meinen Eltern mit drin", JETZT, "Hausrat")).toEqual({ art: "wert", wert: "bei meinen Eltern mit drin" });
    expect(v.ohneNachfrage).toBe(true);
  });
  it("Wohngebäude: ohne bisherigen Vertrag die Pflichtfrage nach der Vorversicherung (5 Jahre)", () => {
    const w = lauf(["wohngebaeude"], (f) => (f.key === "vorvertrag" ? { knopf: "nein" } : normal(f)));
    expect(w.gestellt.find((g) => g.id === "wohngebaeude.vorversicherung")?.text).toBe("War das Haus in den letzten 5 Jahren versichert?");
    expect(lauf(["wohngebaeude"], normal).ids).not.toContain("wohngebaeude.vorversicherung");
    // im Bündel: nur, wenn die gemeinsame Antwort das Haus nicht nennt
    const b = lauf(["hausrat", "wohngebaeude"], (f) => (f.key === "vorvertraege" ? { text: "Hausrat bei der HUK" } : normal(f)));
    expect(b.ids).toContain("wohngebaeude.vorversicherung");
    const h = lauf(["hausrat", "wohngebaeude"], (f) => (f.key === "vorvertraege" ? { text: "Hausrat und Haus bei der HUK bis 2027" } : normal(f)));
    expect(h.ids).not.toContain("wohngebaeude.vorversicherung");
  });
});

describe("Mehrere Tiere bzw. Personen: alle abfragen", () => {
  it("Tierkranken, zwei Hunde: Name, dann je Hund dieselben Fragen", () => {
    let name = 0;
    const r = lauf(["tierkranken"], (f) =>
      f.key === "tierart" ? { knopf: "hunde" } : f.key === "anzahl" ? { text: "2" } : f.key === "name" ? { text: ["Rex", "Luna"][name++] } : f.key === "rasse" ? { text: "Labrador" } : normal(f),
    );
    const texte = r.gestellt.map((g) => g.text);
    expect(texte).toContain("Wie viele Hunde sind es?");
    expect(texte).toContain("Wie heißt Ihr erster Hund?");
    expect(texte).toContain("Und Ihr zweiter Hund: Wie heißt er?");
    expect(texte).toContain("Welche Rasse hat Rex? Bei Mischlingen schreiben Sie einfach „Mischling“.");
    expect(texte).toContain("Welche Rasse hat Luna? Bei Mischlingen schreiben Sie einfach „Mischling“.");
    expect(r.ids.filter((id) => id.startsWith("tierkranken.gesundheit"))).toEqual(["tierkranken.gesundheit", "tierkranken.gesundheit~2"]);
    // OP/Voll einmal für beide, danach der Vorvertrag
    expect(r.ids.slice(-2)).toEqual(["tierkranken.schutz", "tierkranken.vorvertrag"]);
  });
  it("Tierhalterhaftpflicht, zwei Hunde: „Und Ihr zweiter Hund: Welche Rasse hat er?“, Mischling mit Größe", () => {
    const r = lauf(["tierhalter"], (f) => (f.key === "tierart" ? { knopf: "hunde" } : f.key === "anzahl" ? { text: "2" } : f.key === "rasse" ? { text: f.i === 1 ? "Labrador" : "Mischling" } : normal(f)));
    const texte = r.gestellt.map((g) => g.text);
    expect(texte).toContain("Welche Rasse hat Ihr erster Hund? Bei Mischlingen schreiben Sie einfach „Mischling“.");
    expect(texte).toContain("Und Ihr zweiter Hund: Welche Rasse hat er?");
    expect(texte).toContain("Wie groß ist Ihr zweiter Hund (Widerristhöhe)?");
    expect(r.gestellt.find((g) => g.text === "Und Ihr zweiter Hund: Welche Rasse hat er?")?.folge).toBe(false);
    const du = lauf(["tierhalter"], (f) => (f.key === "tierart" ? { knopf: "hunde" } : f.key === "anzahl" ? { text: "2" } : normal(f)), quelle(), "du");
    expect(du.gestellt.map((g) => g.text)).toContain("Und dein zweiter Hund: Welche Rasse hat er?");
  });
  it("Unfall für mich und zwei Kinder: je Kind das Geburtsdatum", () => {
    const r = lauf(["unfall"], (f) => (f.key === "fuer" ? { text: "für mich und die Kinder" } : f.key === "kinder" ? { text: "2" } : normal(f)));
    const texte = r.gestellt.map((g) => g.text);
    expect(texte).toEqual([
      "Für wen soll der Unfallschutz sein?",
      "Für wie viele Kinder?",
      "Wie sind Sie beruflich tätig?",
      "Wann ist Ihr erstes Kind geboren? Zum Beispiel 15.03.2016.",
      "Und Ihr zweites Kind: Wann ist es geboren?",
      "Haben Sie schon eine Unfallversicherung? Wenn ja: bei welcher Gesellschaft und bis wann läuft sie? Ungefähr reicht, zum Beispiel: HUK bis 03/2027.",
    ]);
  });
});

describe("Unfall ohne Invalidität, Tierkranken mit OP/Voll", () => {
  it("Unfall: keine Frage zur Invalidität, nur für das Kind: kein Beruf, kein eigenes Geburtsdatum", () => {
    const alle = lauf(["unfall"], (f) => (f.key === "fuer" ? { knopf: "partner" } : normal(f)), quelle([]));
    expect(alle.gestellt.some((g) => /invalid|br(ü|ue)che/i.test(g.text))).toBe(false);
    const kind = lauf(["unfall"], (f) => (f.key === "fuer" ? { text: "nur mein Kind" } : normal(f)), quelle([]));
    expect(kind.ids).not.toContain("gemeinsam.beruf");
    expect(kind.ids).not.toContain("gemeinsam.geburt");
    // Beamte: zusätzlich Büro oder körperlich
    const beamt = lauf(["unfall"], (f) => (f.key === "fuer" ? { knopf: "ich" } : f.key === "beruf" ? { knopf: "oeffentl" } : normal(f)));
    expect(beamt.gestellt.find((g) => g.id === "gemeinsam.taetigkeit")).toMatchObject({ folge: true, text: "Ist Ihre Arbeit eher im Büro oder körperlich?" });
  });
  it("Tierkranken: OP-Schutz oder Vollschutz wird gefragt (Knöpfe), bekannt aus dem Erstanschreiben übersprungen", () => {
    const plan = fragenPlan(["tierkranken"], SPARTEN_DEFINITIONEN, quelle());
    const s = plan.find((f) => f.id === "tierkranken.schutz")!;
    expect(frageNachricht(s, "sie", 1).buttons?.map((b) => b.title)).toEqual(["OP-Schutz", "Vollschutz", "Rest im Termin"]);
    expect(antwortAuswerten(s, null, "op")).toMatchObject({ wert: "nur OP-Schutz" });
    expect(antwortAuswerten(s, "lieber die volle Krankenversicherung")).toMatchObject({ wert: "Vollschutz (Krankenversicherung)" });
    const q = quelle(FORM, { tarifwunsch: "nur OP-Schutz" });
    expect(offeneFragen(fragenPlan(["tierkranken"], SPARTEN_DEFINITIONEN, q), q).map((f) => f.id)).not.toContain("tierkranken.schutz");
    // Gesundheit des Tieres: bei „Ja“ die Bereiche, bei „Weitere Bereiche“ die zweite Seite
    const g = lauf(["tierkranken"], (f) => (f.key === "gesundheit" ? { knopf: "ja" } : f.key === "bereiche" ? { text: "Zähne und Magen" } : f.key === "bereiche2" ? { text: "Verdauung" } : normal(f)));
    expect(g.antworten["tierkranken.bereiche"]).toEqual({ wert: "Maulhöhle und Zähne, Weitere Bereiche", opt: ["zaehne", "weitere"] });
    expect(g.antworten["tierkranken.bereiche2"]).toMatchObject({ opt: ["verdauung"] });
  });
});

describe("Bekanntes aus dem Formular wird übersprungen", () => {
  it("Geburtsdatum, PLZ, Lebenssituation, Wohnfläche, Adresse, Beruf, Tierart", () => {
    const leer = fragenPlan(["haftpflicht", "hausrat", "rechtsschutz"], SPARTEN_DEFINITIONEN, quelle([]));
    expect(leer.slice(0, 2).map((f) => f.id)).toEqual(["gemeinsam.geburt", "gemeinsam.plz"]);
    const form = [
      ...FORM,
      { label: "Lebenssituation", value: "Familie mit Kindern" },
      { label: "Wohnfläche in qm", value: "80" },
      { label: "Straße und Hausnummer", value: "Achenseeweg 11a" },
      { label: "Beruf", value: "Beamter" },
    ];
    const q = quelle(form);
    const plan = fragenPlan(["haftpflicht", "hausrat", "rechtsschutz"], SPARTEN_DEFINITIONEN, q);
    const offen = offeneFragen(plan, q).map((f) => f.id);
    for (const id of ["gemeinsam.geburt", "gemeinsam.plz", "gemeinsam.versicherte", "gemeinsam.beruf", "hausrat.flaeche", "gemeinsam.adresse"]) expect(offen).not.toContain(id);
    // erkannte Optionen gelten für Bedingungen: öffentlicher Dienst → Zeile Dienst-Haftpflicht
    expect(plan.find((f) => f.id === "gemeinsam.versicherte")?.vorwissen?.opt).toEqual(["familie"]);
    expect(plan.find((f) => f.id === "gemeinsam.bausteine")?.optionen?.map((o) => o.id)).toContain("dienst");
    const tq = quelle([...FORM, { label: "Tierart", value: "Katze" }]);
    const tk = offeneFragen(fragenPlan(["tierkranken"], SPARTEN_DEFINITIONEN, tq), tq);
    expect(tk[0].frage.sie).toBe("Wie heißt Ihre Katze?");
    expect(tk.map((f) => f.key)).toContain("haltung");
  });
  it("Angaben des Assistenten (Wohnfläche, Lebensbereiche) zählen als bekannt", () => {
    const q = quelle(FORM, { wohnflaeche: "75 m²", bereiche: "Privat, Beruf, Verkehr" });
    const offen = offeneFragen(fragenPlan(["hausrat", "rechtsschutz"], SPARTEN_DEFINITIONEN, q), q).map((f) => f.id);
    expect(offen).not.toContain("hausrat.flaeche");
    expect(offen).not.toContain("rechtsschutz.bereiche");
  });
});

describe("Mehrfachauswahl, Knöpfe und Listen", () => {
  const wg = fragenPlan(["wohngebaeude"], SPARTEN_DEFINITIONEN, quelle());
  const heizung = wg.find((f) => f.id === "wohngebaeude.heizung")!;
  it("Liste, nach der Wahl „Noch etwas davon?“ mit „Das war alles“; getippt alles auf einmal", () => {
    const n = frageNachricht(heizung, "sie", 4);
    expect(n.liste?.zeilen.map((z) => z.title)).toEqual(["Gasheizung", "Ölheizung", "Fern-/Nahwärme", "Pellet-/Holzheizung", "Wärmepumpenanlage", "Keine davon", "Rest im Termin"]);
    const w = mehrfachWeiterNachricht(heizung, "sie", ["gas"]);
    expect(w.text).toBe("Danke! Noch etwas davon?");
    expect(w.liste?.zeilen.map((z) => z.id)).toEqual(["vf:wohngebaeude.heizung:fertig", "vf:wohngebaeude.heizung:oel", "vf:wohngebaeude.heizung:fern", "vf:wohngebaeude.heizung:pellet", "vf:wohngebaeude.heizung:wp", "vf:rest"]);
    expect(antwortAuswerten(heizung, "Gas und Öl", null, JETZT)).toEqual({ art: "wert", wert: "Gasheizung, Ölheizung", opt: ["gas", "oel"] });
    expect(antwortAuswerten(heizung, "nichts davon", null, JETZT)).toMatchObject({ opt: ["keine"] });
    const merk = wg.find((f) => f.id === "wohngebaeude.merkmale")!;
    expect(frageNachricht(merk, "sie", 4).liste?.zeilen.find((z) => z.title === "Weiche Bedachung")?.description).toBe("Dach aus Naturschiefer, Holz, Ried, Schilf oder Stroh");
  });
  it("Knock-out bricht nicht ab, Vermerk „online nicht berechenbar“", () => {
    const e = wg.find((f) => f.id === "wohngebaeude.einheiten")!;
    expect(antwortAuswerten(e, null, "drei")).toMatchObject({ wert: "drei oder mehr (online nicht berechenbar)" });
    const fl = fragenPlan(["hausrat"], SPARTEN_DEFINITIONEN, quelle()).find((f) => f.id === "hausrat.flaeche")!;
    expect(antwortAuswerten(fl, "ca. 320 qm")).toMatchObject({ wert: "320 m² (online nicht berechenbar)" });
  });
  it("Payload mit Wiederholung, Feld mit Präfix (gleicher Präfix ersetzt)", () => {
    expect(payloadLesen("vf:tierkranken.rasse~2:fertig")).toEqual({ id: "tierkranken.rasse~2", option: "fertig" });
    expect(feldWert({ praefix: "Keller" }, "ohne Wohnfläche", "Größe: 140 m²; Keller: kein")).toBe("Größe: 140 m²; Keller: ohne Wohnfläche");
    expect(feldWert({ voran: true }, "Musterweg 5", "10115")).toBe("Musterweg 5, 10115");
  });
  it("alle Fragen: Knöpfe höchstens 20, Zeilen 24, Beschreibungen 72 Zeichen, höchstens 10 Zeilen, Sie und Du, keine Gedankenstriche", () => {
    const faelle: [string[], (f: GeplanteFrage) => { text?: string; knopf?: string }][] = [
      [["haftpflicht", "hausrat", "rechtsschutz", "wohngebaeude", "unfall"], (f) => (f.typ === "mehrfach" && f.key !== "bausteine" ? { knopf: f.optionen!.at(-2)!.id } : f.key === "fuer" ? { text: "mich, Partnerin und Kinder" } : normal(f))],
      [["tierkranken", "tierhalter"], (f) => (f.key === "tierart" ? { knopf: "hunde" } : f.key === "gesundheit" ? { knopf: "ja" } : normal(f))],
      [["tierkranken"], (f) => (f.key === "tierart" ? { knopf: "katzen" } : normal(f))],
      [["tierhalter"], (f) => (f.key === "tierart" ? { knopf: "pferde" } : normal(f))],
      [["kfz"], normal],
    ];
    for (const [sparten, antwort] of faelle) {
      for (const an of ["sie", "du"] as const) {
        const r = lauf(sparten, antwort, quelle([]), an);
        for (const g of r.gestellt) {
          expect(g.text, g.id).not.toMatch(/[–—]/);
          if (an === "sie") expect(g.text, g.id).not.toMatch(/\b(du|dein|deine|deinen|deiner|dich|dir)\b/);
          else expect(g.text, g.id).not.toMatch(/\b(Sie|Ihr|Ihre|Ihren|Ihrer|Ihnen)\b/);
        }
      }
      const q = quelle([]);
      for (const f of fragenPlan(sparten, SPARTEN_DEFINITIONEN, q)) {
        const n = frageNachricht(f, "sie", 3);
        for (const b of n.buttons ?? []) expect(b.title.length, `${f.id} ${b.title}`).toBeLessThanOrEqual(20);
        for (const z of n.liste?.zeilen ?? []) expect(z.title.length, `${f.id} ${z.title}`).toBeLessThanOrEqual(24);
        for (const z of n.liste?.zeilen ?? []) expect((z.description ?? "").length, `${f.id} ${z.title}`).toBeLessThanOrEqual(72);
        expect((n.liste?.zeilen ?? []).length).toBeLessThanOrEqual(10);
        for (const o of f.optionen ?? []) expect(o.titel.length, `${f.id} ${o.titel}`).toBeLessThanOrEqual(f.typ === "knoepfe" ? 20 : 24);
      }
    }
  });
});

describe("Schalter", () => {
  it("Standard an, „0“ aus, Liste von Kunden-IDs nur für diese", () => {
    expect(fragenAktiv(null, "")).toBe(true);
    expect(fragenAktiv("k1", "1")).toBe(true);
    expect(fragenAktiv("k1", "0")).toBe(false);
    expect(fragenAktiv("k1", "k1,k2")).toBe(true);
    expect(fragenAktiv("k3", "k1,k2")).toBe(false);
    expect(aktiveSparten(SPARTEN_DEFINITIONEN, false, false)).toEqual([]);
    expect(aktiveSparten(SPARTEN_DEFINITIONEN, false, true)).toHaveLength(SPARTEN_DEFINITIONEN.length);
  });
});
