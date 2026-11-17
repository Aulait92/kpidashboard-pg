// Tarifkatalog und Tarifauswahl der neuen Terminvorbereitung (Ole, 15.11.2026).
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ladeTarifkatalog } from "@/lib/tarifkatalog-laden";
import {
  AUSWAHL_GRENZEN,
  auswahlDazu,
  auswahlWeg,
  bekannteGesellschaften,
  gesellschaftAusText,
  gesellschaftName,
  gesellschaftSchluessel,
  katalogAus,
  parseBuendel,
  SPARTEN_STANDARD,
  sortiereGesellschaften,
  sparteAusText,
  spartenAusFormular,
  standardMerkmale,
  tarifeFuer,
  vorauswahl,
} from "@/lib/tarifkatalog";
import {
  ausAltenAngeboten,
  beitragsUebersicht,
  cleanTarifauswahl,
  grenzenFuer,
  kurzName,
  preiseUebernehmen,
  startAuswahl,
  summeEmpfehlung,
  tarifAusEigenem,
  tarifAusKatalog,
  tarifEinfuegen,
  zuAngebote,
  type Tarifauswahl,
} from "@/lib/tarifauswahl";
import { demoTarife } from "@/lib/demo-beratung";
import { folien, markeFuer } from "@/lib/praesentation";
import type { VorbereitungDaten } from "@/lib/termin-vorbereitung";

const ORDNER = path.join(__dirname, "..", "fixtures", "tarifkatalog");
const k = ladeTarifkatalog(ORDNER);
const vertreter = { rolle: "vertreter" as const, gesellschaften: ["allianz"] };
const makler = { rolle: "makler" as const, gesellschaften: [] };

describe("Katalog laden", () => {
  it("liest Schema und Tarife je Gesellschaft und Sparte, mit Anzeigenamen und Reihenfolge", () => {
    expect(k.sparten.map((s) => s.key)).toEqual(["haftpflicht", "hausrat", "rechtsschutz"]);
    const hausrat = tarifeFuer(k, "hausrat");
    expect(hausrat.map((t) => t.id)).toEqual([
      "allianz/hausrat/basis",
      "allianz/hausrat/smart",
      "allianz/hausrat/komfort",
      "allianz/hausrat/premium",
      "axa/hausrat/kompakt",
      "axa/hausrat/komfort",
      "signal-iduna/hausrat/top",
    ]);
    expect(hausrat.map((t) => t.gesellschaftName)).toContain("SIGNAL IDUNA");
    expect(hausrat.find((t) => t.gesellschaft === "axa")?.gesellschaftName).toBe("AXA");
    expect(hausrat[3].bausteine.elementar).toBe("inklusive");
    expect(hausrat[3].inAllenTarifen).toEqual(["Ersatz zum Neuwert"]);
    // null bleibt null (nicht recherchiert), kein „nein“
    expect(tarifeFuer(k, "hausrat", ["axa"])[0].werte["online-betrug"]).toBeNull();
  });

  it("fehlender Ordner: eingebautes Schema, keine Tarife; kaputte Dateien und unbekannte Sparten werden übersprungen", () => {
    const leer = ladeTarifkatalog(path.join(ORDNER, "gibt-es-nicht"));
    expect(leer.tarife).toEqual([]);
    expect(leer.sparten.map((s) => s.key)).toEqual(SPARTEN_STANDARD.map((s) => s.key));
    expect(leer.sparten.map((s) => s.key)).toEqual(["katze-kranken", "katze-op", "hund-kranken", "hund-op", "pferd-op", "pferd-kranken", "haftpflicht", "hausrat", "rechtsschutz", "wohngebaeude", "tierhalter-hund", "tierhalter-pferd", "unfall"]);
    for (const s of SPARTEN_STANDARD) expect(s.merkmale.filter((m) => m.standard).length).toBeLessThanOrEqual(5);
    const kk = katalogAus(null, [
      { gesellschaft: "allianz", sparte: "hausrat", json: { tarife: [{ name: "X", werte: { a: 5 }, bausteine: { b: "vielleicht" } }, { kurz: "ohne Namen" }] } },
      { gesellschaft: "allianz", sparte: "kfz", json: { tarife: [{ name: "Kfz" }] } },
      { gesellschaft: "allianz", sparte: "buendel", json: { buendel: { linien: ["Komfort", "Premium"], mindestLaufzeitJahre: 3, sparten: ["hausrat"], staffel: [{ anzahl: 3, prozent: 10 }, { anzahl: 2, prozent: 5 }] } } },
    ]);
    expect(kk.tarife).toHaveLength(1);
    expect(kk.tarife[0].werte.a).toBe("5");
    expect(kk.tarife[0].bausteine).toEqual({});
    expect(kk.buendel.allianz?.staffel).toEqual([{ anzahl: 2, prozent: 5 }, { anzahl: 3, prozent: 10 }]);
    expect(parseBuendel({ staffel: [] })).toBeNull();
  });

  it("Reihenfolge: Vertreter-Gesellschaften zuerst, dann alphabetisch nach Anzeigename (Ole, 16.11.2026)", () => {
    expect(bekannteGesellschaften().map(gesellschaftName)).toEqual([
      "Allianz",
      "AXA",
      "SIGNAL IDUNA",
      "ADVOCARD",
      "AGILA",
      "ARAG",
      "BarmeniaGothaer",
      "DEVK",
      "DFV",
      "Die Haftpflichtkasse",
      "ERGO",
      "Generali",
      "HanseMerkur",
      "HUK-COBURG",
      "LVM",
      "Provinzial",
      "R+V",
      "ROLAND",
      "Uelzener",
      "VHV",
      "Zurich",
    ]);
    expect(sortiereGesellschaften(["zurich", "ruv", "advocard", "axa", "barmenia-gothaer", "allianz", "vhv"])).toEqual([
      "allianz",
      "axa",
      "advocard",
      "barmenia-gothaer",
      "ruv",
      "vhv",
      "zurich",
    ]);
  });

  it("ungeprüfte Werte: „ungeprueft“ je Tarif bleibt bis in die gespeicherte Auswahl erhalten", () => {
    const kk = katalogAus(null, [
      {
        gesellschaft: "vhv",
        sparte: "hausrat",
        json: { tarife: [{ name: "Hausrat Klassik", kurz: "Klassik", stufe: 1, werte: {}, ungeprueft: true }, { name: "Hausrat Exklusiv", kurz: "Exklusiv", stufe: 2, werte: {} }] },
      },
    ]);
    const [klassik, exklusiv] = tarifeFuer(kk, "hausrat");
    expect(klassik.ungeprueft).toBe(true);
    expect(exklusiv.ungeprueft).toBeUndefined();
    expect(tarifAusKatalog(klassik).werteUngeprueft).toBe(true);
    expect(tarifAusKatalog(exklusiv).werteUngeprueft).toBeUndefined();
    const gespeichert = cleanTarifauswahl({ v: 1, sparten: [{ key: "hausrat", label: "Hausrat", schema: {}, tarife: [tarifAusKatalog(klassik), tarifAusKatalog(exklusiv)] }] });
    expect(gespeichert?.sparten[0].tarife.map((t) => t.werteUngeprueft ?? false)).toEqual([true, false]);
  });

  it("Gesellschaft und Sparte aus Texten", () => {
    expect(gesellschaftAusText("Allianz Agentur Lohmann")).toBe("allianz");
    expect(gesellschaftAusText("AXA Versicherung AG")).toBe("axa");
    expect(gesellschaftAusText("SIGNAL IDUNA Allgemeine")).toBe("signal-iduna");
    expect(gesellschaftAusText("Maklerbüro Schmidt")).toBeNull();
    // Tierversicherer (16.11.2026): Markenschreibweise, Erkennung im Text, Reihenfolge nach den Vertreter-Gesellschaften
    expect(gesellschaftName("agila")).toBe("AGILA");
    expect(gesellschaftName("uelzener")).toBe("Uelzener");
    expect(gesellschaftAusText("AGILA Haustierversicherung AG")).toBe("agila");
    expect(gesellschaftAusText("Uelzener Allgemeine Versicherungs-Gesellschaft a. G.")).toBe("uelzener");
    expect(gesellschaftName("hansemerkur")).toBe("HanseMerkur");
    expect(gesellschaftAusText("Hanse Merkur Allgemeine Versicherung AG")).toBe("hansemerkur");
    // Barmenia und Gothaer sind fusioniert (Ole, 16.11.2026): eine Gesellschaft „BarmeniaGothaer“
    expect(gesellschaftName("barmenia-gothaer")).toBe("BarmeniaGothaer");
    expect(gesellschaftAusText("BarmeniaGothaer Tierkrankenversicherung")).toBe("barmenia-gothaer");
    expect(gesellschaftAusText("Barmenia Allgemeine Versicherungs-AG")).toBe("barmenia-gothaer");
    expect(gesellschaftAusText("Gothaer Allgemeine Versicherung AG")).toBe("barmenia-gothaer");
    expect(gesellschaftSchluessel("barmenia")).toBe("barmenia-gothaer");
    expect(gesellschaftSchluessel("gothaer")).toBe("barmenia-gothaer");
    expect(gesellschaftSchluessel("allianz")).toBe("allianz");
    expect(gesellschaftName("dfv")).toBe("DFV");
    expect(gesellschaftAusText("Deutsche Familienversicherung AG")).toBe("dfv");
    expect(gesellschaftAusText("DFV-TierkrankenSchutz")).toBe("dfv");
    expect(gesellschaftName("ergo")).toBe("ERGO");
    expect(gesellschaftAusText("ERGO Versicherung AG")).toBe("ergo");
    expect(gesellschaftName("ruv")).toBe("R+V");
    expect(gesellschaftAusText("R+V Allgemeine Versicherung AG")).toBe("ruv");
    expect(gesellschaftAusText("Agentur Schmidt (R + V)")).toBe("ruv");
    expect(gesellschaftAusText("Arvid Hansen")).toBeNull();
    expect(sortiereGesellschaften(["uelzener", "agila", "signal-iduna", "allianz"])).toEqual(["allianz", "signal-iduna", "agila", "uelzener"]);
    // Privatschutz (16.11.2026): ERGO, R+V, HUK-COBURG, DEVK, Generali
    expect(gesellschaftAusText("R + V Agentur Meier")).toBe("ruv");
    expect(gesellschaftAusText("HUK-COBURG Vertrauensmann")).toBe("huk-coburg");
    expect(gesellschaftAusText("HUK24 AG")).toBe("huk-coburg");
    expect(gesellschaftAusText("DEVK Geschäftsstelle")).toBe("devk");
    expect(gesellschaftAusText("Generali Deutschland")).toBe("generali");
    expect(gesellschaftAusText("Hugo Ergonomie GmbH")).toBeNull();
    // Zurich, VHV, Die Haftpflichtkasse, LVM, Provinzial und die Rechtsschutz-Spezialisten
    const faelle: Array<[string, string, string]> = [
      ["Zurich Insurance plc", "zurich", "Zurich"],
      ["VHV Allgemeine Versicherung AG", "vhv", "VHV"],
      ["Die Haftpflichtkasse VVaG", "haftpflichtkasse", "Die Haftpflichtkasse"],
      ["LVM Landwirtschaftlicher Versicherungsverein", "lvm", "LVM"],
      ["Provinzial Versicherung AG", "provinzial", "Provinzial"],
      ["ARAG SE", "arag", "ARAG"],
      ["ROLAND Rechtsschutz-Versicherungs-AG", "roland", "ROLAND"],
      ["ADVOCARD Rechtsschutzversicherung AG", "advocard", "ADVOCARD"],
      ["HUK-COBURG", "huk-coburg", "HUK-COBURG"],
      ["DEVK", "devk", "DEVK"],
      ["Generali", "generali", "Generali"],
    ];
    for (const [text, key, name] of faelle) {
      expect(gesellschaftAusText(text), text).toBe(key);
      expect(gesellschaftName(key)).toBe(name);
    }
    expect(gesellschaftAusText("Agentur Roland Meier")).toBeNull();
    expect(gesellschaftAusText("Paragraph 5")).toBeNull();
    expect(gesellschaftAusText("Kanzlei in Zürich")).toBeNull();
    expect(sparteAusText("Privathaftpflicht")).toBe("haftpflicht");
    expect(sparteAusText("Tierhalterhaftpflicht Hund")).toBe("tierhalter-hund");
    expect(sparteAusText("Pferdehalterhaftpflicht")).toBe("tierhalter-pferd");
    expect(sparteAusText("Katzen-OP-Versicherung")).toBe("katze-op");
    expect(sparteAusText("Pferde-OP-Versicherung")).toBe("pferd-op");
    expect(sparteAusText("Pferdekrankenversicherung")).toBe("pferd-kranken");
    expect(sparteAusText("Pferdeversicherung")).toBe("pferd-op");
    expect(sparteAusText("Hundekrankenversicherung")).toBe("hund-kranken");
    expect(sparteAusText("Wohngebäude")).toBe("wohngebaeude");
    expect(sparteAusText("Kfz")).toBeNull();
  });
});

describe("Vorauswahl", () => {
  it("Vertreter: 3 Stufen seiner Gesellschaft rund um die Empfehlung, Stern auf der mittleren", () => {
    const v = vorauswahl(k, "hausrat", vertreter);
    expect(v.tarife.map((t) => t.kurz)).toEqual(["Smart", "Komfort", "Premium"]);
    expect(v.empfohlen).toBe("allianz/hausrat/komfort");
    const h = vorauswahl(k, "haftpflicht", vertreter);
    expect(h.tarife.map((t) => t.kurz)).toEqual(["Basis", "Smart", "Komfort"]);
    expect(h.empfohlen).toBe("allianz/haftpflicht/smart");
    // nur die eigene Gesellschaft, auch wenn andere mehr hätten
    expect(vorauswahl(k, "hausrat", { rolle: "vertreter", gesellschaften: ["axa"] }).tarife.every((t) => t.gesellschaft === "axa")).toBe(true);
    // ohne Tarife der Gesellschaft: leer (dann eigener Tarif)
    expect(vorauswahl(k, "hausrat", { rolle: "vertreter", gesellschaften: ["andere"] }).tarife).toEqual([]);
  });

  it("Makler: je Gesellschaft die Empfehlung, höchstens 3; Stern in der Mitte", () => {
    const v = vorauswahl(k, "hausrat", makler);
    expect(v.tarife.map((t) => t.id)).toEqual(["allianz/hausrat/komfort", "axa/hausrat/komfort", "signal-iduna/hausrat/top"]);
    expect(v.empfohlen).toBe("axa/hausrat/komfort");
    // nur eine Gesellschaft mit Tarifen: wie Vertreter (Stufen)
    expect(vorauswahl(k, "haftpflicht", makler).tarife.map((t) => t.kurz)).toEqual(["Basis", "Smart", "Komfort"]);
  });

  it("Start je Sparte: Merkmale aus „Meine Merkmale“ bzw. Standard, Bausteine, die ein Tarif anbietet", () => {
    const a = startAuswahl(k, ["hausrat", "rechtsschutz", "unbekannt"], vertreter, { rechtsschutz: { merkmale: ["mediation", "wartezeit", "gibts-nicht"], bausteine: [] } });
    expect(a.sparten.map((s) => s.key)).toEqual(["hausrat", "rechtsschutz"]);
    expect(a.sparten[0].merkmale).toEqual(["grobe-fahrlaessigkeit", "fahrraddiebstahl", "elementar", "wertsachen", "online-betrug"]);
    expect(a.sparten[0].bausteine).toEqual(["fahrrad", "elementar"]);
    expect(a.sparten[1].merkmale).toEqual(["mediation", "wartezeit"]);
    expect(a.sparten[1].tarife.map((t) => t.kurz)).toEqual(["Smart", "Komfort", "Premium"]);
  });
});

describe("Grenzen und Tausch", () => {
  it("dazu bis zur Grenze, dann Tausch gegen das letzte (mit raus für Rückgängig); nie mehr als die Grenze", () => {
    const m5 = ["a", "b", "c", "d", "e"];
    expect(auswahlDazu(["a"], "b", 5)).toEqual({ liste: ["a", "b"], raus: null });
    expect(auswahlDazu(m5, "x", 5)).toEqual({ liste: ["a", "b", "c", "d", "x"], raus: "e" });
    expect(auswahlDazu(m5, "c", 5).liste).toEqual(m5);
    expect(auswahlDazu([...m5, "f"], "x", 5).liste).toHaveLength(5);
    expect(auswahlWeg(m5, "c")).toEqual(["a", "b", "d", "e"]);
    expect(standardMerkmale(k.sparten[1], ["x", "elementar"])).toEqual(["elementar"]);
  });

  it("3 Tarife, bei Stufen einer Gesellschaft bis 4 (dann 4 Merkmale), 2 Bausteine; lange Namen kosten eine Zeile", () => {
    const a = startAuswahl(k, ["hausrat"], vertreter);
    const sp = a.sparten[0];
    expect(grenzenFuer(sp)).toEqual({ tarife: 4, merkmale: 5, bausteine: 2 });
    tarifEinfuegen(sp, tarifAusKatalog(tarifeFuer(k, "hausrat", ["allianz"])[0]));
    expect(sp.tarife.map((t) => t.kurz)).toEqual(["Basis", "Smart", "Komfort", "Premium"]);
    expect(grenzenFuer(sp).merkmale).toBe(4);
    // lange Werte (gemessen: Allianz Hausrat) passen nur in 3 Spalten
    const lang = structuredClone(sp);
    lang.tarife[0].werte["grobe-fahrlaessigkeit"] = "bis Versicherungssumme";
    expect(grenzenFuer(lang).tarife).toBe(3);
    expect(zuAngebote({ v: 1, sparten: [lang] }).items).toHaveLength(3);
    const m = startAuswahl(k, ["hausrat"], makler).sparten[0];
    expect(grenzenFuer(m).tarife).toBe(3);
    m.tarife[0] = { ...m.tarife[0], kurz: "Hausrat Premium Plus Extra" };
    expect(grenzenFuer(m).merkmale).toBe(4);
    expect(AUSWAHL_GRENZEN).toMatchObject({ tarife: 3, merkmale: 5, bausteine: 2 });
  });

  it("Kurznamen ohne Spartenwort, höchstens 18 Zeichen an einer Wortgrenze", () => {
    expect(kurzName("Hausrat Komfort", "Hausrat")).toBe("Komfort");
    expect(kurzName("Hausrat Best Selection Plus Max", "Hausrat").length).toBeLessThanOrEqual(18);
    expect(kurzName("Hausrat Best Selection Plus Max", "Hausrat")).toBe("Best Selection");
  });
});

describe("Auswahl → Angebote (Präsentation)", () => {
  const termin: VorbereitungDaten = {
    lead: { name: "Verena Martin", telefon: null, email: null, adresse: null, produkt: "Privatschutz" },
    termin: { startsAt: new Date("2026-11-16T09:00:00Z"), mode: "phone", berater: "Max Berger", meetUrl: null },
    zusammenfassung: null,
    formular: [],
    angaben: { interesse: "Hausrat und Rechtsschutz" },
    vorbereitetAm: null,
  };

  function beispiel(): Tarifauswahl {
    const a = startAuswahl(k, ["hausrat", "rechtsschutz"], vertreter);
    const [h, r] = a.sparten;
    h.tarife[0].beitrag = 8.9;
    h.tarife[1].beitrag = 11.4;
    h.tarife[1].bausteine.fahrrad = { an: true, beitrag: 2.4 };
    h.tarife[2].beitrag = 189.6;
    h.tarife[2].zahlweise = "jahr";
    r.tarife[1].beitrag = 31.2;
    return a;
  }

  it("Beitrag (Jahr → Monat), Empfehlung, Merkmale mit Kurznamen, Bausteine mit Preis bzw. inklusive", () => {
    const d = zuAngebote(beispiel());
    const hausrat = d.items.filter((i) => i.sparte === "Hausrat");
    expect(hausrat.map((i) => [i.tarif, i.beitragMonat, i.empfohlen, i.gewaehlt])).toEqual([
      ["Smart", 8.9, false, false],
      ["Komfort", 11.4, true, true],
      ["Premium", 15.8, false, false],
    ]);
    expect(hausrat[1].merkmale.map((m) => m.name)).toEqual(["Grobe Fahrlässigkeit", "Fahrraddiebstahl", "Elementarschäden", "Wertsachen", "Online-Betrug"]);
    expect(hausrat[1].bausteine).toEqual([{ name: "Fahrraddiebstahl", beitrag: 2.4, aktiv: true }]);
    expect(hausrat[2].bausteine).toEqual([{ name: "Elementarschäden", beitrag: 0, aktiv: true }]);
    expect(hausrat[1].leistungen).toContain("Grobe Fahrlässigkeit: voll");
    expect(hausrat[1].leistungen).toContain("Ersatz zum Neuwert");
    const opt = beispiel();
    opt.sparten[0].tarife[1].werte.fahrraddiebstahl = "optional";
    expect(zuAngebote(opt).items[1].leistungen.some((l) => /optional/.test(l))).toBe(false);
    // Selbstbeteiligung aus dem Merkmal (Rechtsschutz)
    expect(d.items.find((i) => i.sparte === "Rechtsschutz")?.selbstbeteiligung).toBe("150 €");
    expect(summeEmpfehlung(beispiel())).toBe(Math.round((11.4 + 2.4 + 31.2) * 100) / 100);
    expect(beitragsUebersicht(beispiel())).toMatchObject({ rabatt: null });
  });

  it("„In Präsentation“ aus: Tarif fehlt auf der Folie; Stern wandert nicht auf einen versteckten Tarif", () => {
    const a = beispiel();
    a.sparten[0].tarife[1].zeigen = false;
    const h = zuAngebote(a).items.filter((i) => i.sparte === "Hausrat");
    expect(h.map((i) => i.tarif)).toEqual(["Smart", "Premium"]);
    expect(h.filter((i) => i.empfohlen)).toHaveLength(1);
  });

  it("Folien: Vergleich je Sparte ohne „…“, Werte ohne Recherche neutral, Makler-Spalten mit Gesellschaft", () => {
    const fs = folien(termin, zuAngebote(beispiel()), markeFuer({ name: "Allianz Max Berger" }));
    const vgl = fs.find((f) => f.id.startsWith("vergleich-hausrat"))!;
    expect(vgl.html).toContain("Komfort");
    expect(vgl.html).toContain("inklusive");
    expect(vgl.html).not.toContain("…");
    const m = startAuswahl(k, ["hausrat"], makler);
    m.sparten[0].merkmale = ["online-betrug", "aussenversicherung"];
    const html = folien(termin, zuAngebote(m), markeFuer({ name: "Makler" })).find((f) => f.id.startsWith("vergleich-"))!.html;
    expect(html).toContain("Allianz Komfort");
    expect(html).toContain("AXA Komfort");
    expect(html).toContain("SIGNAL IDUNA Top");
    expect(html).toContain("lt. Bedingungen");
  });

  it("eigener Tarif: Kurzname, Werte, keine Bausteine", () => {
    const t = tarifAusEigenem({ id: "x1", gesellschaft: "Uelzener", name: "Hausrat Exklusiv", kurz: "Exklusiv", werte: { elementar: "ja" } });
    expect(t).toMatchObject({ id: "eigen:x1", herkunft: "eigen", gesellschaft: "Uelzener", kurz: "Exklusiv", bausteinStatus: {} });
  });

  it("bereinigt geschickte Daten (Grenzen, Längen, unbekannte Merkmale, Beträge)", () => {
    const a = beispiel();
    const raw = JSON.parse(JSON.stringify(a));
    raw.sparten[0].merkmale = ["x", ...raw.sparten[0].merkmale, "versicherungssumme"];
    raw.sparten[0].tarife[0].beitrag = "12,50";
    raw.sparten[0].tarife[1].beitrag = -3;
    raw.sparten[0].empfohlen = "gibts-nicht";
    const c = cleanTarifauswahl(raw)!;
    expect(c.sparten[0].merkmale).toHaveLength(5);
    expect(c.sparten[0].merkmale).not.toContain("x");
    expect(c.sparten[0].tarife[0].beitrag).toBe(12.5);
    expect(c.sparten[0].tarife[1].beitrag).toBeNull();
    expect(c.sparten[0].empfohlen).toBeNull();
    expect(cleanTarifauswahl({ items: [] })).toBeNull();
  });
});

describe("Kompatibilität: ältere Angebote (offersJson)", () => {
  it("liest ausgelesene Angebote verlustfrei als Auswahl, Präsentation bleibt gleich", () => {
    const alt = demoTarife();
    const a = ausAltenAngeboten(alt, k);
    expect(a.sparten.map((s) => s.label)).toEqual(["Privathaftpflicht", "Hausrat", "Rechtsschutz"]);
    const rs = a.sparten[2];
    expect(rs.tarife).toHaveLength(4);
    expect(rs.tarife.map((t) => t.beitrag)).toEqual([24.29, 29.58, 35.69, 61.44]);
    expect(rs.empfohlen).toBe(rs.tarife[2].id);
    // „Versicherungssumme“ im Katalog-Schema → dessen Schlüssel; „Wohnen“ ebenso (Kurzname), der Rest als eigenes Merkmal
    expect(rs.merkmale).toContain("versicherungssumme");
    expect(rs.merkmale.length).toBeLessThanOrEqual(4);
    const hr = a.sparten[1];
    expect(hr.schema.bausteine.map((b) => b.key)).toEqual(expect.arrayContaining(["fahrrad", "elementar", "glas"]));
    expect(hr.tarife[0].bausteine).toMatchObject({ fahrrad: { an: true, beitrag: 3.4 } });

    const neu = zuAngebote(a);
    const nach = (d: typeof alt, s: string) => d.items.filter((i) => i.sparte === s);
    for (const s of ["Privathaftpflicht", "Hausrat", "Rechtsschutz"]) {
      expect(nach(neu, s).map((i) => [i.tarif, i.beitragMonat, i.empfohlen, i.selbstbeteiligung])).toEqual(nach(alt, s).map((i) => [i.tarif, i.beitragMonat, i.empfohlen, i.selbstbeteiligung]));
      expect(nach(neu, s).map((i) => i.leistungen)).toEqual(nach(alt, s).map((i) => i.leistungen));
      expect(nach(neu, s).map((i) => i.ausschluesse)).toEqual(nach(alt, s).map((i) => i.ausschluesse));
    }
    expect(summeEmpfehlung(a)).toBe(Math.round((8.4 + 9.8 + 3.4 + 35.69) * 100) / 100);
  });

  it("ohne Katalog: Sparten und Merkmale aus den Angeboten", () => {
    const a = ausAltenAngeboten({ items: [{ sparte: "Kfz", gesellschaft: "Allianz", tarif: "Kfz Komfort", beitragMonat: 40, selbstbeteiligung: null, leistungen: [], ausschluesse: [], empfohlen: true, gewaehlt: true, merkmale: [{ name: "Schutzbrief", wert: "ja" }], bausteine: [] }], quelle: [] }, null);
    expect(a.sparten[0]).toMatchObject({ key: "alt-kfz", label: "Kfz", merkmale: ["alt-schutzbrief"] });
    expect(zuAngebote(a).items[0]).toMatchObject({ sparte: "Kfz", tarif: "Kfz Komfort", beitragMonat: 40, empfohlen: true });
  });
});

describe("Preise aus dem Angebot (PDF)", () => {
  it("ordnet Beiträge und Bausteinpreise den gewählten Tarifen zu, füllt nur leere", () => {
    const a = startAuswahl(k, ["hausrat", "rechtsschutz"], vertreter);
    a.sparten[0].tarife[0].beitrag = 7;
    const item = (sparte: string, tarif: string, beitragMonat: number, bausteine: { name: string; beitrag: number; aktiv: boolean }[] = []) => ({
      sparte,
      gesellschaft: "Allianz",
      tarif,
      beitragMonat,
      selbstbeteiligung: null,
      leistungen: [],
      ausschluesse: [],
      empfohlen: false,
      gewaehlt: false,
      merkmale: [{ name: "Grobe Fahrlässigkeit", wert: "unsinn" }],
      bausteine,
    });
    const r = preiseUebernehmen(a, [
      item("Hausrat", "Hausrat Smart", 8.9),
      item("Hausrat", "Hausrat Komfort", 11.4, [{ name: "Fahrraddiebstahl", beitrag: 2.4, aktiv: false }]),
      item("Rechtsschutz", "Rechtsschutz Komfort", 31.2),
      item("Wohngebäude", "Wohngebäude Komfort", 50),
    ]);
    expect(r.anzahl).toBe(2);
    expect(r.sparten).toEqual(["Hausrat", "Rechtsschutz"]);
    const [h, rs] = r.auswahl.sparten;
    expect(h.tarife.map((t) => t.beitrag)).toEqual([7, 11.4, null]);
    expect(h.tarife[1].bausteine.fahrrad).toEqual({ an: false, beitrag: 2.4 });
    expect(h.tarife[1].werte["grobe-fahrlaessigkeit"]).toBe("voll");
    expect(rs.tarife.map((t) => t.beitrag)).toEqual([null, 31.2, null]);
    // Original unverändert
    expect(a.sparten[0].tarife[1].beitrag).toBeNull();
  });
});

describe("Echte Katalogdaten (data/tarifkatalog)", () => {
  const echt = ladeTarifkatalog(path.join(__dirname, "..", "..", "data", "tarifkatalog"));
  it("Allianz-Vertreter: je Sparte 3 Stufen um die Empfehlung, Stern auf Komfort; Halterhaftpflicht 3 Stufen", () => {
    expect(echt.sparten).toHaveLength(13);
    for (const s of echt.sparten) {
      const v = vorauswahl(echt, s.key, { rolle: "vertreter", gesellschaften: ["allianz"] });
      expect(v.tarife.length, s.key).toBe(3);
      expect(v.tarife.find((t) => t.id === v.empfohlen)?.kurz, s.key).toBe("Komfort");
      expect(standardMerkmale(s).length, s.key).toBeLessThanOrEqual(5);
      for (const t of v.tarife) expect(t.kurz.length, t.id).toBeLessThanOrEqual(AUSWAHL_GRENZEN.kurzname);
    }
    expect(vorauswahl(echt, "tierhalter-hund", { rolle: "vertreter", gesellschaften: ["allianz"] }).tarife.map((t) => t.kurz)).toEqual(["Smart", "Komfort", "Premium"]);
  });
  it("AXA und SIGNAL IDUNA ohne Tierkranken: leere Vorauswahl (eigener Tarif bzw. Angebot); Makler bekommt je Tierversicherer die Empfehlung", () => {
    expect(vorauswahl(echt, "katze-kranken", { rolle: "vertreter", gesellschaften: ["axa"] }).tarife).toEqual([]);
    const op = vorauswahl(echt, "katze-op", { rolle: "makler", gesellschaften: [] });
    expect(op.tarife).toHaveLength(3);
    expect(op.tarife[0].gesellschaft).toBe("allianz");
    expect(new Set(op.tarife.map((t) => t.gesellschaft)).size).toBe(3);
    // Pferde-Sparten: Allianz-Vertreter bekommt Stufen, Makler mehrere Gesellschaften
    const pferd = vorauswahl(echt, "pferd-op", { rolle: "makler", gesellschaften: [] }).tarife.map((t) => t.gesellschaft);
    expect(pferd).toHaveLength(3);
    expect(pferd[0]).toBe("allianz");
    expect(new Set(pferd).size).toBe(3);
    expect(vorauswahl(echt, "pferd-kranken", { rolle: "vertreter", gesellschaften: ["uelzener"] }).tarife.map((t) => t.kurz)).toEqual(["Tarif"]);
    const m = vorauswahl(echt, "hausrat", { rolle: "makler", gesellschaften: [] });
    expect(m.tarife.map((t) => t.gesellschaft)).toEqual(["allianz", "axa", "signal-iduna"]);
  });
  it("Bündelregel Allianz mit Staffel bis „ab 5“; Formularwörter für die Vorauswahl", () => {
    expect(echt.buendel.allianz?.staffel.at(-1)).toEqual({ anzahl: 5, prozent: 20, abAnzahl: true });
    expect(echt.buendel.allianz?.linien).toEqual(["Komfort", "Premium"]);
    expect(spartenAusFormular(echt, "Privathaftpflicht, Hausrat und Rechtsschutz", "privatschutz")).toEqual(["haftpflicht", "hausrat", "rechtsschutz"]);
    expect(spartenAusFormular(echt, "Tierhalterhaftpflicht, Unfall", "privatschutz")).toEqual(["unfall"]);
    expect(spartenAusFormular(echt, "Hundehaftpflicht")).toEqual(["tierhalter-hund"]);
  });
});
