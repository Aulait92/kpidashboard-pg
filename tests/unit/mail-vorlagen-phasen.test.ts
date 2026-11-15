// Neue E-Mail-Vorlagen und Sortierung nach Phase (Ole, 14.11.2026). Ohne Datenbank.
import { describe, expect, it } from "vitest";
import {
  datumKurz,
  fehlendeUnterlagen,
  fuelle,
  fuelleMitSignatur,
  musterKuendigung,
  produktArt,
  tagText,
  terminArtText,
  terminDatumText,
  terminUnterlagen,
  werteFuer,
  zusatzIn,
  type Werte,
  anrufTag,
  ihrProdukt,
  rueckrufZeiten,
} from "@/lib/mail/platzhalter";
import { fehlendeStandards, neueFassungen, STAND_JE_VORLAGE, STANDARD_VORLAGEN_JE, VORLAGEN_STAND } from "@/lib/mail/vorlagen";
import { STANDARD_VORLAGEN_STAND2 } from "@/lib/mail/vorlagen-alt";
import { nachfassenFuer, passendeVorlagen, sortiereVorlagen } from "@/lib/mail/phasen";
import { beratungsPdfInhalt, pdfDateiname, wuenscheVorschlag } from "@/lib/mail/beratung";
import { pdfSicher, textPdf, umbrechen } from "@/lib/mail/text-pdf";

const NEU = ["termin_vorbereitung", "nicht_erschienen", "beratungsdoku", "unterlagen_fehlen", "willkommen", "kuendigung", "wie_besprochen", "tuer_offen"];

/** Alle Zusatzfelder belegt, wie der Dialog sie füllt. */
function vollWerte(an: "sie" | "du"): Werte {
  return {
    ...werteFuer({ name: "Eva Pohl", source: "TKV Katze", salutation: "Frau" }, "Jana Becker", { ansprache: an, terminlink: "https://app.example/book/x?lead=1" }),
    termin_datum: "Dienstag, 17. November um 14:00 Uhr",
    termin_art: "per Videocall",
    videolink: "https://meet.example/abc",
    termin_unterlagen: terminUnterlagen("TKV Katze", an),
    fehlende_unterlagen: fehlendeUnterlagen(["IBAN für den Beitragseinzug"]),
    melde_datum: "Montag, 7. Dezember",
    versicherer: "Beispiel Versicherung AG",
    vertragsnummer: "123",
    kuendigungstermin: "31.12.2026",
    musterkuendigung: musterKuendigung({ name: "Eva Pohl", versicherer: "Beispiel Versicherung AG", vertragsnummer: "123", kuendigungstermin: "31.12.2026" }),
    wuensche: "• Katze absichern",
    rat: "OP-Schutz mit Vorsorge, weil die Katze Freigänger ist",
    vorteil_1: "OP-Schutz",
    vorteil_2: "freie Tierarztwahl",
    vorteil_3: "Vorsorge inklusive",
  };
}

describe("Standardvorlagen (Sie und Du)", () => {
  it("12 Vorlagen, gleiche Schlüssel und Namen in beiden Fassungen, 8 neue mit Stand 2", () => {
    expect(STANDARD_VORLAGEN_JE.sie).toHaveLength(12);
    expect(STANDARD_VORLAGEN_JE.du.map((v) => [v.key, v.name])).toEqual(STANDARD_VORLAGEN_JE.sie.map((v) => [v.key, v.name]));
    expect(STANDARD_VORLAGEN_JE.sie.filter((v) => STAND_JE_VORLAGE[v.key] === 2).map((v) => v.key)).toEqual(NEU);
    // Stand 3 hebt nur Texte, keine neuen Vorlagen
    expect(VORLAGEN_STAND).toBe(3);
    // Nicht als freie Vorlage (Werbung, nur über Bestandskampagnen)
    const namen = STANDARD_VORLAGEN_JE.sie.map((v) => v.name.toLowerCase()).join(" ");
    expect(namen).not.toMatch(/jahresgespräch|vertragscheck|empfehlung|geburtstag/);
  });

  it("keine Gedankenstriche, kein „Garantie“, Signatur am Ende", () => {
    for (const an of ["sie", "du"] as const) {
      for (const v of STANDARD_VORLAGEN_JE[an]) {
        expect(v.subject + v.body, v.name).not.toMatch(/[–—]/);
        expect(v.body, v.name).not.toMatch(/garantie/i);
        expect(v.body.endsWith("\n\n{signatur}"), v.name).toBe(true);
        expect(v.body.startsWith("{anrede},\n\n"), v.name).toBe(true);
      }
    }
  });

  it("Du-Fassung ohne Sie-Form, Sie-Fassung ohne Du-Form", () => {
    for (const v of STANDARD_VORLAGEN_JE.du) expect(v.subject + v.body, v.name).not.toMatch(/\b(Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer)\b/);
    for (const v of STANDARD_VORLAGEN_JE.sie) expect(v.subject + v.body, v.name).not.toMatch(/\b(du|dich|dir|dein|deine|deinen|deinem|deiner)\b/i);
  });

  it("vollständig gefüllt: keine offenen Platzhalter, Anrede je Ansprache", () => {
    for (const an of ["sie", "du"] as const) {
      const w = vollWerte(an);
      for (const v of STANDARD_VORLAGEN_JE[an]) {
        const body = fuelleMitSignatur(v.body, w);
        expect(body, v.name).not.toMatch(/\{[a-z0-9_]+\}/);
        expect(fuelle(v.subject, w), v.name).not.toMatch(/\{[a-z0-9_]+\}/);
        expect(body.startsWith(an === "sie" ? "Guten Tag Frau Pohl," : "Hallo Eva,"), v.name).toBe(true);
        expect(body.endsWith("Viele Grüße\nJana Becker"), v.name).toBe(true);
      }
    }
  });
});

describe("Zusatz-Platzhalter", () => {
  const tpl = (key: string, an: "sie" | "du" = "sie") => STANDARD_VORLAGEN_JE[an].find((v) => v.key === key)!;

  it("Termin: Vorbereitung mit Datum, Art und Videolink; ohne Link entfällt der Satz", () => {
    const w = vollWerte("sie");
    const mit = fuelle(tpl("termin_vorbereitung").body, w);
    expect(mit).toContain("am Dienstag, 17. November um 14:00 Uhr per Videocall.");
    expect(mit).toContain("Den Link zum Videocall finden Sie hier: https://meet.example/abc");
    expect(mit).toContain("• Tierpass bzw. Chipnummer\n• Tierarztrechnungen der letzten Zeit, falls vorhanden\n• Ihre IBAN, falls Sie direkt abschließen möchten");
    const ohne = fuelle(tpl("termin_vorbereitung").body, { ...w, termin_art: terminArtText("phone"), videolink: "" });
    expect(ohne).toContain("um 14:00 Uhr am Telefon.\n\nDamit wir");
    expect(ohne).not.toContain("Videocall");
  });

  it("Nicht erschienen: ohne Terminlink entfällt nur der Satz mit dem Link", () => {
    const w = { ...vollWerte("du"), terminlink: null };
    const t = fuelle(tpl("nicht_erschienen", "du").body, w);
    expect(t).toContain("kein Problem, so etwas passiert. Sollen wir einen neuen Termin finden?\n\nViele Grüße");
    expect(t).not.toContain("such");
  });

  it("Musterkündigung wird eingesetzt, ohne dass Text darin noch einmal ersetzt wird", () => {
    const m = musterKuendigung({ name: "Eva {vorname} Pohl", versicherer: "", vertragsnummer: "", kuendigungstermin: "" });
    expect(m).toContain("zum nächstmöglichen Zeitpunkt.");
    expect(m).toContain("[Name des bisherigen Versicherers]");
    const t = fuelle("{musterkuendigung}\n{vorname}", { ...vollWerte("sie"), musterkuendigung: m });
    expect(t).toContain("Eva {vorname} Pohl");
    expect(t.endsWith("\nEva")).toBe(true);
    expect(musterKuendigung({ name: "Eva Pohl", kuendigungstermin: "31.12.2026" })).toContain("zum 31.12.2026, hilfsweise zum nächstmöglichen Zeitpunkt");
  });

  it("fehlende Unterlagen, Datum und Termin als Text", () => {
    expect(fehlendeUnterlagen(["IBAN für den Beitragseinzug", " ", "Foto vom Tierpass"])).toBe("• IBAN für den Beitragseinzug\n• Foto vom Tierpass");
    expect(datumKurz("2026-12-31")).toBe("31.12.2026");
    expect(tagText("2026-12-07", new Date("2026-11-14T12:00:00Z"))).toBe("Montag, 7. Dezember");
    expect(tagText("2027-01-04", new Date("2026-11-14T12:00:00Z"))).toBe("Montag, 4. Januar 2027");
    expect(terminDatumText(new Date("2026-11-17T13:00:00Z"), new Date("2026-11-14T12:00:00Z"))).toBe("Dienstag, 17. November um 14:00 Uhr");
    expect(terminArtText("video")).toBe("per Videocall");
  });

  it("Unterlagen zum Termin je Produkt und Ansprache", () => {
    expect(produktArt("TKV-Katze")).toBe("tier");
    expect(produktArt("Hundefutter")).toBe("sonst");
    expect(produktArt("Hausrat")).toBe("sach");
    expect(produktArt("Privatschutz")).toBe("sach");
    expect(terminUnterlagen("Hausrat", "du")).toBe(
      "• deine bisherige Police mit Ablaufdatum, falls vorhanden\n• Geburtsdaten aller Personen, die mitversichert werden sollen\n• deine IBAN, falls du direkt abschließen möchtest",
    );
    expect(terminUnterlagen("Zahnzusatz", "sie")).toBe("• Ihre IBAN, falls Sie direkt abschließen möchten");
  });

  it("Dialog erkennt Zusatz-Platzhalter auch in eigenen Vorlagen", () => {
    expect([...zusatzIn("Hallo", "Ich melde mich am {melde_datum}.")]).toEqual(["melde_datum"]);
    expect(zusatzIn(STANDARD_VORLAGEN_JE.sie[0].subject, STANDARD_VORLAGEN_JE.sie[0].body).size).toBe(0);
    expect(zusatzIn("", tpl("beratungsdoku").body).has("wuensche")).toBe(true);
  });
});

describe("Sortierung nach Phase", () => {
  it("Regeln je Status bzw. Ereignis", () => {
    expect(passendeVorlagen({ status: "Nicht erreicht" })).toEqual(["nicht_erreicht"]);
    expect(passendeVorlagen({ status: "Neuer Lead", contactAttempts: 1 })).toEqual(["nicht_erreicht"]);
    expect(passendeVorlagen({ status: "Neuer Lead", contactAttempts: 0 })).toEqual([]);
    expect(passendeVorlagen({ status: "In Beratung", naechsterTermin: true })).toEqual(["termin_vorbereitung"]);
    expect(passendeVorlagen({ status: "Im Gespräch", letzterTermin: "no_show" })).toEqual(["nicht_erschienen"]);
    expect(passendeVorlagen({ status: "In Beratung", letzterTermin: "booked" })).toEqual(["beratungsdoku", "unterlagen_fehlen", "angebot"]);
    expect(passendeVorlagen({ status: "Angebot gesendet", letzterTermin: "completed" })).toEqual(["nachfassen_angebot"]);
    expect(passendeVorlagen({ status: "Abschluss" })).toEqual(["kuendigung", "nach_abschluss"]);
    expect(passendeVorlagen({ status: "Abschluss", policeFertig: true })).toEqual(["willkommen", "kuendigung"]);
    expect(passendeVorlagen({ status: "Nicht erreicht", spaeter: true })).toEqual(["wie_besprochen", "nicht_erreicht"]);
    expect(passendeVorlagen({ status: "Kein Interesse", spaeter: true })).toEqual(["tuer_offen"]);
    expect(passendeVorlagen({ status: "Disqualifiziert" })).toEqual([]);
    expect(passendeVorlagen({ status: "Storno (Widerruf)" })).toEqual([]);
    // Neuer Termin nach No-Show: Vorbereitung statt „Nicht erschienen“, kein „Nicht erreicht“
    expect(passendeVorlagen({ status: "Nicht erreicht", naechsterTermin: true, letzterTermin: "no_show" })).toEqual(["termin_vorbereitung"]);
  });

  it("passende vorn in Empfehlungs-Reihenfolge, übrige (auch eigene) unter „Weitere“", () => {
    const v = [
      { id: "1", standardKey: "nicht_erreicht" },
      { id: "2", standardKey: null },
      { id: "3", standardKey: "unterlagen_fehlen" },
      { id: "4", standardKey: "beratungsdoku" },
    ];
    const r = sortiereVorlagen(v, ["beratungsdoku", "unterlagen_fehlen", "angebot"]);
    expect(r.passend.map((x) => x.id)).toEqual(["4", "3"]);
    expect(r.weitere.map((x) => x.id)).toEqual(["1", "2"]);
    expect(sortiereVorlagen(v, []).weitere).toHaveLength(4);
  });
});

describe("Nachfass-Aufgabe je Vorlage", () => {
  it("passt zur Vorlage", () => {
    expect(nachfassenFuer("nicht_erschienen", { erinnern: true, tage: 2, mitLink: false })).toEqual({ art: "nicht_erschienen", tage: 2 });
    expect(nachfassenFuer("unterlagen_fehlen", { erinnern: true, tage: 1, mitLink: false })).toEqual({ art: "unterlagen", tage: 3 });
    expect(nachfassenFuer("unterlagen_fehlen", { erinnern: false, tage: 1, mitLink: false })).toBeNull();
    expect(nachfassenFuer("wie_besprochen", { erinnern: false, tage: 2, mitLink: false, meldeTag: "2026-12-07" })).toEqual({ art: "melden", tag: "2026-12-07" });
    expect(nachfassenFuer("wie_besprochen", { erinnern: true, tage: 2, mitLink: true })).toBeNull();
    expect(nachfassenFuer("tuer_offen", { erinnern: true, tage: 2, mitLink: true })).toEqual({ art: "beenden" });
    expect(nachfassenFuer("nicht_erreicht", { erinnern: true, tage: 5, mitLink: true })).toEqual({ art: "terminlink", tage: 5 });
    expect(nachfassenFuer(null, { erinnern: true, tage: 5, mitLink: false })).toBeNull();
  });
});

describe("Ergänzen der Standardvorlagen (rein)", () => {
  const alt = STANDARD_VORLAGEN_JE.sie.slice(0, 4).map((v) => ({ name: v.name, standardKey: v.key as string | null }));

  it("erstes Laden: alle 12; bestehender Kunde mit Stand 1: nur die 8 neuen", () => {
    expect(fehlendeStandards("sie", 0, [])).toHaveLength(12);
    expect(fehlendeStandards("du", 1, alt).map((v) => v.key)).toEqual(NEU);
    expect(fehlendeStandards("du", 1, alt)[0].body).toContain("leg dir bitte");
  });

  it("keine Doppelung: vorhandener Schlüssel oder gleicher Name bleibt; gelöschte alte kommen nicht zurück", () => {
    const eigen = [...alt.slice(1), { name: "termin: vorbereitung", standardKey: null }, { name: "Mein Text", standardKey: "willkommen" }];
    const neu = fehlendeStandards("sie", 1, eigen).map((v) => v.key);
    expect(neu).not.toContain("termin_vorbereitung");
    expect(neu).not.toContain("willkommen");
    expect(neu).not.toContain("nicht_erreicht"); // vom Kunden gelöscht, Stand 1 schon erledigt
    expect(neu).toHaveLength(6);
    expect(fehlendeStandards("sie", VORLAGEN_STAND, alt)).toEqual([]);
  });
});

describe("Gesprächszusammenfassung und PDF", () => {
  it("Wünsche aus Formular und Assistent, ohne Kontaktdaten und interne Punkte", () => {
    const w = wuenscheVorschlag({
      produkt: "Privatschutz",
      formData: [
        { label: "Vorname", value: "Eva" },
        { label: "E-Mail", value: "eva@example.com" },
        { label: "Lebenssituation", value: "Familie mit Kindern" },
        { label: "Datenschutz", value: "ja" },
      ],
      qualificationData: { interesse: "Unfall, Haftpflicht", wunsch: "Videocall abends", einwaende: "Preis", vorhanden: "keine" },
    });
    expect(w).toBe("• Interesse an: Privatschutz\n• Lebenssituation: Familie mit Kindern\n• Interesse: Unfall, Haftpflicht\n• Vorhanden: keine");
    expect(wuenscheVorschlag({ produkt: "", qualificationSummary: "Sucht Hausrat" })).toBe("• Sucht Hausrat");
  });

  it("PDF-Inhalt je Ansprache, Dateiname, erzeugtes PDF", async () => {
    const now = new Date("2026-11-14T12:00:00Z");
    const i = beratungsPdfInhalt({ an: "du", kunde: "Eva Pohl", produkt: "TKV", berater: "Jana Becker", wuensche: "• A", rat: "B", now });
    expect(i.kopf).toContain("Datum: 14.11.2026");
    expect(i.fuss).toContain("Bitte prüfe");
    expect(i.fuss).not.toMatch(/[–—]/);
    expect(pdfDateiname("Beratungsdokumentation", "Eva Pöhl-Meier", now)).toBe("Beratungsdokumentation_Eva_Pöhl_Meier_2026-11-14.pdf");
    const bytes = await textPdf({ ...i, bloecke: [...i.bloecke, { text: "Emoji 😀 und € und „Anführung“ ".repeat(200) }] });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("Zeichen und Zeilenumbruch", () => {
    expect(pdfSicher("a😀b\tc€")).toBe("a?b    c€");
    const font = { widthOfTextAtSize: (t: string) => t.length * 10 };
    expect(umbrechen("eins zwei drei\n\nvier", font, 10, 95)).toEqual(["eins zwei", "drei", "", "vier"]);
    expect(umbrechen("abcdefghijkl", font, 10, 50)).toEqual(["abcde", "fghij", "kl"]);
  });
});

describe("Stand 3: verkaufsstärkere E-Mails (Ole, 15.11.2026)", () => {
  // Di 17.11.2026, 10:00 Uhr Berlin
  const DI = new Date("2026-11-17T09:00:00Z");
  const lead = { name: "Julia Schneider", source: "Zahnzusatz", salutation: "Frau" };
  const tpl = (an: "sie" | "du", key: string) => STANDARD_VORLAGEN_JE[an].find((v) => v.key === key)!;

  it("persönlicher Betreff mit Name und Produkt, Du/Sie und ohne Namen", () => {
    const sie = werteFuer(lead, "Jana Becker", { ansprache: "sie", now: DI });
    expect(fuelle(tpl("sie", "nicht_erreicht").subject, sie)).toBe("Frau Schneider, kurz zu Ihrer Zahnzusatzversicherung");
    const du = werteFuer(lead, "Jana Becker", { ansprache: "du", now: DI });
    expect(fuelle(tpl("du", "nicht_erreicht").subject, du)).toBe("Julia, kurz zu deiner Zahnzusatzversicherung");
    const ohne = werteFuer({ name: "Julia", source: "Privatschutz" }, "Jana Becker", { ansprache: "sie", now: DI });
    expect(fuelle(tpl("sie", "nicht_erreicht").subject, ohne)).toBe("Kurz zu Ihrem Privatschutz");
    expect(fuelle(tpl("sie", "nachfassen_angebot").subject, ohne)).toBe("Kurze Frage zu Ihrem Angebot");
    expect(fuelle(tpl("sie", "angebot").subject, sie)).toBe("Frau Schneider, Ihr Angebot zu Zahnzusatz");
  });

  it("„Nicht erreicht“: zwei Rückrufzeiten und Buchungslink", () => {
    const w = werteFuer(lead, "Jana Becker", { ansprache: "sie", now: DI, terminlink: "https://app.example/book/x" });
    const t = fuelleMitSignatur(tpl("sie", "nicht_erreicht").body, w);
    expect(t).toContain("Ich versuche es gern noch einmal heute um 17 Uhr oder morgen um 10 Uhr. Passt Ihnen eine der beiden Zeiten?");
    expect(t).toContain("https://app.example/book/x");
    // Freitag 16 Uhr: Montag 10 und 17 Uhr
    expect(rueckrufZeiten(new Date("2026-11-20T15:00:00Z"))).toEqual(["am Montag um 10 Uhr", "am Montag um 17 Uhr"]);
    // Freitag 10 Uhr: heute 17 Uhr, Montag 10 Uhr
    expect(rueckrufZeiten(new Date("2026-11-20T09:00:00Z"))).toEqual(["heute um 17 Uhr", "am Montag um 10 Uhr"]);
  });

  it("Angebot: drei Vorteile als Liste, fester nächster Schritt", () => {
    const w = { ...werteFuer(lead, "Jana Becker", { ansprache: "sie", now: DI }), vorteil_1: "A", vorteil_2: "B", vorteil_3: "C" };
    const t = fuelleMitSignatur(tpl("sie", "angebot").body, w);
    expect(t).toContain("• A\n• B\n• C");
    expect(t).toContain("Ich rufe Sie am Donnerstag kurz an, passt das?");
    expect(anrufTag(new Date("2026-11-20T09:00:00Z"))).toBe("Dienstag");
    expect(zusatzIn(tpl("sie", "angebot").body)).toEqual(new Set(["vorteil_1", "vorteil_2", "vorteil_3"]));
  });

  it("Nachfassen Angebot: eine konkrete Frage", () => {
    expect(tpl("sie", "nachfassen_angebot").body).toContain("Ist für Sie eher der Beitrag oder die Leistung entscheidend?");
    expect(tpl("du", "nachfassen_angebot").body).toContain("Ist für dich eher der Beitrag oder die Leistung entscheidend?");
  });

  it("Produkt mit Possessiv", () => {
    expect(ihrProdukt("Katzenversicherung (TKV)")).toBe("Ihrer Katzenversicherung");
    expect(ihrProdukt("Privatschutz", "du")).toBe("deinem Privatschutz");
    expect(ihrProdukt(null)).toBe("Ihrer Anfrage");
    expect(ihrProdukt("KFZ")).toBe("Ihrer Anfrage zu KFZ");
  });

  it("unveränderte alte Standardvorlagen werden gehoben, selbst geänderte bleiben", () => {
    const altSie = STANDARD_VORLAGEN_STAND2.sie.find((v) => v.key === "angebot")!;
    const altDu = STANDARD_VORLAGEN_STAND2.du.find((v) => v.key === "nicht_erreicht")!;
    const up = neueFassungen([
      { id: "1", standardKey: "angebot", subject: altSie.subject, body: altSie.body },
      { id: "2", standardKey: "nicht_erreicht", subject: altDu.subject, body: altDu.body },
      { id: "3", standardKey: "angebot", subject: altSie.subject, body: `${altSie.body} (eigener Zusatz)` },
      { id: "4", standardKey: null, subject: "Eigene", body: "Eigene" },
    ]);
    expect(up.map((u) => u.id)).toEqual(["1", "2"]);
    expect(up[0].body).toBe(tpl("sie", "angebot").body);
    expect(up[1].body).toBe(tpl("du", "nicht_erreicht").body);
  });
});
