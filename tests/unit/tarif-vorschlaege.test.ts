// Tarifkatalog lernt aus Einträgen der Vermittler (Ole, 18.11.2026): Erfassen (eigener Tarif, bisheriger Vertrag),
// Vergleich der Werte, keine Personendaten, Überlagerung, Gruppierung mit „Empfohlen“ ab 3, Auffrischen, Export-Skript.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ladeTarifkatalog } from "@/lib/tarifkatalog-laden";
import { werteZuPruefen } from "@/lib/tarifkatalog";
import { sparteNeu, tarifAusKatalog, zuAngebote } from "@/lib/tarifauswahl";
import { bisherHand } from "@/lib/bisheriger-vertrag";
import { folien, markeFuer } from "@/lib/praesentation";
import type { VorbereitungDaten } from "@/lib/termin-vorbereitung";
import {
  TARIF_MERKMAL,
  auswahlAuffrischen,
  gruppieren,
  katalogUeberlagern,
  vorschlaegeAusBisher,
  vorschlaegeAusEigenemTarif,
  wertNorm,
  wirktPersoenlich,
  type VorschlagZeile,
} from "@/lib/tarif-vorschlaege";
import { anwenden } from "../../scripts/tarif-vorschlaege-export.mjs";

const ORDNER = path.join(__dirname, "..", "..", "data", "tarifkatalog");
const k = ladeTarifkatalog(ORDNER);
const lvm = k.tarife.find((t) => t.id === "lvm/hausrat/meinpremium")!;
const allianz = k.tarife.find((t) => t.id === "allianz/hausrat/komfort")!;
const termin: VorbereitungDaten = {
  lead: { name: "Verena Martin", telefon: null, email: null, adresse: null, produkt: "Privatschutz" },
  termin: { startsAt: new Date("2026-11-20T09:00:00Z"), mode: "phone", berater: "Max Berger", meetUrl: null },
  zusammenfassung: null,
  formular: [],
  angaben: {},
  vorbereitetAm: null,
};

describe("Werte vergleichen und Personendaten", () => {
  it("gleich geschrieben im Sinne des Katalogs", () => {
    expect(wertNorm("bis 5.000 €")).toBe(wertNorm("bis 5000€"));
    expect(wertNorm("bis 5000 Euro")).toBe(wertNorm("bis 5.000 €"));
    expect(wertNorm("✓")).toBe("ja");
    expect(wertNorm("nicht enthalten")).toBe("nein");
    expect(wertNorm("bis 3.000 €")).not.toBe(wertNorm("bis 5.000 €"));
  });
  it("E-Mail, Telefonnummer und IBAN gelten als persönlich, Beträge nicht", () => {
    expect(wirktPersoenlich("max@beispiel.de")).toBe(true);
    expect(wirktPersoenlich("0151 2345678")).toBe(true);
    expect(wirktPersoenlich("+49 151 2345678")).toBe(true);
    expect(wirktPersoenlich("DE89 3704 0044")).toBe(true);
    expect(wirktPersoenlich("bis 10.000.000 €")).toBe(false);
    expect(wirktPersoenlich("100 %, 5000000 €")).toBe(false);
    expect(wirktPersoenlich("30 % der VS")).toBe(false);
  });
});

describe("Erfassen: eigener Tarif zu einem Katalogtarif", () => {
  it("ungeprüfter Tarif: abweichend, ergänzt und bestätigt; Unbekanntes, Leeres und Persönliches nicht", () => {
    expect(lvm.ungeprueft).toBe(true);
    const v = vorschlaegeAusEigenemTarif(k, {
      sparte: "hausrat",
      gesellschaft: "LVM Versicherung",
      name: "MeinPremium",
      werte: { bargeld: "bis 5.000 €", diebstahl: "bis 2.000 €", wert: "30 % der VS", gf: "", garten: "0151 2345678", gibtsnicht: "x" },
    });
    expect(v.map((x) => [x.merkmal, x.alterWert, x.neuerWert])).toEqual([
      ["bargeld", "bis 3.000 €", "bis 5.000 €"],
      ["diebstahl", null, "bis 2.000 €"],
      ["wert", "30 % der VS", "30 % der VS"],
    ]);
    expect(v.every((x) => x.tarifId === "lvm/hausrat/meinpremium" && x.datei === "lvm/hausrat.json" && x.gesellschaft === "lvm" && x.ungeprueft)).toBe(true);
    // nur Katalogbezug, keine weiteren Felder
    expect(Object.keys(v[0]).sort()).toEqual(["alterWert", "datei", "gesellschaft", "merkmal", "neuerWert", "sparte", "tarifId", "ungeprueft"]);
  });

  it("geprüfter Tarif: nur Abweichungen, gleiche Werte nicht", () => {
    expect(allianz.ungeprueft).toBeUndefined();
    const v = vorschlaegeAusEigenemTarif(k, { sparte: "hausrat", gesellschaft: "Allianz", name: "Hausrat Komfort", werte: { bargeld: "2000 €", garten: "bis 20.000 €" } });
    expect(v.map((x) => [x.tarifId, x.merkmal, x.neuerWert, x.ungeprueft])).toEqual([["allianz/hausrat/komfort", "garten", "bis 20.000 €", false]]);
  });

  it("Name fehlt im Katalog der Gesellschaft: Tarifname als Vorschlag; fremde Gesellschaft bzw. Sparte ohne Datei: nichts", () => {
    const v = vorschlaegeAusEigenemTarif(k, { sparte: "hausrat", gesellschaft: "LVM", name: "MeinKompakt", werte: { bargeld: "bis 500 €" } });
    expect(v).toEqual([
      { gesellschaft: "lvm", sparte: "hausrat", datei: "lvm/hausrat.json", tarifId: "lvm/hausrat/*", merkmal: TARIF_MERKMAL, alterWert: null, neuerWert: "MeinKompakt", ungeprueft: true },
    ]);
    expect(vorschlaegeAusEigenemTarif(k, { sparte: "hausrat", gesellschaft: "Kleine Regionale VVaG", name: "Top", werte: { bargeld: "x" } })).toEqual([]);
    expect(vorschlaegeAusEigenemTarif(k, { sparte: "gibts-nicht", gesellschaft: "LVM", name: "Top" })).toEqual([]);
  });
});

describe("Erfassen: bisheriger Vertrag", () => {
  const hand = (gesellschaft: string, tarif: string | null, katalogId: string | null = null) => ({ ...bisherHand(null), gesellschaft, tarif, katalogId });
  it("„Anderer Tarif“ bei einer Katalog-Gesellschaft: Tarifname; Katalogtarif, Police, Chat und Gesundheitssparten nicht", () => {
    const v = vorschlaegeAusBisher(k, [
      { key: "hausrat", bisher: hand("LVM", "Hausrat Classic 2019") },
      { key: "haftpflicht", bisher: hand("LVM", "Komfort", "lvm/haftpflicht/komfort") },
      { key: "rechtsschutz", bisher: { ...hand("LVM", "Alt 2010"), quelle: "police" } },
      { key: "bu", bisher: hand("Allianz", "BU Alt") },
      { key: "wohngebaeude", bisher: null },
    ]);
    expect(v.map((x) => [x.tarifId, x.neuerWert])).toEqual([["lvm/hausrat/*", "Hausrat Classic 2019"]]);
  });
  it("Name, der im Katalog steckt, ist kein Vorschlag", () => {
    expect(vorschlaegeAusBisher(k, [{ key: "hausrat", bisher: hand("LVM", "LVM MeinPremium 2024") }])).toEqual([]);
  });
});

describe("Überlagerung", () => {
  it("setzt Werte, markiert „von Vermittlern bestätigt“, lässt Datei-Katalog, fremde Merkmale und Tarifnamen unberührt", () => {
    const o = katalogUeberlagern(k, [
      { tarifId: lvm.id, merkmal: "bargeld", wert: "bis 5.000 €" },
      { tarifId: lvm.id, merkmal: "gibtsnicht", wert: "x" },
      { tarifId: "lvm/hausrat/*", merkmal: TARIF_MERKMAL, wert: "MeinKompakt" },
      { tarifId: "gibts/nicht/da", merkmal: "bargeld", wert: "x" },
    ]);
    const t = o.tarife.find((x) => x.id === lvm.id)!;
    expect(t.werte.bargeld).toBe("bis 5.000 €");
    expect(t.werte.gibtsnicht).toBeUndefined();
    expect(t.bestaetigt).toEqual(["bargeld"]);
    expect(lvm.werte.bargeld).toBe("bis 3.000 €");
    expect(lvm.bestaetigt).toBeUndefined();
    expect(o.tarife.length).toBe(k.tarife.length);
    expect(katalogUeberlagern(k, [])).toBe(k);
  });
  it("„bitte prüfen“ nur, solange ein Merkmal der Folie unbestätigt ist", () => {
    const t = { ungeprueft: true, bestaetigt: ["gf", "wert"] };
    expect(werteZuPruefen(t, ["gf", "wert"])).toBe(false);
    expect(werteZuPruefen(t, ["gf", "bargeld"])).toBe(true);
    expect(werteZuPruefen({ bestaetigt: [] }, ["gf"])).toBe(false);
    const w = tarifAusKatalog(katalogUeberlagern(k, [{ tarifId: lvm.id, merkmal: "gf", wert: "ja" }]).tarife.find((x) => x.id === lvm.id)!);
    expect(w.werteUngeprueft).toBe(true);
    expect(w.werteBestaetigt).toEqual(["gf"]);
  });
  it("Vergleichsfolie (Angebote) nutzt den übernommenen Wert, gespeicherte Auswahl wird aufgefrischt", () => {
    const o = katalogUeberlagern(k, [{ tarifId: lvm.id, merkmal: "wert", wert: "40 % der VS" }]);
    const sp = sparteNeu(o, "hausrat", { rolle: "vertreter", gesellschaften: ["lvm"] })!;
    const ang = zuAngebote({ v: 1, sparten: [sp] });
    expect(ang.items.find((i) => i.tarif === "MeinPremium")!.merkmale.map((m) => m.wert)).toContain("40 % der VS");
    const vergleich = folien(termin, ang, markeFuer({ name: "LVM Agentur Test" })).find((f) => f.id.startsWith("vergleich-"))!;
    expect(vergleich.html).toContain("40 % der VS");
    // alte Auswahl (Schnappschuss mit Dateiwert) bekommt den Wert
    const alt = { v: 1 as const, sparten: [sparteNeu(k, "hausrat", { rolle: "vertreter", gesellschaften: ["lvm"] })!] };
    const f = auswahlAuffrischen(alt, o);
    expect(f.geaendert).toBe(true);
    const t = f.auswahl.sparten[0].tarife.find((x) => x.id === lvm.id)!;
    expect(t.werte.wert).toBe("40 % der VS");
    expect(t.werteBestaetigt).toEqual(["wert"]);
    expect(auswahlAuffrischen(f.auswahl, o).geaendert).toBe(false);
    expect(alt.sparten[0].tarife.find((x) => x.id === lvm.id)!.werte.wert).toBe("30 % der VS");
  });
});

describe("Admin-Liste: Gruppen, verschiedene Vermittler, Empfohlen ab 3", () => {
  const z = (customerId: string, tarifId: string, merkmal: string, neuerWert: string, ungeprueft: boolean, tag = 1): VorschlagZeile => ({
    customerId,
    tarifId,
    gesellschaft: tarifId.split("/")[0],
    sparte: tarifId.split("/")[1],
    datei: `${tarifId.split("/")[0]}/${tarifId.split("/")[1]}.json`,
    merkmal,
    neuerWert,
    ungeprueft,
    createdAt: new Date(Date.UTC(2026, 10, tag)),
  });
  it("zählt verschiedene Vermittler je Wert (gleich geschrieben), Empfohlen erst ab 3 und nur bei ungeprüften", () => {
    const g = gruppieren(
      [
        z("a", allianz.id, "garten", "bis 20.000 €", false, 9),
        z("b", allianz.id, "garten", "bis 20000 €", false),
        z("c", allianz.id, "garten", "bis 20.000 €", false),
        z("a", lvm.id, "bargeld", "bis 5.000 €", true),
        z("b", lvm.id, "bargeld", "bis 5000 €", true),
        z("c", lvm.id, "bargeld", "bis 5.000 Euro", true),
        z("d", lvm.id, "bargeld", "bis 4.000 €", true),
        z("a", lvm.id, "diebstahl", "bis 2.000 €", true),
        z("b", lvm.id, "diebstahl", "bis 2.000 €", true),
        z("a", "lvm/hausrat/*", TARIF_MERKMAL, "MeinKompakt", true),
      ],
      k,
    );
    // ungeprüfte zuerst, darunter die mit Empfehlung
    expect(g.map((x) => x.key)).toEqual([`${lvm.id}|bargeld`, `${lvm.id}|diebstahl`, `lvm/hausrat/*|${TARIF_MERKMAL}`, `${allianz.id}|garten`]);
    const bargeld = g[0];
    expect(bargeld.katalogWert).toBe("bis 3.000 €");
    expect(bargeld.werte.map((w) => [w.vermittler, w.empfohlen, w.art])).toEqual([
      [3, true, "geaendert"],
      [1, false, "geaendert"],
    ]);
    expect(g[1].werte[0]).toMatchObject({ vermittler: 2, empfohlen: false, art: "ergaenzt" });
    expect(g[2]).toMatchObject({ merkmalLabel: "Tarifname", tarif: null, werte: [expect.objectContaining({ art: "neu", vermittler: 1 })] });
    expect(g[3].werte[0]).toMatchObject({ vermittler: 3, empfohlen: false });
  });
  it("übernommener Wert: Merkmal gilt als bestätigt, nicht mehr ungeprüft", () => {
    const o = katalogUeberlagern(k, [{ tarifId: lvm.id, merkmal: "bargeld", wert: "bis 5.000 €" }]);
    const [g] = gruppieren([z("a", lvm.id, "bargeld", "bis 5.000 €", true)], o);
    expect(g).toMatchObject({ ungeprueft: false, bestaetigt: true, katalogWert: "bis 5.000 €" });
    expect(g.werte[0]).toMatchObject({ art: "bestaetigt", empfohlen: false });
  });
  it("zu lange Werte passen nicht auf die Folie", () => {
    const [g] = gruppieren([z("a", lvm.id, "garten", "bis 10.000 €, erhöhbar auf 50.000 €", true)], k);
    expect(g.werte[0].zuLang).toBe(true);
  });
});

describe("Export-Skript", () => {
  it("schreibt übernommene Werte mit Vermerk in eine Kopie der Katalogdatei, ohne Gedankenstriche", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tarif-export-"));
    fs.mkdirSync(path.join(tmp, "lvm"));
    fs.copyFileSync(path.join(ORDNER, "lvm", "hausrat.json"), path.join(tmp, "lvm", "hausrat.json"));
    const { dateien, meldungen } = anwenden(
      {
        werte: [
          { datei: "lvm/hausrat.json", tarifId: lvm.id, merkmal: "bargeld", wert: "bis 5.000 € – erhöhbar", vermittler: 3, uebernommenAm: "2026-11-18T10:00:00Z" },
          { datei: "lvm/hausrat.json", tarifId: "lvm/hausrat/gibtsnicht", merkmal: "bargeld", wert: "x", vermittler: 1, uebernommenAm: "2026-11-18T10:00:00Z" },
        ],
        neueTarife: [{ datei: "lvm/hausrat.json", gesellschaft: "lvm", sparte: "hausrat", name: "MeinKompakt", vermittler: 2, uebernommenAm: "2026-11-18T10:00:00Z" }],
      },
      tmp,
    );
    const j = dateien.get(path.join(tmp, "lvm", "hausrat.json"));
    const t = j.tarife.find((x: { kurz: string }) => x.kurz === "MeinPremium");
    expect(t.werte.bargeld).toBe("bis 5.000 €, erhöhbar");
    expect(t.ungeprueft).toBe(true);
    expect(j.offen.at(-1)).toContain("von 3 Vermittlern eingetragen");
    expect(meldungen.some((m: string) => m.startsWith("Tarif nicht gefunden"))).toBe(true);
    expect(meldungen.some((m: string) => m.includes("MeinKompakt"))).toBe(true);
    // Probelauf schreibt nichts
    expect(JSON.parse(fs.readFileSync(path.join(tmp, "lvm", "hausrat.json"), "utf8")).tarife[1].werte.bargeld).toBe("bis 3.000 €");
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
