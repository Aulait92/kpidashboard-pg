// Kombi-Rabatt (Bündelrabatt) je Gesellschaft (Ole, 15./16.11.2026): Staffel, Linie, Laufzeit, Rundung, nächste Stufe.
import { describe, expect, it } from "vitest";
import { beitragAus, cleanAngebote, sparteSchalten, tarifWaehlen, type AngebotItem } from "@/lib/angebote-daten";
import {
  anzahlFuer,
  bedingungText,
  cleanKombiRegeln,
  kombiFuer,
  kombiRabatt,
  naechsteStufe,
  naechsteText,
  prozentFuer,
  prozentMit,
  rabattAuf,
  staffelLeiste,
  type KombiRegel,
} from "@/lib/kombi-rabatt";
import { ladeTarifkatalog } from "@/lib/tarifkatalog-laden";
import { startAuswahl, beitragsUebersicht, kombiRegelnFuer, zuAngebote } from "@/lib/tarifauswahl";

const ALLIANZ: KombiRegel = {
  gruppe: "allianz",
  name: "Allianz PrivatSchutz",
  linien: ["Komfort", "Premium"],
  mindestLaufzeitJahre: 3,
  sparten: ["haftpflicht", "hausrat", "rechtsschutz", "wohngebaeude", "unfall", "tierhalter-hund"],
  staffel: [
    { anzahl: 2, prozent: 5 },
    { anzahl: 3, prozent: 10 },
    { anzahl: 4, prozent: 15 },
    { anzahl: 5, prozent: 20, abAnzahl: true },
  ],
};

const item = (sparte: string, beitrag: number, linie = "Komfort", x: Partial<AngebotItem> = {}): AngebotItem => ({
  sparte,
  gesellschaft: "Allianz",
  tarif: linie,
  beitragMonat: beitrag,
  selbstbeteiligung: null,
  leistungen: [],
  ausschluesse: [],
  empfohlen: true,
  gewaehlt: true,
  merkmale: [],
  bausteine: [],
  kombi: { gruppe: "allianz", sparte, linie },
  ...x,
});

describe("Kombi-Rabatt: Staffel", () => {
  it("2 Verträge 5 %, 3 Verträge 10 %, 4 Verträge 15 %, ab 5 Verträgen 20 %", () => {
    expect([0, 1, 2, 3, 4, 5, 7].map((n) => prozentFuer(ALLIANZ.staffel, n))).toEqual([0, 0, 5, 10, 15, 20, 20]);
    expect(naechsteStufe(ALLIANZ.staffel, 1)).toEqual({ anzahl: 2, prozent: 5 });
    expect(naechsteStufe(ALLIANZ.staffel, 2)).toEqual({ anzahl: 3, prozent: 10 });
    expect(naechsteStufe(ALLIANZ.staffel, 5)).toBeNull();
  });

  it("Beispiel der Allianz: Haftpflicht, Hausrat, Rechtsschutz statt 36,23 € nur 32,60 € (Endbeitrag abgerundet)", () => {
    expect(rabattAuf(36.23, 10)).toEqual({ euro: 3.63, end: 32.6 });
    expect(rabattAuf(100, 5)).toEqual({ euro: 5, end: 95 });
    expect(rabattAuf(19.99, 0)).toEqual({ euro: 0, end: 19.99 });
    const e = kombiFuer(ALLIANZ, [item("haftpflicht", 8.4), item("hausrat", 9.8), item("rechtsschutz", 18.03)]);
    expect(e).toMatchObject({ anzahl: 3, prozent: 10, basis: 36.23, euro: 3.63, fehlt: 1, naechste: { prozent: 15 } });
    expect(naechsteText(e)).toBe("Noch 1 Vertrag bis 15 %");
  });

  it("ein Vertrag: noch kein Rabatt, Hinweis auf die erste Stufe", () => {
    const e = kombiFuer(ALLIANZ, [item("haftpflicht", 8.4)]);
    expect(e).toMatchObject({ anzahl: 1, prozent: 0, euro: 0, fehlt: 1 });
    expect(naechsteText(e)).toBe("Noch 1 Vertrag bis 5 %");
    expect(naechsteText(kombiFuer(ALLIANZ, []))).toBe("Noch 2 Verträge bis 5 %");
  });

  it("Basis bzw. Smart verhindert den Rabatt (nur Komfort oder Premium zählen)", () => {
    const e = kombiFuer(ALLIANZ, [item("haftpflicht", 8.4), item("hausrat", 7.6, "Smart"), item("rechtsschutz", 35.69, "Premium")]);
    expect(e).toMatchObject({ anzahl: 2, prozent: 5 });
    expect(e.blockiert).toEqual([{ sparte: "hausrat", tarif: "Smart", grund: "linie" }]);
    expect(e.basis).toBe(44.09);
  });

  it("Laufzeit unter 3 Jahren zählt nicht; ohne Angabe gilt die Laufzeit der Regel", () => {
    const kurz = item("hausrat", 9.8, "Komfort", { kombi: { gruppe: "allianz", sparte: "hausrat", linie: "Komfort", laufzeitJahre: 1 } });
    const e = kombiFuer(ALLIANZ, [item("haftpflicht", 8.4), kurz]);
    expect(e).toMatchObject({ anzahl: 1, prozent: 0, blockiert: [{ sparte: "hausrat", grund: "laufzeit" }] });
  });

  it("nicht gewählte Sparten, fremde Gesellschaften und Sparten außerhalb der Regel zählen nicht", () => {
    const e = kombiFuer(ALLIANZ, [
      item("haftpflicht", 8.4),
      item("hausrat", 9.8, "Komfort", { gewaehlt: false }),
      item("rechtsschutz", 20, "Komfort", { kombi: { gruppe: "axa", sparte: "rechtsschutz", linie: "Komfort" } }),
      item("katze-kranken", 30),
    ]);
    expect(e.anzahl).toBe(1);
  });

  it("Bausteine zählen zum Beitrag; zwei Stufen derselben Sparte zählen einmal", () => {
    const mitBaustein = item("hausrat", 9.8, "Komfort", { bausteine: [{ name: "Fahrrad", beitrag: 3.4, aktiv: true }] });
    expect(kombiFuer(ALLIANZ, [item("haftpflicht", 8.4), mitBaustein]).basis).toBe(21.6);
    expect(anzahlFuer(ALLIANZ, ["haftpflicht", "haftpflicht", "hausrat"])).toBe(2);
  });

  it("R+V: alle Haftpflichtversicherungen zählen zusammen einmal", () => {
    const ruv: KombiRegel = { gruppe: "ruv", name: null, linien: [], mindestLaufzeitJahre: null, sparten: ["haftpflicht", "tierhalter-hund", "hausrat"], staffel: [{ anzahl: 2, prozent: 3 }], einmal: [["haftpflicht", "tierhalter-hund"]] };
    expect(anzahlFuer(ruv, ["haftpflicht", "tierhalter-hund"])).toBe(1);
    expect(anzahlFuer(ruv, ["haftpflicht", "tierhalter-hund", "hausrat"])).toBe(2);
  });

  it("„Mit Unfall: 15 %“: nächste Stufe durch eine weitere Sparte", () => {
    const e = kombiFuer(ALLIANZ, [item("haftpflicht", 8.4), item("hausrat", 9.8), item("rechtsschutz", 18)]);
    expect(prozentMit(e, "unfall", ["haftpflicht", "hausrat", "rechtsschutz"])).toBe(15);
    expect(prozentMit(e, "katze-kranken", ["haftpflicht", "hausrat", "rechtsschutz"])).toBeNull();
    expect(prozentMit(e, "hausrat", ["haftpflicht", "hausrat", "rechtsschutz"])).toBeNull();
  });

  it("Bedingung und Staffel-Leiste zum Anzeigen", () => {
    expect(bedingungText(ALLIANZ)).toBe("ab 2 Verträgen der Linie Komfort oder Premium, Laufzeit 3 Jahre");
    expect(staffelLeiste({ regel: ALLIANZ, prozent: 10 })).toEqual([
      { text: "2 Verträge", prozent: 5, aktiv: false },
      { text: "3 Verträge", prozent: 10, aktiv: true },
      { text: "4 Verträge", prozent: 15, aktiv: false },
      { text: "5+ Verträge", prozent: 20, aktiv: false },
    ]);
  });

  it("Makler mit zwei Gesellschaften: die Regel mit dem meisten Rabatt", () => {
    const axa: KombiRegel = { ...ALLIANZ, gruppe: "axa", staffel: [{ anzahl: 2, prozent: 10 }] };
    const items = [
      item("haftpflicht", 10),
      item("hausrat", 10),
      item("rechtsschutz", 50, "Komfort", { kombi: { gruppe: "axa", sparte: "rechtsschutz", linie: "Komfort" } }),
      item("unfall", 50, "Komfort", { kombi: { gruppe: "axa", sparte: "unfall", linie: "Komfort" } }),
    ];
    expect(kombiRabatt(items, [ALLIANZ, axa])).toMatchObject({ regel: { gruppe: "axa" }, prozent: 10, euro: 10 });
    expect(kombiRabatt(items, [])).toBeNull();
    expect(kombiRabatt(items, null)).toBeNull();
  });
});

describe("Kombi-Rabatt in den Angeboten", () => {
  it("bleibt beim Speichern erhalten (Regeln, Zuordnung je Angebot) und rechnet beim Umschalten neu", () => {
    const d = cleanAngebote({ items: [item("haftpflicht", 8.4), item("hausrat", 9.8), item("rechtsschutz", 18.03)], quelle: [], kombi: [ALLIANZ] });
    expect(d.kombi?.[0]).toMatchObject({ gruppe: "allianz", staffel: ALLIANZ.staffel, mindestLaufzeitJahre: 3 });
    expect(d.items[0].kombi).toEqual({ gruppe: "allianz", sparte: "haftpflicht", linie: "Komfort" });
    expect(beitragAus(d)).toMatchObject({ einzelSumme: 36.23, rabatt: { prozent: 10, euro: 3.63 }, endbeitrag: 32.6 });
    // Kunde nimmt Rechtsschutz heraus: 2 Verträge, 5 %
    const ohne = sparteSchalten(d, 2)!;
    expect(beitragAus(ohne)).toMatchObject({ einzelSumme: 18.2, rabatt: { prozent: 5, euro: 0.91 }, endbeitrag: 17.29 });
    // ohne Regeln: wie bisher
    expect(beitragAus({ ...d, kombi: undefined })).toMatchObject({ einzelSumme: 36.23, rabatt: null, endbeitrag: 36.23 });
    expect(tarifWaehlen(d, 0)!.kombi).toEqual(d.kombi);
  });

  it("unsaubere Regeln werden verworfen", () => {
    expect(cleanKombiRegeln([{ gruppe: "Allianz!", staffel: [{ anzahl: 2, prozent: 5 }] }, { gruppe: "x", staffel: [] }, { gruppe: "y", staffel: [{ anzahl: 2, prozent: 150 }] }])).toEqual([]);
    expect(cleanKombiRegeln("x")).toEqual([]);
  });

  it("echter Katalog: Allianz-Vertreter mit Haftpflicht, Hausrat und Rechtsschutz (Komfort vorgewählt) bekommt 10 %", () => {
    const k = ladeTarifkatalog();
    const a = startAuswahl(k, ["haftpflicht", "hausrat", "rechtsschutz"], { rolle: "vertreter", gesellschaften: ["allianz"] });
    expect(a.sparten.map((s) => s.tarife.find((t) => t.id === s.empfohlen)?.kurz)).toEqual(["Komfort", "Komfort", "Komfort"]);
    a.sparten.forEach((s, i) => (s.tarife.find((t) => t.id === s.empfohlen)!.beitrag = [8.4, 9.8, 18.03][i]));
    const regeln = kombiRegelnFuer(a, k.buendel, { allianz: "Allianz" });
    expect(regeln).toHaveLength(1);
    expect(regeln[0]).toMatchObject({ gruppe: "allianz", name: "Allianz PrivatSchutz", linien: ["Komfort", "Premium"], mindestLaufzeitJahre: 3 });
    expect(beitragsUebersicht(a, k.buendel)).toMatchObject({ einzelSumme: 36.23, rabatt: { prozent: 10, euro: 3.63 }, endbeitrag: 32.6 });
    // Empfehlung Hausrat auf Smart: Rabatt fällt auf 5 %
    const hausrat = a.sparten[1];
    hausrat.empfohlen = hausrat.tarife.find((t) => t.kurz === "Smart")!.id;
    hausrat.tarife.find((t) => t.kurz === "Smart")!.beitrag = 7.6;
    const u = beitragsUebersicht(a, k.buendel);
    expect(u.rabatt?.prozent).toBe(5);
    expect(u.kombi?.blockiert.map((b) => b.tarif)).toEqual(["Smart"]);
    // ohne Katalog-Regeln (z. B. AXA ohne Staffel): kein Rabatt
    expect(zuAngebote(a).kombi).toBeUndefined();
  });
});
