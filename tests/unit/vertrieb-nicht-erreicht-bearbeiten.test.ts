// „Nicht erreicht“ im Vertriebs-CRM: Du/Sie wählbar, Mailtext bearbeitbar (Ole, 23.11.2026). Versand nutzt den
// bearbeiteten Text, der Knopf mit dem Buchungslink bleibt, bearbeitete Sendungen werden vermerkt und zählen nicht im A/B-Test.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  kontakt: null as null | Record<string, unknown>,
  angebot: null as null | { id: string; mailDu: boolean },
  freigegeben: new Set<string>(),
  mail: vi.fn<(o: Record<string, unknown>) => Promise<{ ok: true }>>(async () => ({ ok: true })),
  activity: vi.fn<(a: { data: Record<string, unknown> }) => Promise<object>>(async () => ({})),
  wa: vi.fn<(o: Record<string, unknown>) => Promise<string>>(async () => "sent"),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    salesContact: { findUnique: async () => h.kontakt },
    salesInboundLead: { findFirst: async () => ({ id: "in1" }) },
    salesMeeting: { findFirst: async () => null },
    offer: { findFirst: async () => h.angebot },
    salesEmail: { findFirst: async () => null },
    message: { findFirst: async () => null },
    salesActivity: { findFirst: async () => null, create: h.activity },
    whatsAppAccount: { findUnique: async () => ({ status: "connected", apiKeyEnc: "x" }) },
    conversation: { findUnique: async () => null },
  },
}));
vi.mock("@/lib/email", () => ({ sendCustomerMail: h.mail }));
vi.mock("@/lib/monitoring", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/vertrieb/sperrliste", () => ({ kontaktGesperrt: async () => false }));
vi.mock("@/lib/vertrieb/bonus-erinnerung-server", () => ({ whatsappErlaubtStand: async () => ({ erlaubt: false }) }));
vi.mock("@/lib/vertrieb/followup", () => ({ loadFollowupSettings: async () => ({ bookingUrl: "https://app.example/termin/x" }) }));
vi.mock("@/lib/vertrieb/buchung", () => ({ publicSalesBookingUrl: () => "https://app.example/termin", vertriebsLinkFuerKontakt: async (u: string) => u }));
vi.mock("@/lib/vertrieb/termin-whatsapp", () => ({ supportVorlagenNutzbar: async () => (name: string) => h.freigegeben.has(name) }));
vi.mock("@/lib/telefon-typ", () => ({ istFestnetz: async () => false }));
vi.mock("@/lib/vertrieb/geplante-nachrichten", () => ({
  whatsappHindernis: (o: { phone: string | null; vorlage: boolean }) => (!o.phone ? "no_phone" : !o.vorlage ? "no_template" : null),
}));
vi.mock("@/lib/angebot-zahlungserinnerung-server", () => ({
  sendeVorlageAnKontakt: h.wa,
  vorlagenAnrede: (k: { firstName: string | null; lastName: string | null }, du: boolean) => (du ? k.firstName! : `Herr ${k.lastName}`),
  vorlagenParams: (p: (a: string) => string[], a: string) => p(a),
}));

import { nachNichtErreicht, nichtErreichtVorschau } from "@/lib/vertrieb/nicht-erreicht-server";
import {
  NE_TEMPLATE_NAME,
  NE_TEMPLATE_NAME_B,
  NE_TEMPLATE_NAME_B_DU,
  NE_TEMPLATE_NAME_DU,
  neBearbeitetAusNotiz,
  neFassungAusNotiz,
  neZuteilung,
} from "@/lib/vertrieb/nicht-erreicht";

const ID = "kontakt-1";
const now = new Date("2026-11-23T10:00:00Z");

beforeEach(() => {
  h.kontakt = {
    id: ID,
    email: "max@agentur.de",
    name: "Max Mustermann",
    phone: "+49 170 1234567",
    salutation: "Herr",
    firstName: "Max",
    lastName: "Mustermann",
    customerSource: "INBOUND",
    art17GeloeschtAt: null,
    customer: null,
  };
  h.angebot = null;
  h.freigegeben = new Set([NE_TEMPLATE_NAME, NE_TEMPLATE_NAME_B]);
  h.mail.mockClear();
  h.activity.mockClear();
  h.wa.mockClear();
});

const fassung = () => neZuteilung(ID);
const notiz = (i = 0) => String(h.activity.mock.calls[i][0].data.note);

describe("Vorschau mit Du/Sie", () => {
  it("liefert beide Formen, Standard Sie, WhatsApp-Du erst mit freigegebener Du-Vorlage", async () => {
    const v = await nichtErreichtVorschau(ID, now);
    if ("stopp" in v) throw new Error(v.stopp);
    expect(v.duStandard).toBe(false);
    expect(v.mail?.sie.betreff).toBe("Ich habe Sie gerade nicht erreicht");
    expect(v.mail?.sie.text.startsWith("Guten Tag Herr Mustermann,\n\n")).toBe(true);
    expect(v.mail?.du.betreff).toBe("Ich habe dich gerade nicht erreicht");
    expect(v.mail?.du.text.startsWith("Hallo Max,\n\n")).toBe(true);
    expect(v.mail?.knopf).toBe("Termin aussuchen");
    expect(v.whatsapp?.sie).toContain("Herr Mustermann");
    expect(v.whatsapp?.du).toBeNull();

    h.freigegeben.add(NE_TEMPLATE_NAME_DU).add(NE_TEMPLATE_NAME_B_DU);
    const v2 = await nichtErreichtVorschau(ID, now);
    if ("stopp" in v2) throw new Error(v2.stopp);
    expect(v2.whatsapp?.du).toMatch(/^Hallo Max, .*dich anzurufen/);
  });

  it("Standard Du aus dem letzten Angebot bzw. der Einstellung am Kunden", async () => {
    h.angebot = { id: "o1", mailDu: true };
    const v = await nichtErreichtVorschau(ID, now);
    expect("stopp" in v ? null : v.duStandard).toBe(true);
    h.kontakt = { ...h.kontakt!, customer: { vermittlerDu: false } };
    const v2 = await nichtErreichtVorschau(ID, now);
    expect("stopp" in v2 ? null : v2.duStandard).toBe(false);
  });
});

describe("Versand mit bearbeitetem Text", () => {
  it("nutzt Betreff und Text aus dem Fenster, Knopf bleibt, Vermerk „bearbeitet“ an Mail und WhatsApp", async () => {
    const r = await nachNichtErreicht(ID, now, { mail: true, whatsapp: true }, {
      du: true,
      betreff: "Kurz verpasst",
      text: "Hallo Max,\n\nwir hatten uns verpasst.\n\n\nMelde dich gern.",
    });
    expect(r).toEqual({ mail: "sent", whatsapp: "sent" });
    const m = h.mail.mock.calls[0][0];
    expect(m.subject).toBe("Kurz verpasst");
    expect(m.greeting).toBe("Hallo Max,");
    expect(m.paragraphs).toEqual(["wir hatten uns verpasst.", "Melde dich gern."]);
    expect(m.button).toEqual({ label: "Termin aussuchen", url: "https://app.example/termin/x" });
    expect(notiz()).toContain("Betreff: Kurz verpasst");
    expect(neBearbeitetAusNotiz(notiz())).toBe(true);
    expect(neFassungAusNotiz(notiz())).toBe(fassung());
    expect(notiz()).toMatch(/, Du, bearbeitet$/);
    // Du-Vorlage nicht freigegeben: WhatsApp in Sie-Form, Vermerk trotzdem „bearbeitet“
    const wa = h.wa.mock.calls[0][0];
    expect(wa.du).toBe(false);
    expect(String(wa.activityNote)).toContain(fassung() === "b" ? NE_TEMPLATE_NAME_B : NE_TEMPLATE_NAME);
    expect(neBearbeitetAusNotiz(String(wa.activityNote))).toBe(true);
  });

  it("unveränderter Vorschlag zählt nicht als bearbeitet, Du-Vorlage wird genutzt, wenn freigegeben", async () => {
    h.freigegeben.add(NE_TEMPLATE_NAME_DU).add(NE_TEMPLATE_NAME_B_DU);
    const v = await nichtErreichtVorschau(ID, now);
    if ("stopp" in v || !v.mail) throw new Error("keine Vorschau");
    // nur Leerzeichen am Rand und eine zusätzliche Leerzeile
    await nachNichtErreicht(ID, now, { mail: true, whatsapp: true }, { du: true, betreff: ` ${v.mail.du.betreff} `, text: `${v.mail.du.text.replace("\n\n", "\n\n\n")}\n` });
    const m = h.mail.mock.calls[0][0];
    expect(m.subject).toBe("Ich habe dich gerade nicht erreicht");
    expect(m.greeting).toBe("Hallo Max,");
    expect(neBearbeitetAusNotiz(notiz())).toBe(false);
    expect(notiz()).toMatch(/Fassung [AB], Du$/);
    const wa = h.wa.mock.calls[0][0];
    expect(wa.du).toBe(true);
    expect(String(wa.activityNote)).toContain(fassung() === "b" ? NE_TEMPLATE_NAME_B_DU : NE_TEMPLATE_NAME_DU);
  });

  it("ohne Eingaben wie bisher: Sie-Vorschlag, Vermerk nur „Fassung X“", async () => {
    await nachNichtErreicht(ID, now);
    expect(h.mail.mock.calls[0][0].subject).toBe("Ich habe Sie gerade nicht erreicht");
    expect(notiz()).toMatch(/, Fassung [AB]$/);
  });
});
