// „An andere E-Mail schicken“ (Ole, 20.11.2026): Einladung von 360dialog an eine andere Adresse, wenn das
// Firmen-Postfach die Mail filtert. Neue Einladung, Adresse gemerkt (Anzeige und Anmeldung), nur der Inhaber.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ ctx: null as null | Record<string, unknown>, calls: [] as { email: string }[], kind: "ok" as "ok" | "exists" | "error" }));
vi.mock("@/lib/buyer-context", () => ({ getBuyerContext: async () => st.ctx }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/whatsapp/dialog360-partner", async (orig) => ({
  ...(await orig<typeof import("@/lib/whatsapp/dialog360-partner")>()),
  partnerConfig: () => ({ partnerId: "p1", apiKey: "k", hubUrl: "https://hub.test", onboardingUrl: "https://app.test/{partner_id}" }),
  createPartnerClient: async (_c: unknown, i: { email: string }) => (st.calls.push(i), st.kind === "ok" ? { kind: "ok", clientId: "neuer_client" } : st.kind === "exists" ? { kind: "exists" } : { kind: "error", status: 400, message: "x" }),
}));

import { prisma } from "@/lib/prisma";
import { inviteOtherEmailAction } from "@/app/buyer/einrichtung/actions";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

describe("WhatsApp-Einladung an andere E-Mail", () => {
  let customerId = "";
  const fd = (email: string) => {
    const f = new FormData();
    f.set("email", email);
    return f;
  };
  beforeAll(async () => {
    requireTestDb();
    const c = await makeCustomer();
    customerId = c.id;
    const u = await makeBuyer(c.id, "owner");
    st.ctx = { customerId, userId: u.id, email: u.email, teamRole: "owner", preview: false };
    await prisma.whatsAppAccount.create({ data: { customerId, status: "invited", dialog360ClientId: "alter_client" } });
  });
  afterAll(async () => cleanupCustomer(customerId));
  beforeEach(() => {
    st.calls = [];
    st.kind = "ok";
  });

  it("legt die Einladung neu an und merkt sich die Adresse", async () => {
    const r = await inviteOtherEmailAction({}, fd(" Henrik.Privat@Example.com "));
    expect(r).toMatchObject({ ok: true, email: "henrik.privat@example.com", vorhanden: false });
    expect(st.calls).toHaveLength(1);
    const acc = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { customerId } });
    expect(acc).toMatchObject({ status: "invited", dialog360ClientId: "neuer_client", dialog360InviteEmail: "henrik.privat@example.com" });
  });
  it("Adresse hat schon ein Konto: Hinweis zum Anmelden, Adresse gemerkt", async () => {
    st.kind = "exists";
    const r = await inviteOtherEmailAction({}, fd("schon@example.com"));
    expect(r).toMatchObject({ ok: true, vorhanden: true });
    expect((await prisma.whatsAppAccount.findUniqueOrThrow({ where: { customerId } })).dialog360InviteEmail).toBe("schon@example.com");
  });
  it("ungültige Adresse, Fehler bei 360dialog und Berater werden abgewiesen", async () => {
    expect((await inviteOtherEmailAction({}, fd("kein-at"))).error).toBeTruthy();
    st.kind = "error";
    expect((await inviteOtherEmailAction({}, fd("neu@example.com"))).error).toMatch(/nicht angenommen/);
    st.ctx = { ...st.ctx, teamRole: "advisor" };
    expect((await inviteOtherEmailAction({}, fd("neu@example.com"))).error).toMatch(/Inhaber/);
    st.ctx = { ...st.ctx, teamRole: "owner" };
  });
});
