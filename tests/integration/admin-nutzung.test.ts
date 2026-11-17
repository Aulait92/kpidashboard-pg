// Nutzungsmessung im Admin (Ole, 18.11.2026): Speichern nur für Admins, Normalisierung und Dedupe auf dem Server,
// Aufräumen nach 180 Tagen, Diagnose q=admin-nutzung nur mit Zahlen (keine Namen, E-Mails, IDs).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resetRateLimits } from "@/lib/rate-limit";
import { requireTestDb } from "./db";

const st: { session: SessionPayload | null } = { session: null };
vi.mock("@/lib/auth", () => ({ getCurrentSession: async () => st.session }));

const { POST } = await import("@/app/api/admin/nutzung/route");
const { GET } = await import("@/app/api/ops/diagnose/route");
const { pruneAdminNutzung } = await import("@/lib/admin-nutzung-server");

const TOKEN = "test-read-token-0123456789-0123456789-abcdef";
const buchstaben = () => Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");
const tag = buchstaben();
const CUID = "cmh3x9k2a0001qz8y7v6u5t4s";

const senden = (body: unknown) => POST(new Request("https://app.test/api/admin/nutzung", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
const diagnose = async (qs: string) => {
  const r = await GET(new Request(`https://app.test/api/ops/diagnose?q=admin-nutzung${qs}`, { headers: { authorization: `Bearer ${TOKEN}` } }));
  expect(r.status).toBe(200);
  return { text: await r.clone().text(), json: (await r.json()) as { data: Record<string, unknown> } };
};

describe("Admin-Nutzung", () => {
  const before = process.env.OPS_READ_TOKEN;
  const ids: string[] = [];
  let admin1 = "";
  let admin2 = "";
  let buyer = "";

  beforeAll(async () => {
    requireTestDb();
    process.env.OPS_READ_TOKEN = TOKEN;
    const mk = (role: "ADMIN" | "BUYER", i: number) =>
      prisma.user.create({ data: { email: `admin-nutzung-${tag}-${i}@test.local`, passwordHash: "x", role } });
    admin1 = (await mk("ADMIN", 1)).id;
    admin2 = (await mk("ADMIN", 2)).id;
    buyer = (await mk("BUYER", 3)).id;
    ids.push(admin1, admin2, buyer);
  });
  beforeEach(() => resetRateLimits());
  afterAll(async () => {
    process.env.OPS_READ_TOKEN = before;
    await prisma.auditLog.deleteMany({ where: { action: { startsWith: `test.${tag}` } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  });

  it("speichert nur für eingeloggte Admins", async () => {
    const body = { n: Date.now(), e: [{ a: "seite", k: `/admin/neu/test-${tag}`, o: "neu", t: Date.now() }] };
    st.session = null;
    expect((await senden(body)).status).toBe(403);
    st.session = { userId: buyer, email: "b@test.local", role: "BUYER", customerId: "c1" };
    expect((await senden(body)).status).toBe(403);
    expect(await prisma.adminUsageEvent.count({ where: { schluessel: `/admin/neu/test-${tag}` } })).toBe(0);
    st.session = { userId: admin1, email: "a@test.local", role: "ADMIN" };
    const r = await senden(body);
    expect(r.status).toBe(200);
    expect(await prisma.adminUsageEvent.count({ where: { adminUserId: admin1, schluessel: `/admin/neu/test-${tag}`, oberflaeche: "neu" } })).toBe(1);
  });

  it("normalisiert Pfade, verwirft Fremdes und Kaputtes", async () => {
    st.session = { userId: admin1, email: "a@test.local", role: "ADMIN" };
    const t = Date.now();
    const r = await senden({
      n: t,
      e: [
        { a: "seite", k: `/admin/kunden/${CUID}/leads?q=Max+Mustermann`, o: "neu", t },
        { a: "seite", k: "/buyer/leads", o: "alt", t },
        { a: "funktion", k: "<b>Name</b>", o: "neu", t },
        { a: "funktion", k: `test-${tag}--speichern`, o: "neu", t },
      ],
    });
    expect(await r.json()).toMatchObject({ ok: true, gespeichert: 2 });
    const rows = await prisma.adminUsageEvent.findMany({ where: { adminUserId: admin1, at: { gte: new Date(t - 5000) } }, select: { art: true, schluessel: true, oberflaeche: true } });
    expect(rows).toEqual(
      expect.arrayContaining([
        { art: "seite", schluessel: "/admin/kunden/:id/leads", oberflaeche: "alt" },
        { art: "funktion", schluessel: `test-${tag}--speichern`, oberflaeche: "neu" },
      ]),
    );
    expect(JSON.stringify(rows)).not.toContain("Mustermann");
    expect(JSON.stringify(rows)).not.toContain(CUID);
    expect((await senden("kein json")).status).toBe(400);
    expect((await senden({ e: "x" })).status).toBe(400);
  });

  it("gleicher Klick innerhalb 1 s zählt einmal, auch über zwei Sendungen", async () => {
    st.session = { userId: admin2, email: "c@test.local", role: "ADMIN" };
    const k = `test-${tag}--doppelt`;
    const t = Date.now();
    await senden({ n: t, e: [{ a: "funktion", k, o: "neu", t }, { a: "funktion", k, o: "neu", t: t + 300 }] });
    await senden({ n: t + 600, e: [{ a: "funktion", k, o: "neu", t: t + 600 }] });
    expect(await prisma.adminUsageEvent.count({ where: { schluessel: k } })).toBe(1);
  });

  it("Ratenbegrenzung je Admin", async () => {
    st.session = { userId: admin2, email: "c@test.local", role: "ADMIN" };
    const body = { n: Date.now(), e: [] };
    const status: number[] = [];
    for (let i = 0; i < 32; i++) status.push((await senden(body)).status);
    expect(status.filter((s) => s === 429).length).toBe(2);
  });

  it("Diagnose: Zahlen je Aktion, Funktion und Seite, System getrennt, keine Personendaten", async () => {
    const jetzt = Date.now();
    const vor = (h: number) => new Date(jetzt - h * 3600_000);
    await prisma.auditLog.createMany({
      data: [
        { action: `test.${tag}.speichern`, actorId: admin1, actorEmail: `admin-nutzung-${tag}-1@test.local`, actorRole: "ADMIN", at: vor(1) },
        { action: `test.${tag}.speichern`, actorId: admin1, actorEmail: `admin-nutzung-${tag}-1@test.local`, actorRole: "ADMIN", at: vor(2) },
        { action: `test.${tag}.speichern`, actorId: admin2, actorEmail: `admin-nutzung-${tag}-2@test.local`, actorRole: "ADMIN", at: vor(3) },
        { action: `test.${tag}.speichern`, actorRole: "system", at: vor(1) },
        { action: `test.${tag}.alt`, actorId: admin1, actorRole: "ADMIN", at: vor(24 * 40) },
      ],
    });
    await prisma.adminUsageEvent.createMany({
      data: [
        { adminUserId: admin1, art: "funktion", schluessel: `test-${tag}--zaehlen`, oberflaeche: "neu", at: vor(1) },
        { adminUserId: admin2, art: "funktion", schluessel: `test-${tag}--zaehlen`, oberflaeche: "alt", at: vor(2) },
        { adminUserId: admin2, art: "funktion", schluessel: `test-${tag}--zaehlen`, oberflaeche: "neu", at: vor(3) },
        { adminUserId: admin1, art: "gruppe", schluessel: `test-${tag}--gruppe`, oberflaeche: "neu", at: vor(1) },
        { adminUserId: admin1, art: "seite", schluessel: `/admin/neu/test-${tag}`, oberflaeche: "neu", at: vor(1) },
      ],
    });
    const { text, json } = await diagnose("");
    const d = json.data as {
      tage: number;
      datenSeit: Record<string, string | null>;
      aktionenAdmin: { aktion: string; anzahl: number; admins: number }[];
      aktionenSystem: { aktion: string; anzahl: number }[];
      funktionen: { id: string; anzahl: number; alt: number; neu: number; admins: number }[];
      inGruppe: { id: string; anzahl: number }[];
      seiten: { pfad: string; anzahl: number; admins: number }[];
    };
    expect(d.tage).toBe(30);
    expect(d.aktionenAdmin.find((a) => a.aktion === `test.${tag}.speichern`)).toMatchObject({ anzahl: 3, admins: 2 });
    // älter als 30 Tage: nicht im Zeitraum
    expect(d.aktionenAdmin.find((a) => a.aktion === `test.${tag}.alt`)).toBeUndefined();
    expect(d.aktionenSystem.find((a) => a.aktion === `test.${tag}.speichern`)).toMatchObject({ anzahl: 1 });
    expect(d.funktionen.find((f) => f.id === `test-${tag}--zaehlen`)).toMatchObject({ anzahl: 3, alt: 1, neu: 2, admins: 2 });
    expect(d.inGruppe.find((f) => f.id === `test-${tag}--gruppe`)).toMatchObject({ anzahl: 1 });
    expect(d.seiten.find((s) => s.pfad === `/admin/neu/test-${tag}`)).toMatchObject({ anzahl: 2, admins: 1 });
    // nach Anzahl sortiert
    const anz = d.funktionen.map((f) => f.anzahl);
    expect([...anz].sort((a, b) => b - a)).toEqual(anz);
    expect(d.datenSeit.klickmessung).not.toBeNull();
    expect(d.datenSeit.aenderungsprotokollAdmin).not.toBeNull();
    // keine Personendaten
    for (const geheim of [admin1, admin2, `admin-nutzung-${tag}`, "actorId", "actorEmail", "adminUserId"]) expect(text).not.toContain(geheim);

    // tage: höchstens 120, mit 60 kommt der alte Eintrag dazu
    expect((await diagnose("&tage=500")).json.data.tage).toBe(120);
    expect((await diagnose("&tage=abc")).json.data.tage).toBe(30);
    const d60 = (await diagnose("&tage=60")).json.data as typeof d;
    expect(d60.aktionenAdmin.find((a) => a.aktion === `test.${tag}.alt`)).toMatchObject({ anzahl: 1, admins: 1 });
  });

  it("räumt nach 180 Tagen auf und löscht mit dem Login", async () => {
    const k = `test-${tag}--alt`;
    await prisma.adminUsageEvent.create({ data: { adminUserId: admin1, art: "funktion", schluessel: k, oberflaeche: "neu", at: new Date(Date.now() - 181 * 86_400_000) } });
    await prisma.adminUsageEvent.create({ data: { adminUserId: admin1, art: "funktion", schluessel: k, oberflaeche: "neu", at: new Date(Date.now() - 179 * 86_400_000) } });
    await pruneAdminNutzung();
    expect(await prisma.adminUsageEvent.count({ where: { schluessel: k } })).toBe(1);
    await prisma.user.delete({ where: { id: admin2 } });
    expect(await prisma.adminUsageEvent.count({ where: { adminUserId: admin2 } })).toBe(0);
  });
});
