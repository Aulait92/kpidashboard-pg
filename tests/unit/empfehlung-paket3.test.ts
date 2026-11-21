// Paket 3 (20.11.2026): öffentliche Seiten, Sofort-Anruf, Dank-Schleife.
// Kontaktseite: Absenden = Einwilligung (Wortlaut + Zeitstempel gespeichert), keine automatische Erstnachricht an
// Empfohlene; Dank mit Link nur mit statusConsent, danach eine Anruf-Aufgabe statt zweiter Nachricht.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    prisma: {
      lead: { findFirst: fn(), findMany: fn(), updateMany: fn(), update: fn(), count: fn(), create: fn() },
      referralLink: { findUnique: fn(), findFirst: fn(), findMany: fn(), update: fn() },
      existingCustomer: { findUnique: fn(), findFirst: fn() },
      leadSource: { findMany: fn() },
      reviewSettings: { findUnique: fn() },
      customer: { findUnique: fn() },
      auditLog: { findMany: fn() },
      conversation: { findUnique: fn() },
    },
    sendWhatsAppNotice: vi.fn(),
    sendWhatsAppMessage: vi.fn(),
    processNewLead: vi.fn(),
    audit: vi.fn(),
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }));
vi.mock("@/lib/audit", () => ({ audit: m.audit }));
vi.mock("@/lib/monitoring", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/whatsapp/templates", () => ({ sendWhatsAppNotice: m.sendWhatsAppNotice, NoTemplateError: class NoTemplateError extends Error {} }));
vi.mock("@/lib/whatsapp/gateway", () => ({ sendWhatsAppMessage: m.sendWhatsAppMessage }));
vi.mock("@/lib/lead-intake", () => ({ processNewLead: m.processNewLead }));
vi.mock("@/lib/lead-anrede", () => ({
  ansprechpartner: vi.fn(async () => null),
  kontaktFromExisting: (e: { firstName?: string | null; lastName?: string | null }) => ({ firstName: e.firstName, lastName: e.lastName }),
}));

import { loadReferralPage, sendReferralThanks, submitReferral } from "@/lib/empfehlung/requests";
import {
  DAY_MS,
  FEEDBACK_CONSENT_TEXT,
  FOLLOWUP_TASK,
  SHARE_AUDIENCES,
  advisorVcard,
  anFromParam,
  contactConsentText,
  contactErrors,
  contactIntro,
  contactLinkIn,
  contactSuccess,
  displayAdvisorPhone,
  empfehlungPush,
  fmtHours,
  gespraechsEinstieg,
  medianHours,
  shareIntro,
  shareText,
  statusConsentText,
  telHref,
  thanksFollowUpNote,
  whatsappRequestText,
  whatsappSelfNote,
} from "@/lib/empfehlung/shared";

const NOW = new Date("2026-11-17T10:00:00Z"); // Dienstag 11 Uhr Berlin (Versandfenster)
const ago = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const DASH = /[–—]/;

const LINK_ROW = {
  id: "link1",
  customerId: "c1",
  kind: "contact",
  token: "emplink33000000000000000",
  lead: { name: "Julia Schneider", erasedAt: null },
  existingCustomer: null,
  customer: {
    name: "Max Muster",
    empfehlungEnabled: true,
    leadAddress: "du",
    bestandAddress: "sie",
    onboarding: { websiteInfo: { privacyUrl: "https://muster.de/datenschutz", phone: "0711 1234567" } },
    whatsAppAccount: { status: "connected", phoneNumber: "4915112345678" },
    erstinformation: null,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  m.prisma.referralLink.findUnique.mockImplementation(async (q: { select?: { lead?: { select?: { phone?: boolean } } } }) =>
    q.select?.lead?.select?.phone ? { lead: { name: "Julia Schneider", phone: "+491555000001" }, existingCustomer: null } : LINK_ROW,
  );
  m.prisma.referralLink.update.mockResolvedValue({});
  m.prisma.leadSource.findMany.mockResolvedValue([]);
  m.prisma.reviewSettings.findUnique.mockResolvedValue(null);
  m.prisma.customer.findUnique.mockResolvedValue({ name: "Max Muster", leadAddress: "sie", bestandAddress: "sie" });
  m.prisma.lead.count.mockResolvedValue(0);
  m.prisma.lead.findFirst.mockResolvedValue(null);
  m.prisma.lead.create.mockResolvedValue({ id: "neu1" });
  m.prisma.lead.updateMany.mockResolvedValue({ count: 1 });
  m.prisma.auditLog.findMany.mockResolvedValue([]);
  m.prisma.referralLink.findMany.mockResolvedValue([]);
  m.prisma.existingCustomer.findUnique.mockResolvedValue(null);
  m.processNewLead.mockResolvedValue(undefined);
  m.sendWhatsAppNotice.mockResolvedValue({ mode: "text", conversationId: "conv1" });
});

describe("Öffentliche Texte: Du und Sie, ohne Gedankenstriche, ohne Versprechen", () => {
  const V = "Max Muster";
  const all = (an: "du" | "sie") => [
    shareIntro(an),
    contactConsentText(V, an),
    contactIntro(V, an),
    whatsappSelfNote(V, an),
    ...Object.values(contactErrors(an)),
    contactSuccess(V, an, true).title,
    contactSuccess(V, an, true).text,
    contactSuccess(V, an, false).text,
    shareText(V, "https://x.de/k", null, an),
    thanksFollowUpNote("Julia", an),
  ];
  it("jede Stelle gibt es in beiden Ansprachen, ohne Gedankenstriche und ohne „Garantie“", () => {
    for (const an of ["du", "sie"] as const) for (const t of all(an)) {
      expect(t).not.toMatch(DASH);
      expect(t).not.toMatch(/garantie/i);
    }
    expect(all("du").join(" ")).not.toMatch(/\b(Sie|Ihnen|Ihre?)\b/);
    expect(all("sie").join(" ")).not.toMatch(/\b(du|dich|dir|deine?)\b/);
  });

  it("Einwilligungssatz am Knopf enthält Wer, Kanäle, Zweck und Widerruf", () => {
    for (const an of ["du", "sie"] as const) {
      const t = contactConsentText("Max Muster", an);
      expect(t).toContain("Max Muster");
      expect(t).toMatch(/Telefon, WhatsApp oder E-Mail/);
      expect(t).toMatch(/zu (deiner|Ihrer) Anfrage/);
      expect(t).toMatch(/Widerruf jederzeit/);
      expect(t).toMatch(/^Mit dem Absenden/);
    }
  });

  it("statusConsent bleibt freiwillig und deckt „Kunde wurde“, nur Vorname", () => {
    const t = statusConsentText("Julia", "Max Muster");
    expect(t).toMatch(/Kunde wurde/);
    expect(t).toMatch(/nur mein Vorname/);
    expect(t).toMatch(/Freiwillig/);
  });

  it("Teilen: Auswahl „An wen?“ mit du als Standard, Link trägt die Ansprache, kein Feld für Daten Dritter", () => {
    expect(SHARE_AUDIENCES.map((x) => x.an)).toEqual(["du", "sie"]);
    expect(contactLinkIn("https://x.de/empfehlung/t/kontakt", "du")).toBe("https://x.de/empfehlung/t/kontakt?an=du");
    expect(contactLinkIn("https://x.de/empfehlung/t/kontakt", "sie")).toBe("https://x.de/empfehlung/t/kontakt");
    expect(anFromParam("du")).toBe("du");
    expect(anFromParam("x")).toBe("sie");
    expect(anFromParam(undefined)).toBe("sie");
    expect(shareIntro("sie")).toMatch(/keine Daten/);
    const page = readFileSync("src/app/empfehlung/[token]/page.tsx", "utf8") + readFileSync("src/components/empfehlung/teilen.tsx", "utf8");
    expect(page).not.toMatch(/<input[^>]+name="(name|email|empfohlen|friend)/);
    expect(page).toContain("Per WhatsApp weiterleiten");
    expect(page).toContain("Gern an mehrere schicken.");
  });

  it("Kontaktseite: Pflichtangaben und rechtlicher Fuß im Quelltext, Einwilligung als Satz statt Häkchen", () => {
    const k = readFileSync("src/app/empfehlung/[token]/kontakt/page.tsx", "utf8");
    expect(k).toContain("contactConsentText(page.vertreter, an)");
    expect(k).toContain("data-referral-privacy");
    expect(k).toContain("Rückruf anfordern");
    expect(k).toContain('name="statusConsent"');
    expect(k).not.toMatch(/name="statusConsent"[^>]*defaultChecked=\{true\}/);
    expect(k).toContain("ReferralShell");
    expect(readFileSync("src/components/empfehlung/public-shell.tsx", "utf8")).toContain("<LeadLegalFooter");
    // Ref-Code bleibt in der vorgeschriebenen WhatsApp-Nachricht
    expect(whatsappRequestText({ vertreter: "Max", recommender: "Julia", offer: null, token: "emplink33000000000000000" })).toContain("(Ref emplink3)");
  });
});

describe("Nummer speichern (vCard) und Anzeige", () => {
  it("vCard mit Namen und wählbarer Nummer, Sonderzeichen maskiert", () => {
    const v = advisorVcard({ name: "Muster; Max, Allianz", phone: "0711 1234567" });
    expect(v).toMatch(/^BEGIN:VCARD\r\nVERSION:3\.0\r\n/);
    expect(v).toContain("FN:Muster\\; Max\\, Allianz");
    expect(v).toContain("TEL;TYPE=CELL,VOICE:07111234567");
    expect(v.trim().endsWith("END:VCARD")).toBe(true);
    expect(advisorVcard({ name: "M", phone: "+49 171 2345678" })).toContain("TEL;TYPE=CELL,VOICE:+491712345678");
    expect(advisorVcard({ name: "M", phone: "4915112345678" })).toContain("TEL;TYPE=CELL,VOICE:+4915112345678");
  });
  it("Anzeige und tel:-Ziel", () => {
    expect(displayAdvisorPhone("4915112345678")).toBe("+49 151 12345678");
    expect(displayAdvisorPhone("0711 1234567")).toBe("0711 1234567");
    expect(displayAdvisorPhone("123")).toBeNull();
    expect(displayAdvisorPhone(null)).toBeNull();
    expect(telHref("0711 1234567")).toBe("tel:07111234567");
    expect(telHref("+49 151 12345678")).toBe("tel:+4915112345678");
  });
  it("Seite liefert die Nummer aus Impressum bzw. WhatsApp und die Ansprache des Empfehlenden", async () => {
    const p = (await loadReferralPage("emplink33000000000000000"))!;
    expect(p.advisorPhone).toBe("0711 1234567");
    expect(p.recommenderAn).toBe("du");
    expect(p.offerDu?.text).toMatch(/deine/);
    m.prisma.referralLink.findUnique.mockResolvedValue({ ...LINK_ROW, customer: { ...LINK_ROW.customer, onboarding: { websiteInfo: {} } } });
    expect((await loadReferralPage("emplink33000000000000000"))!.advisorPhone).toBe("+49 151 12345678");
  });
});

describe("Kontaktseite absenden", () => {
  const input = { name: "Tom Becker", phone: "491701234567", email: null, topic: null, message: null, consent: true, statusConsent: false };

  it("speichert den Wortlaut der Einwilligung mit Zeitstempel, in der Ansprache der Seite", async () => {
    const r = await submitReferral("emplink33000000000000000", { ...input, an: "du" }, NOW);
    expect(r).toEqual({ ok: true, leadId: "neu1" });
    const data = m.prisma.lead.create.mock.calls[0][0].data;
    const e = (data.formData as { label: string; value: string }[]).find((x) => x.label === "Einwilligung")!;
    expect(e.value).toContain(contactConsentText("Max Muster", "du"));
    expect(e.value).toMatch(/17\.11\.26, 11:00/);
    expect(data.referralStatusConsent).toBe(false);
    expect(data.source).toBe("Empfehlung");
  });

  it("keine automatische Erstnachricht an die empfohlene Person, der Vermittler ruft an", async () => {
    await submitReferral("emplink33000000000000000", input, NOW);
    const data = m.prisma.lead.create.mock.calls[0][0].data;
    expect(data.outreachAt).toEqual(NOW);
    expect(data.outreachStatus).toBe("skipped_contact");
    expect(m.sendWhatsAppNotice).not.toHaveBeenCalled();
    expect(m.sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(m.processNewLead).toHaveBeenCalledWith("neu1");
  });

  it("ohne Einwilligung (nur theoretisch, Absenden = Einwilligung) kein Lead", async () => {
    expect(await submitReferral("emplink33000000000000000", { ...input, consent: false }, NOW)).toEqual({ ok: false, error: "consent" });
    expect(m.prisma.lead.create).not.toHaveBeenCalled();
  });

  it("statusConsent nur, wenn angehakt (nie vorausgefüllt), mit Wortlaut", async () => {
    await submitReferral("emplink33000000000000000", { ...input, statusConsent: true }, NOW);
    const data = m.prisma.lead.create.mock.calls[0][0].data;
    expect(data.referralStatusConsent).toBe(true);
    expect(JSON.stringify(data.formData)).toContain("Kunde wurde");
  });
});

describe("Sofort-Anruf: Push und Gesprächseinstieg", () => {
  it("Push „Empfehlung von {Vorname}: jetzt anrufen“ mit Tag empfehlung-lead, ohne Nummern", () => {
    const p = empfehlungPush("lead9", "Julia Schneider");
    expect(p.title).toBe("Empfehlung von Julia: jetzt anrufen");
    expect(p.tag).toBe("empfehlung-lead:lead9");
    expect(p.body).toContain("„Julia hat mir erzählt, dass …“");
    expect(`${p.title} ${p.body}`).not.toMatch(/\d{4,}/);
    expect(p.url).toBe("/buyer/leads/lead9");
    expect(empfehlungPush("x", null).title).toBe("Neue Empfehlung: jetzt anrufen");
    expect(gespraechsEinstieg(null)).not.toMatch(DASH);
  });
  it("Median der Zeit bis zum ersten Anruf", () => {
    expect(medianHours([])).toBeNull();
    expect(medianHours([5, 1, 3])).toBe(3);
    expect(medianHours([1, 2, 3, 10])).toBe(2.5);
    expect(medianHours([NaN, -1, 4])).toBe(4);
    expect(fmtHours(null)).toBe("noch keine Werte");
    expect(fmtHours(0.25)).toBe("15 Min.");
    expect(fmtHours(5)).toBe("5 Std.");
    expect(fmtHours(72)).toBe("3 Tage");
  });
});

describe("Dank-Schleife", () => {
  const referred = (recommender: object) => ({
    id: "ref1",
    customerId: "c1",
    referralLink: {
      id: "link1",
      customerId: "c1",
      leadId: "l1",
      existingCustomerId: null,
      kind: "contact",
      token: "emplink33000000000000000",
      lead: { id: "l1", name: "Julia Schneider", phone: "+491555000001", erasedAt: null, ...recommender },
      existingCustomer: null,
    },
  });
  const CONSENT = { feedbackConsentAt: ago(30), feedbackOptOutAt: null, feedbackConsentText: FEEDBACK_CONSENT_TEXT };

  it("ohne statusConsent der empfohlenen Person geht kein Dank raus (auch keiner ohne Anlassbezug)", async () => {
    m.prisma.lead.findMany.mockResolvedValue([]);
    expect(await sendReferralThanks(NOW)).toBe(0);
    expect(m.prisma.lead.findMany.mock.calls[0][0].where).toMatchObject({ referralStatusConsent: true });
    expect(m.sendWhatsAppNotice).not.toHaveBeenCalled();
  });

  it("Dank mit „Ihr Link funktioniert weiterhin“, danach Anruf-Aufgabe nach 48 h statt zweiter Nachricht", async () => {
    m.prisma.lead.findMany.mockResolvedValue([referred(CONSENT)]);
    m.prisma.lead.findFirst.mockResolvedValue({ name: "Julia Schneider", followUpAt: null });
    expect(await sendReferralThanks(NOW)).toBe(1);
    expect(m.sendWhatsAppNotice).toHaveBeenCalledTimes(1);
    expect(m.sendWhatsAppNotice.mock.calls[0][0].text).toMatch(/Link funktioniert weiterhin/);
    const task = m.prisma.lead.updateMany.mock.calls.find((c) => c[0].data?.followUpNote)?.[0];
    expect(task.where).toMatchObject({ id: "l1", followUpAt: null });
    expect(task.data.followUpAt).toEqual(new Date(NOW.getTime() + 48 * 3600_000));
    expect(task.data.followUpNote).toBe(thanksFollowUpNote("Julia", "sie"));
    expect(task.data.followUpNote.startsWith(FOLLOWUP_TASK)).toBe(true);
  });

  it("über der Obergrenze: Dank ohne Link und ohne Nachfass-Aufgabe", async () => {
    m.prisma.lead.findMany.mockResolvedValue([referred(CONSENT)]);
    m.prisma.auditLog.findMany.mockResolvedValue([{ at: ago(10) }, { at: ago(20) }, { at: ago(30) }]);
    expect(await sendReferralThanks(NOW)).toBe(1);
    expect(m.sendWhatsAppNotice.mock.calls[0][0].text).not.toContain("/empfehlung/");
    expect(m.prisma.lead.updateMany.mock.calls.some((c) => c[0].data?.followUpNote)).toBe(false);
  });
});
