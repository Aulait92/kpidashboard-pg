// Adressbuch fürs iPhone (CardDAV, Ole 22.11.2026) mit Testdatenbank: Route Handler
// (src/app/api/carddav/[[...pfad]]/route.ts), PROPFIND/REPORT wie in der Middleware getunnelt (lib/carddav/tunnel.ts).
// 401 ohne Anmeldung, 404 ohne CARDDAV_PASSWORD, 403 bei PUT.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as route from "@/app/api/carddav/[[...pfad]]/route";
import { prisma } from "@/lib/prisma";
import { resetCarddavCache } from "@/lib/carddav/server";
import { mussTunneln, tunnelAnfrage } from "@/lib/carddav/tunnel";
import { resetRateLimits } from "@/lib/rate-limit";
import { requireTestDb } from "./db";

const PW = "carddav-test-passwort-0123456789";
const tag = Math.random().toString(36).slice(2, 8);
const ids: string[] = [];

const auth = { authorization: `Basic ${Buffer.from(`vertrieb:${PW}`).toString("base64")}` };
const BUCH = "/api/carddav/adressbuecher/vertrieb";

async function dav(method: string, path: string, body?: string, headers: Record<string, string> = {}) {
  const h = new Headers({ "content-type": "application/xml; charset=utf-8", "x-real-ip": "198.51.100.9", ...headers });
  let req: Request;
  let fn: (r: Request) => Promise<Response>;
  if (mussTunneln(path, method)) {
    const t = tunnelAnfrage({ method, headers: h, nextUrl: { pathname: path, search: "" } }, body ?? "", "3000");
    req = new Request(t.url, t.init);
    fn = route.POST;
  } else {
    req = new Request(`http://localhost${path}`, { method, headers: h, body });
    fn = (route as unknown as Record<string, (r: Request) => Promise<Response>>)[method];
  }
  const res = await fn(req);
  return { status: res.status, text: await res.text(), headers: res.headers };
}

beforeAll(async () => {
  requireTestDb();
  const mit = await prisma.salesContact.create({
    data: { email: `carddav-${tag}-1@agentur.test`, name: `Agentur Nord, ${tag}`, firstName: "Hans", lastName: "Müller", phone: "0171 1234567", stage: "TERMIN" },
  });
  await prisma.salesContactPhone.create({ data: { contactId: mit.id, phone: "+4940123456", source: "MANUELL" } });
  const ohne = await prisma.salesContact.create({ data: { email: `carddav-${tag}-2@agentur.test`, name: `Ohne Nummer ${tag}` } });
  const geloescht = await prisma.salesContact.create({
    data: { email: `carddav-${tag}-3@art17.invalid`, name: "Gelöscht auf Verlangen", phone: "0172 7654321", art17GeloeschtAt: new Date() },
  });
  ids.push(mit.id, ohne.id, geloescht.id);
});

afterAll(async () => {
  await prisma.salesContact.deleteMany({ where: { id: { in: ids } } });
  delete process.env.CARDDAV_PASSWORD;
});

beforeEach(() => {
  process.env.CARDDAV_PASSWORD = PW;
  resetCarddavCache();
  resetRateLimits();
});

describe("CardDAV-Adressbuch Vertrieb", () => {
  it("404, wenn CARDDAV_PASSWORD fehlt", async () => {
    delete process.env.CARDDAV_PASSWORD;
    expect((await dav("PROPFIND", BUCH, undefined, auth)).status).toBe(404);
  });

  it("401 ohne Anmeldung, 401 mit falschem Passwort", async () => {
    const a = await dav("PROPFIND", BUCH);
    expect(a.status).toBe(401);
    expect(a.headers.get("www-authenticate")).toMatch(/^Basic realm="performancegrowth Vertrieb"/);
    const b = await dav("PROPFIND", BUCH, undefined, { authorization: `Basic ${Buffer.from("vertrieb:falsch").toString("base64")}` });
    expect(b.status).toBe(401);
  });

  it("PROPFIND Depth 1 listet nur Kontakte mit Nummer, ohne Art.-17-Löschungen", async () => {
    const a = await dav("PROPFIND", BUCH, `<d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/"><d:prop><d:getetag/><cs:getctag/><d:resourcetype/></d:prop></d:propfind>`, { ...auth, depth: "1" });
    expect(a.status).toBe(207);
    expect(a.text).toContain("<card:addressbook/>");
    expect(a.text).toMatch(/<cs:getctag>\d+-\d+-[\w-]+<\/cs:getctag>/);
    expect(a.text).toContain(`${BUCH}/pg-vertrieb-${ids[0]}.vcf`);
    expect(a.text).not.toContain(ids[1]);
    expect(a.text).not.toContain(ids[2]);
  });

  it("REPORT addressbook-multiget liefert die Karte mit allen Nummern", async () => {
    const href = `${BUCH}/pg-vertrieb-${ids[0]}.vcf`;
    const a = await dav(
      "REPORT",
      BUCH,
      `<C:addressbook-multiget xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><D:prop><D:getetag/><C:address-data/></D:prop><D:href>${href}</D:href></C:addressbook-multiget>`,
      { ...auth, depth: "1" },
    );
    expect(a.status).toBe(207);
    expect(a.text).toContain("FN:Hans Müller");
    expect(a.text).toContain(`ORG:Agentur Nord\\, ${tag}`);
    expect(a.text).toContain("TEL;TYPE=CELL,VOICE:+491711234567");
    expect(a.text).toContain("TEL;TYPE=WORK,VOICE:+4940123456");
    expect(a.text).toContain("NOTE:performancegrowth Vertrieb · Termin");
  });

  it("GET einer Karte als vCard mit ETag", async () => {
    const a = await dav("GET", `${BUCH}/pg-vertrieb-${ids[0]}.vcf`, undefined, auth);
    expect(a.status).toBe(200);
    expect(a.headers.get("content-type")).toBe("text/vcard; charset=utf-8");
    expect(a.headers.get("etag")).toMatch(/^"[\w-]+"$/);
    expect(a.text.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n")).toBe(true);
    expect((await dav("GET", `${BUCH}/pg-vertrieb-${ids[1]}.vcf`, undefined, auth)).status).toBe(404);
  });

  it("nur lesen: PUT und DELETE 403, nichts geändert", async () => {
    const href = `${BUCH}/pg-vertrieb-${ids[0]}.vcf`;
    expect((await dav("PUT", href, "BEGIN:VCARD\r\nEND:VCARD\r\n", { ...auth, "content-type": "text/vcard" })).status).toBe(403);
    expect((await dav("DELETE", href, undefined, auth)).status).toBe(403);
    expect((await dav("POST", href, "x", auth)).status).toBe(403);
    expect((await dav("PROPPATCH", BUCH, "<x/>", auth)).status).toBe(403);
    expect(await prisma.salesContact.count({ where: { id: ids[0] } })).toBe(1);
  });
});
