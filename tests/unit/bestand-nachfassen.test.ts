// Bestand Paket 4 (20.11.2026): genau ein automatisches Nachfassen nach 5 Werktagen, mit denselben Prüfungen wie beim
// ersten Versand, Texte in beiden Ansprachen, warme Kontakte für „Heute“. Ohne Datenbank.
import { describe, expect, it } from "vitest";
import {
  addWorkdays,
  FOLLOW_UP_LABEL,
  FOLLOW_UP_MAX_DAYS,
  followUpDecision,
  followUpDueAt,
  followUpMail,
  followUpText,
  replyAfterFollowUp,
  type FollowUpInput,
} from "@/lib/bestand/nachfassen";
import { istWarm, WARM_TITLE } from "@/lib/bestand/warm-shared";
import { recipientStatusLabel } from "@/lib/bestand/campaigns";
import type { ConsentSubject } from "@/lib/bestand/einwilligung";

const D = (s: string) => new Date(s);
const DASH = /[–—]/;
const subject = (o: Partial<ConsentSubject> = {}): ConsentSubject => ({
  phone: "4915111111111",
  email: "kunde@test.local",
  optOutAt: null,
  emailOptOutAt: null,
  emailConsent: "ja",
  whatsappConsent: null,
  widerspruchHinweis: "ja",
  ...o,
});
// Dienstag, 10.11.2026, 10 Uhr Berlin
const SENT = D("2026-11-10T09:00:00Z");
// Dienstag, 17.11.2026, 10 Uhr: genau 5 Werktage später
const DUE = D("2026-11-17T09:00:00Z");
const input = (o: Partial<FollowUpInput> & { r?: Partial<FollowUpInput["recipient"]>; s?: Partial<ConsentSubject> } = {}): FollowUpInput => ({
  occasion: "renewal",
  campaign: { followUp: true, status: "done", channelMode: "whatsapp_first" },
  subject: subject(o.s),
  settings: { uwgConfirmed: true },
  lastCampaignAt: SENT,
  waWindowOpen: false,
  now: DUE,
  ...o,
  recipient: { status: "sent", sentAt: SENT, repliedAt: null, optOutAt: null, bouncedAt: null, followUpAt: null, ...o.r },
});

describe("Werktage", () => {
  it("zählt nur Montag bis Freitag (Berliner Zeit)", () => {
    expect(addWorkdays(SENT, 5).toISOString()).toBe(DUE.toISOString());
    // Freitag 20.11. → Freitag 27.11.
    expect(addWorkdays(D("2026-11-20T09:00:00Z"), 5).toISOString()).toBe("2026-11-27T09:00:00.000Z");
    // Samstag 21.11. → Freitag 27.11.
    expect(addWorkdays(D("2026-11-21T09:00:00Z"), 5).toISOString()).toBe("2026-11-27T09:00:00.000Z");
    // Donnerstag 23 Uhr Berlin (22 Uhr UTC) zählt als Donnerstag
    expect(addWorkdays(D("2026-11-19T22:30:00Z"), 1).toISOString()).toBe("2026-11-20T22:30:00.000Z");
    expect(followUpDueAt(SENT).toISOString()).toBe(DUE.toISOString());
  });
});

describe("Nachfassen: höchstens eine Erinnerung, gleiche Prüfungen wie beim ersten Versand", () => {
  it("fällig nach 5 Werktagen ohne Antwort, per E-Mail, wenn WhatsApp-Fenster zu ist", () => {
    expect(followUpDecision(input())).toEqual({ channel: "email" });
    expect(followUpDecision(input({ now: D("2026-11-17T08:00:00Z") }))).toMatchObject({ channel: null, reason: "noch nicht fällig" });
  });

  it("nie eine zweite Erinnerung", () => {
    expect(followUpDecision(input({ r: { followUpAt: DUE }, now: D("2026-11-25T09:00:00Z") }))).toMatchObject({ channel: null, reason: "schon erinnert" });
  });

  it("keine Erinnerung nach Antwort, Kein Bedarf, Stopp, Abmeldung oder Unzustellbarkeit", () => {
    expect(followUpDecision(input({ r: { status: "replied", repliedAt: D("2026-11-11T09:00:00Z") } })).channel).toBeNull();
    // „Kein Bedarf“ und „Stopp“ setzen status replied (handleCampaignReply)
    expect(followUpDecision(input({ r: { status: "replied", repliedAt: D("2026-11-11T09:00:00Z") } }))).toMatchObject({ reason: "geantwortet oder nicht verschickt" });
    expect(followUpDecision(input({ r: { optOutAt: D("2026-11-12T09:00:00Z") } }))).toMatchObject({ channel: null, reason: "abgemeldet" });
    expect(followUpDecision(input({ r: { bouncedAt: D("2026-11-10T10:00:00Z") } }))).toMatchObject({ channel: null, reason: "unzustellbar" });
    // Abmeldung am Kunden (Ein-Klick-Link, Sperrliste): emailDecision greift
    expect(followUpDecision(input({ s: { optOutAt: D("2026-11-12T09:00:00Z") } })).channel).toBeNull();
    expect(followUpDecision(input({ s: { suppressed: { all: true } } })).channel).toBeNull();
    expect(followUpDecision(input({ s: { emailOptOutAt: D("2026-11-12T09:00:00Z") } })).channel).toBeNull();
    expect(followUpDecision(input({ s: { blockedAt: D("2026-11-12T09:00:00Z") } })).channel).toBeNull();
  });

  it("Kampagnenende, Schalter aus und Pause beenden bzw. halten das Nachfassen", () => {
    expect(followUpDecision(input({ campaign: { followUp: false, status: "done", channelMode: "whatsapp_first" } }))).toMatchObject({ reason: "Erinnerung aus" });
    expect(followUpDecision(input({ campaign: { followUp: true, status: "paused", channelMode: "whatsapp_first" } }))).toMatchObject({ reason: "Kampagne pausiert" });
  });

  it("ohne WhatsApp-Einwilligung kein WhatsApp-Nachfassen, auch bei offenem Fenster", () => {
    expect(followUpDecision(input({ waWindowOpen: true, s: { whatsappConsent: null, emailConsent: null, email: null } })).channel).toBeNull();
    expect(followUpDecision(input({ waWindowOpen: true, s: { whatsappConsent: "nein" } }))).toEqual({ channel: "email" });
    // Mit Opt-in nur im offenen Fenster (keine freigegebene Vorlage), sonst E-Mail
    expect(followUpDecision(input({ waWindowOpen: true, s: { whatsappConsent: "ja" } }))).toEqual({ channel: "whatsapp" });
    expect(followUpDecision(input({ waWindowOpen: false, s: { whatsappConsent: "ja" } }))).toEqual({ channel: "email" });
    // Nur WhatsApp gewählt und Fenster zu: keine Erinnerung
    expect(followUpDecision(input({ campaign: { followUp: true, status: "running", channelMode: "whatsapp" }, s: { whatsappConsent: "ja" } }))).toMatchObject({ channel: null });
  });

  it("gleicher Anlass, gleiche Rechtsgrundlage: Cross-Selling per E-Mail nur mit Einwilligung", () => {
    expect(followUpDecision(input({ occasion: "cross_sell", s: { emailConsent: null } }))).toMatchObject({ channel: null, reason: "Cross-Selling in eine andere Sparte nur mit Einwilligung" });
    expect(followUpDecision(input({ occasion: "cross_sell" }))).toEqual({ channel: "email" });
    // Ablauf nach § 7 Abs. 3 UWG nur mit Bestätigung und Nachweis
    expect(followUpDecision(input({ s: { emailConsent: null } }))).toEqual({ channel: "email" });
    expect(followUpDecision(input({ s: { emailConsent: null }, settings: { uwgConfirmed: false } })).channel).toBeNull();
  });

  it("kein Nachfassen bei Geburtstag und Empfehlungsbitte", () => {
    expect(followUpDecision(input({ occasion: "birthday" })).channel).toBeNull();
    expect(followUpDecision(input({ occasion: "empfehlung" })).channel).toBeNull();
  });

  it("30-Tage-Abstand: Ausnahme nur für diese Kampagne, nicht nach einer anderen Kampagne, nicht nach Wochen", () => {
    expect(followUpDecision(input({ lastCampaignAt: D("2026-11-12T09:00:00Z") }))).toMatchObject({ channel: null, reason: "seitdem andere Kampagne" });
    expect(followUpDecision(input({ now: new Date(SENT.getTime() + (FOLLOW_UP_MAX_DAYS + 1) * 86_400_000) }))).toMatchObject({ reason: "zu lange her" });
  });

  it("Antwort nach Erinnerung wird erkannt", () => {
    expect(replyAfterFollowUp({ followUpAt: DUE, repliedAt: D("2026-11-18T09:00:00Z") })).toBe(true);
    expect(replyAfterFollowUp({ followUpAt: DUE, repliedAt: D("2026-11-12T09:00:00Z") })).toBe(false);
    expect(replyAfterFollowUp({ followUpAt: null, repliedAt: D("2026-11-18T09:00:00Z") })).toBe(false);
    expect(recipientStatusLabel({ status: "replied", reason: null, sentAt: SENT, repliedAt: D("2026-11-18T09:00:00Z"), followUpAt: DUE }).label).toContain("nach Erinnerung");
    expect(recipientStatusLabel({ status: "sent", reason: null, sentAt: SENT, repliedAt: null, followUpAt: DUE }).label).toBe("erinnert am 17.11.2026");
  });
});

describe("Nachfass-Texte", () => {
  const kontakt = { firstName: "Erika", lastName: "Muster", salutation: "Frau" };
  it("Sie und Du, mit und ohne Terminlink, ohne Gedankenstriche, ohne Druck und ohne Euro", () => {
    const sie = followUpText(kontakt, "sie", SENT, "https://x.test/book/a?bk=1");
    const du = followUpText(kontakt, "du", SENT, null);
    expect(sie).toContain("Frau Muster");
    expect(sie).toContain("meiner Nachricht vom Dienstag");
    expect(sie).toContain("Termin wählen: https://x.test/book/a?bk=1");
    expect(sie).toContain("Kein Bedarf? Dann reicht ein kurzes Nein.");
    expect(du).toContain("Hallo Erika");
    expect(du).toContain("Passt dir");
    expect(du).toContain("antworte einfach mit Ja");
    expect(du).not.toMatch(/\b(Ihnen|Sie|Ihr)\b/);
    for (const t of [sie, du]) {
      expect(t).not.toMatch(DASH);
      expect(t).not.toMatch(/Garantie|€|Euro|letzte Chance|dringend|nur noch/i);
    }
  });

  it("Mail mit Betreff „Kurz nachgefragt“ und Hinweis für schon Antwortende", () => {
    const m = followUpMail({ kontakt, an: "sie", sentAt: SENT, terminlink: null, subject: "Ihr Vertrag verlängert sich am 01.03.2027", meinname: "Max Berater" });
    expect(m.subject).toBe("Kurz nachgefragt: Ihr Vertrag verlängert sich am 01.03.2027");
    expect(followUpMail({ kontakt, an: "sie", sentAt: SENT, terminlink: null, subject: m.subject, meinname: "x" }).subject).toBe(m.subject);
    expect(m.body).toContain("Falls Sie schon geantwortet haben");
    expect(m.body).toContain("Max Berater");
    expect(m.body).not.toMatch(DASH);
    const du = followUpMail({ kontakt, an: "du", sentAt: SENT, terminlink: "https://x.test/b", subject: "Dein Jahrescheck: 15 Minuten", meinname: "Max" });
    expect(du.body).toContain("Falls du schon geantwortet hast");
    expect(du.body).toContain("Oder antworte einfach mit Ja");
    expect(du.body).not.toMatch(/\b(Ihnen|Sie|Ihr)\b/);
  });

  it("Schalter-Beschriftung", () => {
    expect(FOLLOW_UP_LABEL).toBe("Nach 5 Werktagen einmal erinnern");
  });
});

describe("Warme Kontakte in Heute", () => {
  const now = D("2026-11-20T09:00:00Z");
  const base = { status: "replied", reason: null, repliedAt: D("2026-11-17T09:00:00Z"), leadId: "l1", optOut: false, leadStatus: "Im Gespräch", hasAppointment: false };
  it("geantwortet ohne Termin seit mindestens 2 Tagen", () => {
    expect(WARM_TITLE).toBe("Nachfassen per Nachricht");
    expect(istWarm(base, now)).toBe(true);
    expect(istWarm({ ...base, repliedAt: D("2026-11-19T09:00:00Z") }, now)).toBe(false);
    expect(istWarm({ ...base, hasAppointment: true }, now)).toBe(false);
  });
  it("nicht bei Stopp, Kein Bedarf, Abmeldung, erledigt oder verloren", () => {
    for (const reason of ["Stopp", "Kein Bedarf", "Abmeldung", "kein Interesse", "nachgefasst"]) expect(istWarm({ ...base, reason }, now)).toBe(false);
    expect(istWarm({ ...base, optOut: true }, now)).toBe(false);
    expect(istWarm({ ...base, leadStatus: "Kein Interesse" }, now)).toBe(false);
    expect(istWarm({ ...base, leadId: null }, now)).toBe(false);
  });
});
