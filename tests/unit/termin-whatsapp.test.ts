// WhatsApp-Terminbestätigung Vertrieb und Kunde/Interessent-Abzeichen (Ole, 15.11.2026)
import { describe, expect, it } from "vitest";
import { bookingPhone, terminArt, terminParams, TERMIN_TEMPLATE_BODY, TERMIN_TEMPLATE_EXAMPLES } from "@/lib/vertrieb/termin-whatsapp";
import { metaTemplateProblems } from "@/lib/whatsapp/template-plan";
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
