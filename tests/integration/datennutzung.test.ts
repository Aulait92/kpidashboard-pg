// Hinweis „KI-Hilfe und gemeinsames Anzeigenlernen“ (Ole, 24.11.2026) gegen die Test-DB: Sichtbarkeit des Banners
// (Paket, Rolle, „Verstanden“, neue Textversion), Nachweis (Login, Datum, Version, erste Anzeige), Widerspruch je
// Punkt und beide, Rücknahme, Aufgabe und Push an die Admins, vomLernenAusgenommen und die technische Wirkung des
// Widerspruchs gegen Amazon Web Services (kein Aufruf des Dienstes, egal welcher Anbieter eingestellt ist).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";

const push = vi.fn(async (_p: { title: string; body: string; url?: string; tag?: string }) => ({ sent: 1, removed: 0, errors: [] }));
vi.mock("@/lib/push", () => ({
  sendToAdmins: (p: { title: string; body: string; url?: string; tag?: string }) => push(p),
  sendToBuyersOfCustomer: async () => ({ sent: 0, removed: 0, errors: [] }),
  sendToUser: async () => ({ sent: 0, removed: 0, errors: [] }),
}));

// Dokument-KI über OpenAI EU (Standard-Anbieter): gezählt, nie echt
const oa: { calls: unknown[] } = { calls: [] };
const HAUSRAT = { sparte: "hausrat", felder: { versicherer: "Teststadt Versicherung AG", tarifname: "Hausrat Top", beitrag: 120, zahlweise: "jaehrlich" }, unsicher: [] };
vi.mock("openai", () => {
  class OpenAI {
    static APIError = class extends Error {};
    responses = {
      create: async (req: unknown) => {
        oa.calls.push(req);
        return { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(HAUSRAT) }] }], output_text: JSON.stringify(HAUSRAT) };
      },
    };
  }
  return { default: OpenAI, OpenAI };
});

// Amazon Web Services (Bedrock): jeder Aufruf des Dienstes läuft über bedrockClient (lib/ki-eu.ts)
const bedrock = vi.fn(async (_req: unknown): Promise<{ content: { type: string; text: string }[]; stop_reason?: string }> => ({ content: [] }));
vi.mock("@/lib/ki-eu", async (orig) => {
  const real = await orig<typeof import("@/lib/ki-eu")>();
  return { ...real, bedrockClient: () => ({ messages: { create: (req: unknown) => bedrock(req) } }) };
});

// Server Actions: Sitzung und Neuladen simuliert
const st: { ctx: unknown } = { ctx: null };
vi.mock("@/lib/buyer-context", () => ({ getBuyerContext: async () => st.ctx }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/usage", () => ({ recordUsage: vi.fn(async () => undefined) }));

import { prisma } from "@/lib/prisma";
import { DATENNUTZUNG_VERSION, BANNER_WORTLAUT, punktWortlaut, kiAusText } from "@/lib/datennutzung";
import { adminAufgabe, bestaetigeHinweis, bestaetigtAm, ladeStand, merkeAnzeige, nimmZurueck, widerspreche } from "@/lib/datennutzung-server";
import { awsWiderspruchAm } from "@/lib/datennutzung-sperre";
import { vomLernenAusgenommen } from "@/lib/anzeigenlernen";
import { datennutzungAngezeigtAction, datennutzungRuecknahmeAction, datennutzungVerstandenAction, datennutzungWiderspruchAction } from "@/app/buyer/einstellungen/datennutzung/actions";
import { gruendeVorschlag, ladeZusammenfassung, zusammenfassungKi } from "@/lib/zusammenfassung-server";
import { ladeBeratungsdoku } from "@/lib/beratungsdoku-server";
import { legeAb, setzeSpeicherFuerTests, type Speicher } from "@/lib/policen/ablage";
import { ladeVergleich, liesUnterlageAus, nachEingang, sperreFuer, waehleSparte } from "@/lib/policen/auslesen/server";
import { kiSatzAktiv } from "@/lib/policen/flow/server";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

type Kunde = { id: string; name: string };
type Login = { id: string; email: string };
const inhaberCtx = (k: Kunde, u: Login) => ({ customerId: k.id, email: u.email, userId: u.id, preview: false, teamRole: "owner" as const });
const mitarbeiterCtx = (k: Kunde, u: Login) => ({ customerId: k.id, email: u.email, userId: u.id, preview: false, teamRole: "advisor" as const });
const SOFTWARE = { plan: "software", retainerMonthly: 990 };
const uid = () => Math.random().toString(36).slice(2, 10);

const angelegt: string[] = [];
async function kunde(extra: Record<string, unknown> = SOFTWARE): Promise<{ k: Kunde; inhaber: Login; ctx: ReturnType<typeof inhaberCtx> }> {
  const k = await makeCustomer(extra);
  angelegt.push(k.id);
  const inhaber = await makeBuyer(k.id, "owner");
  return { k, inhaber, ctx: inhaberCtx(k, inhaber) };
}
const nachweise = (customerId: string) => prisma.datennutzungNachweis.findMany({ where: { customerId }, orderBy: { createdAt: "asc" } });
const aufgaben = (customerId: string) => prisma.salesTask.findMany({ where: { note: { contains: `Kunden-ID ${customerId}` } }, orderBy: { createdAt: "asc" } });
const protokoll = (customerId: string) => prisma.auditLog.findMany({ where: { customerId, action: { startsWith: "datennutzung." } }, orderBy: { at: "asc" } });

beforeAll(() => requireTestDb());
afterAll(async () => {
  await prisma.salesTask.deleteMany({ where: { OR: angelegt.map((id) => ({ note: { contains: `Kunden-ID ${id}` } })) } });
  for (const id of angelegt) await cleanupCustomer(id);
});
beforeEach(() => {
  push.mockClear();
  bedrock.mockClear();
  oa.calls = [];
  st.ctx = null;
});

describe("Sichtbarkeit des Banners", () => {
  it("Software-Kunde: Inhaber ja, Mitarbeiter nein, Admin-Vorschau und App-Demo nein", async () => {
    const { k, ctx } = await kunde();
    const mitarbeiter = await makeBuyer(k.id, "advisor");
    expect(await ladeStand(ctx)).toMatchObject({ darf: true, banner: true, version: DATENNUTZUNG_VERSION, angezeigtAm: null, verstandenAm: null, widerspruch: { anzeigenlernen: null, aws: null } });
    expect(await ladeStand(mitarbeiterCtx(k, mitarbeiter))).toBeNull();
    // Admin-Vorschau („Als Kunde ansehen“): Stand nur zum Lesen, kein Banner
    expect(await ladeStand({ customerId: k.id, email: "admin@test.local", userId: null, preview: true, teamRole: "owner" })).toMatchObject({ darf: false, banner: false });
    // Öffentliche App-Demo (dorthin führt auch der Prüferzugang der App-Stores)
    expect(await ladeStand({ customerId: k.id, email: "demo@example.com", userId: null, preview: true, teamRole: "owner", demo: true })).toBeNull();
  });

  it("andere Pakete nein: Pay-per-Lead, Nur Betreuung, Nur Leads, intern und Bestellkonto; Pay-per-Lead + Software ja", async () => {
    const nein = [
      { plan: "software" }, // reines Pay-per-Lead: ohne Betreuungsgebühr und ohne Onboarding
      { plan: "service", retainerMonthly: 990 },
      { plan: "ppl" },
      { plan: "internal", retainerMonthly: 990 },
    ];
    for (const extra of nein) {
      const { ctx } = await kunde(extra);
      expect(await ladeStand(ctx), JSON.stringify(extra)).toBeNull();
      // Auch die Aktionen greifen dann nicht
      expect(await bestaetigeHinweis(ctx, "banner")).toBe(false);
      expect((await widerspreche(ctx, ["aws"])).ok).toBe(false);
      expect(await merkeAnzeige(ctx, "banner")).toBe(false);
    }
    const mitSoftware = await kunde({ plan: "ppl_software" });
    expect(await ladeStand(mitSoftware.ctx)).toMatchObject({ banner: true });
    // Reines Bestellkonto: hat Vertriebspartner, aber keinen eigenen aktiven Bezug
    const haupt = await kunde();
    const partner = await makeCustomer({ bestelltUeberId: haupt.k.id });
    angelegt.push(partner.id);
    expect(await ladeStand(haupt.ctx)).toBeNull();
  });
});

describe("„Verstanden“ und erste Anzeige: Nachweis", () => {
  it("erste Anzeige wird einmal festgehalten (Login, Datum, Textversion, Wortlaut), nur bei einem Inhaber", async () => {
    const { k, inhaber, ctx } = await kunde();
    const mitarbeiter = await makeBuyer(k.id, "advisor");
    expect(await merkeAnzeige(mitarbeiterCtx(k, mitarbeiter), "banner")).toBe(false);
    expect(await merkeAnzeige({ ...ctx, userId: null, preview: true }, "banner")).toBe(false);
    expect(await nachweise(k.id)).toHaveLength(0);

    const t1 = new Date("2026-11-24T08:00:00Z");
    expect(await merkeAnzeige(ctx, "banner", t1)).toBe(true);
    // Spätere Anzeigen (zweiter Inhaber, anderes Gerät) verschieben den Beginn der 14 Tage nicht
    const zweiter = await makeBuyer(k.id, "owner");
    expect(await merkeAnzeige(inhaberCtx(k, zweiter), "banner", new Date("2026-11-26T08:00:00Z"))).toBe(false);
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: k.id } });
    expect(c.datennutzungAngezeigtAt?.toISOString()).toBe(t1.toISOString());
    expect(c.datennutzungAngezeigtVersion).toBe(DATENNUTZUNG_VERSION);
    const n = await nachweise(k.id);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ art: "angezeigt", punkt: null, textVersion: DATENNUTZUNG_VERSION, wortlaut: BANNER_WORTLAUT, userId: inhaber.id, userEmail: inhaber.email, quelle: "banner" });
    expect(n[0].createdAt.toISOString()).toBe(t1.toISOString());
    // Das Banner bleibt, bis „Verstanden“ gespeichert ist
    expect(await ladeStand(ctx)).toMatchObject({ banner: true, angezeigtAm: t1.toISOString(), verstandenAm: null });
    expect((await protokoll(k.id)).map((p) => p.action)).toEqual(["datennutzung.angezeigt"]);
  });

  it("„Verstanden“: Datum, Login und Textversion; danach ist das Banner für den ganzen Kunden weg", async () => {
    const { k, inhaber, ctx } = await kunde();
    const zweiter = await makeBuyer(k.id, "owner");
    const mitarbeiter = await makeBuyer(k.id, "advisor");
    await merkeAnzeige(ctx, "banner", new Date("2026-11-24T08:00:00Z"));
    // Mitarbeiter und Vorschau können nicht bestätigen
    expect(await bestaetigeHinweis(mitarbeiterCtx(k, mitarbeiter), "banner")).toBe(false);
    expect(await bestaetigeHinweis({ ...ctx, userId: null, preview: true }, "banner")).toBe(false);
    expect(await ladeStand(ctx)).toMatchObject({ banner: true });

    const t2 = new Date("2026-11-25T09:30:00Z");
    expect(await bestaetigeHinweis(ctx, "banner", t2)).toBe(true);
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: k.id } });
    expect(c.datennutzungVerstandenAt?.toISOString()).toBe(t2.toISOString());
    expect(c.datennutzungVerstandenVersion).toBe(DATENNUTZUNG_VERSION);
    expect(c.datennutzungVerstandenUserId).toBe(inhaber.id);
    // Für alle Inhaber des Kunden weg, nicht nur für diesen Browser
    expect(await ladeStand(ctx)).toMatchObject({ banner: false, verstandenAm: t2.toISOString() });
    expect(await ladeStand(inhaberCtx(k, zweiter))).toMatchObject({ banner: false, verstandenAm: t2.toISOString() });
    expect(await bestaetigtAm(k.id, t2.toISOString())).toBe(t2.toISOString());

    // Zweiter Klick (anderer Inhaber, später) ändert nichts
    expect(await bestaetigeHinweis(inhaberCtx(k, zweiter), "detailseite", new Date("2026-11-27T09:30:00Z"))).toBe(true);
    const danach = await prisma.customer.findUniqueOrThrow({ where: { id: k.id } });
    expect(danach.datennutzungVerstandenAt?.toISOString()).toBe(t2.toISOString());
    expect(danach.datennutzungVerstandenUserId).toBe(inhaber.id);
    const n = await nachweise(k.id);
    expect(n.map((x) => x.art)).toEqual(["angezeigt", "verstanden"]);
    expect(n[1]).toMatchObject({ art: "verstanden", textVersion: DATENNUTZUNG_VERSION, wortlaut: BANNER_WORTLAUT, userId: inhaber.id, userEmail: inhaber.email, quelle: "banner" });
    const p = await protokoll(k.id);
    expect(p.map((x) => x.action)).toEqual(["datennutzung.angezeigt", "datennutzung.verstanden"]);
    expect(p[1]).toMatchObject({ actorId: inhaber.id, actorEmail: inhaber.email, actorRole: "BUYER" });
    expect(p[1].details).toMatchObject({ version: DATENNUTZUNG_VERSION, quelle: "banner" });
  });

  it("„Verstanden“ ohne festgehaltene Anzeige holt die erste Anzeige nach", async () => {
    const { k, ctx } = await kunde();
    const t = new Date("2026-11-24T12:00:00Z");
    expect(await bestaetigeHinweis(ctx, "detailseite", t)).toBe(true);
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: k.id } });
    expect(c.datennutzungAngezeigtAt?.toISOString()).toBe(t.toISOString());
    expect((await nachweise(k.id)).map((x) => `${x.art}:${x.quelle}`).sort()).toEqual(["angezeigt:detailseite", "verstanden:detailseite"]);
  });

  it("neue Textversion: das Banner erscheint wieder, erste Anzeige und „Verstanden“ werden neu festgehalten", async () => {
    const { k, ctx } = await kunde();
    // Stand einer früheren Textversion (bestätigt und angezeigt)
    const alt = new Date("2026-10-01T08:00:00Z");
    await prisma.customer.update({
      where: { id: k.id },
      data: { datennutzungAngezeigtAt: alt, datennutzungAngezeigtVersion: "2026-10-01", datennutzungVerstandenAt: alt, datennutzungVerstandenVersion: "2026-10-01", datennutzungVerstandenUserId: "frueher" },
    });
    expect(await ladeStand(ctx)).toMatchObject({ banner: true, angezeigtAm: null, verstandenAm: null });
    const t = new Date("2026-11-24T08:00:00Z");
    expect(await merkeAnzeige(ctx, "banner", t)).toBe(true);
    expect(await bestaetigeHinweis(ctx, "banner", new Date("2026-11-24T08:05:00Z"))).toBe(true);
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: k.id } });
    expect(c.datennutzungAngezeigtAt?.toISOString()).toBe(t.toISOString());
    expect(c.datennutzungAngezeigtVersion).toBe(DATENNUTZUNG_VERSION);
    expect(c.datennutzungVerstandenVersion).toBe(DATENNUTZUNG_VERSION);
    expect(await ladeStand(ctx)).toMatchObject({ banner: false });
  });

  it("der Nachweis lässt sich nur anhängen, nicht ändern oder löschen", async () => {
    const { k, ctx } = await kunde();
    await bestaetigeHinweis(ctx, "banner");
    const n = (await nachweise(k.id))[0];
    await expect(prisma.datennutzungNachweis.update({ where: { id: n.id }, data: { art: "anders" } })).rejects.toThrow();
    await expect(prisma.datennutzungNachweis.delete({ where: { id: n.id } })).rejects.toThrow();
    expect(await prisma.datennutzungNachweis.count({ where: { customerId: k.id } })).toBe(2);
  });
});

describe("Widerspruch und Rücknahme", () => {
  it("nur Anzeigenlernen: Datum und Login am Kunden, Nachweis, Aufgabe und Push; Amazon Web Services bleibt an", async () => {
    const { k, inhaber, ctx } = await kunde();
    await merkeAnzeige(ctx, "banner", new Date("2026-11-24T08:00:00Z"));
    const t = new Date("2026-11-26T10:15:00Z");
    expect(await widerspreche(ctx, ["anzeigenlernen"], t)).toEqual({ ok: true, punkte: ["anzeigenlernen"] });
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: k.id } });
    expect(c.anzeigenlernenWiderspruchAt?.toISOString()).toBe(t.toISOString());
    expect(c.anzeigenlernenWiderspruchUserId).toBe(inhaber.id);
    expect(c.awsWiderspruchAt).toBeNull();
    expect(await awsWiderspruchAm(k.id)).toBeNull();
    expect(await ladeStand(ctx)).toMatchObject({ widerspruch: { anzeigenlernen: t.toISOString(), aws: null } });

    const n = await nachweise(k.id);
    expect(n.map((x) => `${x.art}:${x.punkt ?? ""}:${x.quelle}`)).toEqual(["angezeigt::banner", "widerspruch:anzeigenlernen:detailseite", "verstanden::widerspruch"]);
    expect(n[1]).toMatchObject({ wortlaut: punktWortlaut("anzeigenlernen"), userId: inhaber.id, userEmail: inhaber.email, textVersion: DATENNUTZUNG_VERSION });
    // Ein Widerspruch belegt die Kenntnis: Banner weg, aber „Bestätigt am“ gibt es nur nach einem Klick auf „Verstanden“
    expect(await ladeStand(ctx)).toMatchObject({ banner: false });
    expect(await bestaetigtAm(k.id, (await ladeStand(ctx))!.verstandenAm)).toBeNull();

    const a = await aufgaben(k.id);
    expect(a).toHaveLength(1);
    expect(a[0].title).toBe(`Widerspruch ${k.name}: Gemeinsames Anzeigenlernen`);
    expect(a[0].type).toBe("SONSTIGES");
    expect(a[0].doneAt).toBeNull();
    expect(a[0].note).toContain(`von ${inhaber.email}`);
    expect(a[0].note).toContain("Banner erstmals angezeigt am 24.11.2026, der Widerspruch kam innerhalb der 14 Tage.");
    expect(a[0].note).toContain("vom gemeinsamen Lernen ausgenommen");
    expect(a[0].note).not.toContain("Amazon Web Services");
    expect(a[0].note).toContain(`/admin/neu/kunden/${k.id}`);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toMatchObject({ title: `Widerspruch: ${k.name}`, body: "Gemeinsames Anzeigenlernen", url: `/admin/neu/kunden/${k.id}` });
    expect((await protokoll(k.id)).map((x) => x.action)).toEqual(["datennutzung.angezeigt", "datennutzung.widerspruch", "datennutzung.verstanden"]);
  });

  it("nur Amazon Web Services, danach auch Anzeigenlernen: je Punkt eigener Zeitpunkt, nichts doppelt", async () => {
    const { k, ctx } = await kunde();
    const t1 = new Date("2026-11-24T10:00:00Z");
    const t2 = new Date("2026-11-30T10:00:00Z");
    expect(await widerspreche(ctx, ["aws"], t1)).toEqual({ ok: true, punkte: ["aws"] });
    expect((await awsWiderspruchAm(k.id))?.toISOString()).toBe(t1.toISOString());
    // Erneut dasselbe: bleibt beim ersten Zeitpunkt, keine zweite Aufgabe
    expect(await widerspreche(ctx, ["aws"], t2)).toEqual({ ok: true, punkte: [] });
    expect(await widerspreche(ctx, ["aws", "anzeigenlernen"], t2)).toEqual({ ok: true, punkte: ["anzeigenlernen"] });
    expect(await ladeStand(ctx)).toMatchObject({ widerspruch: { aws: t1.toISOString(), anzeigenlernen: t2.toISOString() } });
    expect((await nachweise(k.id)).filter((x) => x.art === "widerspruch").map((x) => x.punkt)).toEqual(["aws", "anzeigenlernen"]);
    const a = await aufgaben(k.id);
    expect(a.map((x) => x.title)).toEqual([`Widerspruch ${k.name}: Amazon Web Services`, `Widerspruch ${k.name}: Gemeinsames Anzeigenlernen`]);
    expect(a[0].note).toContain("Banner bisher keinem Inhaber angezeigt");
    expect(push).toHaveBeenCalledTimes(2);
  });

  it("beide zusammen: eine Aufgabe mit beiden Punkten", async () => {
    const { k, ctx } = await kunde();
    expect(await widerspreche(ctx, ["anzeigenlernen", "aws"])).toEqual({ ok: true, punkte: ["anzeigenlernen", "aws"] });
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: k.id } });
    expect(c.anzeigenlernenWiderspruchAt).not.toBeNull();
    expect(c.awsWiderspruchAt).not.toBeNull();
    const a = await aufgaben(k.id);
    expect(a.map((x) => x.title)).toEqual([`Widerspruch ${k.name}: Gemeinsames Anzeigenlernen und Amazon Web Services`]);
    expect(push.mock.calls[0][0].body).toBe("Gemeinsames Anzeigenlernen und Amazon Web Services");
  });

  it("nur der Inhaber, und nur mit gültiger Auswahl", async () => {
    const { k, ctx } = await kunde();
    const mitarbeiter = await makeBuyer(k.id, "advisor");
    expect((await widerspreche(mitarbeiterCtx(k, mitarbeiter), ["aws"])).ok).toBe(false);
    expect((await widerspreche({ ...ctx, userId: null, preview: true }, ["aws"])).ok).toBe(false);
    expect(await widerspreche(ctx, [])).toEqual({ ok: false, error: "Bitte mindestens einen Punkt wählen." });
    expect((await widerspreche(ctx, ["alles"])).ok).toBe(false);
    expect((await widerspreche(ctx, "aws")).ok).toBe(false);
    expect((await nimmZurueck(mitarbeiterCtx(k, mitarbeiter), "aws")).ok).toBe(false);
    expect((await nimmZurueck(ctx, "alles")).ok).toBe(false);
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: k.id } });
    expect(c.awsWiderspruchAt).toBeNull();
    expect(c.anzeigenlernenWiderspruchAt).toBeNull();
    expect(await nachweise(k.id)).toHaveLength(0);
    expect(await aufgaben(k.id)).toHaveLength(0);
    expect(push).not.toHaveBeenCalled();
  });

  it("Rücknahme je Punkt: wieder an, Nachweis, Aufgabe und Push; der andere Widerspruch bleibt", async () => {
    const { k, inhaber, ctx } = await kunde();
    await widerspreche(ctx, ["anzeigenlernen", "aws"], new Date("2026-11-24T10:00:00Z"));
    push.mockClear();
    const t = new Date("2026-12-01T09:00:00Z");
    expect(await nimmZurueck(ctx, "aws", t)).toEqual({ ok: true, punkte: ["aws"] });
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: k.id } });
    expect(c.awsWiderspruchAt).toBeNull();
    expect(c.awsWiderspruchUserId).toBeNull();
    expect(c.anzeigenlernenWiderspruchAt).not.toBeNull();
    expect(await awsWiderspruchAm(k.id)).toBeNull();
    const n = (await nachweise(k.id)).filter((x) => x.art === "ruecknahme");
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ punkt: "aws", wortlaut: "Widerspruch zurücknehmen: Amazon Web Services", userId: inhaber.id, userEmail: inhaber.email });
    expect(n[0].createdAt.toISOString()).toBe(t.toISOString());
    const a = await aufgaben(k.id);
    expect(a.map((x) => x.title)).toEqual([`Widerspruch ${k.name}: Gemeinsames Anzeigenlernen und Amazon Web Services`, `Widerspruch zurückgenommen ${k.name}: Amazon Web Services`]);
    expect(a[1].note).toContain("wieder an");
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toMatchObject({ title: `Widerspruch zurückgenommen: ${k.name}`, body: "Amazon Web Services" });
    expect((await protokoll(k.id)).map((x) => x.action)).toContain("datennutzung.ruecknahme");
    // Noch einmal zurücknehmen: nichts passiert
    expect(await nimmZurueck(ctx, "aws")).toEqual({ ok: true, punkte: [] });
    expect(push).toHaveBeenCalledTimes(1);
    // Danach kann er erneut widersprechen
    expect(await widerspreche(ctx, ["aws"])).toEqual({ ok: true, punkte: ["aws"] });
  });

  it("Aufgabe: Widerspruch nach Ablauf der 14 Tage ist als solcher erkennbar (wirkt trotzdem)", () => {
    const a = adminAufgabe({ art: "widerspruch", name: "Agentur Muster", punkte: ["aws"], customerId: "c1", email: "inhaber@test.local", now: new Date("2026-12-20T10:00:00Z"), angezeigtAm: "2026-11-24T08:00:00.000Z" });
    expect(a.note).toContain("Banner erstmals angezeigt am 24.11.2026, der Widerspruch kam nach Ablauf der 14 Tage.");
    expect(a.note).toContain("am 20.12.2026 um 11:00 Uhr von inhaber@test.local");
    expect(a.note).toContain("für das Konto ab sofort aus");
    expect(a.push).toEqual({ title: "Widerspruch: Agentur Muster", body: "Amazon Web Services" });
  });
});

describe("Server Actions (Banner und Detailseite)", () => {
  it("Inhaber: Anzeige, „Verstanden“, Widerspruch, Rücknahme; Mitarbeiter und Vorschau werden abgewiesen", async () => {
    const { k, inhaber, ctx } = await kunde();
    const mitarbeiter = await makeBuyer(k.id, "advisor");

    st.ctx = null;
    expect(await datennutzungVerstandenAction("banner")).toMatchObject({ ok: false });
    st.ctx = mitarbeiterCtx(k, mitarbeiter);
    await datennutzungAngezeigtAction();
    expect(await datennutzungVerstandenAction("banner")).toMatchObject({ ok: false });
    expect(await datennutzungWiderspruchAction(["aws"])).toMatchObject({ ok: false });
    st.ctx = { ...ctx, userId: null, preview: true };
    expect(await datennutzungVerstandenAction("banner")).toMatchObject({ ok: false });
    expect(await datennutzungRuecknahmeAction("aws")).toMatchObject({ ok: false });
    expect(await nachweise(k.id)).toHaveLength(0);

    st.ctx = ctx;
    await datennutzungAngezeigtAction();
    expect((await ladeStand(ctx))?.angezeigtAm).not.toBeNull();
    expect(await datennutzungVerstandenAction("banner")).toEqual({ ok: true });
    expect(await ladeStand(ctx)).toMatchObject({ banner: false });
    expect(await datennutzungWiderspruchAction([])).toEqual({ ok: false, error: "Bitte mindestens einen Punkt wählen." });
    expect(await datennutzungWiderspruchAction(["anzeigenlernen", "aws"])).toEqual({ ok: true });
    expect(await datennutzungRuecknahmeAction("anzeigenlernen")).toEqual({ ok: true });
    expect(await ladeStand(ctx)).toMatchObject({ widerspruch: { anzeigenlernen: null } });
    expect((await ladeStand(ctx))?.widerspruch.aws).not.toBeNull();
    expect((await nachweise(k.id)).map((x) => `${x.art}:${x.punkt ?? ""}`)).toEqual(["angezeigt:", "verstanden:", "widerspruch:anzeigenlernen", "widerspruch:aws", "ruecknahme:anzeigenlernen"]);
    expect((await nachweise(k.id)).every((x) => x.userId === inhaber.id)).toBe(true);
  });
});

describe("vomLernenAusgenommen (für die Kampagnen-Agenten)", () => {
  it("liefert genau die Kunden mit aktivem Widerspruch gegen das Anzeigenlernen", async () => {
    const a = await kunde();
    const b = await kunde();
    const c = await kunde();
    await widerspreche(a.ctx, ["anzeigenlernen"]);
    await widerspreche(b.ctx, ["aws"]); // anderer Punkt: nimmt weiter am Lernen teil
    expect(await vomLernenAusgenommen([a.k.id, b.k.id, c.k.id])).toEqual(new Set([a.k.id]));
    // Nur gefragte Kunden, doppelte und unbekannte IDs sind egal
    expect(await vomLernenAusgenommen([b.k.id, c.k.id])).toEqual(new Set());
    expect(await vomLernenAusgenommen([a.k.id, a.k.id, "gibt-es-nicht", ""])).toEqual(new Set([a.k.id]));
    expect(await vomLernenAusgenommen([])).toEqual(new Set());
    // Rücknahme wirkt sofort
    await nimmZurueck(a.ctx, "anzeigenlernen");
    expect(await vomLernenAusgenommen([a.k.id])).toEqual(new Set());
  });
});

// ─── Technische Wirkung: Widerspruch gegen Amazon Web Services ──────────────

const T0 = new Date("2026-11-24T09:00:00.000Z");
const offers = {
  items: [{ sparte: "Privathaftpflicht", gesellschaft: "Allianz", tarif: "Komfort", beitragMonat: 6.12, leistungen: ["Versicherungssumme: 50 Mio. €", "Schlüsselverlust"], empfohlen: true, gewaehlt: true, merkmale: [], bausteine: [] }],
  quelle: [],
  schutz: [],
};
let n = 0;
async function termin(customerId: string, assignedUserId?: string) {
  const lead = await prisma.lead.create({
    data: { customerId, name: "Anna Becker", source: "Privathaftpflicht", formData: [{ label: "Lebenssituation", value: "Familie" }], phone: `49151700${String(++n).padStart(4, "0")}`, email: "anna@example.org", status: "Termin vereinbart", ...(assignedUserId ? { assignedUserId } : {}) },
  });
  const t = await prisma.appointment.create({ data: { customerId, leadId: lead.id, startsAt: new Date(T0.getTime() - 2 * 3600_000), status: "completed", mode: "video", offersJson: offers } });
  await prisma.leadHistory.create({ data: { leadId: lead.id, customerId, kind: "notiz", text: "Fahrrad soll mit rein" } });
  return { lead, t };
}

describe("Widerspruch Amazon Web Services: Gesprächszusammenfassung und Beratungsdokumentation", () => {
  const ENV = { ...process.env };
  beforeEach(() => {
    process.env.KI_EU_AWS_ACCESS_KEY_ID = "AKIATEST";
    process.env.KI_EU_AWS_SECRET_ACCESS_KEY = "geheim";
  });
  afterEach(() => {
    process.env = { ...ENV };
  });
  const team = (k: Kunde, userId: string | null = null, teamRole: "owner" | "advisor" = "owner") => ({ customerId: k.id, userId, teamRole });
  const text = { wuensche: "• Familie\n• Fahrrad soll mit rein", rat: "• Privathaftpflicht: Allianz Komfort" };

  it("ohne Widerspruch geht „Mit KI formulieren“ und „Gründe vorschlagen“ an den Dienst", async () => {
    const { k } = await kunde({ ...SOFTWARE, beratungsdokuAn: true });
    const { t } = await termin(k.id);
    const info = (await ladeZusammenfassung(t.id, team(k), T0))!;
    expect(info).toMatchObject({ ki: true, kiAus: null });
    expect(info.vorschlag).not.toBeNull();
    expect((await ladeBeratungsdoku(t.id, team(k), T0))!).toMatchObject({ kiAus: null, vorschlag: { tarif: true } });

    bedrock.mockResolvedValueOnce({ content: [{ type: "text", text: "WÜNSCHE:\n• Familie\n• Fahrrad soll mit rein\nRAT:\n• Privathaftpflicht: Allianz Komfort" }] });
    expect((await zusammenfassungKi(t.id, team(k), text)).ok).toBe(true);
    bedrock.mockResolvedValueOnce({ content: [{ type: "text", text: "GRÜNDE:\n• Der Tarif deckt den Schlüsselverlust ab, das war Ihnen wichtig." }] });
    expect((await gruendeVorschlag(t.id, team(k), text.wuensche)).ok).toBe(true);
    expect(bedrock).toHaveBeenCalledTimes(2);
  });

  it("mit Widerspruch: kein Aufruf des Dienstes, statt der Knöpfe ein ruhiger Hinweis mit Datum und nächstem Schritt", async () => {
    const { k, ctx } = await kunde({ ...SOFTWARE, beratungsdokuAn: true });
    const mitarbeiter = await makeBuyer(k.id, "advisor");
    const { t } = await termin(k.id, mitarbeiter.id);
    const am = new Date("2026-11-24T10:00:00Z");
    await widerspreche(ctx, ["aws"], am);

    const hinweis = "KI-Hilfe ist für Ihr Konto abgeschaltet (Widerspruch vom 24.11.2026). In den Einstellungen können Sie das ändern.";
    expect(await zusammenfassungKi(t.id, team(k), text)).toEqual({ ok: false, error: hinweis });
    expect(await gruendeVorschlag(t.id, team(k), text.wuensche)).toEqual({ ok: false, error: hinweis });
    // Auch mit ausdrücklich übergebener Konfiguration (wie die Tests des Vorschlags) bleibt es gesperrt
    const create = vi.fn();
    expect((await gruendeVorschlag(t.id, team(k), text.wuensche, { konfig: { art: "bedrock", region: "eu-central-1", accessKey: "a", secretKey: "s", model: "m" }, client: { messages: { create } } })).ok).toBe(false);
    expect((await zusammenfassungKi(t.id, team(k), text, { client: { messages: { create } } })).ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
    expect(bedrock).not.toHaveBeenCalled();

    // Die Blätter: Knöpfe aus, Hinweis an. Der Entwurf ohne KI bleibt.
    const info = (await ladeZusammenfassung(t.id, team(k), T0))!;
    expect(info).toMatchObject({ ki: false, vorschlag: null, kiAus: { am: am.toISOString(), inhaber: true } });
    expect(info.entwurf.wuensche).toContain("Fahrrad soll mit rein");
    expect(kiAusText("KI-Hilfe", info.kiAus!)).toBe(hinweis);
    const bd = (await ladeBeratungsdoku(t.id, team(k), T0))!;
    expect(bd).toMatchObject({ vorschlag: null, kiAus: { am: am.toISOString(), inhaber: true } });
    // Mitarbeiter: nächster Schritt ist der Inhaber
    const alsMitarbeiter = (await ladeZusammenfassung(t.id, team(k, mitarbeiter.id, "advisor"), T0))!;
    expect(alsMitarbeiter.kiAus).toEqual({ am: am.toISOString(), inhaber: false });
    expect(await zusammenfassungKi(t.id, team(k, mitarbeiter.id, "advisor"), text)).toEqual({
      ok: false,
      error: "KI-Hilfe ist für Ihr Konto abgeschaltet (Widerspruch vom 24.11.2026). Ihr Inhaber kann das in den Einstellungen ändern.",
    });

    // Rücknahme: sofort wieder an
    await nimmZurueck(ctx, "aws");
    expect((await ladeZusammenfassung(t.id, team(k), T0))!).toMatchObject({ ki: true, kiAus: null });
    bedrock.mockResolvedValueOnce({ content: [{ type: "text", text: "WÜNSCHE:\n• Familie\n• Fahrrad soll mit rein\nRAT:\n• Privathaftpflicht: Allianz Komfort" }] });
    expect((await zusammenfassungKi(t.id, team(k), text)).ok).toBe(true);
    expect(bedrock).toHaveBeenCalledTimes(1);
  });

  it("ohne eingerichtete KI gibt es keinen Hinweis (es gäbe die Knöpfe ohnehin nicht)", async () => {
    delete process.env.KI_EU_AWS_ACCESS_KEY_ID;
    const { k, ctx } = await kunde({ ...SOFTWARE, beratungsdokuAn: true });
    const { t } = await termin(k.id);
    await widerspreche(ctx, ["aws"]);
    expect((await ladeZusammenfassung(t.id, team(k), T0))!).toMatchObject({ ki: false, vorschlag: null, kiAus: null });
    expect((await ladeBeratungsdoku(t.id, team(k), T0))!).toMatchObject({ vorschlag: null, kiAus: null });
  });
});

describe("Widerspruch Amazon Web Services: Auslesen von Unterlagen (jeder Anbieter)", () => {
  const ENV = { ...process.env };
  const ABLAGE_ENV = {
    POLICEN_S3_ENDPOINT: "https://test123.eu.r2.cloudflarestorage.com",
    POLICEN_S3_BUCKET: "pg-policen-eu",
    POLICEN_S3_ACCESS_KEY_ID: "id",
    POLICEN_S3_SECRET_ACCESS_KEY: "secret",
    POLICEN_SCHLUESSEL: Buffer.alloc(32, 11).toString("base64"),
  };
  const objekte = new Map<string, Buffer>();
  const memory: Speicher = { put: async (k, b) => void objekte.set(k, b), get: async (k) => objekte.get(k) ?? null, del: async (ks) => ks.forEach((k) => objekte.delete(k)), list: async () => [] };
  let seq = 0;

  async function police(): Promise<Buffer> {
    const d = await PDFDocument.create();
    const font = await d.embedFont(StandardFonts.Helvetica);
    d.addPage([595, 842]).drawText("Versicherungsschein Hausratversicherung", { x: 50, y: 780, size: 12, font });
    return Buffer.from(await d.save());
  }
  async function leadMitUnterlage(customerId: string) {
    const phone = `4916${String(Date.now()).slice(-6)}${String(++seq).padStart(3, "0")}`;
    const lead = await prisma.lead.create({ data: { customerId, name: "Julia Schneider", phone, source: "Privatschutz", status: "Termin", reached: true } });
    const data = await police();
    const { storageKey, dateiSchluessel } = await legeAb(customerId, lead.id, data);
    const doc = await prisma.leadDocument.create({ data: { customerId, leadId: lead.id, status: "gespeichert", mimeType: "application/pdf", fileName: "Police.pdf", size: data.length, storageKey, dateiSchluessel, sparte: "hausrat" } });
    // Einwilligung des Leads mit KI (Nachweis aus Policen per WhatsApp)
    await prisma.$executeRaw`INSERT INTO "PolicenNachweis" ("id","customerId","leadId","phone","art","ki","textVersion","quelle","createdAt") VALUES (${`pn-${uid()}`}, ${customerId}, ${lead.id}, ${phone}, 'einwilligung', true, '2026-11-18.g2', 'whatsapp', ${new Date()})`;
    return { lead, doc };
  }

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    await prisma.policenAuslesenEinstellung.deleteMany({});
    await prisma.policenAuslesenTag.deleteMany({});
  });
  beforeEach(() => {
    for (const k of Object.keys(process.env)) if (/^POLICEN_/.test(k)) delete process.env[k];
    Object.assign(process.env, { POLICEN_OPENAI_API_KEY: "sk-test-geheim", ...ABLAGE_ENV });
    setzeSpeicherFuerTests(memory);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...ENV };
  });
  afterAll(async () => {
    setzeSpeicherFuerTests(null);
    await prisma.policenAuslesenEinstellung.deleteMany({});
    await prisma.policenAuslesenTag.deleteMany({});
  });

  it("ohne Widerspruch wird ausgelesen; mit Widerspruch nichts mehr, bei jedem Anbieter, auch nicht im Hintergrund", async () => {
    const { k, ctx } = await kunde();
    const vorher = await leadMitUnterlage(k.id);
    expect(await sperreFuer(k.id, vorher.lead.id)).toBeNull();
    expect(await kiSatzAktiv({ customerId: k.id, source: "Privatschutz", formular: [], angaben: null })).toBe(true);
    expect(await nachEingang(vorher.lead.id)).toBe(1);
    expect(oa.calls).toHaveLength(1);

    const am = new Date("2026-11-24T10:00:00Z");
    await widerspreche(ctx, ["aws"], am);
    oa.calls = [];
    const a = await leadMitUnterlage(k.id);
    for (const anbieter of ["openai-eu", "bedrock-eu"]) {
      process.env.POLICEN_AUSLESEN_ANBIETER = anbieter;
      process.env.KI_EU_AWS_ACCESS_KEY_ID = "AKIATEST";
      process.env.KI_EU_AWS_SECRET_ACCESS_KEY = "geheim";
      expect(await sperreFuer(k.id, a.lead.id), anbieter).toBe("widerspruch");
      // Eingang per WhatsApp (Hintergrund), Vergleichsblatt und Sparten-Wahl des Vermittlers
      expect(await nachEingang(a.lead.id), anbieter).toBe(0);
      expect(await liesUnterlageAus(a.doc.id), anbieter).toEqual({ status: "gesperrt:widerspruch" });
      expect(await waehleSparte({ customerId: k.id, userId: ctx.userId, leadId: a.lead.id }, a.doc.id, "hausrat"), anbieter).toEqual({ status: "gesperrt:widerspruch" });
      // Kein „damit Ihr Vergleich schon fertig ist“ an den Lead
      expect(await kiSatzAktiv({ customerId: k.id, source: "Privatschutz", formular: [], angaben: null }), anbieter).toBe(false);
    }
    expect(oa.calls).toHaveLength(0);
    expect(bedrock).not.toHaveBeenCalled();
    expect(await prisma.policenAuszug.count({ where: { leadId: a.lead.id } })).toBe(0);

    // Vergleichsblatt: Sperre mit Datum für den Hinweis; schon ausgelesene Werte bleiben sichtbar
    const v = await ladeVergleich(a.lead.id, k.id);
    expect(v).toMatchObject({ sperre: "widerspruch", widerspruchAm: am.toISOString(), vertraege: [] });
    expect(v.offen).toHaveLength(1);
    expect((await ladeVergleich(vorher.lead.id, k.id)).vertraege).toHaveLength(1);

    // Rücknahme: wird wieder ausgelesen
    delete process.env.POLICEN_AUSLESEN_ANBIETER;
    await nimmZurueck(ctx, "aws");
    expect(await sperreFuer(k.id, a.lead.id)).toBeNull();
    expect(await ladeVergleich(a.lead.id, k.id)).toMatchObject({ sperre: null, widerspruchAm: null });
    expect(await nachEingang(a.lead.id)).toBe(1);
    expect(oa.calls).toHaveLength(1);
  });

  it("der Widerspruch eines Kunden wirkt nicht auf andere Kunden", async () => {
    const a = await kunde();
    const b = await kunde();
    await widerspreche(a.ctx, ["aws"]);
    const beiB = await leadMitUnterlage(b.k.id);
    expect(await sperreFuer(b.k.id, beiB.lead.id)).toBeNull();
    expect(await nachEingang(beiB.lead.id)).toBe(1);
  });
});
