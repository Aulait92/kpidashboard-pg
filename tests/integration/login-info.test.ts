import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { DEFAULT_LOGIN_INFO } from "@/lib/login-info";
import { loadLoginInfo, loadLoginInfoImage, saveLoginInfo } from "@/lib/login-info-server";
import { GET as getImage } from "@/app/api/login-info/image/route";
import { requireTestDb } from "./db";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const actor = { id: null, email: "admin@test.local", role: "ADMIN" };
const input = { enabled: "1", badge: "Neu", title: "Release-Webinar", text: "Am 24.11. um 19 Uhr", linkText: "Platz sichern", linkUrl: "https://performancegrowth.de/webinar" };

describe("Infokarte Login-Seite: Laden und Speichern", () => {
  beforeAll(async () => {
    requireTestDb();
    await prisma.loginInfo.deleteMany({});
    await prisma.auditLog.deleteMany({ where: { action: "login_info.update" } });
  });
  afterAll(async () => {
    await prisma.loginInfo.deleteMany({});
    await prisma.auditLog.deleteMany({ where: { action: "login_info.update" } });
  });

  it("ohne Eintrag: Standard-Karte, kein Bild (Route 404)", async () => {
    expect(await loadLoginInfo()).toEqual(DEFAULT_LOGIN_INFO);
    expect(await loadLoginInfoImage()).toBeNull();
    expect((await getImage()).status).toBe(404);
  });

  it("speichern mit Bild → geladen, Bild öffentlich ausgeliefert, Audit-Eintrag", async () => {
    const res = await saveLoginInfo(input, { kind: "set", bytes: PNG, type: "image/png" }, actor);
    expect(res.ok).toBe(true);
    const info = await loadLoginInfo();
    expect(info).toMatchObject({ enabled: true, badge: "Neu", title: "Release-Webinar", linkUrl: "https://performancegrowth.de/webinar", hasImage: true });
    expect(info.version).toBeGreaterThan(0);
    const resp = await getImage();
    expect(resp.status).toBe(200);
    expect(resp.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await resp.arrayBuffer())).toEqual(PNG);
    const log = await prisma.auditLog.findFirst({ where: { action: "login_info.update" }, orderBy: { at: "desc" } });
    expect(log?.details).toMatchObject({ aktiv: true, bild: "set" });
  });

  it("Text ändern ohne Bild-Upload behält das Bild; Entfernen löscht es", async () => {
    await saveLoginInfo({ ...input, title: "Neue Überschrift" }, { kind: "keep" }, actor);
    expect(await loadLoginInfo()).toMatchObject({ title: "Neue Überschrift", hasImage: true });
    await saveLoginInfo({ ...input }, { kind: "remove" }, actor);
    expect((await loadLoginInfo()).hasImage).toBe(false);
    expect((await getImage()).status).toBe(404);
  });

  it("ungültige Eingaben werden nicht gespeichert", async () => {
    const before = await loadLoginInfo();
    const bad = await saveLoginInfo({ ...input, title: "Geändert", linkUrl: "javascript:alert(1)" }, { kind: "keep" }, actor);
    expect(bad.ok).toBe(false);
    const svg = await saveLoginInfo({ ...input, title: "Geändert" }, { kind: "set", bytes: new TextEncoder().encode("<svg/>"), type: "image/svg+xml" }, actor);
    expect(svg.ok).toBe(false);
    expect((await loadLoginInfo()).title).toBe(before.title);
  });

  it("Schalter aus → Karte aus (Login zeigt nur das Formular)", async () => {
    await saveLoginInfo({ ...input, enabled: undefined }, { kind: "keep" }, actor);
    expect((await loadLoginInfo()).enabled).toBe(false);
  });
});
