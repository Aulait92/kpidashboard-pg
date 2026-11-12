// Bewertungs-Wächter: Google-API gemockt (fetch). Neue Bewertung → Push und Aufgabe genau
// einmal, Kontingent-Fehler → kein Absturz („wird freigeschaltet“), Antwort nur nach Klick.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pushes: [] as { title: string }[],
  calls: [] as { url: string; method: string; body?: string }[],
  reviews: [] as unknown[],
  mode: "ok" as "ok" | "quota",
}));

vi.mock("@/lib/push", () => {
  const rec = async (...args: unknown[]) => {
    const p = args[args.length - 1] as { title: string };
    state.pushes.push({ title: p?.title ?? "" });
    return { sent: 0, removed: 0, errors: [] };
  };
  return { sendToAdmins: rec, sendToBuyersOfCustomer: rec, sendToUser: rec };
});

import { prisma } from "@/lib/prisma";
import { encryptNullable } from "@/lib/encryption";
import { BAD_REVIEW_TASK, listLocations, matchLead, publishReply, runWaechter, signState, syncReviews, verifyState } from "@/lib/empfehlung/google-business";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const NOW = new Date("2026-11-17T10:00:00Z");
const uid = () => Math.random().toString(36).slice(2, 8);

function fakeFetch(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  const u = String(url);
  state.calls.push({ url: u, method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : undefined });
  if (state.mode === "quota") return Promise.resolve(new Response(JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED" } }), { status: 429 }));
  if (u.includes("/accounts") && !u.includes("/locations")) return Promise.resolve(Response.json({ accounts: [{ name: "accounts/1" }] }));
  if (u.includes("mybusinessbusinessinformation")) return Promise.resolve(Response.json({ locations: [{ name: "locations/9", title: "Agentur Test" }] }));
  if (u.endsWith("/reply")) return Promise.resolve(Response.json({ comment: "ok" }));
  if (u.includes("/reviews")) return Promise.resolve(Response.json({ reviews: state.reviews, averageRating: 4.5, totalReviewCount: state.reviews.length }));
  return Promise.resolve(new Response("{}", { status: 404 }));
}

describe("Bewertungs-Wächter", () => {
  const customers: string[] = [];
  beforeAll(() => {
    requireTestDb();
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 5).toString("base64");
    process.env.GOOGLE_CLIENT_ID = "cid";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    process.env.GOOGLE_REDIRECT_URI = "https://app.test/api/google/callback";
    delete process.env.ANTHROPIC_API_KEY;
    vi.stubGlobal("fetch", vi.fn(fakeFetch));
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    for (const id of customers) await cleanupCustomer(id);
  });
  beforeEach(() => {
    state.pushes = [];
    state.calls = [];
    state.mode = "ok";
    state.reviews = [];
  });

  async function connected() {
    const c = await makeCustomer({ plan: "software", empfehlungEnabled: true, empfehlungMonthly: 59 });
    customers.push(c.id);
    await prisma.googleBusinessConnection.create({
      data: {
        customerId: c.id,
        accessTokenEnc: encryptNullable("tok"),
        refreshTokenEnc: encryptNullable("ref"),
        expiresAt: new Date(Date.now() + 3600_000),
        status: "connected",
        accountName: "accounts/1",
        locationName: "locations/9",
        locationTitle: "Agentur Test",
      },
    });
    return c.id;
  }
  const review = (id: string, stars: string, name: string, comment: string) => ({
    name: `accounts/1/locations/9/reviews/${id}`,
    reviewer: { displayName: name },
    starRating: stars,
    comment,
    createTime: NOW.toISOString(),
    updateTime: NOW.toISOString(),
  });

  it("state ist signiert und läuft ab", () => {
    const s = signState("cust_1", NOW.getTime());
    expect(verifyState(s, NOW.getTime())).toBe("cust_1");
    expect(verifyState(s.replace("cust_1", "cust_2"), NOW.getTime())).toBeNull();
    expect(verifyState(s, NOW.getTime() + 20 * 60_000)).toBeNull();
  });

  it("neue Bewertung: Push und Aufgabe genau einmal, Zuordnung zum Kontakt, keine Antwort ohne Klick", async () => {
    const id = await connected();
    // Erster Abgleich: Bestand, keine Meldungen
    state.reviews = [review(`old-${uid()}`, "FIVE", "Alt Kunde", "Top")];
    await syncReviews(id, NOW);
    expect(state.pushes).toHaveLength(0);

    const lead = await prisma.lead.create({ data: { customerId: id, name: "Paula Kritisch", status: "Abschluss", closedAt: NOW } });
    state.reviews.push(review(`bad-${uid()}`, "TWO", "Paula Kritisch", "Leider schlecht erreichbar"), review(`good-${uid()}`, "FIVE", "Max Froh", "Sehr gut"));
    const r = await syncReviews(id, new Date(NOW.getTime() + 3600_000));
    expect(r).toMatchObject({ status: "ok", fresh: 2 });
    expect(state.pushes.filter((p) => p.title.includes("bitte antworten"))).toHaveLength(1);
    expect(state.pushes.filter((p) => p.title.includes("Neue Google-Bewertung"))).toHaveLength(1);
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(l.followUpNote?.startsWith(BAD_REVIEW_TASK)).toBe(true);
    const bad = await prisma.googleReview.findFirstOrThrow({ where: { customerId: id, stars: 2 } });
    expect(bad.leadId).toBe(lead.id);
    expect(bad.suggestedReply).toBeTruthy();
    expect(bad.suggestedReply).not.toContain("Paula");

    await syncReviews(id, new Date(NOW.getTime() + 7200_000));
    expect(state.pushes).toHaveLength(2);
    expect(state.calls.some((c) => c.method === "PUT")).toBe(false);

    // Antwort nur nach Klick
    const res = await publishReply(id, bad.id, "Vielen Dank für Ihre Rückmeldung, ich melde mich gern direkt.");
    expect(res.ok).toBe(true);
    const put = state.calls.find((c) => c.method === "PUT");
    expect(put?.url).toContain(`${bad.googleName}/reply`);
    expect(JSON.parse(put!.body!)).toEqual({ comment: "Vielen Dank für Ihre Rückmeldung, ich melde mich gern direkt." });
    expect((await prisma.googleReview.findUniqueOrThrow({ where: { id: bad.id } })).repliedAt).not.toBeNull();
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).followUpNote).toBeNull();
  });

  it("Kontingent 0 / kein Zugang: kein Absturz, Status „wird freigeschaltet“", async () => {
    const id = await connected();
    state.mode = "quota";
    expect(await syncReviews(id, NOW)).toMatchObject({ status: "no_access" });
    expect((await prisma.googleBusinessConnection.findUniqueOrThrow({ where: { customerId: id } })).status).toBe("no_access");
    expect(await listLocations(id)).toMatchObject({ ok: false, noAccess: true });
    const run = await runWaechter(new Date(NOW.getTime() + 3600_000));
    expect(run.noAccess).toBeGreaterThanOrEqual(0);
    const rv = await prisma.googleReview.create({ data: { customerId: id, googleName: `accounts/1/locations/9/reviews/q-${uid()}`, stars: 3, reviewedAt: NOW } });
    expect(await publishReply(id, rv.id, "Danke für Ihre Rückmeldung.")).toMatchObject({ ok: false, noAccess: true });
  });

  it("Zuordnung nur bei eindeutigem Namen eines Kontakts mit Abschluss", async () => {
    const id = await connected();
    await prisma.lead.create({ data: { customerId: id, name: "Eva Eindeutig", status: "Abschluss" } });
    await prisma.lead.create({ data: { customerId: id, name: "Doppelt Name", status: "Abschluss" } });
    await prisma.lead.create({ data: { customerId: id, name: "Doppelt Name", status: "Abschluss" } });
    expect(await matchLead(id, "eva eindeutig")).toBeTruthy();
    expect(await matchLead(id, "Doppelt Name")).toBeNull();
    expect(await matchLead(id, "Eva")).toBeNull();
  });
});
