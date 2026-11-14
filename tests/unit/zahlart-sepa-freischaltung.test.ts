// SEPA-Lastschrift beim Angebot (Ole, 14.11.2026): Freischaltung und Onboarding warten nicht auf
// die Gutschrift. Checkout „completed“ mit noch nicht eingegangener Lastschrift → Status
// „processing“, Abo-Zeitplan und Onboarding starten sofort. Alles gemockt.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const s = vi.hoisted(() => ({
  updates: [] as Record<string, unknown>[],
  schedules: [] as string[],
  onboarding: [] as string[],
  stages: [] as string[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    stripeEvent: { create: async () => ({}) },
    offer: {
      findFirst: async () => ({ id: "off_1", number: "A-1", company: "Muster GmbH", contactName: "Max", paidAt: null, startDate: null, dealId: null, salesContactId: "sc_1" }),
      findUnique: async () => null,
      update: async (p: { data: Record<string, unknown> }) => {
        s.updates.push(p.data);
        return {};
      },
    },
  },
}));
vi.mock("@/lib/billing", () => ({
  createScheduleForOffer: async (id: string) => {
    s.schedules.push(id);
  },
  cancelScheduleForOffer: async () => {},
}));
vi.mock("@/lib/onboarding", () => ({
  startOnboarding: async (id: string) => {
    s.onboarding.push(id);
    return { ok: true };
  },
}));
vi.mock("@/lib/offer-links", () => ({
  logOfferActivity: async () => {},
  offerAdminHref: () => "/admin",
  setContactCustomerStage: async (_o: unknown, stage: string) => {
    s.stages.push(stage);
  },
}));
vi.mock("@/lib/push", () => ({ sendToAdmins: async () => {} }));
vi.mock("@/lib/pause", () => ({ markPaymentOverdue: async () => {}, markPaymentReceived: async () => {} }));

import { handleStripeEvent } from "@/lib/billing-webhook";

beforeEach(() => {
  s.updates = [];
  s.schedules = [];
  s.onboarding = [];
  s.stages = [];
});

describe("Lastschrift beim Angebot", () => {
  it("Checkout abgeschlossen, Lastschrift noch unterwegs: processing, Abo und Onboarding starten sofort", async () => {
    const session = { id: "cs_1", mode: "payment", payment_status: "unpaid", customer: "cus_1", subscription: null, amount_total: 119000, metadata: {} };
    await handleStripeEvent({ id: "evt_1", type: "checkout.session.completed", data: { object: session } } as unknown as Stripe.Event);
    expect(s.updates[0]).toMatchObject({ paymentStatus: "processing", stripeCustomerId: "cus_1" });
    expect(s.updates[0]).not.toHaveProperty("paidAt");
    expect(s.schedules).toEqual(["off_1"]);
    expect(s.onboarding).toEqual(["off_1"]);
    expect(s.stages).toEqual(["ONBOARDING"]);
  });
});
