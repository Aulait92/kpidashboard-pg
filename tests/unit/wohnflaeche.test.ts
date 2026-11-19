// Wohnfläche als genaue Zahl statt Bereichsknöpfen (Ole, 19.11.2026): Zwischenfrage Privatschutz ohne Knöpfe, Auswertung,
// einmalige Nachfrage bei Spanne bzw. unplausibler Zahl, „weiß nicht“ ohne Wert weiter (lib/wohnflaeche.ts,
// lib/whatsapp/zwischenfrage.ts), gleiche Frage nach der Buchung (lib/preise/rechner-angaben.ts).
import { describe, expect, it } from "vitest";
import { qmText, wohnflaecheLesen } from "@/lib/wohnflaeche";
import { vermittlerName } from "@/lib/vermittler-nennung";
import { folgefragen } from "@/lib/preise/rechner-angaben";
import { zwischenfrageText, zwischenKnoepfe, zwischenNachfrageText, zwischenSchritt, ZWISCHENFRAGEN, type VerlaufNachricht } from "@/lib/whatsapp/zwischenfrage";

const HERR = vermittlerName("sie", { name: "Ole Kannapinn", anrede: "Herr", fallback: "Agentur" });
const DU = vermittlerName("du", { name: "Ole Kannapinn", anrede: "Herr", fallback: "Agentur" });
const FORM = [
  { label: "Versicherungsinteresse", value: "Haftpflicht, Hausrat" },
  { label: "Familienstand", value: "verheiratet" },
];
const def = ZWISCHENFRAGEN.outreach_privatschutz!.find((d) => d.key === "wohnflaeche")!;
const ERST: VerlaufNachricht = {
  direction: "outbound",
  kind: "template",
  purpose: "outreach_privatschutz",
  sentBy: "system",
  body: "Hallo Frau Mustermann, danke für Ihre Anfrage zum Privatschutz! *Sind Haftpflicht und Hausrat schon versichert, oder wäre beides neu?*",
};
const ein = (body: string): VerlaufNachricht => ({ direction: "inbound", body, kind: "text" });
const uns = (body: string): VerlaufNachricht => ({ direction: "outbound", body, kind: "text", sentBy: "bot" });
const FRAGE = uns(zwischenfrageText(def, "sie", HERR));
const schritt = (...v: VerlaufNachricht[]) => zwischenSchritt({ source: "Privatschutz", formular: FORM, verlauf: [ERST, ein("beides neu"), FRAGE, ...v] });

describe("wohnflaecheLesen", () => {
  it("Zahlen", () => {
    for (const [t, qm] of [["72", 72], ["72 qm", 72], ["72m²", 72], ["ca. 75", 75], ["ca. 75 qm", 75], ["75,5", 75.5], ["etwa 80 Quadratmeter", 80], ["knapp 90", 90], ["120 m2", 120]] as const)
      expect(wohnflaecheLesen(t), t).toEqual({ art: "zahl", qm });
    expect(qmText(75.5)).toBe("75,5 m²");
    expect(qmText(72)).toBe("72 m²");
  });
  it("Spanne, unplausibel, weiß nicht, keine Zahl", () => {
    expect(wohnflaecheLesen("60 bis 80")).toEqual({ art: "spanne", von: 60, bis: 80, qm: 70 });
    expect(wohnflaecheLesen("so 60-80 qm")).toEqual({ art: "spanne", von: 60, bis: 80, qm: 70 });
    expect(wohnflaecheLesen("1.200")).toEqual({ art: "unplausibel", qm: 1200 });
    expect(wohnflaecheLesen("5")).toEqual({ art: "unplausibel", qm: 5 });
    expect(wohnflaecheLesen("weiß nicht")).toEqual({ art: "weiss_nicht" });
    expect(wohnflaecheLesen("keine Ahnung")).toEqual({ art: "weiss_nicht" });
    expect(wohnflaecheLesen("Warum fragen Sie das?")).toBeNull();
  });
});

describe("Zwischenfrage Wohnfläche (Privatschutz)", () => {
  it("Text Sie und Du, ohne Knöpfe", () => {
    expect(zwischenfrageText(def, "sie", HERR)).toBe(
      "Danke! Damit Herr Kannapinn Ihnen im Termin gleich passende Beiträge zeigen kann: Wie viele Quadratmeter Wohnfläche hat Ihre Wohnung? Bitte als Zahl, zum Beispiel 72.",
    );
    expect(zwischenfrageText(def, "du", DU)).toBe("Danke! Damit Ole dir im Termin gleich passende Beiträge zeigen kann: Wie viele Quadratmeter Wohnfläche hat deine Wohnung? Bitte als Zahl, zum Beispiel 72.");
    expect(zwischenKnoepfe(def)).toEqual([]);
    expect(zwischenNachfrageText("spanne", "sie")).toBe("Danke! Wissen Sie es etwas genauer? Eine Zahl reicht.");
    expect(zwischenNachfrageText("spanne", "du")).toBe("Danke! Weißt du es etwas genauer? Eine Zahl reicht.");
    for (const an of ["sie", "du"] as const) for (const art of ["spanne", "unplausibel"] as const) expect(zwischenNachfrageText(art, an)).not.toMatch(/[–—]/);
  });

  it("„72“ und „ca. 75 qm“: Wert als Zahl, weiter zum Terminvorschlag", () => {
    expect(schritt(ein("72"))).toMatchObject({ art: "antwort", wert: "72 m²", frei: false });
    expect(schritt(ein("ca. 75 qm"))).toMatchObject({ art: "antwort", wert: "75 m²", frei: false });
  });

  it("„60 bis 80“: Mittelwert vorläufig, einmal nachfragen, dann die Zahl", () => {
    expect(schritt(ein("60 bis 80"))).toMatchObject({ art: "nachfragen", nachfrage: "spanne", wert: "ca. 70 m²" });
    const nach = uns(zwischenNachfrageText("spanne", "sie"));
    expect(schritt(ein("60 bis 80"), nach, ein("72"))).toMatchObject({ art: "antwort", wert: "72 m²", frei: false });
    // zweite unklare Antwort: ohne Wert weiter (der ca.-Wert bleibt), keine zweite Nachfrage
    expect(schritt(ein("60 bis 80"), nach, ein("so 70 bis 75"))).toMatchObject({ art: "antwort", wert: null, ohneWert: true });
    expect(schritt(ein("60 bis 80"), nach, ein("weiß ich nicht genau"))).toMatchObject({ art: "antwort", wert: null, ohneWert: true });
  });

  it("„1.200“: unplausibel, einmal nachfragen", () => {
    expect(schritt(ein("1.200"))).toMatchObject({ art: "nachfragen", nachfrage: "unplausibel", wert: null });
    const nach = uns(zwischenNachfrageText("unplausibel", "sie"));
    expect(nach.body).toBe("Die Zahl scheint nicht zu passen. Wie viele Quadratmeter Wohnfläche hat Ihre Wohnung? Bitte als Zahl, zum Beispiel 72.");
    expect(schritt(ein("1.200"), nach, ein("120"))).toMatchObject({ art: "antwort", wert: "120 m²" });
    expect(schritt(ein("1.200"), nach, ein("1.200"))).toMatchObject({ art: "antwort", wert: null, ohneWert: true });
  });

  it("„weiß nicht“: ohne Wert weiter; Rückfrage: Assistent übernimmt", () => {
    expect(schritt(ein("weiß nicht"))).toMatchObject({ art: "antwort", wert: null, frei: false, ohneWert: true });
    expect(schritt(ein("Wozu brauchen Sie das?"))).toMatchObject({ art: "antwort", wert: null, frei: true });
  });

  it("laufende Chats mit der alten Frage und alten Knöpfen bleiben lesbar", () => {
    const alt = uns("Danke! Damit Herr Kannapinn Ihnen im Termin gleich passende Beiträge zeigen kann: Wie groß ist Ihre Wohnung ungefähr?");
    expect(zwischenSchritt({ source: "Privatschutz", formular: FORM, verlauf: [ERST, ein("beides neu"), alt, ein("60 bis 100 m²")] })).toMatchObject({ art: "antwort", wert: "60 bis 100 m²" });
    expect(zwischenSchritt({ source: "Privatschutz", formular: FORM, verlauf: [ERST, ein("beides neu"), alt, ein("85")] })).toMatchObject({ art: "antwort", wert: "85 m²" });
  });
});

describe("Frage nach der Buchung (Rechner-Tabelle)", () => {
  it("gleiche Frage als freie Eingabe", () => {
    const f = folgefragen(["hausrat"], { formular: [{ label: "PLZ", value: "12209" }], angaben: { geburt: "14.05.1985" } });
    expect(f.find((x) => x.key === "wohnflaeche")).toMatchObject({
      sie: "Wie viele Quadratmeter Wohnfläche hat Ihre Wohnung? Bitte als Zahl, zum Beispiel 72.",
      du: "Wie viele Quadratmeter Wohnfläche hat deine Wohnung? Bitte als Zahl, zum Beispiel 72.",
    });
    expect(f.find((x) => x.key === "wohnflaeche")?.knoepfe).toBeUndefined();
  });
});
