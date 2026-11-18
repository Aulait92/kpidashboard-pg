// Bestandsübertragung aus der Maklervollmacht (Ole, 18.11.2026): reine Regeln, Provision nur Bestand, Zählung erst
// nach Bestätigung, getrennte Zeile in den Zahlen.
import { describe, expect, it } from "vitest";
import {
  aufgabeKind,
  beitragAusMonat,
  bisherBeitragMonat,
  gleicherVersicherer,
  provisionsSparte,
  uebertragungKey,
  uebertragungStand,
  zaehltVertrag,
} from "@/lib/maklervollmacht/uebertragung-regeln";
import { contractProvision, standardRate } from "@/lib/provision";
import { provisionAusText, summarizeProvision } from "@/lib/ertrag";
import { uebertragungNote, versichererAusUebertragung } from "@/lib/vertraege-shared";
import type { CustomerContract } from "@/lib/vertraege";

const makler = { hausrat: standardRate("hausrat", "makler"), privatschutz: standardRate("privatschutz", "makler"), bu: standardRate("bu", "makler") };

const bisher = (gesellschaft: string | null, beitrag: number, zahlweise: "monat" | "jahr" = "monat") => ({
  quelle: "hand",
  zeigen: null,
  gesellschaft,
  tarif: null,
  katalogId: null,
  werte: {},
  beitrag,
  zahlweise,
  summe: null,
  sb: null,
  ablauf: null,
  kuendbarZum: null,
  fristMonate: null,
});

describe("Bestandsübertragung: Regeln", () => {
  it("Sparte der Vollmacht über die bestehende Zuordnung", () => {
    expect(provisionsSparte("haftpflicht")).toBe("privatschutz");
    expect(provisionsSparte("hausrat")).toBe("hausrat");
    expect(provisionsSparte("wohngebaeude")).toBe("wohngebaeude");
    expect(provisionsSparte("kfz")).toBe("kfz");
    expect(provisionsSparte("rechtsschutz")).toBe("rechtsschutz");
    expect(provisionsSparte("bu")).toBe("bu");
    expect(provisionsSparte("leben")).toBe("leben_bu");
    expect(provisionsSparte("unfall")).toBe("unfall");
    expect(provisionsSparte("pflege")).toBe("pflegezusatz");
    expect(provisionsSparte("kranken")).toBe("krankenzusatz");
    expect(provisionsSparte("tier")).toBe("katze");
    expect(provisionsSparte("sonstige")).toBe("sonstiges");
    expect(provisionsSparte("unbekannt")).toBe("sonstiges");
  });

  it("Versicherer vergleichen: bekannte Gesellschaften und Namen", () => {
    expect(gleicherVersicherer("Allianz", "Allianz Versicherungs-AG")).toBe(true);
    expect(gleicherVersicherer("HUK-Coburg", "HUK24")).toBe(true);
    expect(gleicherVersicherer("Allianz", "AXA")).toBe(false);
    expect(gleicherVersicherer("Muster Versicherung", "muster-versicherung")).toBe(true);
    expect(gleicherVersicherer(null, "Allianz")).toBe(false);
  });

  it("Monatsbeitrag in den gespeicherten Beitrag (Kranken monatlich, sonst Jahresbeitrag)", () => {
    expect(beitragAusMonat("privatschutz", 8)).toBe(96);
    expect(beitragAusMonat("bu", 50)).toBe(600);
    expect(beitragAusMonat("krankenzusatz", 25)).toBe(25);
    expect(beitragAusMonat("pkv_tarif", 25)).toBeNull();
    expect(beitragAusMonat("hausrat", null)).toBeNull();
    expect(beitragAusMonat("hausrat", 0)).toBeNull();
  });

  it("Beitrag aus dem bisherigen Vertrag der Terminvorbereitung: gleiche Sparte und gleicher Versicherer", () => {
    const auswahl = {
      v: 1,
      sparten: [
        { key: "hausrat", label: "Hausrat", bisher: bisher("AXA", 120, "jahr") },
        { key: "haftpflicht", label: "Privathaftpflicht", bisher: bisher("Allianz", 8) },
        { key: "zahnzusatz", label: "Zahnzusatz", bisher: bisher(null, 20) },
      ],
    };
    expect(bisherBeitragMonat([auswahl], { versicherer: "Allianz", sparte: "haftpflicht" })).toBe(8);
    expect(bisherBeitragMonat([auswahl], { versicherer: "AXA", sparte: "hausrat" })).toBe(10);
    // anderer Versicherer: nicht übernehmen
    expect(bisherBeitragMonat([auswahl], { versicherer: "ERGO", sparte: "haftpflicht" })).toBeNull();
    // ohne Versicherer im bisherigen Vertrag reicht die Sparte (Kranken-Linie)
    expect(bisherBeitragMonat([auswahl], { versicherer: "Barmenia", sparte: "kranken" })).toBe(20);
    expect(bisherBeitragMonat([auswahl], { versicherer: "Allianz", sparte: "kfz" })).toBeNull();
    expect(bisherBeitragMonat([null, "x", { sparten: "x" }], { versicherer: "Allianz", sparte: "haftpflicht" })).toBeNull();
  });

  it("Schlüssel, Aufgabe, Wiedervorlage, Stand", () => {
    expect(uebertragungKey("vv1", 2)).toBe("vv1:2");
    expect(aufgabeKind("HUK-Coburg")).toBe("uebertragung:huk-coburg");
    expect(aufgabeKind("  Württembergische AG ")).toBe("uebertragung:württembergische-ag");
    const note = uebertragungNote("Allianz");
    expect(note).toBe("Übertragung bei Allianz bestätigt?");
    expect(versichererAusUebertragung(note)).toBe("Allianz");
    expect(versichererAusUebertragung("Police da und erste Zahlung erfolgt?")).toBeNull();
    expect(uebertragungStand({ status: "aktiv", uebertragungBestaetigtAt: null })).toBe("laeuft");
    expect(uebertragungStand({ status: "aktiv", uebertragungBestaetigtAt: new Date() })).toBe("bestaetigt");
    expect(uebertragungStand({ status: "storniert", uebertragungBestaetigtAt: null })).toBe("abgelehnt");
    expect(zaehltVertrag({ herkunft: null, uebertragungBestaetigtAt: null })).toBe(true);
    expect(zaehltVertrag({ herkunft: "uebertragung", uebertragungBestaetigtAt: null })).toBe(false);
    expect(zaehltVertrag({ herkunft: "uebertragung", uebertragungBestaetigtAt: new Date() })).toBe(true);
  });
});

describe("Bestandsübertragung: Provision nur Bestand", () => {
  it("Makler Sach: keine Abschlusscourtage, Bestand ab sofort", () => {
    const neu = contractProvision({ sparte: "hausrat", premium: 200 }, makler);
    const ueb = contractProvision({ sparte: "hausrat", premium: 200, uebertragung: true }, makler);
    expect(ueb.abschluss).toBe(0);
    expect(ueb.trailPerYear).toBe(45);
    expect(ueb.trailFromYear2).toBe(false);
    expect(ueb.firstYear).toBe(45);
    expect(neu.trailPerYear).toBe(45);
  });

  it("Vertreter-Sätze und Leben: Abschluss fällt weg, Bestand im 1. Jahr", () => {
    const sach = contractProvision({ sparte: "hausrat", premium: 200, uebertragung: true });
    expect(sach).toMatchObject({ abschluss: 0, trailPerYear: 20, trailFromYear2: false, firstYear: 20 });
    const bu = contractProvision({ sparte: "bu", premium: 600, uebertragung: true }, makler);
    expect(bu.abschluss).toBe(0);
    expect(bu.haftungMonate).toBeNull();
    expect(bu.firstYear).toBe(bu.trailPerYear);
    expect(bu.trailPerYear).toBe(9);
    // Honorar (Tarifoptimierung) und feste Werte: bei einer Übertragung nichts
    expect(contractProvision({ sparte: "pkv_tarif", premium: 100, uebertragung: true }).firstYear).toBe(0);
    expect(contractProvision({ sparte: "hausrat", premium: null, provisionValue: 300, uebertragung: true }).firstYear).toBe(0);
  });

  const base = (o: Partial<CustomerContract>): CustomerContract => ({
    id: Math.random().toString(36),
    leadId: "l1",
    primary: true,
    sparte: "hausrat",
    premium: 200,
    provisionValue: null,
    signedAt: new Date("2026-11-10T12:00:00Z"),
    periodAt: new Date("2026-11-10T12:00:00Z"),
    origin: "paid",
    campaignId: null,
    assignedUserId: null,
    leadCreatedAt: new Date("2026-11-01T12:00:00Z"),
    ...o,
  });

  it("Zahlen: Übertragung getrennt von Neuabschluss und Cross-Selling", () => {
    const range = { from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-11-30T23:59:59Z") };
    const contracts = [
      base({ primary: true }),
      base({ primary: false, sparte: "privatschutz", premium: 100 }),
      base({ leadId: "l2", primary: false, uebertragung: true, premium: 400, periodAt: new Date("2026-11-15T12:00:00Z") }),
    ];
    const s = summarizeProvision(contracts, makler, range, { now: new Date("2026-11-20T00:00:00Z") });
    expect(s.uebertragung).toEqual({ contracts: 1, amount: 90, leads: 1 });
    expect(s.crossSell.contracts).toBe(1);
    expect(s.abschluss).toBe(0);
    expect(s.firstYear).toBe(45 + 22.5 + 90);
    expect(s.contracts).toBe(3);
    expect(provisionAusText(s, true)).toBe("aus 1 Abschluss (2 Verträge, davon 1 Cross-Selling) und 1 Bestandsübertragung, im 1. Jahr");
    // Übertragung außerhalb des Zeitraums (bestätigt später) zählt dort nicht
    const vorher = summarizeProvision(contracts, makler, { from: range.from, to: new Date("2026-11-12T00:00:00Z") });
    expect(vorher.uebertragung.contracts).toBe(0);
  });
});
