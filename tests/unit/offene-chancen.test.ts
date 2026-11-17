// Offene Chancen auf Wachstum (Ole, 18.11.2026): Stufen, Wert je Chance, eigene bzw. Standardquoten, Sortierung.
import { describe, expect, it } from "vitest";
import {
  bewerteChancen,
  chanceStufe,
  chancenAufteilung,
  eigeneQuoten,
  erwarteteProvision,
  MIN_FAELLE_QUOTE,
  STANDARD_QUOTEN,
  type ChanceLead,
  type QuotenFall,
} from "@/lib/offene-chancen";
import { contractProvision } from "@/lib/provision";

const now = new Date("2026-11-18T10:00:00Z");
const h = (n: number) => new Date(now.getTime() + n * 3600_000);
const lead = (o: Partial<ChanceLead>): ChanceLead => ({ id: "l", name: "Anna Muster", source: "Privatschutz", status: "In Beratung", reached: true, followUpAt: null, termine: [], ...o });
const std = eigeneQuoten([]);

describe("chanceStufe", () => {
  it("ordnet die vier Stufen zu", () => {
    expect(chanceStufe(lead({ status: "Angebot gesendet" }), now)).toBe("angebot");
    expect(chanceStufe(lead({ termine: [{ startsAt: h(-2), status: "booked" }] }), now)).toBe("termin_offen");
    expect(chanceStufe(lead({ termine: [{ startsAt: h(24), status: "booked" }] }), now)).toBe("termin");
    expect(chanceStufe(lead({ followUpAt: h(48) }), now)).toBe("wiedervorlage");
  });
  it("Angebot geht vor Termin, Termin ohne Ergebnis vor gebuchtem Termin", () => {
    expect(chanceStufe(lead({ status: "Angebot gesendet", termine: [{ startsAt: h(24), status: "booked" }] }), now)).toBe("angebot");
    expect(chanceStufe(lead({ termine: [{ startsAt: h(-30), status: "booked" }, { startsAt: h(5), status: "booked" }] }), now)).toBe("termin_offen");
  });
  it("Termin gilt erst 30 Minuten nach Beginn als vorbei", () => {
    expect(chanceStufe(lead({ termine: [{ startsAt: new Date(now.getTime() - 10 * 60_000), status: "booked" }] }), now)).toBe("termin");
  });
  it("keine Chance: nicht erreichte Neu-Leads, verloren, gewonnen, storniert, abgesagte Termine", () => {
    expect(chanceStufe(lead({ status: "Nicht erreicht", reached: false, followUpAt: h(24) }), now)).toBeNull();
    expect(chanceStufe(lead({ status: "Neuer Lead", reached: false }), now)).toBeNull();
    expect(chanceStufe(lead({ status: "Kein Interesse", followUpAt: h(24) }), now)).toBeNull();
    expect(chanceStufe(lead({ status: "Angebot gesendet", lostAt: h(-1) }), now)).toBeNull();
    expect(chanceStufe(lead({ status: "Abschluss", closedAt: h(-1) }), now)).toBeNull();
    expect(chanceStufe(lead({ status: "Angebot gesendet", stornoState: "approved" }), now)).toBeNull();
    expect(chanceStufe(lead({ status: "Storno" }), now)).toBeNull();
    expect(chanceStufe(lead({ termine: [{ startsAt: h(24), status: "cancelled" }] }), now)).toBeNull();
    expect(chanceStufe(lead({ status: "In Beratung", followUpAt: null }), now)).toBeNull();
  });
  it("Wiedervorlage zählt, sobald gesprochen wurde (auch ohne „erreicht“-Haken bei Beratungs-Status)", () => {
    expect(chanceStufe(lead({ status: "In Beratung", reached: false, followUpAt: h(24) }), now)).toBe("wiedervorlage");
    expect(chanceStufe(lead({ status: "Nicht erreicht", reached: false, followUpAt: h(24), termine: [{ startsAt: h(-100), status: "completed" }] }), now)).toBe("wiedervorlage");
  });
});

describe("erwarteteProvision", () => {
  it("ohne Angebot: Standardbeitrag des Produkts mit den Sätzen des Vermittlers", () => {
    const std = contractProvision({ sparte: "privatschutz", premium: null }).firstYear;
    expect(erwarteteProvision({ source: "Privatschutz", termine: [] })).toEqual({ betrag: Math.round(std), ausAngebot: false });
    const eigen = erwarteteProvision({ source: "Privatschutz", termine: [] }, { privatschutz: { kind: "fixed", amount: 222 } });
    expect(eigen.betrag).toBe(222);
  });
  it("mit abgelegtem Angebot: Monatsbeitrag × 12 (Sach), PKV mit Monatsbeitrag; jüngster Termin zählt", () => {
    const r = erwarteteProvision({
      source: "Privatschutz",
      termine: [
        { startsAt: h(-200), status: "completed", angebote: [{ sparte: "Privatschutz", beitragMonat: 10 }] },
        { startsAt: h(-2), status: "booked", angebote: [{ sparte: "Privatschutz", beitragMonat: 50 }, { sparte: "Hausrat", beitragMonat: 10 }] },
      ],
    });
    // 600 × 55 % + 120 × 55 %
    expect(r).toEqual({ betrag: 396, ausAngebot: true });
    expect(erwarteteProvision({ source: "PKV Neugeschäft", termine: [{ startsAt: h(-2), status: "booked", angebote: [{ sparte: "PKV-Neugeschäft", beitragMonat: 500 }] }] }).betrag).toBe(4500);
  });
  it("unbekanntes Produkt: Sonstiges", () => {
    expect(erwarteteProvision({ source: null, termine: [] }).betrag).toBe(Math.round(contractProvision({ sparte: "sonstiges", premium: null }).firstYear));
  });
});

describe("eigeneQuoten", () => {
  const fall = (o: Partial<QuotenFall>): QuotenFall => ({ hatteTermin: true, hatteAngebot: false, abschluss: false, verloren: false, ...o });
  it(`unter ${MIN_FAELLE_QUOTE} entschiedenen Fällen: Standardquote`, () => {
    const q = eigeneQuoten(Array.from({ length: 9 }, (_, i) => fall({ abschluss: i < 5, verloren: i >= 5 })));
    expect(q.termin).toEqual({ quote: STANDARD_QUOTEN.termin, eigen: false, faelle: 9 });
    expect(q.angebot.eigen).toBe(false);
  });
  it("ab 10 entschiedenen Fällen: eigene Quote, offene Fälle zählen nicht", () => {
    const faelle = [
      ...Array.from({ length: 3 }, () => fall({ abschluss: true, hatteAngebot: true })),
      ...Array.from({ length: 7 }, () => fall({ verloren: true, hatteAngebot: true })),
      ...Array.from({ length: 20 }, () => fall({})),
    ];
    const q = eigeneQuoten(faelle, { angebot: 0.5, termin: 0.3 });
    expect(q.termin).toEqual({ quote: 0.3, eigen: true, faelle: 10 });
    expect(q.angebot).toEqual({ quote: 0.3, eigen: true, faelle: 10 });
  });
  it("Standardquoten aus dem Admin", () => {
    expect(eigeneQuoten([], { angebot: 0.5, termin: 0.2 })).toMatchObject({ angebot: { quote: 0.5 }, termin: { quote: 0.2 } });
  });
});

describe("bewerteChancen", () => {
  it("Wert = Provision × Quote der Stufe, sortiert nach erwartetem Wert, Summen und Aufteilung", () => {
    const leads = [
      lead({ id: "a", name: "Termin", termine: [{ startsAt: h(24), status: "booked" }] }),
      lead({ id: "b", name: "Angebot", status: "Angebot gesendet" }),
      lead({ id: "c", name: "Bedenkzeit", followUpAt: h(-24), followUpNote: "Rückruf" }),
      lead({ id: "d", name: "Verloren", status: "Kein Interesse" }),
    ];
    const c = bewerteChancen(leads, std, undefined, now);
    expect(c.anzahl).toBe(3);
    expect(c.liste.map((x) => x.leadId)).toEqual(["b", "c", "a"]);
    const p = Math.round(contractProvision({ sparte: "privatschutz", premium: null }).firstYear);
    expect(c.liste[0]).toMatchObject({ stufe: "angebot", provision: p, erwartet: Math.round(p * STANDARD_QUOTEN.angebot), schaetzung: true, naechsterSchritt: "Angebot nachfassen" });
    expect(c.liste[1].naechsterSchritt).toBe("Wiedervorlage seit 17.11. fällig (Rückruf)");
    expect(c.liste[2].naechsterSchritt).toBe("Termin am 19.11. um 11:00 Uhr");
    expect(c.bisZu).toBe(3 * p);
    expect(c.realistisch).toBe(c.liste.reduce((s, x) => s + x.erwartet, 0));
    expect(c.schaetzung).toBe(true);
    expect(chancenAufteilung(c)).toBe("1 Angebot, 1 Termin, 1 Bedenkzeit");
  });
  it("Termin ohne Ergebnis: nächster Schritt Ergebnis eintragen", () => {
    const c = bewerteChancen([lead({ termine: [{ startsAt: new Date("2026-11-17T09:00:00Z"), status: "booked" }] })], std, undefined, now);
    expect(c.liste[0].naechsterSchritt).toBe("Ergebnis vom Termin am 17.11. eintragen");
    expect(chancenAufteilung(c)).toBe("1 Termin");
  });
  it("ohne Chancen: leer", () => {
    const c = bewerteChancen([], std, undefined, now);
    expect(c).toMatchObject({ anzahl: 0, bisZu: 0, realistisch: 0, schaetzung: false });
  });
});
