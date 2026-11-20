import { beforeEach, describe, expect, it, vi } from "vitest";

// Scheitert nach der Annahme die Stripe-Zahlseite, darf nie „Auftrag bestätigt“ erscheinen (Ole, 19.11.2026):
// Fehler melden, Admins benachrichtigen, auf die Zahlungsansicht mit erneutem Versuch leiten.

const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
const createCheckoutForOffer = vi.fn();
const reportError = vi.fn();
const sendToAdmins = vi.fn(async () => ({ sent: 1, removed: 0, errors: [] }));

vi.mock("next/headers", () => ({ headers: async () => new Map([["user-agent", "test"]]) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));
vi.mock("@/lib/rate-limit", () => ({ checkLimit: () => ({ ok: true }), clientIp: () => "1.2.3.4", RATE_LIMIT_MESSAGE: "x" }));
vi.mock("@/lib/offers", () => ({
  acceptOffer: async () => ({ ok: true }),
  getOfferByToken: async () => ({ id: "o1", number: "PG-2026-0001", salesContactId: "c1", isTest: false, allowPayLater: false }),
}));
vi.mock("@/lib/billing", () => ({ billingEnabled: () => true, createCheckoutForOffer: (...a: unknown[]) => createCheckoutForOffer(...a) }));
vi.mock("@/lib/ueberweisung", () => ({ richteUeberweisungEin: vi.fn(), ueberweisungMoeglich: () => false }));
vi.mock("@/lib/angebot-zahlungserinnerung-server", () => ({ setzeErinnerungPerToken: vi.fn() }));
vi.mock("@/lib/monitoring", () => ({ reportError: (...a: unknown[]) => reportError(...a) }));
vi.mock("@/lib/push", () => ({ sendToAdmins: (...a: unknown[]) => sendToAdmins(...(a as [])) }));

const { acceptOfferAction } = await import("@/app/angebot/[token]/actions");

const form = () => {
  const fd = new FormData();
  fd.set("name", "Max Muster");
  return fd;
};

describe("Annahme: Zahlseite scheitert", () => {
  beforeEach(() => {
    redirect.mockClear();
    reportError.mockClear();
    sendToAdmins.mockClear();
  });

  it("leitet zur Zahlungsansicht mit Fehlerhinweis statt „bestätigt“ zu melden", async () => {
    createCheckoutForOffer.mockResolvedValueOnce({ error: "Stripe nicht erreichbar" });
    await expect(acceptOfferAction("tok", {}, form())).rejects.toThrow("REDIRECT:/angebot/tok?zahlung=fehler#zahlung");
    expect(reportError).toHaveBeenCalledOnce();
    expect(sendToAdmins).toHaveBeenCalledOnce();
  });

  it("leitet bei Erfolg zu Stripe weiter", async () => {
    createCheckoutForOffer.mockResolvedValueOnce({ url: "https://checkout.stripe.test/x" });
    await expect(acceptOfferAction("tok", {}, form())).rejects.toThrow("REDIRECT:https://checkout.stripe.test/x");
    expect(reportError).not.toHaveBeenCalled();
  });
});
