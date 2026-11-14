// KI-Hilfe → „Mit Mensch sprechen“ (Ole, 14.11.2026): Nachricht direkt aus der App senden. Mit Postfach über das
// eigene Postfach, sonst über unseren Versand mit Antwort an den Login; danach Anfrage im Admin, Push an Admins.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { sendToAdmins, sendPlainMail, sendViaPostfach } = vi.hoisted(() => ({
  sendToAdmins: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] as string[] })),
  sendPlainMail: vi.fn(async (_o: { to: string | string[]; subject: string; text: string; replyTo?: string | null }) => ({ ok: true as const })),
  sendViaPostfach: vi.fn(async (_u: string, _m: { to: string; subject: string; text: string }) => ({ ok: true, from: "berater@example.de" }) as { ok: true; from: string } | { ok: false; error: string }),
}));
vi.mock("@/lib/push", () => ({ sendToAdmins }));
vi.mock("@/lib/email", async (orig) => ({ ...(await orig<typeof import("@/lib/email")>()), sendPlainMail }));
vi.mock("@/lib/mail/postfach", async (orig) => ({ ...(await orig<typeof import("@/lib/mail/postfach")>()), sendViaPostfach }));

import { prisma } from "@/lib/prisma";
import { loadSupportRequests, offerEscalation, sendSupportMail } from "@/lib/support-server";
import { hilfeGruss } from "@/lib/hilfe-gruss";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const env = { ...process.env };
let customerId = "";
let userId = "";

describe("KI-Hilfe: Nachricht an das Team aus der App", () => {
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer({ name: "Company GmbH" })).id;
    userId = (await makeBuyer(customerId, "owner")).id;
    process.env.SUPPORT_EMAIL = "support@test.local";
    delete process.env.SUPPORT_WHATSAPP_NUMBER;
  });
  beforeEach(() => {
    sendPlainMail.mockClear();
    sendViaPostfach.mockClear();
    sendToAdmins.mockClear();
  });
  afterAll(async () => {
    process.env = env;
    await prisma.usageEvent.deleteMany({ where: { customerId } });
    await cleanupCustomer(customerId);
  });

  const ctx = () => ({ customerId, email: "berater@example.de", preview: false, userId, teamRole: "owner" as const });

  it("ohne Postfach: über unseren Versand, Antwort an den Login, Anfrage im Admin", async () => {
    const e = await offerEscalation(ctx(), { reason: "user_request", summary: "Wie reklamiere ich einen Lead?", source: "user" });
    expect(e.canSend).toBe(true);
    expect(e.messageText).toContain("Wie reklamiere ich einen Lead?");
    expect(e.messageText).toContain(e.ref);

    expect(await sendSupportMail(ctx(), e.id, "  ")).toMatchObject({ ok: false });
    const r = await sendSupportMail(ctx(), e.id, e.messageText);
    expect(r).toMatchObject({ ok: true, ref: e.ref, via: "app" });
    expect(sendViaPostfach).not.toHaveBeenCalled();
    const mail = sendPlainMail.mock.calls[0][0];
    expect(mail).toMatchObject({ to: "support@test.local", subject: `Hilfe-Anfrage ${e.ref}`, replyTo: "berater@example.de" });
    expect(mail.text).toContain("Referenz: " + e.ref);
    expect(sendToAdmins).toHaveBeenCalledTimes(1);
    expect((await loadSupportRequests(1)).find((x) => x.id === e.id)).toMatchObject({ channel: "email" });
  });

  it("mit Postfach: über das eigene Postfach; scheitert es, über unseren Versand", async () => {
    await prisma.mailConnection.create({ data: { userId, customerId, provider: "smtp", email: "berater@example.de" } });
    const e = await offerEscalation(ctx(), { reason: "user_request", summary: "Frage zur Rechnung", source: "user" });
    expect(await sendSupportMail(ctx(), e.id, "Bitte um Rückruf")).toMatchObject({ ok: true, via: "postfach" });
    expect(sendViaPostfach).toHaveBeenCalledWith(userId, expect.objectContaining({ to: "support@test.local" }));
    expect(sendPlainMail).not.toHaveBeenCalled();

    sendViaPostfach.mockResolvedValueOnce({ ok: false, error: "Token abgelaufen" });
    const e2 = await offerEscalation(ctx(), { reason: "user_request", summary: "Noch eine Frage", source: "user" });
    expect(await sendSupportMail(ctx(), e2.id, "Noch eine Frage")).toMatchObject({ ok: true, via: "app" });
    expect(sendPlainMail).toHaveBeenCalledTimes(1);
  });

  it("fremde Anfrage und Vorschau senden nichts", async () => {
    const e = await offerEscalation(ctx(), { reason: "user_request", summary: "Test", source: "user" });
    expect(await sendSupportMail({ ...ctx(), customerId: "anderer" }, e.id, "Hallo Team")).toMatchObject({ ok: false });
    expect(await sendSupportMail({ ...ctx(), preview: true }, e.id, "Hallo Team")).toMatchObject({ ok: false });
    expect(sendPlainMail).not.toHaveBeenCalled();
    expect(sendViaPostfach).not.toHaveBeenCalled();
  });
});

describe("KI-Hilfe: Begrüßung", () => {
  it("nie Firmen- oder Platzhaltername, sonst Anrede mit Nachname", () => {
    expect(hilfeGruss({ salutation: "Herr", lastName: "Müller" })).toBe("Guten Tag Herr Müller!");
    expect(hilfeGruss({ salutation: "frau", lastName: "Schwarzkopf" })).toBe("Guten Tag Frau Schwarzkopf!");
    expect(hilfeGruss({ salutation: null, lastName: "Müller" })).toBe("Hallo!");
    expect(hilfeGruss({ salutation: "Herr", lastName: "Company" })).toBe("Hallo!");
    expect(hilfeGruss(null)).toBe("Hallo!");
  });
});
