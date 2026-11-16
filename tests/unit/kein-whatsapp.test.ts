// Leads ohne WhatsApp (Ole, 15.11.2026): Einordnung der Meta-Fehlercodes, E-Mail-Text, Kanalwahl im Bestand.
import { describe, expect, it } from "vitest";
import { artOf, isNoWhatsAppCode, isWhatsAppOptOutCode, zustellfehlerOf } from "@/lib/whatsapp/zustellfehler";
import { keinWhatsAppMail } from "@/lib/whatsapp/kein-whatsapp-mail";
import { chooseChannel, NO_WHATSAPP_REASON, type ConsentSubject } from "@/lib/bestand/einwilligung";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

describe("Zustellfehler einordnen", () => {
  it("131026 (und 1013 alt) = kein WhatsApp", () => {
    expect(isNoWhatsAppCode(131026)).toBe(true);
    expect(isNoWhatsAppCode(1013)).toBe(true);
    expect(artOf(131026)).toBe("kein_whatsapp");
  });

  it("andere Fehler sind nicht „kein WhatsApp“", () => {
    for (const c of [131042, 131047, 131048, 131049, 131050, 131056, 130429, 130472, 132001, 132015, 132016, 133010, 131031, 131000]) {
      expect(isNoWhatsAppCode(c), String(c)).toBe(false);
      expect(artOf(c), String(c)).not.toBe("kein_whatsapp");
    }
    expect(artOf(131042)).toBe("zahlung_konto");
    expect(artOf(132015)).toBe("vorlage");
    expect(artOf(130429)).toBe("limit");
    expect(artOf(131048)).toBe("limit");
    expect(artOf(131056)).toBe("limit");
    expect(artOf(131047)).toBe("empfaenger");
    expect(artOf(131000)).toBe("meta");
    expect(artOf(null)).toBe("sonstiges");
    expect(isNoWhatsAppCode(null)).toBe(false);
  });

  it("nur 131050 zählt als Abmeldung von WhatsApp", () => {
    expect(isWhatsAppOptOutCode(131050)).toBe(true);
    for (const c of [131026, 131049, 131047, 131042, null, undefined]) expect(isWhatsAppOptOutCode(c), String(c)).toBe(false);
  });

  it("liest code und title aus statuses[].errors (auch Code als Text)", () => {
    expect(zustellfehlerOf([{ code: 131026, title: "Message undeliverable" }])).toEqual({ code: 131026, title: "Message undeliverable", art: "kein_whatsapp" });
    expect(zustellfehlerOf([{ code: "131042", message: "Business eligibility payment issue" }])).toMatchObject({ code: 131042, art: "zahlung_konto" });
    expect(zustellfehlerOf(undefined)).toEqual({ code: null, title: null, art: "sonstiges" });
    expect(zustellfehlerOf([{ code: "abc" }]).code).toBeNull();
  });
});

describe("E-Mail an Leads ohne WhatsApp", () => {
  const link = "https://dein-beratungstermin.de/book/anna?lead=l1";

  it("Sie ohne bekannte Anrede: neutral „Guten Tag,“, Produkt, Link, Name", () => {
    const m = keinWhatsAppMail({ an: "sie", kontakt: { fullName: "Kim Winter" }, source: "Zahnzusatzversicherung", advisor: "Anna Berater", link });
    expect(m.subject).toBe("Kurz zu Ihrer Zahnzusatzversicherung");
    expect(m.text.startsWith("Guten Tag,\n")).toBe(true);
    expect(m.text).not.toContain("Kim Winter");
    expect(m.text).toContain("Ihr Interesse");
    expect(m.text).toContain("Hier können Sie direkt einen Termin wählen");
    expect(m.text).toContain(link);
    expect(m.text.trimEnd().endsWith("Viele Grüße\nAnna Berater")).toBe(true);
    expect(hatGedankenstrich(m.subject + m.text)).toBe(false);
  });

  it("Sie mit Anrede: „Guten Tag Frau Winter,“ und Name im Betreff", () => {
    const m = keinWhatsAppMail({ an: "sie", kontakt: { fullName: "Kim Winter", salutation: "Frau" }, source: "Zahnzusatzversicherung", advisor: "Anna", link });
    expect(m.text.startsWith("Guten Tag Frau Winter,")).toBe(true);
    expect(m.subject).toBe("Frau Winter, kurz zu Ihrer Zahnzusatzversicherung");
  });

  it("Du: Vorname, du-Form; ohne Link: bitte antworten", () => {
    const m = keinWhatsAppMail({ an: "du", kontakt: { fullName: "Kim Winter" }, source: null, advisor: "Anna", link: null });
    expect(m.text.startsWith("Hallo Kim,")).toBe(true);
    expect(m.text).toContain("dein Interesse");
    expect(m.text).toContain("Antworte gern einfach auf diese E-Mail");
    expect(m.text).not.toMatch(/\bSie\b|\bIhnen\b/);
    expect(m.subject).toBe("Kim, kurz zu deiner Anfrage");
  });

  it("mit Signatur des Postfachs statt „Viele Grüße“", () => {
    const m = keinWhatsAppMail({ an: "sie", kontakt: {}, source: null, advisor: "Anna", link, signatur: "Beste Grüße\nAnna Berater\nAgentur Berater" });
    expect(m.text.trimEnd().endsWith("Beste Grüße\nAnna Berater\nAgentur Berater")).toBe(true);
    expect(m.text).not.toContain("Viele Grüße");
  });
});

describe("Bestand: kein WhatsApp → E-Mail", () => {
  const base: ConsentSubject = { phone: "4915112345678", email: "a@b.de", optOutAt: null, emailOptOutAt: null, emailConsent: "ja", whatsappConsent: "ja" };
  it("nimmt E-Mail statt WhatsApp", () => {
    expect(chooseChannel("whatsapp_first", base, "cross_sell", { uwgConfirmed: false })).toMatchObject({ channel: "whatsapp" });
    expect(chooseChannel("whatsapp_first", { ...base, waUnavailableAt: new Date() }, "cross_sell", { uwgConfirmed: false })).toMatchObject({ channel: "email" });
  });
  it("nur, wo E-Mail erlaubt ist", () => {
    const s = { ...base, waUnavailableAt: new Date(), emailConsent: null };
    // Cross-Selling ohne E-Mail-Einwilligung: ausgeschlossen
    expect(chooseChannel("whatsapp_first", s, "cross_sell", { uwgConfirmed: true }).channel).toBeNull();
    expect(chooseChannel("whatsapp", s, "cross_sell", { uwgConfirmed: true })).toEqual({ channel: null, reason: NO_WHATSAPP_REASON });
    expect(chooseChannel("whatsapp_first", { ...s, email: null }, "renewal", { uwgConfirmed: true })).toEqual({ channel: null, reason: NO_WHATSAPP_REASON });
  });
});
