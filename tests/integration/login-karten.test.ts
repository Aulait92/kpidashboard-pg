import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));

import { prisma } from "@/lib/prisma";
import { activeLoginCards, countLoginCardClick, deleteLoginCard, listLoginCards, loadLoginCardImage, moveLoginCard, saveLoginCard, toggleLoginCard } from "@/lib/login-karten-server";
import { GET as getImage } from "@/app/api/login-info/image/route";
import { GET as click } from "@/app/api/login-info/klick/route";
import { requireTestDb } from "./db";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const actor = { id: null, email: "admin@test.local", role: "ADMIN" };
const input = { enabled: "1", badge: "Neu", title: "Release-Webinar", text: "Am 24.11. um 19 Uhr", linkText: "Platz sichern", linkUrl: "/buyer/bestand" };

/** Ziel einer redirect()-Weiterleitung aus einem Route Handler. */
async function redirectTarget(p: Promise<Response>): Promise<string> {
  try {
    const res = await p;
    return res.headers.get("location") ?? "";
  } catch (err) {
    const digest = (err as { digest?: string }).digest ?? "";
    return digest.split(";")[2] ?? "";
  }
}

describe("Login-Karten: Laden, Speichern, Reihenfolge, Klicks", () => {
  let saved: unknown;
  beforeAll(async () => {
    requireTestDb();
    // Karten aus der Migration sichern und danach wiederherstellen
    saved = await prisma.loginCard.findMany();
    await prisma.loginCard.deleteMany({});
    await prisma.auditLog.deleteMany({ where: { action: { startsWith: "login_card." } } });
  });
  afterAll(async () => {
    await prisma.loginCard.deleteMany({});
    await prisma.loginCard.createMany({ data: saved as never });
    await prisma.auditLog.deleteMany({ where: { action: { startsWith: "login_card." } } });
  });

  it("anlegen mit Bild, hinten angehängt, Bild öffentlich ausgeliefert, Audit-Eintrag", async () => {
    const a = await saveLoginCard(null, input, { kind: "set", bytes: PNG, type: "image/png" }, actor);
    const b = await saveLoginCard(null, { ...input, title: "Zweite Karte", linkUrl: "https://performancegrowth.de/x" }, { kind: "keep" }, actor);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.card.position).toBeGreaterThan(a.card.position);
    expect(a.card.imageSrc).toMatch(/^\/api\/login-info\/image\?id=/);
    expect(b.card.imageSrc).toBeNull();
    const resp = await getImage(new Request(`http://x${a.card.imageSrc}`));
    expect(resp.status).toBe(200);
    expect(resp.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await resp.arrayBuffer())).toEqual(PNG);
    expect((await getImage(new Request("http://x/api/login-info/image?id=gibtsnicht"))).status).toBe(404);
    expect(await prisma.auditLog.count({ where: { action: "login_card.create" } })).toBe(2);
  });

  it("Bild aus /public (Migration) und Bild entfernen", async () => {
    const c = await prisma.loginCard.create({ data: { title: "Sparte", imagePath: "/login-karten/sparte.webp", position: 9 } });
    expect((await listLoginCards()).find((x) => x.id === c.id)?.imageSrc).toBe("/login-karten/sparte.webp");
    await saveLoginCard(c.id, { ...input, title: "Sparte" }, { kind: "remove" }, actor);
    expect((await listLoginCards()).find((x) => x.id === c.id)?.imageSrc).toBeNull();
    await deleteLoginCard(c.id, actor);
    expect(await prisma.loginCard.count({ where: { id: c.id } })).toBe(0);
  });

  it("ungültige Eingaben werden nicht gespeichert", async () => {
    const [first] = await listLoginCards();
    const bad = await saveLoginCard(first.id, { ...input, title: "Geändert", linkUrl: "javascript:alert(1)" }, { kind: "keep" }, actor);
    expect(bad.ok).toBe(false);
    const svg = await saveLoginCard(first.id, { ...input, title: "Geändert" }, { kind: "set", bytes: new TextEncoder().encode("<svg/>"), type: "image/svg+xml" }, actor);
    expect(svg.ok).toBe(false);
    expect((await listLoginCards())[0].title).toBe(first.title);
  });

  it("an/aus und Reihenfolge: nur aktive Karten auf der Login-Seite, in Reihenfolge", async () => {
    const [a, b] = await listLoginCards();
    await moveLoginCard(b.id, -1, actor);
    expect((await listLoginCards()).map((c) => c.id)).toEqual([b.id, a.id]);
    await moveLoginCard(b.id, -1, actor); // ganz oben: bleibt
    expect((await listLoginCards()).map((c) => c.position)).toEqual([1, 2]);
    await toggleLoginCard(b.id, actor);
    expect((await activeLoginCards()).map((c) => c.id)).toEqual([a.id]);
    await toggleLoginCard(b.id, actor);
    expect((await activeLoginCards()).map((c) => c.id)).toEqual([b.id, a.id]);
  });

  it("Klick wird gezählt und führt ohne Anmeldung zum Login mit Ziel; extern direkt", async () => {
    const cards = await listLoginCards();
    const intern = cards.find((c) => c.linkUrl === "/buyer/bestand")!;
    const extern = cards.find((c) => c.linkUrl?.startsWith("https://"))!;
    const before = await loadLoginCardImage(intern.id);
    expect(await redirectTarget(click(new Request(`http://x/api/login-info/klick?id=${intern.id}`)))).toBe(`/login?next=%2Fbuyer%2Fbestand&karte=${intern.id}`);
    expect(await redirectTarget(click(new Request(`http://x/api/login-info/klick?id=${extern.id}`)))).toBe("https://performancegrowth.de/x");
    expect(await redirectTarget(click(new Request("http://x/api/login-info/klick?id=gibtsnicht")))).toBe("/login");
    expect(await countLoginCardClick(intern.id)).toBe("/buyer/bestand");
    const after = await listLoginCards();
    expect(after.find((c) => c.id === intern.id)?.clicks).toBe(2);
    expect(after.find((c) => c.id === extern.id)?.clicks).toBe(1);
    // Zählen ändert den Cache-Schlüssel des Bildes nicht
    expect(after.find((c) => c.id === intern.id)?.imageSrc).toBe(intern.imageSrc);
    expect(before).not.toBeNull();
  });
});
