// Einrichtung: Schritte in der Kundenakte für den Kunden abhaken (Ole, 20.11.2026). Gespeichert als stepSkips mit Grund
// „admin“; zählt in Checkliste, Kunden-Fortschritt und Erinnerungen als erledigt. Andere Überspringen-Gründe bleiben unberührt.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { customerSetupProgress, NICHT_ABHAKBAR, onboardingChecklist, vonUnsAbgehakt, type OnboardingFull } from "@/lib/onboarding";
import { openCustomerSteps } from "@/lib/selbst-einrichtung";

const ob = (stepSkips: unknown) =>
  ({
    package: "software",
    stepSkips,
    welcomeSentAt: null,
    questionnaireAt: null,
    metaAccessAt: null,
    consentAt: null,
    consentConfirmedAt: null,
    campaignReadyAt: null,
    websiteCheckedAt: null,
    testLeadAt: null,
    liveAt: null,
    websiteInfo: null,
    customer: {
      users: [],
      calendarConnection: null,
      agentConfig: null,
      whatsAppAccount: null,
      messageTemplates: [],
      reviewSettings: null,
      erstinformation: null,
      mailFeaturesOff: false,
      mailAblauf: null,
      existingCustomersEnabled: false,
      empfehlungEnabled: false,
      seatsBilled: 0,
      _count: { existingCustomers: 0 },
    },
  }) as unknown as OnboardingFull;

const at = "2026-11-20T10:00:00.000Z";
const done = (items: { key: string; done: boolean }[], k: string) => items.find((i) => i.key === k)?.done;

describe("Für den Kunden abhaken", () => {
  it("Postfach und Erstinformation gelten als erledigt, wenn wir sie abgehakt haben", () => {
    const vorher = onboardingChecklist(ob(null), null);
    expect([done(vorher, "mailbox"), done(vorher, "erstinfo")]).toEqual([false, false]);
    const nachher = onboardingChecklist(ob({ mailbox: { at, reason: "admin" }, erstinfo: { at, reason: "admin" } }), null);
    expect([done(nachher, "mailbox"), done(nachher, "erstinfo")]).toEqual([true, true]);
    expect(openCustomerSteps(nachher).map((i) => i.key)).not.toContain("mailbox");
    expect(customerSetupProgress(nachher).open.map((i) => i.key)).not.toContain("erstinfo");
  });
  it("Andere Überspringen-Gründe zählen nicht als „von uns abgehakt“", () => {
    expect(vonUnsAbgehakt({ calendar: { at, reason: "spaeter" } }, "calendar")).toBe(false);
    expect(vonUnsAbgehakt({ calendar: { at, reason: "admin" } }, "calendar")).toBe(true);
    expect(vonUnsAbgehakt(null, "calendar")).toBe(false);
  });
  it("Live und Willkommens-Mail sind nicht abhakbar", () => {
    expect(NICHT_ABHAKBAR).toEqual(expect.arrayContaining(["live", "welcome"]));
  });
});

describe("Pflichtangaben ohne Website (Admin Punkt 11, Ole 20.11.2026)", () => {
  const ohneWebsite = (erstinformation: unknown) => {
    const o = ob(null) as unknown as { websiteInfo: unknown; customer: { erstinformation: unknown } };
    o.websiteInfo = { error: "Keine (gültige) Website hinterlegt.", missing: [] };
    o.customer.erstinformation = erstinformation;
    return o as unknown as OnboardingFull;
  };
  it("vollständige Erstinformation: Impressum-Schritt erledigt mit „Erstinformation statt Website“", () => {
    const voll = { registerNummer: "D-ABCD-EFGHI-12", fileName: "erstinfo.pdf", bestaetigtAt: new Date(at) };
    const item = onboardingChecklist(ohneWebsite(voll), null).find((i) => i.key === "website");
    expect(item).toMatchObject({ done: true, note: "Erstinformation statt Website" });
  });
  it("unvollständige Erstinformation: bleibt offen, ohne Zusatz", () => {
    const item = onboardingChecklist(ohneWebsite({ registerNummer: "D-ABCD-EFGHI-12", fileName: "erstinfo.pdf", bestaetigtAt: null }), null).find((i) => i.key === "website");
    expect(item?.done).toBe(false);
    expect(item?.note).toBeUndefined();
  });
});
