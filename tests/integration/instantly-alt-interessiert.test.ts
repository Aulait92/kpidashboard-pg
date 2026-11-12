import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { syncInstantly } from "@/lib/vertrieb/instantly";
import { requireTestDb } from "./db";

// Fall Achim Schmidt (12.11.): positive Zusage in Instantly, Antwort älter als 4 Wochen.
// Der Abgleich hat solche Leads übersprungen (nur „frische“ Leads werden angelegt).
// Jetzt gilt: Instantly-Status „Interessiert“/„Termin gebucht“ wird immer angelegt.
const tag = Math.random().toString(36).slice(2, 8);
const campaignName = `Signal Iduna Alt ${tag}`;
const positive = `achim.schmidt-${tag}@signal-iduna.test`;
const neutral = `alt-neutral-${tag}@signal-iduna.test`;
const old = new Date(Date.now() - 60 * 86400000).toISOString();

const lead = (email: string, interest: number | null) => ({
  id: `lead-${email}`,
  email,
  first_name: "Achim",
  last_name: "Schmidt",
  company_name: "Agentur Schmidt",
  status: 1,
  email_open_count: 1,
  email_reply_count: 1,
  email_click_count: 0,
  timestamp_last_contact: old,
  timestamp_last_reply: old,
  lt_interest_status: interest,
});

describe("Instantly-Abgleich: ältere Leads mit positiver Zusage", () => {
  beforeAll(() => {
    requireTestDb();
    process.env.INSTANTLY_API_KEY = "test";
    vi.stubGlobal("fetch", async (url: string) => {
      const path = String(url);
      const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
      if (path.includes("/campaigns")) return json({ items: [{ id: `camp-${tag}`, name: campaignName }] });
      if (path.includes("/leads/list")) return json({ items: [lead(positive, 1), lead(neutral, null)] });
      if (path.includes("/emails")) return json({ items: [] });
      return json({ items: [] });
    });
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    delete process.env.INSTANTLY_API_KEY;
    await prisma.salesContact.deleteMany({ where: { email: { in: [positive, neutral] } } });
    await prisma.salesCampaign.deleteMany({ where: { name: campaignName } });
  });

  it("legt den interessierten Lead an, auch wenn die Antwort alt ist – den neutralen nicht", async () => {
    await syncInstantly();
    const c = await prisma.salesContact.findFirst({ where: { email: positive }, include: { campaigns: true } });
    expect(c).not.toBeNull();
    expect(c!.campaigns[0]?.interest).toBe("Interessiert");
    expect(await prisma.salesContact.findFirst({ where: { email: neutral } })).toBeNull();
  });
});
