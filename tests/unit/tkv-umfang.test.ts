// Tierkranken: gewünschter Umfang (OP, voll, offen) aus Freitext und Knopf, Texte an den Lead (Terminvorschlag,
// Erinnerungen) und Vorauswahl in der Terminvorbereitung (Ole, 19.11.2026: Lead wählt „OPeration“, der Bot schrieb
// „was eine Krankenversicherung für Minka kostet“).
import { describe, expect, it } from "vitest";
import { tarifwunschText, tkvAngabenNormal, tkvUmfangAusText, tkvUmfangAusVerlauf, tkvUmfangVon, TKV_WUNSCH_TEXT } from "@/lib/tkv-umfang";
import { terminNutzenSatz, terminVorschlagText, vermittlerName } from "@/lib/whatsapp/gespraech";
import { spartenDesLeads } from "@/lib/preise/rechner-angaben";
import { kundeWill, spartenFuerTermin } from "@/lib/terminvorbereitung-neu";
import { tierAntwortAuswerten } from "@/lib/whatsapp/tier-fragen";
import type { VorbereitungDaten } from "@/lib/termin-vorbereitung";

const GEDANKENSTRICH = /[–—]/;

describe("tkvUmfangAusText: Freitext robust, Groß- und Kleinschreibung egal", () => {
  it.each(["OPeration", "op", "OP", "nur OP", "Operationen", "Unfall und OP", "OP-Schutz", "Nur Operationen", "nur OP-Schutz", "op schutz reicht", "OP, keine volle Krankenversicherung"])("%s → op", (t) => {
    expect(tkvUmfangAusText(t)).toBe("op");
  });
  it.each(["voll", "Vollschutz", "Krankenversicherung", "alles", "Tierarzt auch", "Auch Behandlungen", "volle Krankenversicherung (auch Tierarztbehandlung)", "OP und Tierarzt"])("%s → voll", (t) => {
    expect(tkvUmfangAusText(t)).toBe("voll");
  });
  it.each(["beides", "Beides", "weiß nicht", "Weiss nicht", "mal sehen", "offen", "OP- und Krankenschutz vergleichen"])("%s → offen", (t) => {
    expect(tkvUmfangAusText(t)).toBe("offen");
  });
  it.each(["", "Minka", "ja", "Hallo"])("%s → null", (t) => {
    expect(tkvUmfangAusText(t)).toBeNull();
  });
  it("fester Text je Umfang wird wieder erkannt", () => {
    for (const u of ["op", "voll", "offen"] as const) expect(tkvUmfangAusText(TKV_WUNSCH_TEXT[u])).toBe(u);
    expect(tarifwunschText("OPeration")).toBe("nur OP-Schutz");
    expect(tarifwunschText("Premium-Tarif")).toBe("Premium-Tarif");
  });
  it("record_qualification: tarifwunsch einheitlich, Umfang zum Speichern", () => {
    expect(tkvAngabenNormal({ tarifwunsch: "OPeration", tier: "Katze" })).toEqual({ angaben: { tarifwunsch: "nur OP-Schutz", tier: "Katze" }, umfang: "op" });
    expect(tkvAngabenNormal({ tier: "Katze" }).umfang).toBeNull();
  });
  it("Umfang: gespeichert vor Chat vor Produkt", () => {
    expect(tkvUmfangVon({ gespeichert: "voll", angaben: { tarifwunsch: "nur OP" }, source: "Tier-OP Katze" })).toBe("voll");
    expect(tkvUmfangVon({ angaben: { tarifwunsch: "nur OP" }, source: "TKV-Katze" })).toBe("op");
    expect(tkvUmfangVon({ angaben: { tarifwunsch: "Auch Behandlungen" }, source: "Tier-OP Katze" })).toBe("voll");
    expect(tkvUmfangVon({ source: "Tier-OP Katze" })).toBe("op");
    expect(tkvUmfangVon({ source: "TKV-Katze" })).toBeNull();
    // Privatschutz-Weg: Umfang in angaben.tier
    expect(tkvUmfangVon({ angaben: { tier: "Katze Minka, nur OP" } })).toBe("op");
    expect(tkvUmfangVon({ angaben: { tier: "Hund, Krankenversicherung" } })).toBe("voll");
  });
  it("Sicherheitsnetz: Antwort auf die Frage nach dem Umfang aus dem Verlauf", () => {
    const frage = { direction: "outbound", body: "Danke! Soll vor allem eine Operation abgesichert sein, oder auch die normale Tierarztbehandlung?" };
    expect(tkvUmfangAusVerlauf([frage, { direction: "inbound", body: "OPeration" }])).toBe("op");
    expect(tkvUmfangAusVerlauf([frage, { direction: "inbound", body: "mal sehen" }])).toBe("offen");
    expect(tkvUmfangAusVerlauf([{ direction: "inbound", body: "OP" }])).toBeNull();
    expect(tkvUmfangAusVerlauf([frage, { direction: "outbound", body: "Wie alt ist Minka?" }, { direction: "inbound", body: "OP" }])).toBeNull();
  });
  it("Tierfrage nach der Buchung: Freitext bleibt erhalten und wird erkannt", () => {
    const r = tierAntwortAuswerten("tarifwunsch", "OPeration", null, { source: "TKV-Katze", formular: [], angaben: null });
    expect(tkvAngabenNormal(r!.angaben).angaben).toMatchObject({ tarifwunsch: "nur OP-Schutz" });
  });
});

describe("Nutzensatz passend zum Umfang (Terminvorschlag, Erinnerungen, Mail-Strecke)", () => {
  const tiere = [
    { source: "TKV-Katze", formular: [{ label: "Name des Tieres", value: "Minka" }], tier: "Minka" },
    { source: "Hundekrankenversicherung", formular: [{ label: "Tiername", value: "Balu" }], tier: "Balu" },
    { source: "Pferdeversicherung", formular: [] as { label: string; value: string }[], tier: { sie: "Ihr Pferd", du: "dein Pferd" } },
  ];
  const erwartet = {
    op: (t: string) => `was eine OP-Versicherung für ${t} kostet`,
    voll: (t: string) => `was eine Krankenversicherung für ${t} kostet`,
    offen: (t: string) => `was OP- und Krankenschutz für ${t} kosten`,
  };
  for (const x of tiere) {
    for (const an of ["sie", "du"] as const) {
      const person = vermittlerName(an, { name: "Ole Kannapinn", anrede: "Herr", fallback: "X" });
      const tier = typeof x.tier === "string" ? x.tier : x.tier[an];
      for (const [wahl, u] of [["OPeration", "op"], ["Tierarzt auch", "voll"], ["beides", "offen"]] as const) {
        it(`${x.source}, ${an}, „${wahl}“ → ${u}`, () => {
          const satz = terminNutzenSatz({ source: x.source, formular: x.formular, angaben: { tarifwunsch: wahl }, an, person });
          expect(satz).toContain(erwartet[u](tier));
          if (u === "op") expect(satz).not.toContain("Krankenversicherung");
          expect(satz).not.toMatch(GEDANKENSTRICH);
          expect(satz).toContain(an === "du" ? "zeigt dir" : "zeigt Ihnen");
          // gespeicherter Umfang (Lead.tkvUmfang) ohne Chat-Angabe, z. B. Erinnerung bzw. Mail-Strecke
          expect(terminNutzenSatz({ source: x.source, formular: x.formular, angaben: null, an, person, tkvUmfang: u })).toContain(erwartet[u](tier));
        });
      }
    }
  }
  it("Testfall Ole: Einleitung OP-Schutz, Nutzensatz OP-Versicherung, kein Widerspruch", () => {
    const person = vermittlerName("sie", { name: "Ole Kannapinn", anrede: "Herr", fallback: "X" });
    const t = terminVorschlagText({
      an: "sie",
      source: "TKV-Katze",
      formular: [{ label: "Name des Tieres", value: "Minka" }],
      angaben: { tarifwunsch: "nur OP-Schutz" },
      person,
      zeiten: ["morgen um 10 Uhr", "Montag, 23.11. um 14 Uhr"],
      einleitung: "Alles klar, der OP-Schutz steht für Minka im Vordergrund.",
    });
    expect(t).toContain("zeigt Ihnen Herr Kannapinn, was eine OP-Versicherung für Minka kostet");
    expect(t).not.toContain("Krankenversicherung");
  });
  it("ohne Angabe wie bisher", () => {
    const person = vermittlerName("sie", { name: "Ole Kannapinn", anrede: "Herr", fallback: "X" });
    expect(terminNutzenSatz({ source: "TKV-Katze", formular: [{ label: "Name des Tieres", value: "Minka" }], an: "sie", person })).toContain("was eine Krankenversicherung für Minka kostet");
  });
  it("Privatschutz mit Tierkranken: Umfang im Satz", () => {
    const person = vermittlerName("sie", { name: "Ole Kannapinn", anrede: "Herr", fallback: "X" });
    const formular = [{ label: "Welche Versicherung interessiert Sie am meisten?", value: "Tierkrankenversicherung / Tierhalterhaftpflicht" }];
    expect(terminNutzenSatz({ source: "Privatschutz", formular, angaben: { tier: "Katze Minka", tarifwunsch: "nur OP" }, an: "sie", person })).toContain("was eine OP-Versicherung für Ihre Katze kostet");
    expect(terminNutzenSatz({ source: "Privatschutz", formular, angaben: { tier: "Hund", tarifwunsch: "beides" }, an: "du", person })).toContain("was OP- und Krankenschutz für deinen Hund kosten");
    const mehr = [{ label: "Welche Versicherung interessiert Sie am meisten?", value: "Haftpflicht, Tierkrankenversicherung / Tierhalterhaftpflicht" }];
    expect(terminNutzenSatz({ source: "Privatschutz", formular: mehr, angaben: { tier: "Katze", tarifwunsch: "Vollschutz" }, an: "sie", person })).toContain("was Haftpflicht und Tierkrankenversicherung für Sie kosten");
    // ohne geklärten Umfang kein Tierwort (wie bisher)
    expect(terminNutzenSatz({ source: "Privatschutz", formular: mehr, angaben: {}, an: "sie", person })).toContain("was Haftpflicht für Sie kostet");
  });
});

describe("Vorauswahl der Tarifvariante (Angebot, Terminvorbereitung)", () => {
  const katze = [{ label: "Tierart", value: "Katze" }];
  it("TKV: OP, Kranken, unentschieden beides", () => {
    expect(spartenDesLeads("TKV-Katze", { formular: katze, angaben: { tarifwunsch: "OPeration" } })).toEqual(["katze-op"]);
    expect(spartenDesLeads("TKV-Katze", { formular: katze, angaben: { tarifwunsch: "Tierarzt auch" } })).toEqual(["katze-kranken"]);
    expect(spartenDesLeads("TKV-Katze", { formular: katze, angaben: { tarifwunsch: "weiß nicht" } })).toEqual(["katze-kranken", "katze-op"]);
    expect(spartenDesLeads("TKV-Katze", { formular: katze, angaben: null })).toEqual(["katze-kranken"]);
  });
  it("Privatschutz mit Tierkranken", () => {
    const formular = [{ label: "Welche Versicherung interessiert Sie am meisten?", value: "Tierkrankenversicherung / Tierhalterhaftpflicht" }];
    expect(spartenDesLeads("Privatschutz", { formular, angaben: { tier: "Katze, Krankenversicherung", tarifwunsch: "nur OP" } })).toContain("katze-op");
    expect(spartenDesLeads("Privatschutz", { formular, angaben: { tier: "Katze, nur OP" } })).toContain("katze-op");
    expect(spartenDesLeads("Privatschutz", { formular, angaben: { tier: "Katze, Krankenversicherung" } })).toContain("katze-kranken");
  });
  const d = (o: { tkvUmfang?: string | null; angaben?: unknown; produkt?: string }): VorbereitungDaten => ({
    lead: { name: "Julia", telefon: null, email: null, adresse: null, produkt: o.produkt ?? "TKV-Katze", tkvUmfang: o.tkvUmfang ?? null },
    termin: { startsAt: new Date(), mode: "video", berater: "Ole", meetUrl: null },
    zusammenfassung: null,
    formular: katze,
    angaben: o.angaben ?? null,
    vorbereitetAm: null,
  });
  it("Terminvorbereitung: Vorauswahl und „Wunsch: OP-Schutz“", () => {
    expect(spartenFuerTermin(d({ tkvUmfang: "op" }))).toEqual(["katze-op"]);
    expect(spartenFuerTermin(d({ angaben: { tarifwunsch: "Vollschutz" } }))).toEqual(["katze-kranken"]);
    expect(spartenFuerTermin(d({ tkvUmfang: "offen" }))).toEqual(["katze-kranken", "katze-op"]);
    expect(kundeWill(d({ angaben: { tarifwunsch: "OPeration" } })).punkte).toContain("Wunsch: OP-Schutz");
    expect(kundeWill(d({ tkvUmfang: "offen" })).punkte).toContain("Wunsch: OP- und Krankenschutz vergleichen");
  });
});
