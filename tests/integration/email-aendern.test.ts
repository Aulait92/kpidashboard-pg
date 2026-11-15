// Kunde ändert seine Login-E-Mail selbst (Ole, 15.11.2026): Passwort nötig, Link an die neue Adresse,
// Übernahme erst nach Klick, alle Sitzungen enden, Link nur einmal und 24 h gültig.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => ({ mails: [] as { to: string | string[]; subject: string; button?: { url: string } }[] }));
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  sendCustomerMail: vi.fn(async (o: { to: string | string[]; subject: string; button?: { url: string } }) => {
    sent.mails.push(o);
    return { ok: true };
  }),
}));

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { confirmEmailChange, requestEmailChange } from "@/lib/email-aendern";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);

describe("Login-E-Mail selbst ändern", () => {
  let customerId = "";
  let userId = "";
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
    userId = (await makeBuyer(customerId, "owner")).id;
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword("geheim1234") } });
  });
  afterAll(async () => cleanupCustomer(customerId));

  it("braucht das richtige Passwort und eine freie Adresse", async () => {
    expect(await requestEmailChange(userId, { newEmail: `neu-${uid()}@example.test`, password: "falsch" })).toMatchObject({ ok: false });
    const other = await makeBuyer(customerId, "advisor");
    expect(await requestEmailChange(userId, { newEmail: other.email, password: "geheim1234" })).toMatchObject({ ok: false });
  });

  it("übernimmt die Adresse erst nach dem Klick, Link nur einmal", async () => {
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).email;
    const neu = `neu-${uid()}@example.test`;
    const r = await requestEmailChange(userId, { newEmail: neu, password: "geheim1234" });
    expect(r.ok).toBe(true);
    expect(sent.mails.at(-1)).toMatchObject({ to: neu });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).email).toBe(before);
    expect(await confirmEmailChange(r.rawToken!)).toEqual({ ok: true, to: neu });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.email).toBe(neu);
    expect(sent.mails.at(-1)).toMatchObject({ to: before });
    expect((await confirmEmailChange(r.rawToken!)).ok).toBe(false);
  });

  it("abgelaufener Link wirkt nicht", async () => {
    const r = await requestEmailChange(userId, { newEmail: `spaet-${uid()}@example.test`, password: "geheim1234" }, new Date(Date.now() - 25 * 3600_000));
    expect((await confirmEmailChange(r.rawToken!)).ok).toBe(false);
  });
});
