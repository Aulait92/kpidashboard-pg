// Vorschau der Angebotsmail (Ole, 20.11.2026): reine Funktion baueAngebotsMail (Betreff, Inhalt je Option,
// Du/Sie, keine Gedankenstriche) und previewOfferEmailAction ohne Seiteneffekte. Alles gemockt.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  offerUpdates: [] as unknown[],
  linkErstellt: 0,
  pdfGeladen: 0,
  verlauf: 0,
  gesendet: [] as { subject: string; html: string; text: string; attachments?: { filename: string }[] }[],
  aktiverLink: null as null | { token: string },
  gesperrt: false,
  offer: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/auth", () => ({ getCurrentSession: async () => ({ userId: "u1", role: "ADMIN", email: "ole@example.com" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    offer: {
      findUnique: async () => s.offer,
      update: async (p: unknown) => {
        s.offerUpdates.push(p);
        return {};
      },
    },
    salesPresentation: { findUnique: async () => ({ fileName: "Vertreter Präsentation" }) },
  },
}));
vi.mock("@/lib/vertrieb/praesentationen", async (orig) => ({
  ...(await orig<typeof import("@/lib/vertrieb/praesentationen")>()),
  getPresentation: async () => {
    s.pdfGeladen++;
    return { fileName: "Vertreter Präsentation", data: new Uint8Array([1, 2, 3]) };
  },
}));
vi.mock("@/lib/vertrieb/verkaufspraesentation-server", () => ({
  aktiverVerkaufsLink: async () => s.aktiverLink,
  verkaufsLinkErstellen: async () => {
    s.linkErstellt++;
    return { token: "tok-neu", bis: new Date(), audience: "vertreter" };
  },
}));
vi.mock("@/lib/vertrieb/entscheidungs-call-server", () => ({
  entscheidungsCallStand: async () => ({ art: "link", url: "https://app.example.com/termin/entscheidung?k=abc" }),
}));
vi.mock("@/lib/vertrieb/sperrliste", () => ({ kontaktGesperrt: async () => s.gesperrt }));
vi.mock("@/lib/offer-links", () => ({
  customerGreeting: async (_o: unknown, du: boolean) => (du ? "Hallo Max," : "Hallo Herr Weber,"),
  logOfferActivity: async () => {
    s.verlauf++;
  },
  offerAdminHref: () => "/admin/x",
}));
vi.mock("@/lib/mail-guard", () => ({
  MAIL_BLOCKED_TEXT: "gesperrt",
  wasBlocked: () => false,
  mailClient: () => ({
    emails: {
      send: async (args: { subject: string; html: string; text: string; attachments?: { filename: string }[] }) => {
        s.gesendet.push(args);
        return { data: { id: "m1" }, error: null };
      },
    },
  }),
}));

import { baueAngebotsMail } from "@/lib/email";
import { hatGedankenstrich } from "@/lib/gedankenstriche";
import { previewOfferEmailAction, sendOfferEmailAction } from "@/app/admin/vertrieb/offer-actions";

const basis = {
  greeting: "Hallo Herr Weber,",
  number: "A-2026-001",
  offerUrl: "https://app.example.com/angebot/tok",
  validUntil: new Date("2026-12-01T12:00:00Z"),
};

describe("baueAngebotsMail", () => {
  it("Sie-Form: Betreff mit Nummer, Link und Gültigkeit", () => {
    const m = baueAngebotsMail(basis);
    expect(m.subject).toBe("Ihr Angebot von performancegrowth (A-2026-001)");
    expect(m.html).toContain('href="https://app.example.com/angebot/tok"');
    expect(m.html).toContain("gültig bis 01.12.2026");
    expect(m.text).toContain("finden Sie Ihr Angebot");
    expect(m.html).not.toContain("Zum Rechner");
    expect(m.html).not.toContain("Zur Präsentation");
    expect(m.html).not.toContain("im Anhang");
  });

  it("Du-Form", () => {
    const m = baueAngebotsMail({ ...basis, greeting: "Hallo Max,", du: true });
    expect(m.subject).toBe("Dein Angebot von performancegrowth (A-2026-001)");
    expect(m.text).toContain("findest du dein Angebot");
    expect(m.text).not.toMatch(/\bSie\b/);
  });

  it("Optionen erscheinen nur, wenn gewählt", () => {
    const m = baueAngebotsMail({
      ...basis,
      rechnerUrl: "https://app.example.com/rechner?typ=vertreter",
      praesentationUrl: "https://app.example.com/praesentation/abc",
      attachment: { filename: "p.pdf" },
      entscheidungsCall: { art: "link", url: "https://app.example.com/termin/entscheidung?k=1" },
      discount: { label: "Empfehlungsrabatt", discount: 500, list: 2000, fee: 1500, anyTerm: false },
      bonus: { betrag: 300, bis: new Date("2026-11-27T22:59:00Z") },
      vorauszahlung: true,
    });
    expect(m.html).toContain("Zum Rechner");
    expect(m.html).toContain("Zur Präsentation");
    expect(m.html).toContain("im Anhang");
    expect(m.html).toContain("termin/entscheidung?k=1");
    expect(m.html).toContain("<s>");
    expect(m.text).toContain("Abschlussbonus");
    expect(m.text).toContain("Zahlung im Voraus");
  });

  it("keine Gedankenstriche, weder Sie noch Du", () => {
    for (const du of [false, true]) {
      const m = baueAngebotsMail({
        ...basis,
        du,
        rechnerUrl: "https://x/r",
        praesentationUrl: "https://x/p",
        attachment: { filename: "p.pdf" },
        entscheidungsCall: { art: "link", url: "https://x/t" },
        bonus: { betrag: 300, bis: new Date("2026-11-27T22:59:00Z") },
        bonusSpaeter: true,
        nachtraeglich: { ersteIso: "2027-01-01", setup: 0 },
      });
      expect(hatGedankenstrich(m.subject)).toBe(false);
      expect(hatGedankenstrich(m.text)).toBe(false);
      expect(hatGedankenstrich(m.html)).toBe(false);
    }
  });
});

describe("previewOfferEmailAction", () => {
  beforeEach(() => {
    process.env.APP_URL = "https://app.example.com";
    process.env.RESEND_API_KEY = "test";
    s.offerUpdates = [];
    s.linkErstellt = 0;
    s.pdfGeladen = 0;
    s.verlauf = 0;
    s.gesendet = [];
    s.aktiverLink = null;
    s.gesperrt = false;
    s.offer = {
      id: "off_1",
      number: "A-2026-001",
      email: "max@example.com",
      status: "draft",
      token: "tok",
      package: "software",
      products: [{ dailyBudget: 30 }],
      salesContactId: "sc_1",
      dealId: null,
      contactName: "Max Weber",
      setupFee: 1500,
      setupListFee: null,
      setupDiscount: null,
      isTest: false,
      abschlussBonus: null,
      allowPayLater: false,
      annualPrepay: false,
      annualChoice: false,
      term: "12m",
      paymentInArrears: false,
      startDate: null,
      validUntil: new Date("2026-12-01T12:00:00Z"),
      sentAt: null,
    };
  });

  const alles = { rechner: true, praesentation: true, praesentationLink: true, audience: "vertreter" as const };

  it("zeigt An, Betreff, Anhang und HTML ohne Seiteneffekte", async () => {
    const r = await previewOfferEmailAction("off_1", alles);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.an).toBe("max@example.com");
    expect(r.betreff).toBe("Ihr Angebot von performancegrowth (A-2026-001)");
    expect(r.anhang).toBe("Vertreter Präsentation.pdf");
    expect(r.html).toContain("/rechner?typ=vertreter&amp;budget=30");
    expect(r.html).toContain("/praesentation/neuer-link");
    // A/B-Test der Angebots-Strecke (lib/vertrieb/ab-tests.ts): ohne Datenbank immer Fassung A
    expect(r.hinweise).toEqual(["Der Präsentations-Link wird beim Senden erstellt.", "A/B-Test: Dieser Kontakt bekommt Fassung A (ohne Absatz zu den nächsten Schritten)."]);
    expect(s.linkErstellt).toBe(0);
    expect(s.pdfGeladen).toBe(0);
    expect(s.offerUpdates).toEqual([]);
    expect(s.verlauf).toBe(0);
    expect(s.gesendet).toEqual([]);
  });

  it("zeigt den bestehenden aktiven Präsentations-Link, Du-Form", async () => {
    s.aktiverLink = { token: "tok-aktiv" };
    const r = await previewOfferEmailAction("off_1", { praesentationLink: true, du: true });
    expect(r.ok && r.html).toContain("/praesentation/tok-aktiv");
    expect(r.ok && r.betreff).toContain("Dein Angebot");
    expect(r.ok && r.hinweise).toEqual(["A/B-Test: Dieser Kontakt bekommt Fassung A (ohne Absatz zu den nächsten Schritten)."]);
  });

  it("gleiche Prüfungen wie beim Senden", async () => {
    s.gesperrt = true;
    expect(await previewOfferEmailAction("off_1")).toMatchObject({ ok: false });
    s.gesperrt = false;
    s.offer = { ...s.offer!, status: "accepted" };
    expect(await previewOfferEmailAction("off_1")).toEqual({ ok: false, error: "Dieses Angebot ist nicht mehr offen." });
    s.offer = { ...s.offer!, status: "draft", email: null };
    expect(await previewOfferEmailAction("off_1")).toMatchObject({ ok: false });
  });

  it("Vorschau entspricht genau der gesendeten Mail", async () => {
    s.aktiverLink = { token: "tok-neu" };
    const v = await previewOfferEmailAction("off_1", alles);
    const r = await sendOfferEmailAction("off_1", alles);
    expect(r.ok).toBe(true);
    expect(s.gesendet).toHaveLength(1);
    expect(v.ok && v.html).toBe(s.gesendet[0].html);
    expect(v.ok && v.betreff).toBe(s.gesendet[0].subject);
    expect(s.gesendet[0].attachments?.[0].filename).toBe("Vertreter Präsentation.pdf");
    expect(s.linkErstellt).toBe(1);
    expect(s.pdfGeladen).toBe(1);
    expect(s.offerUpdates).toHaveLength(1);
  });
});
