// LinkedIn-Posts (Ole, 14.11.2026): Text-Format, Uhrzeiten, Zielgruppen-Reichweite, Entwürfe
// mit Foto, Freigabe, Veröffentlichen, Export-Import.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const pushes: { title: string }[] = [];
vi.mock("@/lib/push", () => ({ sendToAdmins: async (p: { title: string }) => (pushes.push(p), { sent: 1, removed: 0, errors: [] }) }));

import { prisma } from "@/lib/prisma";
import { entityParam, linkedInState, toLittleText, userFromLinkedInState } from "@/lib/linkedin/api";
import {
  approvePost,
  baselineFor,
  getSettings,
  icpTerms,
  liftOf,
  metricsDue,
  nextPostingDay,
  parseSlots,
  publishDue,
  saveConnection,
  scoreOf,
  slotTimes,
} from "@/lib/linkedin/posts";
import { buildDraftPrompt, generateDrafts, maybeGenerateDrafts, validateDrafts } from "@/lib/linkedin/drafts";
import { importExport, parseExportTables, parseIcpShare, parseSinglePost, urnFromUrl } from "@/lib/linkedin/import";
import { addPhoto } from "@/lib/linkedin/photos";
import type { LlmCall } from "@/lib/kampagnen/llm";
import { requireTestDb } from "./db";

const TEXT = (i: number) => `Einstieg ${i}: Warum Vermittler Leads verlieren, bevor sie anrufen.\n\n` + "Kurzer Absatz mit Gedanken zum Vertrieb. ".repeat(6);

async function reset() {
  await prisma.linkedInPost.deleteMany({});
  await prisma.linkedInPhoto.deleteMany({});
  await prisma.linkedInConnection.deleteMany({});
  await prisma.linkedInSettings.deleteMany({});
}

describe("LinkedIn – reine Funktionen", () => {
  beforeAll(() => {
    process.env.AUTH_SECRET ??= "localtestsecret_localtestsecret_0123456789";
  });

  it("maskiert Sonderzeichen für die Posts-API und behält Hashtags", () => {
    expect(toLittleText("Leads (echt) & Termine *jetzt*")).toBe("Leads \\(echt\\) & Termine \\*jetzt\\*");
    expect(toLittleText("Mehr dazu #Versicherung und #PKV2026")).toBe("Mehr dazu {hashtag|\\#|Versicherung} und {hashtag|\\#|PKV2026}");
    expect(toLittleText("Nr.#1 bleibt")).toBe("Nr.\\#1 bleibt");
  });

  it("state ist signiert", () => {
    const s = linkedInState("u1");
    expect(userFromLinkedInState(s)).toBe("u1");
    expect(userFromLinkedInState(s.replace("u1", "u2"))).toBeNull();
  });

  it("Uhrzeiten: gültig, sortiert, je Tag begrenzt, Wochenende frei", () => {
    expect(parseSlots("18:00, 7:30;9.30 25:00 abc 07:30")).toEqual(["07:30", "09:30", "18:00"]);
    const s = { slots: "07:30,09:30,12:00,15:00,18:00", postsPerDay: 3, weekdays: true };
    expect(slotTimes(s, "2026-11-16")).toHaveLength(3); // Montag
    expect(slotTimes(s, "2026-11-15")).toHaveLength(0); // Sonntag
    // Montag 07:30 Berlin = 06:30 UTC (Winterzeit)
    expect(slotTimes(s, "2026-11-16")[0].toISOString()).toBe("2026-11-16T06:30:00.000Z");
    // Freitagabend → Montag
    expect(nextPostingDay({ weekdays: true }, new Date("2026-11-13T18:00:00Z"))).toBe("2026-11-16");
  });

  it("Zielgruppen-Reichweite schlägt reine Reichweite", () => {
    const d = (n: number) => new Date(Date.UTC(2026, 10, n, 9));
    const viral = { id: "v", impressions: 30000, icpShare: 0.02, publishedAt: d(10) }; // 600
    const nische = { id: "n", impressions: 3000, icpShare: 0.4, publishedAt: d(11) }; // 1200
    expect(scoreOf(viral)).toBe(600);
    expect(scoreOf(nische)).toBe(1200);
    // Ohne eigenen Anteil gilt der Profil-Schnitt, ohne beides die Impressionen
    expect(scoreOf({ id: "x", impressions: 1000, publishedAt: d(1) }, 0.25)).toBe(250);
    expect(scoreOf({ id: "x", impressions: 1000, publishedAt: d(1) })).toBe(1000);
    const all = [
      { id: "a", impressions: 1000, icpShare: 0.5, publishedAt: d(1) },
      { id: "b", impressions: 1000, icpShare: 0.5, publishedAt: d(2) },
      { id: "c", impressions: 1000, icpShare: 0.5, publishedAt: d(3) },
      nische,
    ];
    expect(baselineFor(nische, all)).toBe(500);
    expect(liftOf(nische, all)).toBeCloseTo(2.4);
  });

  it("Zahlen nach 1, 3, 7 und 14 Tagen holen", () => {
    const pub = new Date("2026-11-01T08:00:00Z");
    const at = (days: number) => new Date(pub.getTime() + days * 86_400_000);
    expect(metricsDue({ publishedAt: pub, metricsAt: null }, at(0.2))).toBe(false);
    expect(metricsDue({ publishedAt: pub, metricsAt: null }, at(1.1))).toBe(true);
    expect(metricsDue({ publishedAt: pub, metricsAt: at(1.1) }, at(2))).toBe(false);
    expect(metricsDue({ publishedAt: pub, metricsAt: at(1.1) }, at(3.2))).toBe(true);
    expect(metricsDue({ publishedAt: pub, metricsAt: at(14.1) }, at(15.5))).toBe(false);
    expect(entityParam("urn:li:share:123")).toBe("(share:urn%3Ali%3Ashare%3A123)");
    expect(entityParam("urn:li:activity:1")).toBeNull();
  });

  it("Entwürfe prüfen: Anzahl, Länge, Foto-IDs", () => {
    const ok = validateDrafts({ posts: [{ idea: "a", hypothesis: "h", text: TEXT(1), photoId: "f1" }, { idea: "b", hypothesis: "h2", text: TEXT(2), photoId: "" }] }, 2, ["f1"]);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.map((d) => d.photoId)).toEqual(["f1", null]);
    const bad = validateDrafts({ posts: [{ idea: "a", hypothesis: "", text: "kurz", photoId: "gibtsnicht" }] }, 2, ["f1"]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) for (const m of [/zu kurz/, /Hypothese/, /Foto-ID/, /Genau 2/]) expect(bad.errors.join(" ")).toMatch(m);
  });

  it("Prompt: Zielgruppe zuerst, bester Post nach Zielgruppen-Reichweite, Fotos", () => {
    const d = (n: number) => new Date(Date.UTC(2026, 10, n, 9));
    const base = { hypothesis: null, reactions: 1, comments: 1, reposts: 0, status: "veroeffentlicht", photoId: null };
    const { system, user } = buildDraftPrompt({
      about: "Gründer von performancegrowth.",
      icp: "Versicherungsvermittler",
      accountIcpShare: null,
      n: 2,
      slots: [d(16), d(16)],
      posts: [
        { ...base, id: "viral", text: "VIRAL Motivation", impressions: 30000, icpShare: 0.02, publishedAt: d(10) },
        { ...base, id: "nische", text: "NISCHE Termine für Makler", impressions: 3000, icpShare: 0.4, publishedAt: d(11), photoId: "f1" },
      ],
      recent: [],
      photos: [{ id: "f1", description: "Ole am Laptop im Büro", lastUsed: null }],
    });
    expect(system).toMatch(/NICHT Reichweite insgesamt/);
    expect(user.indexOf("## Zielgruppe")).toBe(0);
    expect(user).toMatch(/Zu schlagen: bester Post in der Zielgruppe \(1200[^)]*\)\n— [^\n]+\nNISCHE/);
    expect(user).toContain("f1: Ole am Laptop im Büro");
    expect(icpTerms("versicherung, , ab, Makler")).toEqual(["versicherung", "makler"]);
  });

  it("Export lesen: Tabellen mit zwei URL-Gruppen, deutsch/englisch", () => {
    const rows = parseExportTables([
      [
        ["Maximum of 50 posts"],
        ["Post URL", "Post publish date", "Engagements", "", "Post URL", "Post publish date", "Impressions"],
        ["https://www.linkedin.com/feed/update/urn:li:activity:7001/", "11/12/2026", 40, "", "https://www.linkedin.com/feed/update/urn:li:activity:7001/", "11/12/2026", 2500],
        ["https://www.linkedin.com/feed/update/urn:li:activity:7002/", "11/13/2026", 10, "", "https://www.linkedin.com/feed/update/urn:li:activity:7002/", "11/13/2026", "1.200"],
      ],
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ urn: "urn:li:activity:7001", engagements: 40, impressions: 2500 });
    expect(rows[1].impressions).toBe(1200);
    expect(urnFromUrl("https://www.linkedin.com/posts/ole_slug-activity-7300000000000000001-AbCd")).toBe("urn:li:activity:7300000000000000001");
  });

  it("Post-Export: Kennzahlen und Zielgruppen-Anteil aus der Demografie", () => {
    const tables = [
      [
        ["Beitrags-URL", "https://www.linkedin.com/feed/update/urn:li:activity:7009/"],
        ["Veröffentlichungsdatum", "13.11.2026"],
        ["Impressionen", "4.100"],
        ["Erreichte Mitglieder", 2900],
        ["Reaktionen", 55],
      ],
      [
        ["Top-Demografie", "Wert", "Prozent"],
        ["Branche", "Versicherungen", "31 %"],
        ["Branche", "Finanzdienstleistungen", "9 %"],
        ["Berufsbezeichnung", "Versicherungsmakler", "0.12"],
        ["Berufsbezeichnung", "Generalvertreter", "0.08"],
        ["Ort", "Berlin", "0.2"],
      ],
    ];
    const single = parseSinglePost(tables);
    expect(single).toMatchObject({ urn: "urn:li:activity:7009", impressions: 4100, membersReached: 2900, reactions: 55 });
    // Branche 31 % (Versicherungen) vs. Beruf 12 + 8 = 20 % → größerer Wert zählt
    expect(parseIcpShare(tables, icpTerms("versicherung, makler, generalvertret"))).toBeCloseTo(0.31);
    expect(parseIcpShare([[["a", "b"]]], ["versicherung"])).toBeNull();
  });
});

describe("LinkedIn – Datenbank", () => {
  let userId = "";
  beforeAll(async () => {
    requireTestDb();
    process.env.AUTH_SECRET ??= "localtestsecret_localtestsecret_0123456789";
    process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    const u = await prisma.user.create({ data: { email: `li-${Date.now()}@test.local`, passwordHash: "x", role: "ADMIN" } });
    userId = u.id;
  });
  beforeEach(async () => {
    await reset();
    pushes.length = 0;
  });
  afterAll(async () => {
    await reset();
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  const fakeLlm =
    (photoId = ""): LlmCall =>
    async (req) => {
      const n = Number(/genau (\d+) Posts/.exec(req.user)?.[1] ?? 1);
      return {
        text: JSON.stringify({ posts: Array.from({ length: n }, (_, i) => ({ idea: `Thema ${i}`, hypothesis: `Test ${i}`, text: TEXT(i), photoId: i === 0 ? photoId : "" })) }),
        usage: { tokensIn: 1, tokensOut: 1, costCents: 0 },
      };
    };

  it("Entwürfe je Uhrzeit mit Foto, nur einmal je Tag, Push", async () => {
    await prisma.linkedInSettings.create({ data: { id: "default", postsPerDay: 3, about: "Gründer" } });
    const photo = await addPhoto({ name: "ole.jpg", type: "image/jpeg", data: Buffer.from("jpg") }, { description: "Ole auf der Bühne", describe: null });
    expect(photo.ok).toBe(true);
    const photoId = photo.ok ? photo.id : "";
    const n = await generateDrafts("2026-11-16", { llm: fakeLlm(photoId) });
    expect(n).toBe(3);
    const drafts = await prisma.linkedInPost.findMany({ where: { draftDate: "2026-11-16" }, orderBy: { scheduledAt: "asc" } });
    expect(drafts.map((d) => d.status)).toEqual(["entwurf", "entwurf", "entwurf"]);
    expect(drafts[0].photoId).toBe(photoId);
    expect(drafts[0].scheduledAt?.toISOString()).toBe("2026-11-16T06:30:00.000Z");
    expect(pushes[0].title).toMatch(/3 Entwürfe für Montag/);
    expect(await generateDrafts("2026-11-16", { llm: fakeLlm() })).toBe(0);
  });

  it("Automatik erst ab der eingestellten Uhrzeit und nur mit „Über mich“", async () => {
    process.env.ANTHROPIC_API_KEY ??= "test";
    await prisma.linkedInSettings.create({ data: { id: "default", postsPerDay: 1, about: "", draftHour: 17 } });
    const evening = new Date("2026-11-16T17:30:00Z"); // 18:30 Berlin, Montag
    expect(await maybeGenerateDrafts(evening, fakeLlm())).toBe(0);
    await prisma.linkedInSettings.update({ where: { id: "default" }, data: { about: "Gründer" } });
    expect(await maybeGenerateDrafts(new Date("2026-11-16T10:00:00Z"), fakeLlm())).toBe(0);
    expect(await maybeGenerateDrafts(evening, fakeLlm())).toBe(1);
    expect(await prisma.linkedInPost.count({ where: { draftDate: "2026-11-17" } })).toBe(1);
    expect((await getSettings()).draftingAt).toBeNull();
  });

  it("Freigeben → zur Uhrzeit veröffentlichen (mit Foto), kein Doppel-Posting", async () => {
    await prisma.linkedInSettings.create({ data: { id: "default", postsPerDay: 2, about: "x" } });
    const now = new Date("2026-11-16T05:00:00Z");
    await saveConnection(userId, { personUrn: "urn:li:person:abc", name: "Ole", accessToken: "tok", expiresAt: new Date("2027-01-01"), scopes: "openid profile w_member_social" });
    const photo = await addPhoto({ name: "ole.png", type: "image/png", data: Buffer.from("png") }, { description: "Ole", describe: null });
    const p = await prisma.linkedInPost.create({ data: { status: "entwurf", text: TEXT(1), scheduledAt: new Date("2026-11-16T06:30:00Z"), draftDate: "2026-11-16" } });
    const res = await approvePost(p.id, TEXT(1) + " ergänzt", now, photo.ok ? photo.id : null);
    expect(res.ok && res.scheduledAt.toISOString()).toBe("2026-11-16T06:30:00.000Z");

    const calls: { text: string; image: boolean }[] = [];
    const publisher = async (_t: string, author: string, text: string, image?: { data: Buffer } | null) => {
      expect(author).toBe("urn:li:person:abc");
      calls.push({ text, image: !!image });
      return "urn:li:share:999";
    };
    expect(await publishDue(new Date("2026-11-16T06:00:00Z"), publisher)).toEqual({ published: 0, failed: 0 });
    const at = new Date("2026-11-16T06:31:00Z");
    const [a, b] = await Promise.all([publishDue(at, publisher), publishDue(at, publisher)]);
    expect(a.published + b.published).toBe(1);
    expect(calls).toEqual([{ text: TEXT(1) + " ergänzt", image: true }]);
    const after = await prisma.linkedInPost.findUniqueOrThrow({ where: { id: p.id } });
    expect(after).toMatchObject({ status: "veroeffentlicht", postUrn: "urn:li:share:999", url: "https://www.linkedin.com/feed/update/urn:li:share:999/" });
  });

  it("Vergangene Uhrzeit → nächste freie; ohne Verbindung → Fehler statt Posten", async () => {
    await prisma.linkedInSettings.create({ data: { id: "default", postsPerDay: 2, slots: "07:30, 12:00", about: "x" } });
    const now = new Date("2026-11-16T08:00:00Z"); // 09:00 Berlin
    const p = await prisma.linkedInPost.create({ data: { status: "entwurf", text: TEXT(1), scheduledAt: new Date("2026-11-16T06:30:00Z") } });
    const res = await approvePost(p.id, TEXT(1), now);
    expect(res.ok && res.scheduledAt.toISOString()).toBe("2026-11-16T11:00:00.000Z");
    expect(await publishDue(new Date("2026-11-16T11:01:00Z"), async () => "x")).toEqual({ published: 0, failed: 1 });
    expect((await prisma.linkedInPost.findUniqueOrThrow({ where: { id: p.id } })).lastError).toMatch(/nicht verbunden/);
  });

  it("Import: App-Post per Tag zuordnen, ältere Posts anlegen, Zielgruppen-Anteil übernehmen", async () => {
    const app = await prisma.linkedInPost.create({
      data: { status: "veroeffentlicht", text: TEXT(1), publishedAt: new Date("2026-11-12T08:30:00Z"), postUrn: "urn:li:share:1", url: "https://www.linkedin.com/feed/update/urn:li:share:1/" },
    });
    const res = await importExport([
      { url: "https://www.linkedin.com/feed/update/urn:li:activity:7001/", urn: "urn:li:activity:7001", date: new Date(Date.UTC(2026, 10, 12, 12)), impressions: 2500, icpShare: 0.3 },
      { url: "https://www.linkedin.com/feed/update/urn:li:activity:6000/", urn: "urn:li:activity:6000", date: new Date(Date.UTC(2026, 9, 1, 12)), impressions: 900 },
    ]);
    expect(res).toMatchObject({ matched: 1, created: 1 });
    expect(await prisma.linkedInPost.findUniqueOrThrow({ where: { id: app.id } })).toMatchObject({ impressions: 2500, icpShare: 0.3, metricsSource: "export" });
    expect(await prisma.linkedInPost.count({ where: { status: "importiert" } })).toBe(1);
    // Zweiter Import aktualisiert, legt nichts doppelt an
    const again = await importExport([{ url: "https://www.linkedin.com/feed/update/urn:li:activity:6000/", urn: "urn:li:activity:6000", date: null, impressions: 950 }]);
    expect(again).toMatchObject({ matched: 1, created: 0 });
  });
});
