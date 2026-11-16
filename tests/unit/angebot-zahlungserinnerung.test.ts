// Zahlungserinnerung für angenommene, unbezahlte Angebote (Ole, 16.11.2026): Plan, Stopp, Grenzen der
// Datumsauswahl, Startverschiebung und Texte.
import { describe, expect, it } from "vitest";
import {
  erinnerungGestoppt,
  erinnerungsGrenzen,
  erinnerungsMail,
  erinnerungsPlan,
  jetztSenden,
  naechsteErinnerung,
  pruefeErinnerungsDatum,
  pushFaellig,
  startVerschobenMail,
  verschobenerStart,
  ZAHLUNG_TEMPLATE_BODY_DU,
  ZAHLUNG_TEMPLATE_BODY_SIE,
  ZAHLUNG_TEMPLATE_EXAMPLES,
  type ErinnerungsAngebot,
} from "@/lib/angebot-zahlungserinnerung";
import { metaTemplateProblems } from "@/lib/whatsapp/template-plan";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

const day = (iso: string) => new Date(`${iso}T12:00:00Z`);
function offer(p: Partial<ErinnerungsAngebot> = {}): ErinnerungsAngebot {
  return {
    status: "accepted",
    isTest: false,
    paymentStatus: "none",
    stripeSubscriptionId: null,
    stripeScheduleId: null,
    acceptedAt: new Date("2026-11-16T10:00:00Z"),
    startDate: day("2027-01-01"),
    paymentReminderAt: null,
    paymentReminderCount: 0,
    paymentReminderLastAt: null,
    ...p,
  };
}

describe("Erinnerungsplan", () => {
  it("mit Datum: vorher nichts, am Datum, dann nach 3 und 7 Tagen, höchstens 3", () => {
    const o = offer({ paymentReminderAt: day("2026-12-07") });
    expect(erinnerungsPlan(o)).toEqual(["2026-12-07", "2026-12-10", "2026-12-14"]);
    const e = naechsteErinnerung(o, new Date("2026-11-20T10:00:00Z"));
    expect(e).toMatchObject({ stufe: 1, tag: "2026-12-07" });
    // Vorher keine Erinnerung
    expect(jetztSenden(e, new Date("2026-12-06T10:00:00Z"))).toBe(false);
    // Am Datum ab 9 Uhr Berlin (Winterzeit: 8 Uhr UTC)
    expect(e!.faelligAb.toISOString()).toBe("2026-12-07T08:00:00.000Z");
    expect(jetztSenden(e, new Date("2026-12-07T09:00:00Z"))).toBe(true);
    expect(naechsteErinnerung({ ...o, paymentReminderCount: 1, paymentReminderLastAt: new Date("2026-12-07T09:00:00Z") }, new Date())).toMatchObject({ stufe: 2, tag: "2026-12-10" });
    expect(naechsteErinnerung({ ...o, paymentReminderCount: 2, paymentReminderLastAt: new Date("2026-12-10T09:00:00Z") }, new Date())).toMatchObject({ stufe: 3, tag: "2026-12-14" });
    expect(naechsteErinnerung({ ...o, paymentReminderCount: 3 }, new Date())).toBeNull();
  });

  it("ohne Datum: 3 Tage nach Annahme, dann wöchentlich, höchstens 4", () => {
    const o = offer({ startDate: day("2027-03-01") });
    expect(erinnerungsPlan(o)).toEqual(["2026-11-19", "2026-11-26", "2026-12-03", "2026-12-10"]);
    expect(naechsteErinnerung(o, new Date())).toMatchObject({ stufe: 1, tag: "2026-11-19" });
    expect(naechsteErinnerung({ ...o, paymentReminderCount: 3, paymentReminderLastAt: day("2026-12-03") }, new Date())).toMatchObject({ stufe: 4, tag: "2026-12-10" });
    expect(naechsteErinnerung({ ...o, paymentReminderCount: 4 }, new Date())).toBeNull();
  });

  it("spätestens 14 Tage vor dem Start, falls früher als der Plan", () => {
    // Ohne Datum, Start 01.12.: 17.11. statt 19.11.
    expect(erinnerungsPlan(offer({ startDate: day("2026-12-01") }))[0]).toBe("2026-11-17");
    // Mit (zu spätem) Datum vom Admin: 18.12. statt 20.12.
    expect(erinnerungsPlan(offer({ paymentReminderAt: day("2026-12-20") }))).toEqual(["2026-12-18", "2026-12-21", "2026-12-25"]);
    // Grenze schon vorbei: frühestens am Tag nach der Annahme
    expect(erinnerungsPlan(offer({ acceptedAt: new Date("2026-11-20T10:00:00Z"), startDate: day("2026-12-01") }))[0]).toBe("2026-11-21");
    // Ohne Startdatum: Plan unverändert
    expect(erinnerungsPlan(offer({ startDate: null }))[0]).toBe("2026-11-19");
  });

  it("holt nach einem Ausfall nicht im Block nach (mindestens 2 Tage Abstand)", () => {
    const o = offer({ paymentReminderAt: day("2026-12-07"), paymentReminderCount: 1, paymentReminderLastAt: new Date("2026-12-09T09:00:00Z") });
    expect(naechsteErinnerung(o, new Date())?.tag).toBe("2026-12-11");
  });

  it("sendet nur zwischen 9 und 19 Uhr Berlin", () => {
    const e = naechsteErinnerung(offer({ startDate: day("2027-03-01") }), new Date());
    expect(jetztSenden(e, new Date("2026-11-19T07:30:00Z"))).toBe(false); // 8:30 Berlin
    expect(jetztSenden(e, new Date("2026-11-19T17:59:00Z"))).toBe(true); // 18:59 Berlin
    expect(jetztSenden(e, new Date("2026-11-19T18:00:00Z"))).toBe(false); // 19:00 Berlin
    expect(jetztSenden(e, new Date("2026-11-20T08:00:00Z"))).toBe(true); // überfällig, am nächsten Morgen
    expect(jetztSenden(null, new Date("2026-11-20T10:00:00Z"))).toBe(false);
  });

  it("stoppt bei Zahlung, Mandat, Storno, Ablehnung, Ersatz und Testangeboten", () => {
    expect(erinnerungGestoppt(offer())).toBeNull();
    for (const p of [
      { paymentStatus: "paid" },
      { paymentStatus: "processing" },
      { stripeScheduleId: "sub_sched_1" },
      { stripeSubscriptionId: "sub_1" },
      { status: "declined" },
      { status: "superseded" },
      { status: "cancelled" },
      { isTest: true },
      { acceptedAt: null },
    ] satisfies Partial<ErinnerungsAngebot>[]) {
      expect(erinnerungGestoppt(offer(p)), JSON.stringify(p)).not.toBeNull();
      expect(naechsteErinnerung(offer(p), new Date()), JSON.stringify(p)).toBeNull();
    }
    expect(naechsteErinnerung(offer(), new Date(), { ersetzt: true })).toBeNull();
    // Fehlgeschlagene oder abgebrochene Zahlung: weiter erinnern
    expect(naechsteErinnerung(offer({ paymentStatus: "failed" }), new Date())).not.toBeNull();
    expect(naechsteErinnerung(offer({ paymentStatus: "pending" }), new Date())).not.toBeNull();
  });

  it("Push an die Admins einmalig 7 Tage nach der ersten Erinnerung", () => {
    const base = { ...offer(), paymentReminderTaskAt: new Date("2026-12-07T09:00:00Z"), paymentReminderPushAt: null };
    expect(pushFaellig(base, new Date("2026-12-13T09:00:00Z"))).toBe(false);
    expect(pushFaellig(base, new Date("2026-12-14T09:00:00Z"))).toBe(true);
    expect(pushFaellig({ ...base, paymentReminderPushAt: new Date() }, new Date("2026-12-20T09:00:00Z"))).toBe(false);
    expect(pushFaellig({ ...base, paymentStatus: "processing" }, new Date("2026-12-20T09:00:00Z"))).toBe(false);
    expect(pushFaellig({ ...base, paymentReminderTaskAt: null }, new Date("2026-12-20T09:00:00Z"))).toBe(false);
  });
});

describe("Datumsauswahl „erinnern Sie mich am …“", () => {
  it("frühestens morgen, spätestens 14 Tage vor dem Start", () => {
    expect(erinnerungsGrenzen("2026-11-16", "2027-01-01")).toEqual({ min: "2026-11-17", max: "2026-12-18" });
    expect(erinnerungsGrenzen("2026-11-16", null)).toEqual({ min: "2026-11-17", max: null });
    // Start zu nah: keine Auswahl für den Kunden, Admin nur heute
    expect(erinnerungsGrenzen("2026-11-16", "2026-11-30")).toBeNull();
    expect(erinnerungsGrenzen("2026-11-16", "2026-11-30", { admin: true })).toEqual({ min: "2026-11-16", max: "2026-11-16" });
    expect(erinnerungsGrenzen("2026-11-16", "2027-01-01", { admin: true })).toEqual({ min: "2026-11-16", max: "2026-12-18" });
  });

  it("prüft das Wunschdatum serverseitig", () => {
    expect(pruefeErinnerungsDatum("2026-12-07", "2026-11-16", "2027-01-01")).toEqual({ ok: true, iso: "2026-12-07" });
    expect(pruefeErinnerungsDatum("2026-11-17", "2026-11-16", "2027-01-01").ok).toBe(true);
    expect(pruefeErinnerungsDatum("2026-12-18", "2026-11-16", "2027-01-01").ok).toBe(true);
    expect(pruefeErinnerungsDatum("2026-11-16", "2026-11-16", "2027-01-01").ok).toBe(false);
    expect(pruefeErinnerungsDatum("2026-12-19", "2026-11-16", "2027-01-01").ok).toBe(false);
    expect(pruefeErinnerungsDatum("2026-02-30", "2026-01-01", null).ok).toBe(false);
    expect(pruefeErinnerungsDatum("morgen", "2026-11-16", null).ok).toBe(false);
    // Admin: heute erlaubt (Fall Ole: Start 01.01.2027, erinnern am 07.12.2026)
    expect(pruefeErinnerungsDatum("2026-11-16", "2026-11-16", "2027-01-01", { admin: true }).ok).toBe(true);
    expect(pruefeErinnerungsDatum("2026-12-07", "2026-11-16", "2027-01-01", { admin: true }).ok).toBe(true);
  });
});

describe("Startverschiebung bei Zahlung nach dem Start", () => {
  it("nächster Monatserster nach der Zahlung, nichts rückwirkend", () => {
    expect(verschobenerStart("2027-01-01", "2026-12-20")).toBeNull();
    expect(verschobenerStart("2027-01-01", "2027-01-01")).toBeNull();
    expect(verschobenerStart("2027-01-01", "2027-01-05")).toBe("2027-02-01");
    expect(verschobenerStart("2027-01-15", "2027-01-31")).toBe("2027-02-01");
    expect(verschobenerStart("2027-01-01", "2027-12-15")).toBe("2028-01-01");
    // Zahlung an einem Monatsersten: Start an diesem Tag
    expect(verschobenerStart("2027-01-01", "2027-02-01")).toBe("2027-02-01");
    expect(verschobenerStart(null, "2027-02-10")).toBeNull();
  });
});

describe("Texte", () => {
  it("Mail in Sie- und Du-Form, ohne Gedankenstriche", () => {
    const sie = erinnerungsMail({ number: "PG-2026-0007", startIso: "2027-01-01", stufe: 1, du: false });
    const du = erinnerungsMail({ number: "PG-2026-0007", startIso: "2027-01-01", stufe: 2, du: true });
    expect(sie.paragraphs.join(" ")).toMatch(/Sie haben unser Angebot PG-2026-0007/);
    expect(sie.paragraphs.join(" ")).toMatch(/01\.01\.2027/);
    expect(sie.paragraphs.join(" ")).not.toMatch(/\b(du|dein|dich)\b/);
    expect(du.subject).toMatch(/^Erinnerung/);
    expect(du.paragraphs.join(" ")).toMatch(/\bdu hast\b/);
    expect(du.paragraphs.join(" ")).not.toMatch(/\b(Sie|Ihr|Ihnen)\b/);
    const all = [sie, du, startVerschobenMail({ number: "X", altIso: "2027-01-01", neuIso: "2027-02-01", du: false }), startVerschobenMail({ number: "X", altIso: "2027-01-01", neuIso: "2027-02-01", du: true })];
    for (const t of all) for (const line of [t.subject, ...t.paragraphs]) expect(hatGedankenstrich(line), line).toBe(false);
  });

  it("WhatsApp-Vorlagen erfüllen Metas Regeln", () => {
    expect(metaTemplateProblems(ZAHLUNG_TEMPLATE_BODY_SIE, ZAHLUNG_TEMPLATE_EXAMPLES)).toEqual([]);
    expect(metaTemplateProblems(ZAHLUNG_TEMPLATE_BODY_DU, ZAHLUNG_TEMPLATE_EXAMPLES)).toEqual([]);
    expect(ZAHLUNG_TEMPLATE_BODY_SIE).not.toMatch(/\b(du|dein|deinem)\b/);
    expect(ZAHLUNG_TEMPLATE_BODY_DU).not.toMatch(/\b(Sie|Ihr|Ihrem)\b/);
  });
});
