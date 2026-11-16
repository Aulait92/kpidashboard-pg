// Erstinformation nach § 15/16 VersVermV (Ole, 15.11.2026): Text je Status (Makler, Ausschließlichkeitsvertreter,
// Mehrfachvertreter), Vorbelegung aus Impressum und Angebot, Vollständigkeit, Begleittexte ohne Gedankenstriche.
import { describe, expect, it } from "vitest";
import {
  KEINE_BETEILIGUNGEN,
  SCHLICHTUNGSSTELLEN,
  STATUS_GEBUNDEN,
  STATUS_MAKLER,
  STATUS_VERTRETER_ERLAUBNIS,
  erlaubnisFromImpressum,
  erstinfoAbschnitte,
  erstinfoDaten,
  erstinfoDateiname,
  erstinfoFehlt,
  erstinfoVollstaendig,
  papierHinweis,
  parseVersicherer,
  statusSatz,
  verguetungText,
  versichererMitArtikel,
  versichererVorschlag,
  type ErstinfoDaten,
} from "@/lib/erstinformation-shared";
import { ERSTINFO_PDF_CAPTION, hasErstinfoPdf } from "@/lib/whatsapp/ki-hinweis";
import { erstinfoMailZeile } from "@/lib/calendar/lead-email";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

const WEB = {
  companyName: "Agentur Meier GmbH",
  representative: "Susanne Meier",
  address: "Hauptstraße 1, 80331 München",
  phone: "089 123456",
  email: "info@meier.de",
  registerNumber: "d1abcdef1234",
  registerType: null,
  chamber: "IHK München und Oberbayern",
  sourceUrl: "https://vertretung.allianz.de/susanne.meier",
};

const voll = (over: Partial<ErstinfoDaten>): ErstinfoDaten => ({
  ...erstinfoDaten(null, WEB, { name: "Agentur Susanne Meier", vermittlerTyp: "vertreter" }),
  ...over,
});
const text = (d: ErstinfoDaten) => erstinfoAbschnitte(d).map((b) => `${b.ueberschrift}\n${b.text}`).join("\n\n");

describe("Statusbezeichnung nach § 15 Abs. 1 Nr. 3 VersVermV", () => {
  it("Wortlaut der drei Bezeichnungen", () => {
    expect(STATUS_MAKLER).toBe("Versicherungsmakler mit Erlaubnis nach § 34d Abs. 1 GewO");
    expect(STATUS_GEBUNDEN).toBe("gebundener Versicherungsvertreter nach § 34d Abs. 7 Satz 1 Nr. 1 GewO");
    expect(STATUS_VERTRETER_ERLAUBNIS).toBe("Versicherungsvertreter mit Erlaubnis nach § 34d Abs. 1 GewO");
  });

  it("Makler", () => {
    expect(statusSatz({ status: "makler", erlaubnis: "abs1", versicherer: ["egal"] })).toBe("Versicherungsmakler mit Erlaubnis nach § 34d Abs. 1 GewO.");
  });

  it("Ausschließlichkeitsvertreter mit genau einem Versicherer", () => {
    expect(statusSatz({ status: "vertreter", erlaubnis: "abs7", versicherer: ["Allianz Versicherungs-AG"] })).toBe(
      "Gebundener Versicherungsvertreter nach § 34d Abs. 7 Satz 1 Nr. 1 GewO, tätig ausschließlich für die Allianz Versicherungs-AG.",
    );
    expect(versichererMitArtikel("Debeka Krankenversicherungsverein a. G.")).toBe("den Debeka Krankenversicherungsverein a. G.");
    expect(versichererMitArtikel("die Bayerische")).toBe("die Bayerische");
  });

  it("Mehrfachvertreter mit Liste, mit Erlaubnis (Abs. 1) oder gebunden (Abs. 7)", () => {
    const abs1 = statusSatz({ status: "mehrfachvertreter", erlaubnis: "abs1", versicherer: ["Gothaer Allgemeine Versicherung AG", "Hallesche Krankenversicherung a. G."] });
    expect(abs1).toContain("Versicherungsvertreter mit Erlaubnis nach § 34d Abs. 1 GewO (Mehrfachvertreter)");
    expect(abs1).toContain("• Gothaer Allgemeine Versicherung AG\n• Hallesche Krankenversicherung a. G.");
    const abs7 = statusSatz({ status: "mehrfachvertreter", erlaubnis: "abs7", versicherer: ["A AG", "B AG"] });
    expect(abs7).toContain("Gebundener Versicherungsvertreter nach § 34d Abs. 7 Satz 1 Nr. 1 GewO");
    expect(abs7).toContain("nicht in Konkurrenz");
    expect(erlaubnisFromImpressum("Gebundener Versicherungsvertreter nach § 34d Abs. 7 GewO")).toBe("abs7");
    expect(erlaubnisFromImpressum("Versicherungsvertreter mit Erlaubnis nach § 34d Absatz 1 GewO")).toBe("abs1");
    expect(erlaubnisFromImpressum("")).toBeNull();
  });
});

describe("Vorbelegung aus Impressum und Angebot", () => {
  it("Ausschließlichkeitsvertreter: Name, Firma, Anschrift, Register, IHK, Versicherer aus der Website, Standards", () => {
    const d = erstinfoDaten(null, WEB, { name: "Agentur Susanne Meier", vermittlerTyp: "vertreter" });
    expect(d).toMatchObject({
      status: "vertreter",
      erlaubnis: "abs7",
      name: "Susanne Meier",
      firma: "Agentur Meier GmbH",
      anschrift: "Hauptstraße 1, 80331 München",
      registerNummer: "D-1ABC-DEF12-34",
      ihk: "IHK München und Oberbayern",
      versicherer: ["Allianz"],
      beratung: true,
      beteiligungen: null,
      verguetung: ["provision"],
      zuwendungen: false,
    });
  });

  it("Makler: Courtage, keine Versicherer; Mehrfachvertreter: Erlaubnisart aus dem Impressum", () => {
    expect(erstinfoDaten(null, WEB, { name: "Meier Finanz", vermittlerTyp: "makler" })).toMatchObject({ verguetung: ["courtage"], versicherer: [], erlaubnis: "abs1" });
    expect(erstinfoDaten(null, { ...WEB, registerType: "gebundener Versicherungsvertreter (§ 34d Abs. 7 GewO)" }, { vermittlerTyp: "mehrfachvertreter" })).toMatchObject({ erlaubnis: "abs7", versicherer: [] });
  });

  it("Gespeichertes hat Vorrang (auch leere Firma)", () => {
    const d = erstinfoDaten(
      { name: "S. Meier", firma: "", versicherer: ["ERGO Versicherung AG"], verguetung: ["provision", "honorar"], zuwendungen: true, ihk: "IHK Berlin", beratung: false },
      WEB,
      { name: "Agentur Susanne Meier", vermittlerTyp: "vertreter" },
    );
    expect(d).toMatchObject({ name: "S. Meier", firma: "", versicherer: ["ERGO Versicherung AG"], verguetung: ["provision", "honorar"], zuwendungen: true, ihk: "IHK Berlin", beratung: false });
  });

  it("Versicherer: Vorschlag, Eingabe je Zeile", () => {
    expect(versichererVorschlag("Allianz Generalvertretung Meier", null)).toBe("Allianz");
    expect(versichererVorschlag("Agentur Meier", "https://www.ergo.de/meier")).toBe("ERGO");
    expect(versichererVorschlag("Meier Finanz", "https://meier.de")).toBeNull();
    expect(parseVersicherer("Gothaer AG\n\nHallesche a. G.; gothaer ag\n")).toEqual(["Gothaer AG", "Hallesche a. G."]);
  });
});

describe("Vollständigkeit", () => {
  it("ohne PDF: alle Pflichtangaben und Bestätigung", () => {
    const d = voll({});
    expect(erstinfoFehlt(d, { upload: false, bestaetigt: false })).toEqual(["Bestätigung der Angaben"]);
    expect(erstinfoFehlt(d, { upload: false, bestaetigt: true })).toEqual([]);
    expect(erstinfoFehlt({ ...d, versicherer: [] }, { upload: false, bestaetigt: true })).toEqual(["Versicherer, für den Sie tätig sind"]);
    expect(erstinfoFehlt({ ...d, status: "mehrfachvertreter", versicherer: [] }, { upload: false, bestaetigt: true })).toEqual(["Versicherer, für die Sie tätig sind"]);
    expect(erstinfoFehlt({ ...d, status: "makler", versicherer: [] }, { upload: false, bestaetigt: true })).toEqual([]);
    expect(erstinfoFehlt({ ...d, name: "", anschrift: "", ihk: "", verguetung: [], registerNummer: "" }, { upload: false, bestaetigt: true })).toEqual([
      "Registernummer",
      "Name",
      "Anschrift",
      "Art der Vergütung",
      "Zuständige IHK",
    ]);
  });

  it("mit eigenem PDF reicht die Registernummer", () => {
    expect(erstinfoFehlt({ ...voll({}), anschrift: "", versicherer: [], ihk: "" }, { upload: true, bestaetigt: true })).toEqual([]);
  });

  it("erstinfoVollstaendig aus Datensatz, Impressum und Kunde", () => {
    const cust = { name: "Agentur Susanne Meier", vermittlerTyp: "vertreter" };
    expect(erstinfoVollstaendig(null, WEB, cust)).toBe(false);
    expect(erstinfoVollstaendig({ bestaetigtAt: new Date() }, WEB, cust)).toBe(true);
    expect(erstinfoVollstaendig({ bestaetigtAt: new Date() }, { ...WEB, chamber: null }, cust)).toBe(false);
    expect(erstinfoVollstaendig({ bestaetigtAt: new Date(), fileName: "ao.pdf" }, { ...WEB, chamber: null }, cust)).toBe(true);
  });
});

describe("Text der Erstinformation (alle Angaben nach § 15 Abs. 1 VersVermV)", () => {
  it("Ausschließlichkeitsvertreter", () => {
    const t = text(voll({ versicherer: ["Allianz Versicherungs-AG"] }));
    expect(t).toContain("Susanne Meier\nAgentur Meier GmbH\nHauptstraße 1, 80331 München"); // Nr. 1, 2
    expect(t).toContain("ausschließlich für die Allianz Versicherungs-AG"); // Nr. 3
    expect(t).toContain("Registrierungsnummer D-1ABC-DEF12-34"); // Nr. 9
    expect(t).toContain("Breite Straße 29, 10178 Berlin, Telefon 0180 6005850");
    expect(t).toContain("www.vermittlerregister.info");
    expect(t).toContain("Zuständige Registrierungsbehörde\nIHK München und Oberbayern");
    expect(t).toContain("wird eine Beratung angeboten"); // Nr. 4
    expect(t).toContain("Provision vom Versicherungsunternehmen, sie ist in der Versicherungsprämie enthalten"); // Nr. 5, 6
    expect(t).toContain("Andere Zuwendungen werden nicht erhalten."); // Nr. 7
    expect(t).toContain("nicht aus einer Verknüpfung"); // Nr. 8
    expect(t).toContain(KEINE_BETEILIGUNGEN); // Nr. 10, 11
    for (const s of SCHLICHTUNGSSTELLEN) expect(t).toContain(s); // Nr. 12
  });

  it("Makler mit Courtage und Honorar, Zuwendungen, Beteiligung", () => {
    const t = text(voll({ status: "makler", erlaubnis: "abs1", versicherer: [], verguetung: ["courtage", "honorar"], zuwendungen: true, beratung: false, beteiligungen: "Muster AG hält 20 %." }));
    expect(t).toContain("Versicherungsmakler mit Erlaubnis nach § 34d Abs. 1 GewO.");
    expect(t).toContain("Zuständige Erlaubnis- und Registrierungsbehörde");
    expect(t).toContain("Courtage vom Versicherungsunternehmen");
    expect(t).toContain("Honorar, das direkt vom Kunden zu zahlen ist");
    expect(t).toContain("Daneben werden andere Zuwendungen");
    expect(t).toContain("besteht aus einer Verknüpfung");
    expect(t).toContain("Es wird keine Beratung angeboten.");
    expect(t).toContain("Muster AG hält 20 %.");
    expect(t).not.toContain(KEINE_BETEILIGUNGEN);
  });

  it("Mehrfachvertreter mit Liste", () => {
    const t = text(voll({ status: "mehrfachvertreter", erlaubnis: "abs1", versicherer: ["Gothaer AG", "Hallesche a. G."] }));
    expect(t).toContain("Versicherungsvertreter mit Erlaubnis nach § 34d Abs. 1 GewO (Mehrfachvertreter)");
    expect(t).toContain("• Gothaer AG\n• Hallesche a. G.");
    expect(t).toContain("Zuständige Erlaubnis- und Registrierungsbehörde");
  });

  it("Vergütungstext und Dateiname", () => {
    expect(verguetungText({ verguetung: ["provision"], zuwendungen: false }).split("\n")).toHaveLength(4);
    expect(erstinfoDateiname("Agentur Meier GmbH")).toBe("Erstinformation_Agentur_Meier_GmbH.pdf");
    expect(erstinfoDateiname("")).toBe("Erstinformation.pdf");
  });

  it("keine Gedankenstriche in Texten an Leads, beide Fassungen", () => {
    for (const st of ["makler", "vertreter", "mehrfachvertreter"] as const) {
      expect(hatGedankenstrich(text(voll({ status: st, versicherer: ["A AG", "B AG"].slice(0, st === "vertreter" ? 1 : 2) })))).toBe(false);
    }
    expect(papierHinweis("du")).toContain("bekommst du");
    expect(papierHinweis("sie")).toContain("erhalten Sie");
    // Begleittext zum PDF (Nachricht 2 nach dem Erstanschreiben), für Du und Sie gleich; Papier-Hinweis steht im PDF
    expect(ERSTINFO_PDF_CAPTION).toBe("Unsere Erstinformation als Versicherungsvermittler, wie gesetzlich vorgesehen.");
    expect(erstinfoMailZeile("sie", "Susanne Meier")).toContain("Im Anhang finden Sie die Erstinformation");
    expect(erstinfoMailZeile("du", "Susanne Meier")).toContain("Im Anhang findest du");
    for (const s of [ERSTINFO_PDF_CAPTION, erstinfoMailZeile("du", "X"), erstinfoMailZeile("sie", "X")]) expect(hatGedankenstrich(s)).toBe(false);
  });

  it("PDF schon geschickt?", () => {
    expect(hasErstinfoPdf([{ direction: "outbound", kind: "document", body: "Hier ist die Erstinformation zu X" }])).toBe(true);
    expect(hasErstinfoPdf([{ direction: "outbound", kind: "text", body: "Erstinformation: https://x/erstinformation/abc" }])).toBe(false);
    expect(hasErstinfoPdf([{ direction: "inbound", kind: "document", body: "Erstinformation" }])).toBe(false);
  });
});
