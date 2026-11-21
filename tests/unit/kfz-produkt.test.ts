// Kfz als Lead-Produkt (Ole, 21.11.2026): „aus letzter Rechnung von Vorversicherer die SFR, Versicherungsscheinnummer
// und Versicherer. Typ (3 Ziffern oder Buchstaben), Hersteller (4 Ziffern), Fahrzeugschein.“ Dazu Cross-Selling (andere
// Policen) und volle Versicherungsscheinnummer nur bei Kfz.
import { describe, expect, it } from "vitest";
import { istKfzProdukt, produktCheckliste } from "@/lib/whatsapp/produkt-fragen";
import { folgefragen, spartenDesLeads, angabenFuerSparte } from "@/lib/preise/rechner-angaben";
import { bereitlegenListe } from "@/lib/whatsapp/gespraech";
import { kfzBitteText, policenBitte } from "@/lib/policen/bitte";
import { chatNachricht, vorlagenText } from "@/lib/policen/flow/texte";
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
  it("Sparte kfz mit genau den zwei Angaben aus Oles Liste", () => {
    expect(spartenDesLeads("Kfz-Versicherung", leer)).toEqual(["kfz"]);
    const ff = folgefragen(["kfz"], leer);
    expect(ff.map((f) => f.key)).toEqual(["fahrzeug", "vorversicherung"]);
    expect(ff[0].sie).toMatch(/2\.1.*2\.2.*Foto vom Fahrzeugschein/);
    expect(ff[1].du).toMatch(/SF-Klasse.*Foto der Rechnung/);
  });

  it("bekannte Angaben bzw. geschickte Fotos werden nicht mehr gefragt", () => {
    expect(folgefragen(["kfz"], { formular: [], angaben: { fahrzeug: "HSN 0603, TSN BJP" } }).map((f) => f.key)).toEqual(["vorversicherung"]);
    const foto = { fahrzeug: "laut Foto (Unterlagen im Kontakt)", vorversicherung: "laut Foto (Unterlagen im Kontakt)" };
    expect(folgefragen(["kfz"], { formular: [], angaben: foto })).toEqual([]);
    expect(angabenFuerSparte({ formular: [{ label: "Herstellerschlüssel", value: "0603" }], angaben: null }, "kfz")[0].wert).toBe("0603");
  });

  it("Bereitlegen: Fahrzeugschein und letzte Rechnung", () => {
    const sie = bereitlegenListe("Kfz-Versicherung", ["kfz"], "sie");
    expect(sie[0]).toBe("Ihren Fahrzeugschein");
    expect(sie[1]).toMatch(/letzte Rechnung Ihrer Kfz-Versicherung/);
    expect(bereitlegenListe("Kfz-Versicherung", ["kfz"], "du")[0]).toBe("deinen Fahrzeugschein");
  });

  it("Telefonat: Bedarfspunkte für Kfz", () => {
    expect(bedarfFelder({ produkt: "Kfz-Versicherung", formular: [], angaben: null }).map((f) => f.key)).toEqual(["fahrzeug", "vorversicherung", "vorhanden"]);
  });
});

describe("Texte an Kfz-Leads", () => {
  const vermittler = { nom: "Herr Kannapinn", dat: "Herrn Kannapinn", anrede: "Herr" as const };
  const texte = (an: "sie" | "du") => [
    kfzBitteText(an, an === "sie" ? "Herr Kannapinn" : "Ole"),
    policenBitte({ an, vermittler, kfz: true }).text,
    chatNachricht({ an, name: an === "sie" ? "Herr Kannapinn" : "Ole", pronomen: "er", tag: "Donnerstag", kiFertig: false, gesundheit: false, kfz: true }).text,
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
      for (const t of texte(an).slice(0, 3)) expect(t, t).toMatch(/anderen Policen, etwa Haftpflicht oder Hausrat/);
    }
    for (const t of texte("sie")) expect(t, t).not.toMatch(/\b(du|dein(e[nmr]?)?|dich|dir)\b/);
    for (const t of texte("du")) expect(t, t).not.toMatch(/\b(Sie|Ihre[nmr]?|Ihnen)\b/);
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
