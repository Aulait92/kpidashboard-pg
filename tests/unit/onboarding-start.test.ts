import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sent: { text: string; html: string }[] = [];
vi.mock("@/lib/mail-guard", () => ({
  mailClient: () => ({
    emails: {
      send: async (m: { text: string; html: string }) => {
        sent.push(m);
        return { error: null };
      },
    },
  }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { sendOnboardingWelcomeEmail, setupParts } from "@/lib/email";
import { customerSetupProgress, type ChecklistItem } from "@/lib/onboarding";
import { daysUntil, startHeadline } from "@/components/first-day";
import { provisionSetupHint } from "@/lib/provision";
import { pauseOfferLevel } from "@/lib/absence";
import { absenceEffect } from "@/components/absence-sheet";

describe("Ich bin abwesend: Texte und Pause-Angebot", () => {
  it("Einzel-Vertreter: Leads kommen weiter, Termine ab Rückkehr (Sie-Form)", () => {
    const t = absenceEffect(true, true, "Max", "Fr., 13.11.");
    expect(t).toBe("Neue Leads kommen weiter rein – Ihr Assistent schreibt sie an und bietet Termine ab Fr., 13.11. an.");
    expect(t).not.toMatch(/keine neuen Leads/);
  });
  it("Team: keine neuen Leads, sie gehen ans Team", () => {
    expect(absenceEffect(false, true, "Max", "Fr., 13.11.")).toBe("In der Zeit bekommen Sie keine neuen Leads; sie gehen an Ihr Team. Termine erst ab Fr., 13.11.");
    expect(absenceEffect(false, false, "Lena", "Mo., 16.11.")).toMatch(/^In der Zeit bekommt Lena keine neuen Leads/);
  });
  it("Pause ab 3 Tagen dezent, ab 7 Tagen hervorgehoben", () => {
    expect(pauseOfferLevel(2)).toBe("none");
    expect(pauseOfferLevel(3)).toBe("soft");
    expect(pauseOfferLevel(6)).toBe("soft");
    expect(pauseOfferLevel(7)).toBe("strong");
  });
});

describe("Einrichtung: Provisionen prüfen", () => {
  it("fragt nicht mehr nach dem Typ, wenn er aus dem Angebot bekannt ist", () => {
    expect(provisionSetupHint("makler", true)).toMatch(/^Sie arbeiten als Makler/);
    expect(provisionSetupHint("makler", true)).toContain("22,5 %");
    expect(provisionSetupHint("vertreter", true)).toMatch(/^Sie arbeiten als Vertreter/);
    expect(provisionSetupHint("vertreter", true)).not.toMatch(/ob Sie als Vertreter oder Makler/);
    expect(provisionSetupHint("vertreter", false)).toMatch(/ob Sie als Vertreter oder Makler arbeiten/);
  });
});

const item = (key: string, owner: ChecklistItem["owner"], done = false): ChecklistItem => ({ key, label: key, owner, done, at: null });

/** Checkliste wie direkt nach Zahlung + erstem Login (vorher „3 von 11“). */
const fresh = (whatsappOwner: ChecklistItem["owner"] = "kunde"): ChecklistItem[] => [
  item("payment", "kunde", true),
  item("welcome", "auto", true),
  item("login", "kunde", true),
  item("questionnaire", "kunde"),
  item("metaAccess", "kunde"),
  item("calendar", "kunde"),
  item("whatsapp", whatsappOwner),
  item("website", "du"),
  item("campaign", "du"),
  item("testLead", "du"),
  item("live", "du"),
];

describe("customerSetupProgress", () => {
  it("zählt nur aktive Kundenschritte – Zahlung, Login, Willkommens-Mail und unsere Schritte nicht", () => {
    const p = customerSetupProgress(fresh());
    expect(p.steps.map((s) => s.key)).toEqual(["questionnaire", "metaAccess", "calendar", "whatsapp"]);
    expect(p.done).toBe(0);
    expect(p.total).toBe(4);
    expect(p.percent).toBe(0);
    expect(p.complete).toBe(false);
    expect(p.ours.map((s) => s.key)).toEqual(["campaign", "testLead", "live"]);
  });

  it("WhatsApp zählt nur, wenn der Kunde selbst verbindet", () => {
    const p = customerSetupProgress(fresh("du"));
    expect(p.total).toBe(3);
    expect(p.steps.some((s) => s.key === "whatsapp")).toBe(false);
    // … dann erscheint es unter „Unser Teil“
    expect(p.ours.map((s) => s.key)).toEqual(["whatsapp", "campaign", "testLead", "live"]);
  });

  it("Nur-Betreuung: Fragebogen und Meta-Zugriff", () => {
    const p = customerSetupProgress(fresh().filter((i) => !["calendar", "whatsapp"].includes(i.key)));
    expect(p.total).toBe(2);
  });

  it("offene Schritte in Reihenfolge, komplett bei allen erledigt", () => {
    const items = fresh().map((i) => (i.key === "questionnaire" || i.key === "metaAccess" ? { ...i, done: true } : i));
    const p = customerSetupProgress(items);
    expect(p.done).toBe(2);
    expect(p.percent).toBe(50);
    expect(p.open.map((s) => s.key)).toEqual(["calendar", "whatsapp"]);
    const all = customerSetupProgress(fresh().map((i) => (i.owner === "kunde" ? { ...i, done: true } : i)));
    expect(all.complete).toBe(true);
    expect(all.percent).toBe(100);
  });
});

describe("Start-Karte vor Go-live", () => {
  const now = new Date("2026-11-11T10:00:00Z");
  it("zählt Berliner Kalendertage bis zum Start", () => {
    expect(daysUntil(new Date("2026-12-01T00:00:00+01:00"), now)).toBe(20);
    expect(daysUntil(new Date("2026-11-11T23:30:00+01:00"), now)).toBe(0);
    expect(daysUntil(new Date("2026-11-01T00:00:00+01:00"), now)).toBe(0);
  });
  it("positive Überschrift mit Datum und Countdown", () => {
    const h = startHeadline(new Date("2026-12-01T00:00:00+01:00"), now);
    expect(h.title).toBe("Ihr Start am Dienstag, 1. Dezember");
    expect(h.sub).toBe("In 20 Tagen geht es los.");
    expect(startHeadline(new Date("2026-11-12T08:00:00+01:00"), now).sub).toBe("Morgen geht es los.");
    expect(startHeadline(null, now).title).toMatch(/Vorbereitung/);
  });
});

describe("Willkommens-Mail", () => {
  beforeEach(() => {
    sent.length = 0;
    process.env.RESEND_API_KEY = "test";
  });
  afterEach(() => {
    delete process.env.RESEND_API_KEY;
  });

  it("setupParts in Reihenfolge der Einrichtungsseite", () => {
    expect(setupParts(true, true)).toBe("kurzer Fragebogen, Freigabe Ihres Meta-Werbekontos, Kalender verbinden und WhatsApp verbinden");
    expect(setupParts(true, false)).toBe("kurzer Fragebogen, Freigabe Ihres Meta-Werbekontos und Kalender verbinden");
    expect(setupParts(false, true)).toBe("kurzer Fragebogen und Freigabe Ihres Meta-Werbekontos");
  });

  const base = {
    to: "kunde@example.de",
    greeting: "Hallo Herr Test,",
    startDate: new Date("2026-12-01T00:00:00+01:00"),
    products: ["TKV-Katze"],
    setPasswordUrl: "https://app.example.de/reset?t=x",
    loginUrl: "https://app.example.de/login",
    setupUrl: "https://app.example.de/buyer/einrichtung",
  };

  it("nennt WhatsApp verbinden, wenn der Kunde selbst verbindet", async () => {
    const r = await sendOnboardingWelcomeEmail({ ...base, packageType: "software", whatsappSelfConnect: true });
    expect(r.ok).toBe(true);
    expect(sent[0].text).toContain("Kalender verbinden und WhatsApp verbinden");
    expect(sent[0].text).toContain("15-Minuten-Termin");
    expect(sent[0].html).toContain("WhatsApp verbinden");
    expect(sent[0].text).not.toMatch(/Onboarding-Termin/);
  });

  it("ohne Selbst-Verbinden bzw. bei Nur-Betreuung kein WhatsApp-Schritt", async () => {
    await sendOnboardingWelcomeEmail({ ...base, packageType: "software", whatsappSelfConnect: false });
    await sendOnboardingWelcomeEmail({ ...base, packageType: "service", whatsappSelfConnect: true });
    expect(sent[0].text).not.toContain("WhatsApp verbinden");
    expect(sent[1].text).not.toContain("WhatsApp verbinden");
    expect(sent[1].text).not.toContain("Kalender verbinden");
  });
});
