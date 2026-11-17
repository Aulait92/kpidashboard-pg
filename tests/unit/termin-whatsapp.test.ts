// WhatsApp-Terminbestätigung Vertrieb und Kunde/Interessent-Abzeichen (Ole, 15.11.2026)
import { describe, expect, it } from "vitest";
import {
  bookingPhone,
  SUPPORT_TEMPLATES,
  TERMIN_TEMPLATE_BODY,
  TERMIN_TEMPLATE_EXAMPLES,
  TERMIN_VORLAGEN,
  terminAnrede,
  terminArt,
  terminModus,
  terminParams,
  terminThema,
  vorlageParams,
  waehleTerminVorlage,
  type Nutzbar,
} from "@/lib/vertrieb/termin-whatsapp";
import { erkenneTerminVorlage } from "@/lib/vertrieb/termin-whatsapp-diagnose";
import { zahlungVorlage, ZAHLUNG_TEMPLATE_BODY_SIE_V2, ZAHLUNG_TEMPLATE_DU_V2, ZAHLUNG_TEMPLATE_SIE, ZAHLUNG_TEMPLATE_SIE_V2 } from "@/lib/angebot-zahlungserinnerung";
import { metaTemplateProblems } from "@/lib/whatsapp/template-plan";
import { renderTemplate } from "@/lib/whatsapp/templates";
import { supportBadge } from "@/lib/whatsapp/support-contacts";

describe("Terminbestätigung", () => {
  it("Vorlage erfüllt Metas Regeln, Sie-Form, ohne Gedankenstriche", () => {
    expect(metaTemplateProblems(TERMIN_TEMPLATE_BODY, TERMIN_TEMPLATE_EXAMPLES)).toEqual([]);
    expect(TERMIN_TEMPLATE_BODY).toMatch(/Ihre/);
    expect(TERMIN_TEMPLATE_BODY).not.toMatch(/\b(du|dein|dich)\b/i);
  });

  it("beschreibt die Terminart", () => {
    expect(terminArt({ type: "zoom", join_url: "https://zoom.us/j/1" })).toBe("per Video: https://zoom.us/j/1");
    expect(terminArt({ type: "google_conference" })).toMatch(/per Video, den Link/);
    expect(terminArt({ type: "outbound_call", location: "+49151" })).toBe("telefonisch, wir rufen Sie an");
    expect(terminArt({ type: "physical", location: "Hamburg" })).toBe("vor Ort: Hamburg");
    expect(terminArt(null)).toMatch(/Bestätigungsmail/);
  });

  it("baut Parameter in Berliner Zeit ohne Zeilenumbrüche", () => {
    const p = terminParams({ name: "Max\nMuster", startAt: new Date("2026-11-18T13:30:00Z"), loc: { type: "outbound_call" }, rescheduleUrl: null });
    expect(p).toEqual(["Max Muster", "Mittwoch, 18. November", "14:30", "telefonisch, wir rufen Sie an", "über den Link in Ihrer Bestätigungsmail"]);
    expect(terminParams({ name: null, startAt: new Date(), loc: null, rescheduleUrl: "https://x" })[0]).toBe("und herzlich willkommen");
  });

  it("findet die Handynummer", () => {
    expect(bookingPhone({ text_reminder_number: "+49 151 1234567" }, null)).toBe("491511234567");
    expect(bookingPhone({ questions_and_answers: [{ question: "Ihre Handynummer", answer: "0176 2223334" }] }, null)).toBe("491762223334");
    expect(bookingPhone({ questions_and_answers: [{ question: "Firma", answer: "Agentur 1234567" }] }, "+49 30 123456")).toBe("4930123456");
    expect(bookingPhone({}, null)).toBeNull();
  });
});

describe("Support-Abzeichen", () => {
  const sc = { id: "c1", name: "Agentur Müller", stage: "TERMIN", customerStage: null, customerId: null };
  it("Interessent, Kunde, Unbekannt", () => {
    expect(supportBadge({ salesContact: sc, linkedCustomer: null })).toMatchObject({ kind: "interessent", detail: "Agentur Müller · Termin", href: "/admin/vertrieb/kontakte/c1" });
    expect(supportBadge({ salesContact: { ...sc, stage: "GEWONNEN", customerId: "k1" }, linkedCustomer: null })).toMatchObject({ kind: "kunde", href: "/admin/kunden/k1" });
    expect(supportBadge({ salesContact: { ...sc, customerStage: "GEKUENDIGT" }, linkedCustomer: null }).label).toBe("Kunde (gekündigt)");
    expect(supportBadge({ salesContact: null, linkedCustomer: { id: "k2", name: "Allianz X" } })).toMatchObject({ kind: "kunde", detail: "Allianz X" });
    expect(supportBadge({ salesContact: null, linkedCustomer: null }).kind).toBe("unbekannt");
  });
});

// Fassung 2 (Ole, 17.11.2026): persönlich von Ole Kannapinn, Varianten je Thema und Terminart, Rückfall auf Fassung 1
const alle: Nutzbar = () => true;
const nur = (...names: string[]): Nutzbar => (n) => names.includes(n);
const v1Namen = TERMIN_VORLAGEN.filter((v) => v.version === 1).map((v) => v.name);

describe("Vorlagen Fassung 2", () => {
  it("alle Vorlagen erfüllen Metas Regeln, Sie-Form, Namen eindeutig, Fassung 2 von Ole Kannapinn", () => {
    const names = SUPPORT_TEMPLATES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of SUPPORT_TEMPLATES) {
      expect(metaTemplateProblems(t.body, t.examples), t.name).toEqual([]);
      expect(t.name).toMatch(/^[a-z0-9_]+$/);
    }
    for (const v of TERMIN_VORLAGEN.filter((x) => x.version === 2)) {
      expect(v.body, v.name).toMatch(/Ole Kannapinn$/);
      expect(v.body).not.toMatch(/\b(du|dein|dich|dir)\b/i);
      expect(v.body).not.toMatch(/Garantie|Team/);
      expect(v.examples).toHaveLength(v.params.length);
    }
    expect(ZAHLUNG_TEMPLATE_BODY_SIE_V2).toMatch(/Viele Grüße, Ole Kannapinn$/);
    // Freigegebene Texte (Ole, 17.11.2026) wörtlich
    expect(TERMIN_VORLAGEN.find((v) => v.name === "pg_vertrieb_termin_v2")?.body).toBe(
      "Guten Tag {{1}}, danke für Ihre Buchung! Wir sprechen am {{2}} um {{3}} Uhr per Video darüber, wie Sie mit exklusiven Leads planbar neue Kundentermine bekommen. Ihren Link finden Sie in der Kalendereinladung. Falls etwas dazwischenkommt: {{4}} Ich freue mich auf Sie! Viele Grüße, Ole Kannapinn",
    );
    expect(TERMIN_VORLAGEN.find((v) => v.name === "pg_vertrieb_erinnerung_v2")?.body).toBe(
      "Guten Tag {{1}}, morgen um {{2}} Uhr sprechen wir per Video darüber, wie Sie mit exklusiven Leads planbar neue Kundentermine bekommen. Ich freue mich darauf! Falls etwas dazwischenkommt: {{3}} Viele Grüße, Ole Kannapinn",
    );
    expect(TERMIN_VORLAGEN.find((v) => v.name === "pg_vertrieb_gleich_v2")?.body).toBe(
      "Guten Tag {{1}}, in einer Stunde sehen wir uns per Video, um {{2}} Uhr. Den Link finden Sie in Ihrer Kalendereinladung. Falls etwas dazwischenkommt: {{3}} Bis gleich, Ole Kannapinn",
    );
  });

  it("wählt die Variante nach Thema und Terminart", () => {
    const name = (art: "termin" | "erinnerung" | "gleich", thema: "leads" | "entscheidung", modus: "video" | "link" | "telefon" | null, morgen = true) =>
      waehleTerminVorlage(art, { thema, modus, morgen }, alle)?.name;
    expect(name("termin", "leads", "video")).toBe("pg_vertrieb_termin_v2");
    expect(name("termin", "leads", "link")).toBe("pg_vertrieb_termin_link_v2");
    expect(name("termin", "leads", "telefon")).toBe("pg_vertrieb_termin_tel_v2");
    expect(name("termin", "entscheidung", "video")).toBe("pg_vertrieb_termin_ent_v2");
    expect(name("termin", "entscheidung", "link")).toBe("pg_vertrieb_termin_ent_link_v2");
    expect(name("termin", "entscheidung", "telefon")).toBe("pg_vertrieb_termin_ent_tel_v2");
    expect(name("erinnerung", "leads", "link")).toBe("pg_vertrieb_erinnerung_v2");
    expect(name("erinnerung", "leads", "telefon")).toBe("pg_vertrieb_erinnerung_tel_v2");
    expect(name("erinnerung", "entscheidung", "video")).toBe("pg_vertrieb_erinnerung_ent_v2");
    expect(name("erinnerung", "entscheidung", "telefon")).toBe("pg_vertrieb_erinnerung_ent_tel_v2");
    expect(name("gleich", "entscheidung", "video")).toBe("pg_vertrieb_gleich_v2");
    expect(name("gleich", "entscheidung", "link")).toBe("pg_vertrieb_gleich_link_v2");
    expect(name("gleich", "leads", "telefon")).toBe("pg_vertrieb_gleich_tel_v2");
    // vor Ort / unbekannt: Fassung 1; 24 h, aber nicht morgen: Fassung 1 (sie nennt das Datum)
    expect(name("termin", "leads", null)).toBe("pg_vertrieb_termin_v1");
    expect(name("erinnerung", "leads", "video", false)).toBe("pg_vertrieb_erinnerung_v1");
  });

  it("Rückfall: Fassung 1, solange Fassung 2 nicht nutzbar ist; Link-Variante fehlt: Video ohne Link", () => {
    expect(waehleTerminVorlage("termin", { thema: "leads", modus: "link" }, nur(...v1Namen))?.name).toBe("pg_vertrieb_termin_v1");
    expect(waehleTerminVorlage("termin", { thema: "leads", modus: "link" }, nur("pg_vertrieb_termin_v2", ...v1Namen))?.name).toBe("pg_vertrieb_termin_v2");
    expect(waehleTerminVorlage("gleich", { thema: "leads", modus: "telefon" }, nur())).toBeNull();
    expect(waehleTerminVorlage("gleich", { thema: "leads", modus: "telefon" }, (n, v) => v === 2 && n === "pg_vertrieb_gleich_tel_v2")?.name).toBe("pg_vertrieb_gleich_tel_v2");
    expect(zahlungVorlage(false, nur(ZAHLUNG_TEMPLATE_SIE))?.name).toBe(ZAHLUNG_TEMPLATE_SIE);
    expect(zahlungVorlage(false, alle)?.name).toBe(ZAHLUNG_TEMPLATE_SIE_V2);
    expect(zahlungVorlage(true, alle)?.name).toBe(ZAHLUNG_TEMPLATE_DU_V2);
    expect(zahlungVorlage(true, nur(ZAHLUNG_TEMPLATE_SIE))).toBeNull();
  });

  it("erkennt Thema und Terminart", () => {
    expect(terminThema({ title: "Meta-Leads-Call", bookingType: { slug: "meta-leads-call" } })).toBe("leads");
    expect(terminThema({ title: "Entscheidungs-Call", bookingType: { slug: "entscheidung" } })).toBe("entscheidung");
    expect(terminThema({ title: "Entscheidungsgespräch (Calendly)", bookingType: null })).toBe("entscheidung");
    expect(terminModus({ joinUrl: "https://meet.google.com/x" })).toBe("link");
    expect(terminModus({ locType: "video" })).toBe("video");
    expect(terminModus({ location: "Videocall" })).toBe("video");
    expect(terminModus({ location: "Telefon" })).toBe("telefon");
    expect(terminModus({ locType: "outbound_call" })).toBe("telefon");
    expect(terminModus({ locType: "+49 151 1234567", location: "+49 151 1234567" })).toBe("telefon");
    expect(terminModus({ locType: "google_conference", location: "google_conference" })).toBe("video");
    expect(terminModus({ locType: "inbound_call", location: "+49 40 123456" })).toBeNull();
    expect(terminModus({ locType: "physical", location: "Hamburg" })).toBeNull();
    expect(terminModus({})).toBeNull();
  });

  it("Anrede: Herr/Frau Nachname nur bei bekannter Anrede, sonst Vor- und Nachname, nie geraten", () => {
    expect(terminAnrede({ salutation: "Frau", firstName: "Julia", lastName: "Schneider" }, "Julia Schneider")).toBe("Frau Schneider");
    expect(terminAnrede({ salutation: null, firstName: "Julia", lastName: "Schneider" }, null)).toBe("Julia Schneider");
    expect(terminAnrede({ salutation: "Herr", firstName: "Max", lastName: "Muster" }, "Petra Weber")).toBe("Petra Weber");
    expect(terminAnrede(null, "Max Muster")).toBe("Max Muster");
    expect(terminAnrede({ firstName: "Max" }, "Max")).toBe("Max");
    expect(terminAnrede(null, null)).toBeNull();
  });

  it("Parameter je Variante; ohne Link die Bitte um Antwort", () => {
    const v = TERMIN_VORLAGEN.find((x) => x.name === "pg_vertrieb_termin_link_v2")!;
    const p = vorlageParams(v, { anrede: "Frau Schneider", startAt: new Date("2026-11-18T13:30:00Z"), loc: null, videolink: "https://meet.google.com/x", link: "https://app/termin/verwalten/t" });
    expect(p).toEqual(["Frau Schneider", "Mittwoch, 18. November", "14:30", "https://meet.google.com/x", "https://app/termin/verwalten/t"]);
    const g = TERMIN_VORLAGEN.find((x) => x.name === "pg_vertrieb_gleich_tel_v2")!;
    expect(vorlageParams(g, { anrede: null, startAt: new Date("2026-11-18T13:30:00Z"), loc: null, videolink: null, link: null })).toEqual([
      "und herzlich willkommen",
      "14:30",
      "antworten Sie einfach kurz auf diese Nachricht.",
    ]);
  });

  it("Diagnose erkennt jede Vorlage am gesendeten Text", () => {
    for (const v of TERMIN_VORLAGEN) {
      const e = erkenneTerminVorlage(renderTemplate(v.body, v.examples));
      expect(e?.name, v.name).toBe(v.name);
      expect(e?.zeit).toBe("14:30");
    }
    expect(erkenneTerminVorlage("Guten Tag, eine kurze Erinnerung zu Ihrem Angebot")).toBeNull();
  });
});
