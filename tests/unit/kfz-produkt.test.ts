// Kfz als Lead-Produkt (Ole, 21.11.2026): „aus letzter Rechnung von Vorversicherer die SFR, Versicherungsscheinnummer
// und Versicherer. Typ (3 Ziffern oder Buchstaben), Hersteller (4 Ziffern), Fahrzeugschein.“ Dazu Cross-Selling (andere
// Policen) und volle Versicherungsscheinnummer nur bei Kfz.
import { describe, expect, it } from "vitest";
import { istKfzProdukt, produktCheckliste } from "@/lib/whatsapp/produkt-fragen";
import { folgefragen, spartenDesLeads, angabenFuerSparte } from "@/lib/preise/rechner-angaben";
import { bereitlegenListe } from "@/lib/whatsapp/gespraech";
import { kfzBitteText, policenBitte } from "@/lib/policen/bitte";
import { chatNachricht, bestaetigung, flowKnopf, formularDaten, KNOPF_POLICEN_SENDEN, KNOPF_UNTERLAGEN_SENDEN, vorlagenText, type FlowTextKontext } from "@/lib/policen/flow/texte";
import { andereVertraege, anderePolicenSatz } from "@/lib/policen/andere-policen";
import { policenErinnerungText } from "@/lib/whatsapp/termin-strecke";
import { FELDER, felderFuer, maskiereNummer, normHsn, normTsn, pruefeWert, volleNummer } from "@/lib/policen/auslesen/felder";
import { spartenImText } from "@/lib/policen/auslesen/sparte";
import { unplausibel } from "@/lib/policen/auslesen/plausibel";
import { bedarfFelder } from "@/lib/telefonat";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

const leer = { formular: [], angaben: null };
const VERBOTEN = /ersparnis|günstiger|zu teuer|garantie|deutlich schneller|lohnt|empfehl/i;
/** Erlaubt ist nur das Bemühen („versucht, Ihnen Geld zu sparen“), kein anderes „sparen“. */
const ohneBemuehen = (t: string) => t.replace(/versucht(?: [^,]{1,40})?, (dir|Ihnen) Geld zu sparen/g, "");

describe("Erkennung des Produkts", () => {
  it("Kfz-Produkte, aber nicht Privatschutz, Tier oder Gewerbe", () => {
    for (const p of ["Kfz-Versicherung", "KFZ", "Autoversicherung", "Auto-Versicherung", "Motorrad", "Pkw Versicherung"]) expect(istKfzProdukt(p), p).toBe(true);
    for (const p of ["Privatschutz", "Privatschutz inkl. Kfz", "TKV-Katze", "Hausrat", "Kfz-Gewerbe Flotte", null, ""]) expect(istKfzProdukt(p), String(p)).toBe(false);
    expect(produktCheckliste("Kfz-Versicherung")?.key).toBe("kfz");
    expect(produktCheckliste("Privatschutz")?.key).toBe("privatschutz");
    expect(produktCheckliste("TKV-Katze")?.key).toBe("tier");
  });

  it("Checkliste: Fotos zuerst, Fragen als Rückfall, Cross-Selling, Unterlagen", () => {
    const c = produktCheckliste("Kfz-Versicherung")!;
    expect(c.fragen).toMatch(/Fahrzeugschein/);
    expect(c.fragen).toMatch(/HSN.*2\.1/);
    expect(c.fragen).toMatch(/TSN.*2\.2/);
    expect(c.fragen).toMatch(/SF-Klasse/);
    expect(c.fragen).toMatch(/Versicherungsscheinnummer/);
    expect(c.fragen).toMatch(/Haftpflicht, Hausrat, Rechtsschutz/);
    expect(c.unterlagen.join(" ")).toMatch(/Fahrzeugschein/);
    expect(c.unterlagen.join(" ")).toMatch(/letzte Rechnung/);
    expect(c.unterlagen.join(" ")).toMatch(/weitere Policen/);
  });
});

describe("Rechner-Angaben und Folgefragen", () => {
  it("Sparte kfz: Folgefragen nach dem Allianz-Rechner, nur was nicht auf den Unterlagen steht (Ole, 21.11.2026)", () => {
    expect(spartenDesLeads("Kfz-Versicherung", leer)).toEqual(["kfz"]);
    const ff = folgefragen(["kfz"], leer);
    expect(ff.map((f) => f.key)).toEqual(["geburt", "oeffentlicherDienst", "plz", "kfzAnlass", "kfzSchutz", "kfzSchaeden", "kfzNutzung", "kfzFuehrerschein", "kfzWeitereFahrer", "kfzKm", "kfzFinanzierung"]);
    // HSN/TSN und Vorversicherung kommen aus den Fotos (Unterlagen-Bitte), nicht als Frage
    expect(ff.some((f) => /2\.1|SF-Klasse/.test(f.sie))).toBe(false);
    for (const f of ff) {
      expect(f.sie).not.toMatch(/\b(du|dein\w*|dir|dich)\b/);
      expect(f.du).not.toMatch(/\b(Sie|Ihr\w*|Ihnen)\b/);
    }
    expect(ff.find((f) => f.key === "kfzSchaeden")!.knoepfe).toEqual(["Nein", "Ja, 1 Schaden", "Ja, 2 oder mehr"]);
  });

  it("bekannte Angaben werden nicht mehr gefragt; Werte aus Formular und Fotos werden angezeigt", () => {
    const bekannt = { geburt: "01.02.1985", beruf: "nein", plz: "12209", kfzVertrag: "Wechsel, Vollkasko, keine Schäden", kfzFahrer: "privat, Führerschein 2004, nur ich", kfzDetails: "12.000 km, bezahlt" };
    expect(folgefragen(["kfz"], { formular: [], angaben: bekannt })).toEqual([]);
    const teil = { kfzVertrag: "Wechsel, Teilkasko" };
    expect(folgefragen(["kfz"], { formular: [], angaben: teil }).map((f) => f.key)).toContain("kfzSchaeden");
    expect(folgefragen(["kfz"], { formular: [], angaben: teil }).map((f) => f.key)).not.toContain("kfzAnlass");
    expect(angabenFuerSparte({ formular: [{ label: "Herstellerschlüssel", value: "0603" }], angaben: null }, "kfz")[0].wert).toBe("0603");
  });

  it("Bereitlegen: Fahrzeugschein und letzte Rechnung", () => {
    const sie = bereitlegenListe("Kfz-Versicherung", ["kfz"], "sie");
    expect(sie[0]).toBe("Ihren Fahrzeugschein");
    expect(sie[1]).toMatch(/letzte Rechnung Ihrer Kfz-Versicherung/);
    expect(bereitlegenListe("Kfz-Versicherung", ["kfz"], "du")[0]).toBe("deinen Fahrzeugschein");
  });

  it("Telefonat: Bedarfspunkte für Kfz", () => {
    expect(bedarfFelder({ produkt: "Kfz-Versicherung", formular: [], angaben: null }).map((f) => f.key)).toEqual(["fahrzeug", "vorversicherung", "kfzVertrag", "kfzFahrer", "kfzDetails", "geburt", "vorhanden"]);
  });
});

describe("Texte an Kfz-Leads", () => {
  const vermittler = { nom: "Herr Kannapinn", dat: "Herrn Kannapinn", anrede: "Herr" as const };
  const texte = (an: "sie" | "du") => [
    kfzBitteText(an, an === "sie" ? "Herr Kannapinn" : "Ole", anderePolicenSatz(an, "er", { komplettcheck: true, verb: "schicken" })),
    policenBitte({ an, vermittler, kfz: true, komplettcheck: true }).text,
    chatNachricht({ an, name: an === "sie" ? "Herr Kannapinn" : "Ole", pronomen: "er", tag: "Donnerstag", kiFertig: false, gesundheit: false, kfz: true, komplettcheck: true }).text,
    policenErinnerungText(an, { nom: "Herr Kannapinn" }, null, true),
  ];

  it("nennen Fahrzeugschein, letzte Rechnung und andere Policen, in beiden Ansprachen", () => {
    for (const an of ["sie", "du"] as const) {
      for (const t of texte(an)) {
        expect(t, t).toMatch(/Fahrzeugschein/);
        expect(t, t).toMatch(/Rechnung (Ihrer|deiner) Kfz-Versicherung/);
        expect(hatGedankenstrich(t), t).toBe(false);
        expect(ohneBemuehen(t), t).not.toMatch(VERBOTEN);
        expect(ohneBemuehen(t), t).not.toMatch(/sparen/i);
      }
      for (const t of texte(an).slice(0, 3)) expect(t, t).toMatch(/anderen Policen(?: hoch)?\*, zum Beispiel Haftpflicht oder Hausrat\. Dann sieht er im Komplettcheck, ob/);
    }
    for (const t of texte("sie")) expect(t, t).not.toMatch(/\b(du|dein(e[nmr]?)?|dich|dir)\b/);
    for (const t of texte("du")) expect(t, t).not.toMatch(/\b(Sie|Ihre[nmr]?|Ihnen)\b/);
  });

  const KFZ: FlowTextKontext = { an: "sie", name: "Herr Kannapinn", pronomen: "er", tag: "Montag", kiFertig: false, gesundheit: false, kfz: true };

  it("Chat-Nachricht (Ole, 22.11.2026): andere Policen klar, mit Grund und genannten Verträgen, ohne Unterlagen", () => {
    expect(chatNachricht({ ...KFZ, andereVertraege: ["Haftpflicht bei Allianz"], komplettcheck: true }).text).toBe(
      "Kleiner Tipp für Montag 💡\n\nWenn Herr Kannapinn Ihren Fahrzeugschein und die letzte Rechnung Ihrer Kfz-Versicherung vorab hat, kann er *Ihren Beitrag schon vor dem Termin rechnen.* Darauf steht alles Nötige, zum Beispiel Ihre SF-Klasse.\n\n*Je ein Foto reicht* (beim Fahrzeugschein die Vorderseite). Dauert etwa eine Minute.\n\n*Laden Sie gern auch Ihre anderen Policen hoch*, zum Beispiel Ihre Haftpflicht bei Allianz. Dann sieht er im Komplettcheck, ob Sie etwas doppelt zahlen.\n\nIhr Termin findet auch ohne Unterlagen statt.",
    );
    expect(chatNachricht({ ...KFZ, an: "du", name: "Ole", andereVertraege: ["Haftpflicht bei Allianz", "Hausrat"], komplettcheck: null }).text).toContain(
      "*Lade gern auch deine anderen Policen hoch*, zum Beispiel Haftpflicht bei Allianz und Hausrat. Dann sieht er, ob du etwas doppelt zahlst.\n\nDein Termin findet auch ohne Unterlagen statt.",
    );
    // Ohne Komplettcheck und ohne genannte Verträge: keine Bitte um andere Policen
    const ohne = chatNachricht({ ...KFZ, komplettcheck: false }).text;
    expect(ohne).not.toMatch(/anderen Policen/);
    expect(ohne.endsWith("Dauert etwa eine Minute.\n\nIhr Termin findet auch ohne Unterlagen statt.")).toBe(true);
    expect(chatNachricht(KFZ).text).not.toMatch(/anderen Policen/);
    // Ohne Kfz bleibt alles wie bisher
    expect(chatNachricht({ ...KFZ, kfz: false }).text.endsWith("Ihr Termin findet auch ohne Policen statt.")).toBe(true);
  });

  it("Knopf „Unterlagen senden“ nur für Kfz (höchstens 20 Zeichen), Formular unverändert, Bestätigung ohne Kfz", () => {
    expect(flowKnopf(KFZ)).toBe(KNOPF_UNTERLAGEN_SENDEN);
    expect(flowKnopf({ kfz: false })).toBe(KNOPF_POLICEN_SENDEN);
    expect(KNOPF_UNTERLAGEN_SENDEN.length).toBeLessThanOrEqual(20);
    // Formular (Einwilligung) für Kfz genau wie für alle anderen (Ole, 22.11.2026: keine neue Fassung)
    expect(formularDaten(KFZ, "https://x.de/d")).toEqual(formularDaten({ ...KFZ, kfz: false }, "https://x.de/d"));
    expect(bestaetigung(KFZ, 1, true).text).not.toMatch(/Kfz/);
    expect(bestaetigung({ ...KFZ, kfz: false }, 1, true).text).toMatch(/etwa Kfz oder Hausrat/);
  });

  it("andere Verträge: ohne das angefragte Produkt, mit Gesellschaft, ohne Gesundheit ohne Freigabe", () => {
    const vv = { at: "x", liste: [{ sparte: "Kfz", gesellschaft: "HUK" }, { sparte: "Haftpflicht", gesellschaft: "Allianz" }, { sparte: "Hausrat" }, { sparte: "Zahnzusatz", gesellschaft: "DKV" }, { sparte: "Sonstige" }] };
    expect(andereVertraege(vv, { source: "Kfz-Versicherung", kfz: true })).toEqual(["Haftpflicht bei der Allianz", "Hausrat"]);
    expect(andereVertraege(vv, { source: "Kfz-Versicherung", kfz: true, gesundheitAn: true })).toEqual(["Haftpflicht bei der Allianz", "Hausrat", "Zahnzusatz bei der DKV"]);
    expect(andereVertraege(null, { kfz: true })).toEqual([]);
    expect(andereVertraege({ at: "x", liste: [{ sparte: "Hausrat", gesellschaft: "HUK24" }] }, { kfz: true })).toEqual(["Hausrat bei HUK24"]);
    // Feste Beispiele nie mit dem angefragten Produkt
    expect(anderePolicenSatz("sie", "er", { komplettcheck: true, verb: "hochladen" })).toMatch(/zum Beispiel Haftpflicht oder Hausrat\./);
    expect(anderePolicenSatz("sie", "er", { komplettcheck: true, verb: "hochladen", ausgenommen: ["Haftpflicht", "Hausrat"] })).toMatch(/zum Beispiel Rechtsschutz oder Kfz\./);
    expect(anderePolicenSatz("sie", "er", { komplettcheck: false, verb: "hochladen" })).toBeNull();
  });

  it("Bitte ohne Formular nennt die genannten Verträge bzw. keine anderen Policen", () => {
    expect(policenBitte({ an: "sie", vermittler, kfz: true, vertraege: ["Haftpflicht bei Allianz"] }).text).toContain(
      "*Schicken Sie gern auch Ihre anderen Policen*, zum Beispiel Ihre Haftpflicht bei Allianz. Dann sieht er, ob Sie etwas doppelt zahlen.",
    );
    expect(policenBitte({ an: "sie", vermittler, kfz: true }).text).not.toMatch(/anderen Policen/);
  });

  it("die Einwilligung und die Meta-Vorlage bleiben unverändert", () => {
    const mitKfz = policenBitte({ an: "sie", vermittler, kfz: true });
    const ohne = policenBitte({ an: "sie", vermittler });
    expect(mitKfz.einwilligung).toEqual(ohne.einwilligung);
    expect(vorlagenText("bitte", "sie").text).not.toMatch(/Fahrzeugschein/);
  });
});

describe("Auslesen: Fahrzeugschein und volle Versicherungsscheinnummer (nur Kfz)", () => {
  const feld = (k: string) => FELDER.find((f) => f.key === k)!;

  it("neue Felder nur für Kfz", () => {
    const kfz = felderFuer("kfz").map((f) => f.key);
    expect(kfz).toEqual(expect.arrayContaining(["versicherungsnummer_voll", "hsn", "tsn", "erstzulassung", "sf_haftpflicht", "sf_kasko"]));
    for (const s of ["haftpflicht", "hausrat", "rechtsschutz", "pkv"] as const) {
      const k = felderFuer(s).map((f) => f.key);
      expect(k).not.toContain("versicherungsnummer_voll");
      expect(k).not.toContain("hsn");
    }
  });

  it("HSN 4 Ziffern, TSN 3 Zeichen, volle Nummer nur gültige Zeichen; Kurzform bleibt maskiert", () => {
    expect(normHsn("0603")).toBe("0603");
    expect(normHsn("06 03")).toBe("0603");
    expect(normHsn("603")).toBeNull();
    expect(normTsn("bjp")).toBe("BJP");
    expect(normTsn("BJP00123")).toBe("BJP");
    expect(normTsn("B")).toBeNull();
    expect(volleNummer("KV-123456/78")).toBe("KV-123456/78");
    expect(volleNummer("ab")).toBeNull();
    expect(volleNummer("<script>")).toBeNull();
    expect(pruefeWert(feld("versicherungsnummer_voll"), "KH 4711 0815")).toBe("KH 4711 0815");
    expect(pruefeWert(feld("hsn"), "0603")).toBe("0603");
    expect(pruefeWert(feld("tsn"), "bjp")).toBe("BJP");
    expect(pruefeWert(feld("versicherungsnummer"), "KV-123456")).toBe(maskiereNummer("KV-123456"));
  });

  it("Fahrzeugschein wird als Kfz erkannt", () => {
    expect(spartenImText("Zulassungsbescheinigung Teil I (Fahrzeugschein) 2.1 0603 2.2 BJP")).toEqual(["kfz"]);
  });

  it("Plausibilität markiert ungültige Schlüssel", () => {
    expect(unplausibel({ hsn: { w: "603", s: "ok" }, tsn: { w: "BJ", s: "ok" } } as never, "kfz")).toEqual(["hsn", "tsn"]);
    expect(unplausibel({ hsn: { w: "0603", s: "ok" }, tsn: { w: "BJP", s: "ok" } } as never, "kfz")).toEqual([]);
  });
});

describe("Kfz-Leadformular (docs/kfz-leadformular.md)", () => {
  it("Anlass und Schutz aus dem Formular werden erkannt und nicht noch einmal gefragt", () => {
    for (const [anlass, schutz] of [
      ["Worum geht es?", "Welchen Schutz wünschen Sie?"],
      ["Worum geht es dir?", "Welchen Schutz wünschst du dir?"],
    ]) {
      const src = { formular: [{ label: anlass, value: "Versicherung wechseln (jetziges Auto)" }, { label: schutz, value: "Vollkasko" }, { label: "Geburtsdatum", value: "1985-02-01" }, { label: "Postleitzahl", value: "12209" }], angaben: null };
      const keys = folgefragen(["kfz"], src).map((f) => f.key);
      expect(keys).not.toContain("kfzAnlass");
      expect(keys).not.toContain("kfzSchutz");
      expect(keys).not.toContain("geburt");
      expect(keys).not.toContain("plz");
      expect(keys).toContain("kfzSchaeden");
    }
  });

  it("„Weiß ich noch nicht“ gilt als beantwortet (klärt der Berater), neues Auto ebenso", () => {
    const src = { formular: [{ label: "Worum geht es?", value: "Neues Auto versichern" }, { label: "Welchen Schutz wünschen Sie?", value: "Weiß ich noch nicht" }], angaben: null };
    const keys = folgefragen(["kfz"], src).map((f) => f.key);
    expect(keys).not.toContain("kfzAnlass");
    expect(keys).not.toContain("kfzSchutz");
  });
});
