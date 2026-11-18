// Vergleich mit dem bisherigen Vertrag (Paket P3b): Spaltenaufbau aus Katalog, Police, Chat und Eingabe von Hand,
// „laut Police prüfen“ statt „nicht enthalten“, Beitragsunterschied, Kündigung, Gesundheitssparten, Folie.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ladeTarifkatalog } from "@/lib/tarifkatalog-laden";
import {
  ausChat,
  ausPolice,
  beitragsUnterschiedJahr,
  bisherAbgleichen,
  bisherSichtbar,
  bisherSpalte,
  bisherVorschlag,
  cleanBisher,
  katalogTarifFinden,
  kuendigungText,
  naechsteKuendigung,
  unterschiedText,
  WERT_PRUEFEN,
  type BisherVertrag,
  type PoliceKurz,
} from "@/lib/bisheriger-vertrag";
import { cleanTarifauswahl, grenzenFuer, startAuswahl, zuAngebote, type SparteWahl, type Tarifauswahl } from "@/lib/tarifauswahl";
import { cleanAngebote } from "@/lib/angebote-daten";
import { folien, markeFuer } from "@/lib/praesentation";
import { normalisiereVertraege, vertragZeile } from "@/lib/whatsapp/vorvertraege";
import type { VorbereitungDaten } from "@/lib/termin-vorbereitung";

/** Geschütztes Leerzeichen (Intl) als normales */
const nb = (s: string) => s.replace(/\u00a0/g, " ");
const k = ladeTarifkatalog(path.join(__dirname, "..", "..", "data", "tarifkatalog"));
const sparte = (key: string): SparteWahl => startAuswahl(k, [key], { rolle: "vertreter", gesellschaften: ["allianz"] }).sparten[0];

const police = (sparte: string, felder: Record<string, unknown>, o: Partial<PoliceKurz> = {}): PoliceKurz => ({
  id: "p1",
  sparte,
  felder: Object.fromEntries(Object.entries(felder).map(([key, w]) => [key, { w, s: "ok" }])),
  geprueft: true,
  ausgelesenAt: "2026-11-18T10:00:00Z",
  ...o,
});

const termin: VorbereitungDaten = {
  lead: { name: "Julia Becker", telefon: null, email: null, adresse: null, produkt: "Privatschutz" },
  termin: { startsAt: new Date("2026-11-20T09:00:00Z"), mode: "video", berater: "Max Berger", meetUrl: null },
  zusammenfassung: null,
  formular: [],
  angaben: {},
  vorbereitetAm: null,
};

const hand = (x: Partial<BisherVertrag>): BisherVertrag => ({
  quelle: "hand",
  zeigen: null,
  gesellschaft: null,
  tarif: null,
  katalogId: null,
  werte: {},
  beitrag: null,
  zahlweise: "monat",
  summe: null,
  sb: null,
  ablauf: null,
  kuendbarZum: null,
  fristMonate: null,
  ...x,
});

function vergleichsfolie(a: Tarifauswahl, an: "sie" | "du" = "sie") {
  const fs = folien(termin, cleanAngebote(JSON.parse(JSON.stringify(zuAngebote(a, k.buendel)))), markeFuer({ name: "Allianz Agentur Max Berger" }), an);
  const f = fs.find((x) => x.id.startsWith("vergleich-"));
  return f ? { ...f, html: nb(f.html) } : undefined;
}

describe("Tarif im Katalog finden", () => {
  it("gleicher Name bzw. längster Kurzname als ganzes Wort; ohne Gesellschaft oder mehrdeutig: kein Treffer", () => {
    expect(katalogTarifFinden(k, "haftpflicht", "HUK-COBURG", "Privathaftpflicht Classic PLUS")?.id).toBe("huk-coburg/haftpflicht/classic-plus");
    expect(katalogTarifFinden(k, "haftpflicht", "HUK", "Classic")?.id).toBe("huk-coburg/haftpflicht/classic");
    expect(katalogTarifFinden(k, "haftpflicht", null, "Classic")).toBeNull();
    expect(katalogTarifFinden(k, "haftpflicht", "HUK-COBURG", "Sondertarif 2009")).toBeNull();
  });
});

describe("Spalte aus der Police", () => {
  it("Tarif im Katalog: dessen Merkmale, die Police geht vor (Deckungssumme, SB), Beitrag je Monat", () => {
    const sp = sparte("haftpflicht");
    const b = ausPolice(
      police("haftpflicht", { versicherer: "HUK-COBURG", tarifname: "Privathaftpflicht Classic PLUS", beitrag: 66, zahlweise: "jaehrlich", deckungssumme: 50_000_000, selbstbeteiligung: 150, ablauf: "2027-01-01", kuendigungsfrist_monate: 3 }),
      sp,
      k,
    );
    expect(b).toMatchObject({ quelle: "police", gesellschaft: "HUK-COBURG", tarif: "Classic PLUS", katalogId: "huk-coburg/haftpflicht/classic-plus", beitrag: 66, zahlweise: "jahr", summe: 50_000_000, sb: 150 });
    expect(b.werte.schluessel).toBe("ja"); // aus dem Katalog
    expect(b.werte.vs).toBe("50 Mio. €"); // Police statt Katalog (100 Mio. €)
    const s = bisherSpalte(sp, b, [
      { key: "vs", name: "Deckungssumme" },
      { key: "schluessel", name: "Schlüsselverlust" },
      { key: "sb", name: "Selbstbeteiligung" },
    ]);
    expect(s.beitragMonat).toBe(5.5);
    expect(s.merkmale).toEqual([
      { name: "Deckungssumme", wert: "50 Mio. €" },
      { name: "Schlüsselverlust", wert: "ja" },
      { name: "Selbstbeteiligung", wert: "150 €" },
    ]);
    expect(s.info).toEqual([]); // Summe und SB stehen schon in den Zeilen
  });

  it("Tarif nicht im Katalog: nur Werte der Police (Beitrag, Summe, SB), Unbekanntes „laut Police prüfen“, ein „nein“ der Police nie als „nicht enthalten“", () => {
    const sp = sparte("hausrat");
    const b = ausPolice(police("hausrat", { versicherer: "Ostsee Versicherung", tarifname: "Hausrat Kompakt", beitrag: 30, zahlweise: "vierteljaehrlich", versicherungssumme: 65_000, selbstbeteiligung: 0, elementar: false, fahrrad: true }, { geprueft: false }), sp, k);
    expect(b).toMatchObject({ katalogId: null, gesellschaft: "Ostsee Versicherung", tarif: "Hausrat Kompakt", beitrag: 10, zahlweise: "monat", summe: 65_000, sb: 0, ungeprueft: true });
    expect(b.werte).toEqual({ fahrrad: "ja", sb: "keine" });
    const s = bisherSpalte(sp, b, [
      { key: "gf", name: "Grobe Fahrlässigkeit" },
      { key: "elementar", name: "Elementarschäden" },
      { key: "fahrrad", name: "Fahrraddiebstahl" },
    ]);
    expect(s.merkmale.map((m) => m.wert)).toEqual([WERT_PRUEFEN, WERT_PRUEFEN, "ja"]);
    expect(s.info).toEqual(["Versicherungssumme 65.000 €", "ohne Selbstbeteiligung"]);
    expect(JSON.stringify(s)).not.toMatch(/nicht enthalten|"nein"/);
  });

  it("Leben-Police passt zu Risikoleben, BU zu Dienstunfähigkeit; andere Sparte nicht", () => {
    const sp = sparte("risikoleben");
    expect(bisherVorschlag(sp, { policen: [police("leben", { versicherer: "Hannoversche", beitrag: 12, zahlweise: "monatlich" })], vorvertraege: null }, k)?.beitrag).toBe(12);
    expect(bisherVorschlag(sparte("hausrat"), { policen: [police("haftpflicht", { beitrag: 5, zahlweise: "monatlich" })], vorvertraege: null }, k)).toBeNull();
  });
});

describe("Spalte aus dem Chat (Lead.vorvertraege)", () => {
  it("Tarif genannt und im Katalog: Merkmale des Tarifs; nur Gesellschaft: Eintrag ohne Inhalt, nicht auf der Folie", () => {
    const sp = sparte("haftpflicht");
    const liste = normalisiereVertraege([{ sparte: "Haftpflicht", gesellschaft: "HUK", tarif: "Classic" }]);
    expect(vertragZeile(liste[0])).toBe("Haftpflicht (HUK Classic)");
    const b = ausChat({ at: "", liste }, sp, k)!;
    expect(b).toMatchObject({ quelle: "chat", katalogId: "huk-coburg/haftpflicht/classic", gesellschaft: "HUK-COBURG", tarif: "Classic", beitrag: null });
    expect(bisherSichtbar(b)).toBe(true);
    const nur = ausChat({ at: "", liste: normalisiereVertraege([{ sparte: "Haftpflicht", gesellschaft: "HUK" }]) }, sp, k)!;
    expect(nur.katalogId).toBeNull();
    expect(bisherSichtbar(nur)).toBe(false);
    expect(ausChat({ at: "", liste: normalisiereVertraege([{ sparte: "Haftpflicht" }]) }, sp, k)).toBeNull();
    // Police geht vor Chat
    const v = bisherVorschlag(sp, { policen: [police("haftpflicht", { versicherer: "ARAG", beitrag: 7, zahlweise: "monatlich" })], vorvertraege: { at: "", liste } }, k);
    expect(v?.quelle).toBe("police");
  });
});

describe("Eingabe von Hand und Abgleich", () => {
  it("bereinigt Eingaben (Datum, Frist, Beträge) und lässt Unbekanntes weg", () => {
    expect(cleanBisher({ quelle: "x" })).toBeNull();
    expect(cleanBisher({ quelle: "hand", beitrag: -3, ablauf: "2027-02-30", fristMonate: 99, sb: 150, werte: { vs: "  50 Mio. € " } })).toMatchObject({
      quelle: "hand",
      beitrag: null,
      ablauf: null,
      fristMonate: null,
      sb: 150,
      werte: { vs: "50 Mio. €" },
      zeigen: null,
    });
  });

  it("von Hand bleibt, Police kommt nach bzw. aktualisiert, gelöschte Police nimmt die Spalte heraus, der Schalter bleibt", () => {
    const sp = sparte("hausrat");
    const p = police("hausrat", { versicherer: "VHV", beitrag: 9, zahlweise: "monatlich" });
    const v = (s: SparteWahl) => bisherVorschlag(s, { policen: [p], vorvertraege: null }, k);
    // neu aus der Police
    let r = bisherAbgleichen([sp], v, false);
    expect(r.geaendert).toBe(true);
    expect(r.sparten[0].bisher).toMatchObject({ quelle: "police", beitrag: 9, zeigen: null });
    // ausgeblendet, gleiche Police: nichts zu tun
    r.sparten[0].bisher!.zeigen = false;
    r = bisherAbgleichen(r.sparten, v, false);
    expect(r.geaendert).toBe(false);
    // Police korrigiert: Werte nach, Schalter bleibt aus
    p.felder = { ...(p.felder as object), beitrag: { w: 11, s: "korrigiert" } };
    r = bisherAbgleichen(r.sparten, v, false);
    expect(r.sparten[0].bisher).toMatchObject({ beitrag: 11, zeigen: false });
    // Unterlage gelöscht: Spalte weg
    r = bisherAbgleichen(r.sparten, () => null, false);
    expect(r.geaendert).toBe(true);
    expect(r.sparten[0].bisher).toBeUndefined();
    // von Hand eingetragen: bleibt, auch wenn eine Police kommt
    const h = { ...sp, bisher: hand({ gesellschaft: "DEVK", beitrag: 12 }) };
    r = bisherAbgleichen([h], v, false);
    expect(r.geaendert).toBe(false);
    expect(r.sparten[0].bisher?.gesellschaft).toBe("DEVK");
  });

  it("Gesundheitssparte ohne Freischaltung: keine Spalte (auch nicht von Hand); mit Freischaltung aus der Police", () => {
    const sp = { ...sparte("bu"), bisher: hand({ beitrag: 80 }) };
    const v = (s: SparteWahl) => bisherVorschlag(s, { policen: [police("bu", { versicherer: "Alte Leipziger", beitrag: 80, zahlweise: "monatlich" })], vorvertraege: null }, k);
    const gesperrt = bisherAbgleichen([sp, sparte("unfall")], v, false);
    expect(gesperrt.sparten.map((s) => s.bisher)).toEqual([undefined, undefined]);
    expect(bisherAbgleichen([sparte("bu")], v, true).sparten[0].bisher?.quelle).toBe("police");
  });

  it("von Hand: SB und Summe gehen in passende Zeilen, sonst unter den Tarifnamen; gespeichert und gelesen", () => {
    const a = startAuswahl(k, ["haftpflicht"], { rolle: "vertreter", gesellschaften: ["allianz"] });
    a.sparten[0].bisher = hand({ gesellschaft: "DEVK", tarif: "Komfort", beitrag: 72, zahlweise: "jahr", summe: 20_000_000, sb: 300 });
    const back = cleanTarifauswahl(JSON.parse(JSON.stringify(a)))!;
    expect(back.sparten[0].bisher).toEqual(a.sparten[0].bisher);
    const ang = zuAngebote(back, k.buendel);
    const s = ang.bisher![0];
    expect(s).toMatchObject({ sparte: "Privathaftpflicht", gesellschaft: "DEVK", tarif: "Komfort", beitragMonat: 6 });
    expect(s.merkmale.find((m) => m.name === "Deckungssumme")?.wert).toBe("20 Mio. €");
    expect(s.info).toEqual(["Selbstbeteiligung 300 €"]);
  });
});

describe("Kündigung und Beitragsunterschied", () => {
  it("nächster Kündigungstermin: genannter Termin, sonst Hauptfälligkeit fortgeschrieben, Frist zurückgerechnet", () => {
    expect(naechsteKuendigung({ ablauf: "2024-01-01", kuendbarZum: null, fristMonate: 3 }, "2026-11-20")).toEqual({ zum: "2028-01-01", bis: "2027-10-01" });
    expect(naechsteKuendigung({ ablauf: "2024-01-01", kuendbarZum: null, fristMonate: 1 }, "2026-11-20")).toEqual({ zum: "2027-01-01", bis: "2026-12-01" });
    expect(naechsteKuendigung({ ablauf: null, kuendbarZum: "2027-03-01", fristMonate: 3 }, "2026-11-20")).toEqual({ zum: "2027-03-01", bis: "2026-12-01" });
    expect(kuendigungText({ ablauf: "2026-04-01", kuendbarZum: null, fristMonate: null }, "2026-11-20")).toBe("kündbar zum 01.04.2027 (Kündigung bis 01.01.2027, übliche Frist 3 Monate).");
    expect(kuendigungText({ ablauf: null, kuendbarZum: null, fristMonate: 3 }, "2026-11-20")).toBe("Kündigungsfrist laut Police prüfen.");
  });

  it("Beitragsunterschied im Jahr, neutral formuliert", () => {
    expect(beitragsUnterschiedJahr(8.5, 10)).toBe(-18);
    expect(beitragsUnterschiedJahr(null, 10)).toBeNull();
    expect(nb(unterschiedText(-18))).toBe("18,00 € weniger im Jahr als bisher");
    expect(nb(unterschiedText(6))).toBe("6,00 € mehr im Jahr als bisher");
    expect(unterschiedText(0)).toBe("gleicher Beitrag wie bisher");
  });
});

describe("Vergleichsfolie mit „Ihr bisheriger Vertrag“", () => {
  function auswahl(): Tarifauswahl {
    const a = startAuswahl(k, ["haftpflicht"], { rolle: "vertreter", gesellschaften: ["allianz"] });
    const sp = a.sparten[0];
    sp.tarife.forEach((t, i) => (t.beitrag = 6 + i));
    sp.bisher = ausPolice(
      police("haftpflicht", { versicherer: "HUK-COBURG", tarifname: "Classic", beitrag: 96, zahlweise: "jaehrlich", ablauf: "2025-01-01", kuendigungsfrist_monate: 1 }),
      sp,
      k,
    );
    return a;
  }

  it("Spalte links von den neuen Tarifen, Beitragsunterschied zum gewählten Tarif, Kündigung; keine Gedankenstriche, kein „Garantie“", () => {
    const a = auswahl();
    const f = vergleichsfolie(a)!;
    expect(f.html).toContain('<th class="bisher"><div class="bt">Ihr bisheriger Vertrag</div><div class="bg">HUK-COBURG</div><div class="tarif">Classic</div>');
    expect(f.html).toContain("8,00 €");
    const ang = zuAngebote(a, k.buendel);
    const gew = ang.items.find((i) => i.gewaehlt)!;
    const diff = beitragsUnterschiedJahr(gew.beitragMonat, 8)!;
    expect(diff).toBe(-12);
    expect(f.html).toContain(`Ihr gewählter Tarif: <b>${nb(unterschiedText(diff))}</b>`);
    expect(f.html).toContain("Ihr bisheriger Vertrag: kündbar zum 01.01.2027 (Kündigung bis 01.12.2026).");
    expect(f.html).not.toMatch(/[–—]|Garantie/);
    // höchstens 3 neue Tarife neben der Spalte, eine Merkmalzeile weniger
    expect(f.html.match(/<th class="bisher">/g)).toHaveLength(1);
    expect((f.html.match(/<thead><tr>(.*?)<\/tr><\/thead>/)![1].match(/<th/g) ?? []).length).toBeLessThanOrEqual(5);
    expect(grenzenFuer(a.sparten[0])).toMatchObject({ tarife: 3, merkmale: 4 });
  });

  it("Du-Fassung", () => {
    const f = vergleichsfolie(auswahl(), "du")!;
    expect(f.html).toContain("Dein bisheriger Vertrag");
    expect(f.html).toContain("Dein gewählter Tarif");
  });

  it("ausgeblendet: keine Spalte, alte Grenzen; ein neuer Tarif mit Spalte bekommt eine Vergleichsfolie", () => {
    const a = auswahl();
    a.sparten[0].bisher!.zeigen = false;
    expect(vergleichsfolie(a)!.html).not.toContain("bisheriger Vertrag");
    expect(grenzenFuer(a.sparten[0]).merkmale).toBe(5);
    const eins = auswahl();
    eins.sparten[0].tarife = eins.sparten[0].tarife.slice(0, 1);
    expect(vergleichsfolie(eins)?.html).toContain("Ihr bisheriger Vertrag");
    eins.sparten[0].bisher!.zeigen = false;
    expect(vergleichsfolie(eins)).toBeUndefined();
  });

  it("unbekannte Merkmale „laut Police prüfen“, nie „nicht enthalten“", () => {
    const a = auswahl();
    a.sparten[0].bisher = hand({ gesellschaft: "Ostsee Versicherung", beitrag: 5 });
    const html = vergleichsfolie(a)!.html;
    const zellen = [...html.matchAll(/<td class="bisher">(.*?)<\/td>/g)].map((m) => m[1]);
    expect(zellen.length).toBeGreaterThan(0);
    for (const z of zellen.filter(Boolean)) expect(z).toContain(WERT_PRUEFEN);
    expect(zellen.join("")).not.toMatch(/nein-z|nicht enthalten/);
  });
});
