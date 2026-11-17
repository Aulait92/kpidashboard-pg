// Instantly-Auswertung (Ole, 17.11.2026): Zählweise je Kampagne/Postfach, Betreffs, Einwand-Kategorien, Markdown.
import { describe, expect, it } from "vitest";
import {
  alsMarkdown,
  auswerten,
  einwandKategorien,
  kurzPostfach,
  normBetreff,
  OHNE_BEGRUENDUNG,
  type AwAntwort,
  type AwLead,
} from "@/lib/vertrieb/instantly-auswertung";

const JETZT = new Date("2026-11-17T12:00:00Z");
const tage = (n: number) => new Date(JETZT.getTime() - n * 86400000);

const lead = (contactId: string, campaignId: string, p: Partial<AwLead> = {}): AwLead => ({
  contactId,
  campaignId,
  sentAt: tage(5),
  openCount: 0,
  lastOpenAt: null,
  replyCount: 0,
  lastReplyAt: null,
  bounced: false,
  unsubscribed: false,
  interest: null,
  ...p,
});
const antwort = (contactId: string, campaign: string | null, p: Partial<AwAntwort> = {}): AwAntwort => ({
  contactId,
  campaign,
  eaccount: "vertrieb.max@beispiel.de",
  subject: "Re: Neue Kunden für Ihre Agentur",
  text: null,
  sentiment: "NEUTRAL",
  isAutoReply: false,
  sentAt: tage(4),
  ...p,
});

describe("einwandKategorien", () => {
  it("ordnet typische Absagen zu", () => {
    expect(einwandKategorien("Danke, wir sind komplett ausgelastet.")).toEqual(["Kein Bedarf, ausgelastet"]);
    expect(einwandKategorien("Wir arbeiten bereits mit einer Agentur zusammen.")).toContain("Hat schon Anbieter oder Agentur");
    expect(einwandKategorien("Das läuft bei uns über die Allianz.")).toContain("Läuft über Allianz bzw. Versicherer");
    expect(einwandKategorien("Das ist uns zu teuer.")).toEqual(["Zu teuer, kein Budget"]);
    expect(einwandKategorien("Bitte austragen, keine Werbung!")).toEqual(["Austragen, keine Werbung"]);
    expect(einwandKategorien("Woher haben Sie meine Adresse?")).toContain("Datenschutz, Herkunft der Adresse");
    expect(einwandKategorien("Ich gehe Ende des Jahres in den Ruhestand.")).toContain("Ruhestand, Agentur aufgegeben");
    expect(einwandKategorien("Haben wir schon mal probiert, schlechte Erfahrungen gemacht.")).toContain("Schlechte Erfahrung mit Leads");
    expect(einwandKategorien("Dafür bin ich nicht zuständig.")).toEqual(["Falsche Person, nicht zuständig"]);
    expect(einwandKategorien("Wir machen das Marketing selbst.")).toEqual(["Macht Marketing selbst, Empfehlungen"]);
  });
  it("Später-Antwort zählt als Zeitpunkt, ohne Stichwort als „ohne Begründung“", () => {
    expect(einwandKategorien("Melden Sie sich im März wieder", null, "SPAETER")).toEqual(["Zeitpunkt passt nicht, später"]);
    expect(einwandKategorien("Nein danke.")).toEqual([OHNE_BEGRUENDUNG]);
    expect(einwandKategorien(null)).toEqual([OHNE_BEGRUENDUNG]);
  });
});

describe("normBetreff / kurzPostfach", () => {
  it("entfernt Antwort-Präfixe, blendet Ziffern und Adressen aus", () => {
    expect(normBetreff("AW: Re:  Neue Kunden für Ihre Agentur")).toBe("Neue Kunden für Ihre Agentur");
    expect(normBetreff("RE: Termin 12.11. an max@test.de")).toBe("Termin ##.##. an …");
  });
  it("kürzt eigene Postfächer", () => {
    expect(kurzPostfach("Vertrieb.Max@Beispiel.de")).toBe("ver…@beispiel.de");
    expect(kurzPostfach(null)).toBe("(unbekannt)");
  });
});

describe("auswerten", () => {
  const kampagnen = [
    { id: "k1", name: "Allianz Okt", ignored: false },
    { id: "k2", name: "Makler Nov", ignored: false },
    { id: "k3", name: "Pflege", ignored: true },
  ];

  it("zählt Kontakte je Kampagne, gesamt und letzte 30 Tage", () => {
    const leads = [
      lead("a", "k1", { openCount: 3, lastOpenAt: tage(4), replyCount: 1, lastReplyAt: tage(4) }),
      lead("b", "k1", { sentAt: tage(60), openCount: 1, lastOpenAt: tage(59), replyCount: 1, lastReplyAt: tage(58) }),
      lead("c", "k1", { bounced: true }),
      lead("d", "k1", { unsubscribed: true, sentAt: tage(40) }),
      lead("e", "k1", { replyCount: 1, lastReplyAt: tage(2), interest: "Interessiert" }), // Antwort ohne Text
      lead("f", "k2", { sentAt: null }), // noch nicht angeschrieben
      lead("g", "k3", { replyCount: 1 }), // ignorierte Kampagne
    ];
    const antworten = [
      antwort("a", "Allianz Okt", { sentiment: "NEUTRAL", sentAt: tage(6) }),
      antwort("a", "Allianz Okt", { sentiment: "POSITIV", sentAt: tage(4) }), // letzte zählt
      antwort("b", "Allianz Okt", { sentiment: "NEGATIV", sentAt: tage(58), text: "Kein Bedarf, wir sind ausgelastet." }),
      antwort("x", "Allianz Okt", { isAutoReply: true }),
      antwort("g", "Pflege", { sentiment: "POSITIV" }),
      antwort("m", "manuell", { sentiment: "POSITIV" }),
    ];
    const termine = [
      { contactId: "a", status: "GEPLANT", createdAt: tage(3) },
      { contactId: "b", status: "ABGESAGT", createdAt: tage(50) },
    ];
    const r = auswerten({ kampagnen, leads, antworten, termine, jetzt: JETZT });

    expect(r.kampagnen.gesamt.map((z) => z.kampagne)).toEqual(["Allianz Okt"]);
    expect(r.kampagnen.gesamt[0]).toEqual({
      kampagne: "Allianz Okt",
      angeschrieben: 5,
      geoeffnet: 2,
      antworten: 3,
      positiv: 2, // a (Text) + e (Instantly „Interessiert“ ohne Text)
      spaeter: 0,
      absagen: 1,
      neutral: 0,
      bounces: 1,
      abmeldungen: 1,
      termine: 1,
    });
    expect(r.kampagnen.letzte30[0]).toMatchObject({ angeschrieben: 3, geoeffnet: 1, antworten: 2, positiv: 2, absagen: 0, bounces: 1, abmeldungen: 0, termine: 1 });

    expect(r.postfaecher.gesamt).toEqual([{ postfach: "ver…@beispiel.de", antworten: 2, positiv: 1, spaeter: 0, absagen: 1, neutral: 0, termine: 1 }]);
    expect(r.einwaende.gesamt).toEqual([{ kategorie: "Kein Bedarf, ausgelastet", anzahl: 1 }]);
    expect(r.einwaende.letzte30).toEqual([]);
  });

  it("Betreffs erst ab 3 Kontakten, Rest zusammengefasst; Einwände je Kontakt einmal", () => {
    const antworten = [
      ...["a", "b", "c"].map((id, i) => antwort(id, "Makler Nov", { subject: "AW: Mehr Termine", sentiment: i ? "NEGATIV" : "POSITIV", text: "Wir haben schon einen Anbieter für Leads" })),
      antwort("d", "Makler Nov", { subject: "Re: Frage an Agentur Muster", sentiment: "POSITIV" }),
      antwort("b", "Makler Nov", { subject: "AW: Mehr Termine", sentiment: "NEGATIV", text: "Und zu teuer ist es auch." }),
    ];
    const r = auswerten({ kampagnen, leads: [], antworten, termine: [], jetzt: JETZT });
    expect(r.betreffs[0]).toEqual({ kampagne: "Makler Nov", betreff: "Mehr Termine", antworten: 3, positiv: 1, spaeter: 0, absagen: 2 });
    expect(r.betreffs[1]).toMatchObject({ kampagne: "(alle)", antworten: 1, positiv: 1 });
    expect(JSON.stringify(r.betreffs)).not.toContain("Muster");
    expect(r.einwaende.gesamt).toEqual([
      { kategorie: "Hat schon Anbieter oder Agentur", anzahl: 2 },
      { kategorie: "Zu teuer, kein Budget", anzahl: 1 },
    ]);
  });

  it("Markdown: Tabellen mit Summenzeile, keine Texte oder Kontaktadressen", () => {
    const antworten = [antwort("a", "Allianz Okt", { sentiment: "NEGATIV", text: "Geheimer Antworttext, kein Bedarf", eaccount: "vertrieb.max@beispiel.de" })];
    const r = auswerten({ kampagnen, leads: [lead("a", "k1", { replyCount: 1, lastReplyAt: tage(4) })], antworten, termine: [], jetzt: JETZT });
    const md = alsMarkdown(r);
    expect(md).toContain("| Kampagne | Angeschrieben | Geöffnet | Antworten | Antwortquote |");
    expect(md).toContain("| Allianz Okt | 1 | 0 | 1 | 100,0 % | 0 | 0,0 % | 0 | 1 |");
    expect(md).toContain("| **Summe** |");
    expect(md).toContain("| Kein Bedarf, ausgelastet | 1 |");
    expect(md).not.toContain("Geheimer");
    expect(md).not.toContain("vertrieb.max@");
    expect(JSON.stringify(r)).not.toContain("Geheimer");
  });
});
