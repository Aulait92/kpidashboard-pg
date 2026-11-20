// Bestandskampagnen (Ole, 14.11.2026): Kanalwahl, Einwilligung je Anlass, WhatsApp strikt, Drosselung,
// Antworten, Trichter je Kanal, 60-Tage-Zuordnung, Provision je Sparte, Texte und Vorlagen-Hinweise. Ohne Datenbank.
import { describe, expect, it } from "vitest";
import {
  chooseChannel,
  consentAskEligible,
  consentRequestByMailAllowed,
  CONSENT_ASK_GAP_DAYS,
  countsForReach,
  offerReach,
  reachableForOffers,
  wantsConsentPs,
  countAudience,
  emailDecision,
  isSimilarLine,
  lacksUwgProof,
  NO_PROOF_REASON,
  parseConsent,
  whatsappDecision,
  type ConsentSubject,
} from "@/lib/bestand/einwilligung";
import { afterSend, bounceCheck, effectiveDailyLimit, inMailWindow, isBounceError, mailSlots, providerDailyLimit, type ThrottleState } from "@/lib/bestand/mail-drossel";
import { buildCampaignMail, campaignMailFooter, consentPsLine, defaultCampaignMail, fillCampaignMail, imprintFromWebsiteInfo, ohneGedankenstriche } from "@/lib/bestand/kampagnen-mail";
import { classifyCampaignReply, effectiveMode, inSegment, renewalTopic } from "@/lib/bestand/campaigns";
import { attributeContract, attributeToCampaign, contractOrigin } from "@/lib/lead-herkunft";
import { ertragOf, funnelOf, groupStats, quote, type CampaignStats, type FunnelRecipient } from "@/lib/bestand/statistik";
import { summarizeProvision } from "@/lib/ertrag";
import { needsSubmit, templateNotice, templateState } from "@/lib/whatsapp/vorlagen-hinweis";
import { groupRows } from "@/lib/bestand/rows";
import type { CustomerContract } from "@/lib/vertraege";

const D = (s: string) => new Date(s);
const subject = (o: Partial<ConsentSubject> = {}): ConsentSubject => ({
  phone: "4915111111111",
  email: "kunde@test.local",
  optOutAt: null,
  emailOptOutAt: null,
  emailConsent: null,
  whatsappConsent: null,
  // Standard: Nachweis zum Widerspruchshinweis liegt vor (eigene Tests für „fehlt“)
  widerspruchHinweis: "ja",
  ...o,
});
const UWG = { uwgConfirmed: true };
const NO_UWG = { uwgConfirmed: false };

describe("Kanalwahl je Empfänger", () => {
  it("WhatsApp bevorzugt: WhatsApp mit Opt-in, sonst E-Mail, sonst ausgeschlossen mit Grund", () => {
    expect(chooseChannel("whatsapp_first", subject({ whatsappConsent: "ja", emailConsent: "ja" }), "cross_sell", NO_UWG)).toEqual({ channel: "whatsapp", basis: "einwilligung" });
    expect(chooseChannel("whatsapp_first", subject({ emailConsent: "ja" }), "cross_sell", NO_UWG)).toEqual({ channel: "email", basis: "einwilligung" });
    expect(chooseChannel("whatsapp_first", subject({ phone: null }), "renewal", UWG)).toEqual({ channel: "email", basis: "uwg7_3" });
    expect(chooseChannel("whatsapp_first", subject({ email: null }), "renewal", UWG)).toEqual({ channel: null, reason: "keine WhatsApp-Einwilligung" });
  });
  it("nur WhatsApp bzw. nur E-Mail: nur dieser Kanal", () => {
    const s = subject({ whatsappConsent: "ja", emailConsent: "ja" });
    expect(chooseChannel("email", s, "review", NO_UWG).channel).toBe("email");
    expect(chooseChannel("whatsapp", subject({ emailConsent: "ja" }), "review", NO_UWG)).toEqual({ channel: null, reason: "keine WhatsApp-Einwilligung" });
    expect(chooseChannel("email", subject({ email: null, whatsappConsent: "ja" }), "review", NO_UWG)).toEqual({ channel: null, reason: "keine E-Mail-Adresse" });
  });
  it("Ohne verbundene Nummer wird „WhatsApp bevorzugt“ zu E-Mail", () => {
    expect(effectiveMode("whatsapp_first", false)).toBe("email");
    expect(effectiveMode("whatsapp_first", true)).toBe("whatsapp_first");
    expect(effectiveMode("whatsapp", false)).toBe("whatsapp");
  });
  it("Vorschau zählt je Kanal und Grund", () => {
    const c = countAudience([
      chooseChannel("whatsapp_first", subject({ whatsappConsent: "ja" }), "renewal", UWG),
      chooseChannel("whatsapp_first", subject(), "renewal", UWG),
      chooseChannel("whatsapp_first", subject({ optOutAt: D("2026-11-01") }), "renewal", UWG),
      chooseChannel("whatsapp_first", subject({ email: null }), "renewal", UWG),
    ]);
    expect(c).toMatchObject({ whatsapp: 1, email: 1, emailUwg: 1, excludedTotal: 2, excluded: { abgemeldet: 1, "keine WhatsApp-Einwilligung": 1 } });
  });
});

describe("Einwilligung je Anlass (§ 7 Abs. 3 UWG nur zum selben Bedarf)", () => {
  it("Mit E-Mail-Einwilligung: alle Anlässe", () => {
    for (const o of ["cross_sell", "birthday", "review", "renewal", "empfehlung"] as const) {
      expect(emailDecision(subject({ emailConsent: "ja" }), o, NO_UWG)).toEqual({ ok: true, basis: "einwilligung" });
    }
  });
  it("Ohne Einwilligung mit Bestätigung: Ablauf/Wechsel und Vertragscheck ja", () => {
    expect(emailDecision(subject(), "renewal", UWG)).toEqual({ ok: true, basis: "uwg7_3" });
    expect(emailDecision(subject(), "review", UWG)).toEqual({ ok: true, basis: "uwg7_3" });
  });
  it("kein Cross-Selling in andere Sparten, kein Geburtstag mit Angebot, keine Empfehlungs- bzw. Bewertungsbitte", () => {
    expect(emailDecision(subject(), "cross_sell", UWG)).toEqual({ ok: false, reason: "Cross-Selling in eine andere Sparte nur mit Einwilligung" });
    expect(emailDecision(subject(), "birthday", UWG)).toEqual({ ok: false, reason: "Geburtstag mit Angebot nur mit Einwilligung" });
    expect(emailDecision(subject(), "empfehlung", UWG)).toEqual({ ok: false, reason: "Empfehlungs- oder Bewertungsbitte nur mit Einwilligung" });
  });
  it("Ohne Bestätigung des Vermittlers gehen ohne Einwilligung keine Mails raus; „nein“ und Abmeldung schließen aus", () => {
    expect(emailDecision(subject(), "renewal", NO_UWG)).toEqual({ ok: false, reason: "keine E-Mail-Einwilligung, Bestätigung zu § 7 Abs. 3 UWG fehlt" });
    expect(emailDecision(subject({ emailConsent: "nein" }), "renewal", UWG)).toMatchObject({ ok: false, reason: "E-Mail-Einwilligung: nein" });
    expect(emailDecision(subject({ emailConsent: "ja", emailOptOutAt: D("2026-11-01") }), "renewal", UWG)).toMatchObject({ ok: false, reason: "E-Mail abgemeldet" });
    expect(emailDecision(subject({ emailConsent: "ja", suppressed: { email: true } }), "renewal", UWG)).toMatchObject({ ok: false, reason: "E-Mail abgemeldet" });
  });
  it("Bitte um Einwilligung per E-Mail nur, wenn ein anderer Weg zulässig ist", () => {
    expect(consentRequestByMailAllowed(subject(), NO_UWG)).toBe(false);
    expect(consentRequestByMailAllowed(subject(), UWG)).toBe(true);
    expect(consentRequestByMailAllowed(subject({ emailConsent: "nein" }), UWG)).toBe(false);
    expect(consentRequestByMailAllowed(subject({ emailOptOutAt: D("2026-11-01") }), UWG)).toBe(false);
  });
  it("Ohne Nachweis zum Widerspruchshinweis greift § 7 Abs. 3 nicht: E-Mail nur mit Einwilligung, Bitte um Einwilligung nicht per E-Mail", () => {
    const ohne = subject({ widerspruchHinweis: null });
    expect(emailDecision(ohne, "renewal", UWG)).toEqual({ ok: false, reason: NO_PROOF_REASON });
    expect(emailDecision(subject({ widerspruchHinweis: "nein" }), "review", UWG)).toEqual({ ok: false, reason: NO_PROOF_REASON });
    expect(emailDecision(subject({ widerspruchHinweis: null, emailConsent: "ja" }), "renewal", UWG)).toEqual({ ok: true, basis: "einwilligung" });
    expect(consentRequestByMailAllowed(ohne, UWG)).toBe(false);
    expect(lacksUwgProof(ohne)).toBe(true);
    expect(lacksUwgProof(subject())).toBe(false);
    expect(lacksUwgProof(subject({ widerspruchHinweis: null, emailConsent: "ja" }))).toBe(false);
    expect(lacksUwgProof(subject({ widerspruchHinweis: null, email: null }))).toBe(false);
    expect(lacksUwgProof(subject({ widerspruchHinweis: null, emailOptOutAt: D("2026-11-01") }))).toBe(false);
  });
  it("Zählung „X ohne Nachweis, nur mit Einwilligung“ (nicht für Kunden, die WhatsApp bekommen)", () => {
    const subs = [subject({ widerspruchHinweis: null }), subject({ widerspruchHinweis: null, whatsappConsent: "ja" }), subject(), subject({ widerspruchHinweis: null, emailConsent: "ja" })];
    const c = countAudience(
      subs.map((s) => chooseChannel("whatsapp_first", s, "renewal", UWG)),
      subs,
    );
    expect(c).toMatchObject({ whatsapp: 1, email: 2, emailUwg: 1, noProof: 1, excludedTotal: 1, excluded: { [NO_PROOF_REASON]: 1 } });
  });
  it("§ 7 Abs. 3 eng: nur dieselbe Sparte ist ähnlich; Cross-Selling ohne Einwilligung nie, auch mit Nachweis", () => {
    expect(isSimilarLine("KFZ", "KFZ")).toBe(true);
    expect(isSimilarLine("Haftpflicht", "Kranken")).toBe(false); // Haftpflicht → Zahnzusatz
    expect(isSimilarLine("Hausrat", "Wohngebäude")).toBe(false); // Sachsparten untereinander nur mit Einwilligung
    expect(isSimilarLine("Haftpflicht", "Hausrat")).toBe(false);
    expect(isSimilarLine("Sonstiges", "Sonstiges")).toBe(false);
    expect(emailDecision(subject(), "cross_sell", UWG)).toMatchObject({ ok: false });
    expect(emailDecision(subject(), "birthday", UWG)).toMatchObject({ ok: false });
  });
  it("Ablauf/Wechsel nennt die Sparte des eigenen ablaufenden Vertrags", () => {
    expect(renewalTopic("KFZ", "Hausrat")).toBe("Kfz-Versicherung");
    expect(renewalTopic("Tier", null)).toBe("Tier");
    expect(renewalTopic(null, "Hausrat")).toBe("Hausrat");
    expect(renewalTopic("Sonstiges", null)).toBeNull();
  });
  it("Import: Spalte „Hinweis auf Widerspruchsrecht“ (ja, nein, Datum; „nein“ geht vor)", () => {
    const g = groupRows(
      [
        { Nr: "1", Mail: "a@test.local", Hinweis: "ja", Sparte: "KFZ" },
        { Nr: "1", Mail: "a@test.local", Hinweis: "nein", Sparte: "Hausrat" },
        { Nr: "2", Mail: "b@test.local", Hinweis: "03.05.2024", Sparte: "KFZ" },
        { Nr: "3", Mail: "c@test.local", Hinweis: "", Sparte: "KFZ" },
      ],
      { externalNo: "Nr", email: "Mail", widerspruchHinweis: "Hinweis", line: "Sparte" },
    );
    expect(g.groups.get("1")?.widerspruchHinweis).toBe("nein");
    expect(g.groups.get("2")?.widerspruchHinweis).toBe("ja");
    expect(g.groups.get("2")?.widerspruchHinweisAt?.toISOString().slice(0, 10)).toBe("2024-05-03");
    expect(g.groups.get("3")?.widerspruchHinweis).toBeNull();
    expect(g.consent).toMatchObject({ hinweisJa: 1, hinweisNein: 1 });
  });
  it("Importwerte: ja, nein, Datum, leer", () => {
    expect(["ja", "X", "1", "true", "01.02.2024", "2024-02-01"].map(parseConsent)).toEqual(["ja", "ja", "ja", "ja", "ja", "ja"]);
    expect(["nein", "0", "keine", "widerrufen"].map(parseConsent)).toEqual(["nein", "nein", "nein", "nein"]);
    expect(["", "vielleicht", null].map(parseConsent)).toEqual([null, null, null]);
  });
  it("Import: Spalten E-Mail- und WhatsApp-Einwilligung werden je Kunde übernommen, „nein“ geht vor", () => {
    const rows = [
      { Nr: "1", Mail: "a@test.local", Mobil: "0151 1111111", "E-Mail-Einwilligung": "ja", "WhatsApp-Einwilligung": "01.03.2025", Sparte: "KFZ" },
      { Nr: "1", Mail: "a@test.local", Mobil: "0151 1111111", "E-Mail-Einwilligung": "nein", "WhatsApp-Einwilligung": "", Sparte: "Kranken" },
      { Nr: "2", Mail: "b@test.local", Mobil: "", "E-Mail-Einwilligung": "", "WhatsApp-Einwilligung": "", Sparte: "Hausrat" },
    ];
    const g = groupRows(rows, { externalNo: "Nr", email: "Mail", phone: "Mobil", emailConsent: "E-Mail-Einwilligung", whatsappConsent: "WhatsApp-Einwilligung", line: "Sparte" });
    const a = g.groups.get("1")!;
    expect(a.emailConsent).toBe("nein");
    expect(a.whatsappConsent).toBe("ja");
    expect(a.whatsappConsentAt?.toISOString().slice(0, 10)).toBe("2025-03-01");
    expect(g.groups.get("2")!.emailConsent).toBeNull();
    expect(g.consent).toEqual({ emailJa: 0, emailNein: 1, whatsappJa: 1, whatsappNein: 0, hinweisJa: 0, hinweisNein: 0 });
    expect(g.withPersonLines).toBe(1);
  });
});

describe("WhatsApp strikt: ohne Opt-in keine Kampagne", () => {
  it("auch nicht im § 7 Abs. 3 UWG-Modus und nicht bei Anlässen zum selben Vertrag", () => {
    for (const o of ["renewal", "review", "cross_sell"] as const) {
      expect(chooseChannel("whatsapp", subject(), o, UWG).channel).toBeNull();
    }
    expect(whatsappDecision(subject({ whatsappConsent: "nein" }))).toEqual({ ok: false, reason: "WhatsApp-Einwilligung: nein" });
    expect(whatsappDecision(subject({ whatsappConsent: "ja", optOutAt: D("2026-11-01") }))).toEqual({ ok: false, reason: "abgemeldet" });
    expect(whatsappDecision(subject({ whatsappConsent: "ja", suppressed: { all: true } }))).toEqual({ ok: false, reason: "abgemeldet" });
    expect(whatsappDecision(subject({ whatsappConsent: "ja" }))).toEqual({ ok: true, basis: "einwilligung" });
  });
});

describe("Segmente", () => {
  const now = D("2026-11-16T10:00:00Z");
  it("Cross-Selling, Ablauf, Geburtstag, Empfehlungsbitte einmal im Jahr", () => {
    const c = { lines: ["KFZ"], birthday: D("1980-11-20"), nextRenewal: D("2026-12-01"), referralLink: { lastSentAt: D("2026-06-01") } };
    expect(inSegment(c, "cross_sell", { has: ["KFZ"], lacks: ["Hausrat"] }, now)).toBe(true);
    expect(inSegment(c, "cross_sell", { has: ["KFZ"], lacks: ["KFZ"] }, now)).toBe(false);
    expect(inSegment(c, "renewal", { renewalDays: 30 }, now)).toBe(true);
    expect(inSegment(c, "birthday", { birthdayDays: 3 }, now)).toBe(false);
    expect(inSegment(c, "birthday", { birthdayDays: 7 }, now)).toBe(true);
    expect(inSegment(c, "empfehlung", {}, now)).toBe(false);
  });
});

describe("Drosselung E-Mail", () => {
  const fresh: ThrottleState = { backoff: 0, errors: 0, pausedUntil: null, nextAt: null, issueAt: null };
  const MON_10 = D("2026-11-16T09:00:00Z"); // Montag 10 Uhr Berlin
  it("Tageslimit je Anbieter, halbiert je Stufe", () => {
    expect(providerDailyLimit("google", "x@gmail.com")).toBe(150);
    expect(providerDailyLimit("google", "x@agentur.de")).toBe(1000);
    expect(providerDailyLimit("microsoft", "x@outlook.de")).toBe(100);
    expect(providerDailyLimit("microsoft", "x@agentur.de")).toBe(300);
    expect(providerDailyLimit("smtp", "x@agentur.de")).toBe(200);
    expect(effectiveDailyLimit(150, 1)).toBe(75);
    expect(effectiveDailyLimit(100, 4)).toBe(10);
  });
  it("Zeitfenster werktags 8 bis 18 Uhr Berlin", () => {
    expect(inMailWindow(MON_10)).toBe(true);
    expect(inMailWindow(D("2026-11-16T06:30:00Z"))).toBe(false); // 7:30
    expect(inMailWindow(D("2026-11-16T17:10:00Z"))).toBe(false); // 18:10
    expect(inMailWindow(D("2026-11-21T10:00:00Z"))).toBe(false); // Samstag
  });
  it("Höchstens 3 je Lauf, Zufallsabstand, Tageslimit", () => {
    expect(mailSlots(fresh, { sentToday: 0, baseLimit: 150, now: MON_10 })).toBe(3);
    expect(mailSlots(fresh, { sentToday: 149, baseLimit: 150, now: MON_10 })).toBe(1);
    expect(mailSlots(fresh, { sentToday: 150, baseLimit: 150, now: MON_10 })).toBe(0);
    const after = afterSend(fresh, "ok", MON_10, 0.5).state;
    expect(after.nextAt!.getTime() - MON_10.getTime()).toBe(6 * 60_000);
    expect(mailSlots(after, { sentToday: 1, baseLimit: 150, now: MON_10 })).toBe(0);
    expect(mailSlots(after, { sentToday: 1, baseLimit: 150, now: new Date(MON_10.getTime() + 7 * 60_000) })).toBe(3);
  });
  it("Fehler und Bounces drosseln, nach 3 Fehlern Pause mit Warnung, nach 2 ruhigen Tagen eine Stufe zurück", () => {
    let s = fresh;
    s = afterSend(s, "error", MON_10, 0).state;
    s = afterSend(s, "error", MON_10, 0).state;
    const third = afterSend(s, "error", MON_10, 0);
    expect(third.warn).toMatch(/dreimal hintereinander/);
    expect(third.state.backoff).toBe(1);
    expect(third.state.pausedUntil!.getTime() - MON_10.getTime()).toBe(2 * 3_600_000);
    const b = afterSend(fresh, "bounce", MON_10, 0).state;
    expect(b.backoff).toBe(1);
    const later = afterSend({ ...b, nextAt: null }, "ok", new Date(MON_10.getTime() + 3 * 86_400_000), 0).state;
    expect(later.backoff).toBe(0);
  });
  it("Mehr als 5 % Bounces (ab 20 Mails): 24 Stunden Pause und Warnung", () => {
    expect(bounceCheck(fresh, 19, 5, MON_10).warn).toBeNull();
    expect(bounceCheck(fresh, 100, 5, MON_10).warn).toBeNull();
    const r = bounceCheck(fresh, 100, 6, MON_10);
    expect(r.warn).toMatch(/unzustellbar/);
    expect(r.state.pausedUntil!.getTime() - MON_10.getTime()).toBe(86_400_000);
  });
  it("Sofortige Ablehnung des Mailservers ist ein Bounce", () => {
    expect(isBounceError("550 5.1.1 <x@y.de>: Recipient address rejected: User unknown")).toBe(true);
    expect(isBounceError("Invalid login: 535 Authentication failed")).toBe(false);
  });
});

describe("Antwortzuordnung", () => {
  it("Bounce, Abwesenheit, Abmeldung, Absage, Interesse", () => {
    expect(classifyCampaignReply("Undeliverable: Ihr Vertragscheck", "Delivery has failed")).toBe("bounce");
    expect(classifyCampaignReply("Mail delivery failed", "mailer-daemon: user unknown")).toBe("bounce");
    expect(classifyCampaignReply("Automatische Antwort: Abwesend", "Ich bin bis 20.11. nicht im Büro.")).toBe("auto");
    expect(classifyCampaignReply("Re: Ihr Vertragscheck", "Bitte keine E-Mails mehr, danke.")).toBe("stop");
    expect(classifyCampaignReply("Re: Ihr Vertragscheck", "Kein Interesse, danke.")).toBe("negativ");
    expect(classifyCampaignReply("Re: Ihr Vertragscheck", "Gerne, rufen Sie mich nächste Woche an.")).toBe("interesse");
  });
});

const rec = (o: Partial<FunnelRecipient> = {}): FunnelRecipient => ({
  channel: "whatsapp",
  status: "sent",
  reason: null,
  sentAt: D("2026-11-02"),
  deliveredAt: null,
  readAt: null,
  bouncedAt: null,
  repliedAt: null,
  leadId: null,
  optOutAt: null,
  appointment: false,
  ...o,
});

describe("Trichter je Kanal", () => {
  it("WhatsApp mit Zustellung und Lesebestätigung, E-Mail ohne Tracking, Gründe für übersprungen", () => {
    const f = funnelOf(
      [
        rec({ deliveredAt: D("2026-11-02"), readAt: D("2026-11-02"), repliedAt: D("2026-11-03"), leadId: "l1", appointment: true, status: "replied" }),
        rec({ deliveredAt: D("2026-11-02") }),
        rec({ status: "replied", repliedAt: D("2026-11-03"), reason: "Stopp", optOutAt: D("2026-11-03") }),
        rec({ channel: "email" }),
        rec({ channel: "email", status: "failed", reason: "unzustellbar", bouncedAt: D("2026-11-02"), sentAt: null }),
        rec({ channel: "email", status: "skipped", reason: "E-Mail abgemeldet", sentAt: null }),
        rec({ channel: "email", status: "queued", sentAt: null }),
      ],
      [{ sparte: "hausrat", premium: 200, provisionValue: null, campaignChannel: "whatsapp" }],
    );
    expect(f.whatsapp).toMatchObject({ angeschrieben: 3, zugestellt: 2, gelesen: 1, geantwortet: 2, lead: 1, termin: 1, abschluss: 1, abgemeldet: 1 });
    expect(f.email).toMatchObject({ angeschrieben: 1, zugestellt: 1, gelesen: null, unzustellbar: 1, fehlgeschlagen: 1, uebersprungen: 1, wartend: 1, abschluss: 0 });
    expect(f.email.gruende).toEqual({ unzustellbar: 1, "E-Mail abgemeldet": 1 });
    expect(f.gesamt.angeschrieben).toBe(4);
    expect(f.gesamt.gelesen).toBeNull();
    expect(quote(f.whatsapp.geantwortet, f.whatsapp.angeschrieben)).toBe(66.7);
  });
  it("Ertrag: Provision minus WhatsApp-Gebühren, € pro angeschriebenem Kunden", () => {
    const f = funnelOf([rec(), rec()], [{ sparte: "hausrat", premium: 200, provisionValue: null, campaignChannel: "whatsapp" }]);
    const e = ertragOf(f.gesamt, 0.23);
    expect(e.ergebnis).toBe(Math.round((f.gesamt.provision - 0.23) * 100) / 100);
    expect(e.proAngeschrieben).toBe(Math.round((e.ergebnis / 2) * 100) / 100);
  });
  it("Provision je Sparte: Rate der verkauften Sparte", () => {
    const rates = { privatschutz: { kind: "percent" as const, rate: 0.5, defaultPremium: 100 }, kfz: { kind: "percent" as const, rate: 0.1, defaultPremium: 100 } };
    const f = funnelOf([rec()], [
      { sparte: "hausrat", premium: 200, provisionValue: null, campaignChannel: "email" },
      { sparte: "kfz", premium: 200, provisionValue: null, campaignChannel: "email" },
    ], rates as never);
    expect(Object.keys(f.email.sparten).length).toBe(2);
    expect(f.email.abschluss).toBe(2);
    // Hausrat mit 50 %, Kfz mit 10 %
    expect(f.email.provision).toBeGreaterThan(100);
  });
  it("Vergleich nach Anlass und Thema", () => {
    const s = (occasion: string, topic: string | null, n: number) =>
      ({ occasion, topic, funnel: funnelOf(Array.from({ length: n }, () => rec()), []) }) as unknown as CampaignStats;
    const g = groupStats([s("cross_sell", "Hausrat", 3), s("cross_sell", "Rechtsschutz", 2), s("renewal", null, 1)], "occasion", (k) => k);
    expect(g.map((x) => [x.key, x.campaigns, x.angeschrieben])).toEqual([["cross_sell", 2, 5], ["renewal", 1, 1]]);
    expect(groupStats([s("renewal", null, 1)], "topic", (k) => k)[0].key).toBe("ohne Thema");
  });
});

describe("60-Tage-Zuordnung, letzte Kampagne zählt, keine Doppelzählung", () => {
  const sends = [
    { campaignId: "A", sentAt: D("2026-08-01"), channel: "whatsapp" },
    { campaignId: "B", sentAt: D("2026-09-01"), channel: "email" },
  ];
  it("letzte Kampagne vor dem Abschluss, höchstens 60 Tage", () => {
    expect(attributeToCampaign(D("2026-09-10"), sends)).toBe("B");
    expect(attributeToCampaign(D("2026-08-20"), sends)).toBe("A");
    expect(attributeToCampaign(D("2026-07-30"), sends)).toBeNull();
    expect(attributeToCampaign(D("2026-10-31"), sends)).toBe("B"); // 60 Tage
    expect(attributeToCampaign(D("2026-11-01"), sends)).toBeNull(); // 61 Tage
  });
  it("Empfehlung bleibt Empfehlung, erster Vertrag eines bezahlten Leads bleibt bezahlt, Cross-Selling zählt für die Kampagne", () => {
    expect(attributeContract("empfehlung", { primary: false, signedAt: D("2026-09-10") }, sends)).toEqual({ campaignId: null, campaignChannel: null, origin: "empfehlung" });
    expect(attributeContract("paid", { primary: true, signedAt: D("2026-09-10") }, sends)).toEqual({ campaignId: null, campaignChannel: null, origin: "paid" });
    expect(attributeContract("paid", { primary: false, signedAt: D("2026-09-10") }, sends)).toEqual({ campaignId: "B", campaignChannel: "email", origin: "bestand" });
    expect(attributeContract("bestand", { primary: true, signedAt: D("2027-01-10") }, sends)).toEqual({ campaignId: null, campaignChannel: null, origin: "bestand" });
    expect(contractOrigin("empfehlung", { primary: false, campaignId: "B" })).toBe("empfehlung");
  });
  it("Zahlen: Bestandskampagnen getrennt, Empfehlungen nicht doppelt", () => {
    const base = { leadId: "l1", primary: false, sparte: "hausrat" as const, premium: 200, provisionValue: null, signedAt: D("2026-11-05"), periodAt: D("2026-11-05"), assignedUserId: null, leadCreatedAt: D("2026-01-01") };
    const contracts: CustomerContract[] = [
      { ...base, id: "1", origin: "bestand", campaignId: "B" },
      { ...base, id: "2", leadId: "l2", origin: "empfehlung", campaignId: null },
      { ...base, id: "3", leadId: "l3", primary: true, origin: "paid", campaignId: null },
    ];
    const p = summarizeProvision(contracts, undefined, { from: D("2026-11-01"), to: D("2026-11-30") });
    expect(p.byOrigin.bestand.contracts).toBe(1);
    expect(p.byOrigin.empfehlung.contracts).toBe(1);
    expect(p.byOrigin.paid.contracts).toBe(1);
    expect(p.contracts).toBe(3);
  });
});

describe("Kampagnen-Mail", () => {
  it("Bestandskunden gesiezt: „Guten Tag Frau Muster,“ bzw. „Guten Tag,“ ohne Namen", () => {
    const t = fillCampaignMail(defaultCampaignMail("renewal"), { kontakt: { firstName: "Erika", lastName: "Muster", salutation: "Frau" }, thema: "Kfz-Versicherung", meinname: "Susanne Meier" });
    expect(t.body.startsWith("Guten Tag Frau Muster,\n\nIhr Vertrag Kfz-Versicherung verlängert sich bald.")).toBe(true);
    expect(t.subject).toBe("Ihr Vertrag Kfz-Versicherung verlängert sich bald");
    expect(fillCampaignMail(defaultCampaignMail("review"), { kontakt: null, meinname: "S" }).body.startsWith("Guten Tag,\n\n")).toBe(true);
    // Du-Fassung liegt ebenfalls vor
    expect(fillCampaignMail(defaultCampaignMail("review", "du"), { ansprache: "du", kontakt: { firstName: "Erika" }, meinname: "S" }).body.startsWith("Hallo Erika,")).toBe(true);
  });
  it("Keine Gedankenstriche, Abmeldelink und Pflichtangaben unten, HTML ohne Bilder", () => {
    for (const o of ["cross_sell", "review", "birthday", "renewal", "empfehlung"] as const) {
      for (const an of ["sie", "du"] as const) {
        const d = defaultCampaignMail(o, an);
        expect(`${d.subject}${d.body}`).not.toMatch(/[–—]/);
      }
    }
    const footer = campaignMailFooter({ firm: "Agentur Meier", unsubscribeUrl: "https://app.test/abmelden/x", imprint: "Agentur Meier\nHauptstr. 1" });
    expect(footer).toContain("https://app.test/abmelden/x");
    expect(footer).not.toMatch(/[–—]/);
    const m = buildCampaignMail("Guten Tag,\n\nText", footer);
    expect(m.text).toContain("Hauptstr. 1");
    expect(m.html).toContain('<a href="https://app.test/abmelden/x">');
    expect(m.html).not.toMatch(/<img/i);
    expect(ohneGedankenstriche("Hallo – wie geht es? 1–3 Tage")).toBe("Hallo, wie geht es? 1–3 Tage");
    expect(imprintFromWebsiteInfo({ companyName: "Agentur Meier", address: "Hauptstr. 1, 12345 Ort", registerNumber: "D-ABC" })).toBe("Agentur Meier\nHauptstr. 1, 12345 Ort\nVermittlerregister: D-ABC");
  });
});

describe("Hinweise zu WhatsApp-Vorlagen", () => {
  const rows = (status: string) => [{ purpose: "campaign_review", status }];
  it("nicht verbunden: nur ein Hinweis zum Verbinden", () => {
    expect(templateNotice(false, rows("approved"), ["campaign_review"], "kampagne")).toMatchObject({ kind: "connect", href: "/buyer/einrichtung#whatsapp" });
  });
  it("eingereicht bzw. fehlt: Kampagne vorbereiten, startet nach Freigabe; fehlt → automatisch einreichen", () => {
    expect(templateNotice(true, rows("pending"), ["campaign_review"], "kampagne")?.text).toMatch(/startet nach der Freigabe automatisch/);
    expect(templateNotice(true, [], ["campaign_review"], "kampagne")?.kind).toBe("pending");
    expect(needsSubmit(true, [], ["campaign_review"])).toBe(true);
    expect(needsSubmit(false, [], ["campaign_review"])).toBe(false);
    expect(needsSubmit(true, rows("pending"), ["campaign_review"])).toBe(false);
  });
  it("abgelehnt: wir kümmern uns; freigegeben: kein Hinweis; nie „melden Sie sich“", () => {
    expect(templateNotice(true, rows("rejected"), ["campaign_review"], "kampagne")?.text).toMatch(/abgelehnt, wir kümmern uns darum/);
    expect(templateNotice(true, rows("approved"), ["campaign_review"], "kampagne")).toBeNull();
    expect(templateState([...rows("rejected"), ...rows("approved")], "campaign_review")).toBe("freigegeben");
    for (const s of ["pending", "rejected", "approved"]) {
      const n = templateNotice(true, rows(s), ["campaign_review"], "empfehlung");
      expect(n?.text ?? "").not.toMatch(/melden Sie sich|[–—]/);
    }
  });
});

describe("Paket 3: Einwilligung als Umsatzhebel", () => {
  const now = D("2026-11-20T10:00:00Z");

  it("Für Angebote erreichbar nur mit Einwilligung, § 7 Abs. 3 allein reicht nicht", () => {
    expect(reachableForOffers(subject({ whatsappConsent: "ja" }))).toBe(true);
    expect(reachableForOffers(subject({ emailConsent: "ja" }))).toBe(true);
    expect(reachableForOffers(subject())).toBe(false);
    expect(reachableForOffers(subject({ emailConsent: "ja", emailOptOutAt: now }))).toBe(false);
    expect(reachableForOffers(subject({ whatsappConsent: "ja", optOutAt: now }))).toBe(false);
    expect(reachableForOffers(subject({ whatsappConsent: "ja", blockedAt: now }))).toBe(false);
    expect(countsForReach(subject({ optOutAt: now }))).toBe(false);
    expect(countsForReach(subject({ email: null, phone: null }))).toBe(false);
  });

  it("Sammelanfrage überspringt Abgemeldete, Gesperrte, Sperrliste und Kunden ohne Werbeerlaubnis", () => {
    const ok = (o: Partial<ConsentSubject>, settings = UWG, last: Date | null = null) => consentAskEligible(subject(o), settings, last, now);
    // mit § 7 Abs. 3 (Bestätigung und Nachweis), noch ohne Einwilligung: ja
    expect(ok({})).toBe(true);
    // abgemeldet (alle Kanäle oder nur E-Mail), gesperrt, Sperrliste
    expect(ok({ optOutAt: now })).toBe(false);
    expect(ok({ emailOptOutAt: now })).toBe(false);
    expect(ok({ blockedAt: now })).toBe(false);
    expect(ok({ suppressed: { email: true } })).toBe(false);
    expect(ok({ suppressed: { all: true } })).toBe(false);
    // ohne Werbeerlaubnis per E-Mail: Bestätigung fehlt, Nachweis fehlt, „nein“, keine Adresse
    expect(ok({}, NO_UWG)).toBe(false);
    expect(ok({ widerspruchHinweis: null })).toBe(false);
    expect(ok({ widerspruchHinweis: "nein" })).toBe(false);
    expect(ok({ emailConsent: "nein" })).toBe(false);
    expect(ok({ email: null })).toBe(false);
    // schon erreichbar: keine Bitte nötig
    expect(ok({ emailConsent: "ja" })).toBe(false);
    expect(ok({ whatsappConsent: "ja" })).toBe(false);
    // 30 Tage Abstand
    const days = (n: number) => new Date(now.getTime() - n * 86_400_000);
    expect(ok({}, UWG, days(CONSENT_ASK_GAP_DAYS - 1))).toBe(false);
    expect(ok({}, UWG, days(CONSENT_ASK_GAP_DAYS))).toBe(true);
  });

  it("Kennzahl: Anteil erreichbar und Zahl der anfragbaren Kunden", () => {
    const r = offerReach(
      [
        { subject: subject({ whatsappConsent: "ja" }), lastAskedAt: null },
        { subject: subject({ emailConsent: "ja" }), lastAskedAt: null },
        { subject: subject(), lastAskedAt: null },
        { subject: subject({ widerspruchHinweis: null }), lastAskedAt: null },
        { subject: subject({ optOutAt: now }), lastAskedAt: null },
      ],
      UWG,
      now,
    );
    expect(r).toEqual({ total: 4, reachable: 2, share: 0.5, withoutConsent: 2, askable: 1 });
    expect(offerReach([], UWG, now).share).toBe(0);
  });

  it("P.S. mit Einwilligungslink nur bei Werbeerlaubnis per E-Mail und fehlender Einwilligung", () => {
    // § 7 Abs. 3 mit Nachweis, ohne Einwilligung: ja
    expect(wantsConsentPs(subject(), UWG, "renewal")).toBe(true);
    // ohne Erlaubnis nie
    expect(wantsConsentPs(subject(), NO_UWG, "renewal")).toBe(false);
    expect(wantsConsentPs(subject({ widerspruchHinweis: null }), UWG, "review")).toBe(false);
    expect(wantsConsentPs(subject({ emailOptOutAt: now }), UWG, "renewal")).toBe(false);
    expect(wantsConsentPs(subject({ blockedAt: now }), UWG, "renewal")).toBe(false);
    // E-Mail-Einwilligung da, WhatsApp offen mit Mobilnummer: ja; WhatsApp „nein“ oder keine Nummer: nein
    expect(wantsConsentPs(subject({ emailConsent: "ja" }), NO_UWG, "cross_sell")).toBe(true);
    expect(wantsConsentPs(subject({ emailConsent: "ja", whatsappConsent: "nein" }), UWG, "cross_sell")).toBe(false);
    expect(wantsConsentPs(subject({ emailConsent: "ja", phone: null }), UWG, "cross_sell")).toBe(false);
    expect(wantsConsentPs(subject({ emailConsent: "ja", whatsappConsent: "ja" }), UWG, "cross_sell")).toBe(false);
    // nicht in Geburtstags- und Empfehlungs-Mails
    expect(wantsConsentPs(subject(), UWG, "birthday")).toBe(false);
    expect(wantsConsentPs(subject({ emailConsent: "ja" }), UWG, "empfehlung")).toBe(false);
  });

  it("P.S.-Zeile in beiden Ansprachen, ohne Gedankenstriche, landet vor dem Fuß", () => {
    const sie = consentPsLine("https://x.test/einwilligung/e1", "sie");
    const du = consentPsLine("https://x.test/einwilligung/e1", "du");
    expect(sie).toMatch(/^P\.S\. .*legen Sie .*https:\/\/x\.test\/einwilligung\/e1$/);
    expect(du).toMatch(/legst du/);
    expect(du).not.toMatch(/\bSie\b|\bIhnen\b/);
    for (const t of [sie, du]) expect(t).not.toMatch(/[–—]/);
    const mail = buildCampaignMail(`Text\n\n${sie}`, campaignMailFooter({ firm: "Agentur", unsubscribeUrl: "https://x.test/abmelden/r1", imprint: "Impressum" }));
    expect(mail.text.indexOf("P.S.")).toBeLessThan(mail.text.indexOf("abmelden"));
  });
});
