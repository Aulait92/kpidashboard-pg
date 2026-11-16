// Pilot „Beiträge rechnen“ (Allianz, Ole 16.11.2026; docs/preise-pilot.md): Schalter, Rechner-Angaben ohne
// Personendaten, Richtwert „bitte prüfen“. Keine Live-Abrufe: Es gibt bewusst keinen Adapter (Nutzungsbedingungen).
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ladeTarifkatalog } from "@/lib/tarifkatalog-laden";
import { angabenText, cleanPilot, PILOT_SCHLUESSEL, plzAus, pruefEtikett, RECHNER, rechnerAngaben, rechnerUrl } from "@/lib/preise/pilot";
import { cleanTarifauswahl, PRUEF_QUELLE_ANGEBOT, preiseUebernehmen, startAuswahl, ungepruefteBeitraege, zuAngebote } from "@/lib/tarifauswahl";
import type { VorbereitungDaten } from "@/lib/termin-vorbereitung";

const d = (x: Partial<VorbereitungDaten> = {}): VorbereitungDaten => ({
  lead: { name: "Verena Martin", telefon: "+49 170 1234567", email: "verena@example.org", adresse: "Lindenstraße 4, 50667 Köln", produkt: "Privatschutz" },
  termin: { startsAt: new Date("2026-11-16T09:00:00Z"), mode: "phone", berater: "Max Berger", meetUrl: null },
  zusammenfassung: null,
  formular: [{ label: "Lebenssituation", value: "Familie mit Kindern" }],
  angaben: { geburt: "12.03.1985", wohnflaeche: "95 m², Wohnung", beruf: "Lehrerin, Beamtin", bereiche: "Privat, Beruf, Verkehr", versichern: "sie selbst" },
  vorbereitetAm: null,
  ...x,
});

describe("Schalter je Gesellschaft und Sparte", () => {
  it("alle 11 Allianz-Sparten des Katalogs, Standard aus", () => {
    const echt = ladeTarifkatalog(path.join(__dirname, "..", "..", "data", "tarifkatalog"));
    expect(PILOT_SCHLUESSEL).toHaveLength(11);
    expect(PILOT_SCHLUESSEL.map((s) => s.split("/")[1]).sort()).toEqual(echt.sparten.map((s) => s.key).sort());
    for (const url of Object.values(RECHNER.allianz)) expect(url).toMatch(/^https:\/\/www\.allianz\.de\/.+\/rechner\//);
    expect(rechnerUrl([], "allianz", "hausrat")).toBeNull();
    expect(rechnerUrl(cleanPilot(null), "allianz", "hausrat")).toBeNull();
  });

  it("nur eingeschaltete, bekannte Schlüssel; andere Gesellschaften ohne Rechner", () => {
    const aktiv = cleanPilot(["allianz/hausrat", "allianz/hausrat", "axa/hausrat", "allianz/kfz", 3]);
    expect(aktiv).toEqual(["allianz/hausrat"]);
    expect(rechnerUrl(aktiv, "allianz", "hausrat")).toBe("https://www.allianz.de/recht-und-eigentum/hausratversicherung/rechner/");
    expect(rechnerUrl(aktiv, "allianz", "rechtsschutz")).toBeNull();
    expect(rechnerUrl(aktiv, "axa", "hausrat")).toBeNull();
    expect(rechnerUrl(aktiv, null, "hausrat")).toBeNull();
  });
});

describe("Angaben für den Rechner", () => {
  it("nie Name, Telefon oder E-Mail; außer beim Wohngebäude nur die PLZ statt der Adresse", () => {
    for (const s of PILOT_SCHLUESSEL.map((x) => x.split("/")[1])) {
      const text = JSON.stringify(rechnerAngaben(d(), s));
      expect(text, s).not.toMatch(/Verena|Martin|1234567|example\.org/);
      if (s !== "wohngebaeude") expect(text, s).not.toMatch(/Lindenstraße/);
    }
    expect(rechnerAngaben(d(), "hausrat")).toEqual([
      { label: "Postleitzahl", wert: "50667" },
      { label: "Wohnfläche", wert: "95 m², Wohnung" },
      { label: "Geburtsdatum", wert: "12.03.1985" },
    ]);
    expect(rechnerAngaben(d(), "haftpflicht")).toContainEqual({ label: "Familienstand (Single, Paar, Familie)", wert: "Familie mit Kindern" });
    expect(rechnerAngaben(d(), "wohngebaeude")[0]).toEqual({ label: "Adresse des Gebäudes", wert: "Lindenstraße 4, 50667 Köln" });
  });

  it("Tier aus dem Formular; fehlende Angaben bleiben leer", () => {
    const tier = d({
      lead: { name: "Tom", telefon: null, email: null, adresse: null, produkt: "Katzenversicherung" },
      formular: [
        { label: "Postleitzahl", value: "80331" },
        { label: "Tierart", value: "Katze" },
        { label: "Name des Tieres", value: "Mimi" },
        { label: "Rasse", value: "Maine Coon" },
        { label: "Geburtsmonat", value: "März" },
        { label: "Geburtsjahr", value: "2022" },
      ],
      angaben: {},
    });
    const a = rechnerAngaben(tier, "katze-kranken");
    expect(a).toContainEqual({ label: "Postleitzahl", wert: "80331" });
    expect(a).toContainEqual({ label: "Rasse", wert: "Maine Coon" });
    expect(a).toContainEqual({ label: "Geburtsmonat und -jahr des Tieres", wert: "März 2022" });
    expect(a).toContainEqual({ label: "Geschlecht des Tieres", wert: null });
    expect(JSON.stringify(a)).not.toContain("Mimi");
    expect(rechnerAngaben(tier, "hund-op")).toContainEqual({ label: "Tierart", wert: "Katze" });
    expect(rechnerAngaben(d({ angaben: {} }), "unfall").map((x) => x.wert)).toEqual([null, null, null]);
    expect(rechnerAngaben(d(), "kfz")).toEqual([]);
  });

  it("Knopf „In Ihrem Allianz-System berechnen“: alle bekannten Angaben als Text, fehlende weggelassen", () => {
    expect(angabenText(rechnerAngaben(d(), "hausrat"))).toBe("Postleitzahl: 50667\nWohnfläche: 95 m², Wohnung\nGeburtsdatum: 12.03.1985");
    expect(angabenText([{ label: "Beruf", wert: null }, { label: "Geburtsdatum", wert: "1.1.1990" }])).toBe("Geburtsdatum: 1.1.1990");
    expect(angabenText(rechnerAngaben(d({ angaben: {} }), "unfall"))).toBeNull();
    expect(angabenText([])).toBeNull();
  });

  it("PLZ aus Formular vor Adresse", () => {
    expect(plzAus(null, "Hauptstr. 1, 10115 Berlin")).toBe("10115");
    expect(plzAus("PLZ 20095", "10115 Berlin")).toBe("20095");
    expect(plzAus("Köln", undefined)).toBeNull();
  });
});

describe("Richtwert „bitte prüfen“", () => {
  const ORDNER = path.join(__dirname, "..", "fixtures", "tarifkatalog");
  const k = ladeTarifkatalog(ORDNER);
  const vertreter = { rolle: "vertreter" as const, gesellschaften: ["allianz"] };
  const item = (sparte: string, tarif: string, beitragMonat: number) => ({
    sparte,
    gesellschaft: "Allianz",
    tarif,
    beitragMonat,
    selbstbeteiligung: null,
    leistungen: [],
    ausschluesse: [],
    empfohlen: false,
    gewaehlt: false,
    merkmale: [],
    bausteine: [],
  });

  it("Etikett mit Quelle und Zeit in Berlin", () => {
    expect(pruefEtikett({ quelle: "Aus dem Angebot gelesen", am: "2026-11-16T09:12:00.000Z" })).toBe("Aus dem Angebot gelesen, Stand 16.11. 10:12, bitte prüfen");
    expect(pruefEtikett({ quelle: "Allianz-Rechner", am: "kaputt" })).toBe("Allianz-Rechner, bitte prüfen");
  });

  it("nur Beiträge freigeschalteter Sparten werden markiert; ohne Schalter wie bisher", () => {
    const a = startAuswahl(k, ["hausrat", "rechtsschutz"], vertreter);
    const items = [item("Hausrat", "Hausrat Komfort", 11.4), item("Rechtsschutz", "Rechtsschutz Komfort", 31.2)];
    const aktiv = cleanPilot(["allianz/hausrat"]);
    const r = preiseUebernehmen(a, items, { pruefen: (sp, g) => rechnerUrl(aktiv, g, sp) != null, am: "2026-11-16T09:12:00.000Z" });
    const [h, rs] = r.auswahl.sparten;
    expect(h.tarife.find((t) => t.beitrag === 11.4)?.preisPruefen).toEqual({ quelle: PRUEF_QUELLE_ANGEBOT, am: "2026-11-16T09:12:00.000Z" });
    expect(rs.tarife.find((t) => t.beitrag === 31.2)?.preisPruefen).toBeUndefined();
    expect(ungepruefteBeitraege(r.auswahl)).toEqual([{ sparte: "hausrat", label: h.label, tarif: "Komfort" }]);
    // Ohne Pilot (bisheriger Weg): keine Markierung
    const ohne = preiseUebernehmen(a, items);
    expect(ungepruefteBeitraege(ohne.auswahl)).toEqual([]);
  });

  it("Speichern behält die Markierung, Bestätigen bzw. ohne Beitrag fällt sie weg; Folien unverändert", () => {
    const a = startAuswahl(k, ["hausrat"], vertreter);
    const r = preiseUebernehmen(a, [item("Hausrat", "Hausrat Komfort", 11.4)], { pruefen: () => true, am: "2026-11-16T09:12:00.000Z" });
    const gespeichert = cleanTarifauswahl(JSON.parse(JSON.stringify(r.auswahl)))!;
    expect(ungepruefteBeitraege(gespeichert)).toHaveLength(1);
    const t = gespeichert.sparten[0].tarife.find((x) => x.preisPruefen)!;
    const vorher = zuAngebote(gespeichert);
    delete t.preisPruefen;
    expect(zuAngebote(gespeichert)).toEqual(vorher);
    expect(ungepruefteBeitraege(cleanTarifauswahl(gespeichert)!)).toEqual([]);
    const ohneBeitrag = structuredClone(r.auswahl);
    const x = ohneBeitrag.sparten[0].tarife.find((y) => y.preisPruefen)!;
    x.beitrag = null;
    expect(cleanTarifauswahl(ohneBeitrag)!.sparten[0].tarife.some((y) => y.preisPruefen)).toBe(false);
  });

  it("ausgeblendete Tarife lösen keinen Hinweis aus", () => {
    const a = startAuswahl(k, ["hausrat"], vertreter);
    const r = preiseUebernehmen(a, [item("Hausrat", "Hausrat Komfort", 11.4)], { pruefen: () => true });
    r.auswahl.sparten[0].tarife.find((t) => t.preisPruefen)!.zeigen = false;
    expect(ungepruefteBeitraege(r.auswahl)).toEqual([]);
  });
});
