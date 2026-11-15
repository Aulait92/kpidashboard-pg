import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Vertriebspräsentation (Ole, 15.11.2026): Link je Kontakt (14 Tage, beendbar), Aufrufe, nur Admins; Link in der Angebotsmail.
const st = { role: "ADMIN" as string };
const sent: { text: string; html: string }[] = [];
vi.mock("@/lib/mail-guard", () => ({
  wasBlocked: () => false,
  MAIL_BLOCKED_TEXT: "gesperrt",
  mailClient: () => ({ emails: { send: async (m: (typeof sent)[number]) => (sent.push(m), { error: null }) } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  getCurrentSession: async () => ({ userId: "admin-test", email: "admin@example.test", role: st.role }),
}));

import { prisma } from "@/lib/prisma";
import { createOffer } from "@/lib/offers";
import { addDaysIso, berlinTodayIso } from "@/lib/offer-pricing";
import { verkaufsLinkAction, verkaufsLinkBeendenAction } from "@/app/admin/vertrieb/kontakte/[id]/praesentation/actions";
import { sendOfferEmailAction } from "@/app/admin/vertrieb/offer-actions";
import {
  aktiverVerkaufsLink,
  ladeVerkaufsLink,
  ladeVerkaufsPraesentation,
  verkaufsAufrufe,
  verkaufsAufrufMerken,
  verkaufsLinkErstellen,
} from "@/lib/vertrieb/verkaufspraesentation-server";
import { requireTestDb } from "./db";

const tag = Math.random().toString(36).slice(2, 8);
let contactId = "";
const T0 = new Date("2026-11-15T10:00:00Z");
const tage = (n: number) => new Date(T0.getTime() + n * 24 * 3600_000);

describe("Vertriebspräsentation: Link und Aufrufe", () => {
  beforeAll(async () => {
    requireTestDb();
    process.env.RESEND_API_KEY = "re_test";
    process.env.APP_URL = process.env.APP_URL || "https://app.test";
    const c = await prisma.salesContact.create({ data: { name: "Finanzkontor Test", email: `vk-${tag}@example.test`, insurer: "Makler" } });
    contactId = c.id;
  });
  afterAll(async () => {
    delete process.env.RESEND_API_KEY;
    await prisma.offer.deleteMany({ where: { salesContactId: contactId } });
    await prisma.salesContact.delete({ where: { id: contactId } }).catch(() => {});
  });

  it("ohne Angebot: Makler-Fassung mit Listenpreisen; mit Angebot: Preise und Zielgruppe aus dem Angebot", async () => {
    const ohne = await ladeVerkaufsPraesentation(contactId);
    expect(ohne).toMatchObject({ audience: "makler", angebotNr: null });
    expect(ohne!.folien).toHaveLength(23);
    expect(ohne!.preise.quelle).toBe("liste");
    const offer = await createOffer(
      { salesContactId: contactId },
      { contactName: "Eva Test", company: "Finanzkontor Test", email: `vk-${tag}@example.test`, term: "12m", products: [{ name: "TKV-Katze", dailyBudget: 40 }], startDate: addDaysIso(berlinTodayIso(), 20) },
      null,
    );
    const mit = await ladeVerkaufsPraesentation(contactId);
    expect(mit).toMatchObject({ audience: offer.vermittlerTyp === "makler" ? "makler" : "vertreter", angebotNr: offer.number });
    expect(mit!.preise).toMatchObject({ quelle: "angebot", name: "Finanzkontor Test", monatlichNetto: Number(offer.monthlyFee) });
    expect((await ladeVerkaufsPraesentation(contactId, "makler"))!.folien).toHaveLength(23);
  });

  it("Link: 14 Tage gültig, Verlängern behält den Token, abgelaufen bzw. beendet ungültig", async () => {
    const a = await verkaufsLinkErstellen(contactId, "makler", null, T0);
    expect(a!.bis.getTime()).toBe(tage(14).getTime());
    expect(await ladeVerkaufsLink(a!.token, tage(13))).toMatchObject({ audience: "makler", contact: { id: contactId } });
    expect((await ladeVerkaufsLink(a!.token, tage(13)))!.folien).toHaveLength(23);
    expect(await ladeVerkaufsLink(a!.token, tage(15))).toBeNull();
    const b = await verkaufsLinkErstellen(contactId, "vertreter", null, tage(5));
    expect(b!.token).toBe(a!.token);
    expect(await ladeVerkaufsLink(a!.token, tage(18))).toMatchObject({ audience: "vertreter" });
    expect(await aktiverVerkaufsLink(contactId, tage(18))).toMatchObject({ token: a!.token });
    // abgelaufen: neuer Link, neuer Token
    const c = await verkaufsLinkErstellen(contactId, "makler", null, tage(30));
    expect(c!.token).not.toBe(a!.token);
    expect(await ladeVerkaufsLink("kurz")).toBeNull();
    expect(await ladeVerkaufsLink("x".repeat(32))).toBeNull();
  });

  it("Aufrufe: protokolliert, Wiederholung innerhalb von 30 Minuten zählt nicht", async () => {
    const l = await verkaufsLinkErstellen(contactId, "makler", null, new Date());
    const p = await ladeVerkaufsLink(l!.token);
    const vorher = (await verkaufsAufrufe(contactId, 50)).length;
    const t = new Date();
    expect(await verkaufsAufrufMerken(p!.linkId, t)).toBe(true);
    expect(await verkaufsAufrufMerken(p!.linkId, new Date(t.getTime() + 10 * 60_000))).toBe(false);
    expect(await verkaufsAufrufMerken(p!.linkId, new Date(t.getTime() + 40 * 60_000))).toBe(true);
    expect((await verkaufsAufrufe(contactId, 50)).length).toBe(vorher + 2);
  });

  it("nur Admins erstellen und beenden Links", async () => {
    st.role = "BUYER";
    expect(await verkaufsLinkAction(contactId, "vertreter")).toEqual({ ok: false, error: "Nicht berechtigt." });
    expect(await verkaufsLinkBeendenAction(contactId)).toMatchObject({ ok: false });
    st.role = "ADMIN";
    expect(await verkaufsLinkAction(contactId, "irgendwas")).toMatchObject({ ok: false });
    const r = await verkaufsLinkAction(contactId, "vertreter");
    expect(r).toMatchObject({ ok: true });
    const token = r.ok ? r.url.split("/praesentation/")[1] : "";
    expect(await ladeVerkaufsLink(token)).not.toBeNull();
    expect(await verkaufsLinkBeendenAction(contactId)).toEqual({ ok: true });
    expect(await ladeVerkaufsLink(token)).toBeNull();
    expect(await aktiverVerkaufsLink(contactId)).toBeNull();
  });

  it("Angebotsmail mit Link zur Präsentation (ohne Gedankenstriche)", async () => {
    const offer = await prisma.offer.findFirstOrThrow({ where: { salesContactId: contactId }, orderBy: { createdAt: "desc" } });
    sent.length = 0;
    expect(await sendOfferEmailAction(offer.id, { praesentationLink: true, audience: "makler" })).toEqual({ ok: true });
    const l = await aktiverVerkaufsLink(contactId);
    expect(l).toMatchObject({ audience: "makler" });
    expect(sent[0].text).toContain(`/praesentation/${l!.token}`);
    expect(sent[0].text).toContain("Präsentation aus unserem Gespräch");
    expect(sent[0].text).not.toMatch(/[–—]/);
    expect(sent[0].html).toContain("Zur Präsentation");
    const act = await prisma.salesActivity.findFirst({ where: { contactId, type: "EMAIL" }, orderBy: { occurredAt: "desc" } });
    expect(act?.outcome).toContain("Präsentations-Link");
  });
});
