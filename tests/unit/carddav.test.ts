// Adressbuch fürs iPhone (CardDAV, lib/carddav): vCard-Bau, XML-Antworten, Anmeldung, nur lesen.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildVCard, escapeText, foldLine, kartenNummern, vcardEtag } from "@/lib/carddav/vcard";
import { parseDavRequest, parseXml, hrefPfad } from "@/lib/carddav/xml";
import { BUCH, carddavAntwort, kartenHref, ort, pruefeBasic, syncToken, zugang, type Adressbuch, type Anfrage } from "@/lib/carddav/dav";
import { baueAdressbuch, kartenStatus } from "@/lib/carddav/server";
import { resetRateLimits } from "@/lib/rate-limit";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { mussTunneln } from "@/lib/carddav/tunnel";

const PW = "x".repeat(12) + "y".repeat(12) + "z";
const env = { CARDDAV_PASSWORD: PW, NODE_ENV: "test" };
const basic = (u: string, p: string) => `Basic ${Buffer.from(`${u}:${p}`).toString("base64")}`;

describe("vCard", () => {
  it("maskiert Komma, Semikolon, Backslash und Zeilenumbruch", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });

  it("faltet lange Zeilen auf höchstens 75 Byte, ohne Umlaute zu zerschneiden", () => {
    const line = "NOTE:" + "ä".repeat(100);
    const folded = foldLine(line);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(Buffer.byteLength(p, "utf8")).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((p) => p.startsWith(" "))).toBe(true);
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(line);
    expect(foldLine("FN:kurz")).toBe("FN:kurz");
  });

  it("normalisiert Nummern auf E.164, ohne Dubletten und ungültige", () => {
    expect(kartenNummern(["0171 1234567", "+49 (0) 171 1234567", "0049 30 1234567", "abc", null, "12"])).toEqual([
      { e164: "+491711234567", mobil: true },
      { e164: "+49301234567", mobil: false },
    ]);
  });

  it("baut eine Karte mit Person, Firma, allen Nummern, Notiz und Link", () => {
    const v = buildVCard(
      { id: "c1", name: "Agentur Müller, Söhne; GmbH", salutation: "Herr", firstName: "Hans", lastName: "Müller", phones: ["0171 1234567", "030/1234567"], status: "Termin", updatedAt: new Date("2026-11-20T10:00:00.123Z") },
      { kontaktUrl: "https://app.example.de/admin/neu/vertrieb/kontakte/c1" },
    )!;
    expect(v.endsWith("\r\n")).toBe(true);
    expect(v.split("\r\n").every((l) => Buffer.byteLength(l, "utf8") <= 75)).toBe(true);
    const unfolded = v.replace(/\r\n /g, "");
    expect(unfolded).toContain("BEGIN:VCARD\r\nVERSION:3.0\r\n");
    expect(unfolded).toContain("UID:pg-vertrieb-c1\r\n");
    expect(unfolded).toContain("FN:Hans Müller\r\n");
    expect(unfolded).toContain("N:Müller;Hans;;Herr;\r\n");
    expect(unfolded).toContain("ORG:Agentur Müller\\, Söhne\\; GmbH\r\n");
    expect(unfolded).toContain("TEL;TYPE=CELL,VOICE:+491711234567\r\n");
    expect(unfolded).toContain("TEL;TYPE=WORK,VOICE:+49301234567\r\n");
    expect(unfolded).toContain("NOTE:performancegrowth Vertrieb · Termin\r\n");
    expect(unfolded).toContain("URL:https://app.example.de/admin/neu/vertrieb/kontakte/c1\r\n");
    expect(unfolded).toContain("REV:2026-11-20T10:00:00Z\r\n");
    expect(unfolded).toContain("END:VCARD\r\n");
    expect(unfolded).not.toContain("X-ABShowAs");
  });

  it("ohne Person: Firma als Name, als Firma angezeigt; ohne Nummer keine Karte", () => {
    const v = buildVCard({ id: "c2", name: "Versicherungsbüro Nord", phones: ["040 123456"], updatedAt: new Date() })!;
    expect(v).toContain("FN:Versicherungsbüro Nord\r\n");
    expect(v).toContain("N:;;;;\r\n");
    expect(v).toContain("X-ABShowAs:COMPANY\r\n");
    expect(buildVCard({ id: "c3", name: "Ohne", phones: [null, ""], updatedAt: new Date() })).toBeNull();
  });

  it("ETag ändert sich mit dem Inhalt", () => {
    const a = buildVCard({ id: "c", name: "A", phones: ["0171 1234567"], updatedAt: new Date(1) })!;
    const b = buildVCard({ id: "c", name: "A", phones: ["0171 1234567"], updatedAt: new Date(2000) })!;
    expect(vcardEtag(a)).toMatch(/^"[\w-]+"$/);
    expect(vcardEtag(a)).not.toBe(vcardEtag(b));
  });
});

describe("Adressbuch bauen", () => {
  const zeile = (id: string, extra: Partial<Parameters<typeof baueAdressbuch>[0][number]> = {}) => ({
    id,
    name: `Agentur ${id}`,
    salutation: null,
    firstName: null,
    lastName: null,
    phone: "0171 1234567",
    stage: "NEU" as const,
    customerStage: null,
    nieKontaktierenAt: null,
    updatedAt: new Date("2026-11-01T00:00:00Z"),
    phones: [],
    ...extra,
  });

  it("überspringt Kontakte ohne Nummer, ctag ändert sich bei neuer Zusatznummer", () => {
    const a = baueAdressbuch([zeile("a"), zeile("b", { phone: null })], null);
    expect(a.karten.map((k) => k.uid)).toEqual(["pg-vertrieb-a"]);
    const b = baueAdressbuch([zeile("a", { phones: [{ phone: "+4930999999", createdAt: new Date("2026-11-02T00:00:00Z") }] })], null);
    expect(b.ctag).not.toBe(a.ctag);
    expect(b.karten[0].vcard).toContain("TEL;TYPE=WORK,VOICE:+4930999999");
    expect(b.karten[0].vcard).toContain("REV:2026-11-02T00:00:00Z");
  });

  it("Status: Kunde vor Stufe, nicht kontaktieren dahinter", () => {
    expect(kartenStatus({ stage: "TERMIN", customerStage: null, nieKontaktierenAt: null })).toBe("Termin");
    expect(kartenStatus({ stage: "GEWONNEN", customerStage: "AKTIV", nieKontaktierenAt: new Date() })).toBe("Kunde: Aktiv · nicht kontaktieren");
  });
});

describe("XML lesen", () => {
  it("löst Namensräume auf (beliebige Präfixe, Standard-Namensraum)", () => {
    const r = parseDavRequest(
      `<?xml version="1.0" encoding="UTF-8"?><A:propfind xmlns:A="DAV:"><A:prop><A:resourcetype/><B:getctag xmlns:B="http://calendarserver.org/ns/"/><x xmlns="urn:foo"/></A:prop></A:propfind>`,
    )!;
    expect(r.root).toEqual({ ns: "DAV:", name: "propfind" });
    expect(r.props).toEqual([
      { ns: "DAV:", name: "resourcetype" },
      { ns: "http://calendarserver.org/ns/", name: "getctag" },
      { ns: "urn:foo", name: "x" },
    ]);
  });

  it("leerer PROPFIND = allprop; multiget-hrefs und sync-token", () => {
    expect(parseDavRequest("")!.props).toBe("allprop");
    const r = parseDavRequest(
      `<C:addressbook-multiget xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><D:prop><D:getetag/><C:address-data><C:prop name="FN"/></C:address-data></D:prop><D:href>/a.vcf</D:href><D:href> /b%20c.vcf </D:href></C:addressbook-multiget>`,
    )!;
    expect(r.props).toEqual([
      { ns: "DAV:", name: "getetag" },
      { ns: "urn:ietf:params:xml:ns:carddav", name: "address-data" },
    ]);
    expect(r.hrefs).toEqual(["/a.vcf", "/b%20c.vcf"]);
    expect(parseDavRequest(`<sync-collection xmlns="DAV:"><sync-token>abc&amp;d</sync-token><prop><getetag/></prop></sync-collection>`)!.syncToken).toBe("abc&d");
  });

  it("kaputtes XML → null", () => {
    expect(parseXml("<a><b></a>")).toBeNull();
    expect(parseXml("<x:a/>")).toBeNull();
    expect(parseDavRequest("<a>")).toBeNull();
  });

  it("hrefs: absolut, prozentkodiert, mit Schrägstrich", () => {
    expect(hrefPfad("https://app.example.de/api/carddav/adressbuecher/vertrieb/")).toBe(BUCH);
    expect(hrefPfad("/api/carddav/adressbuecher/vertrieb/pg-vertrieb-a%2Db.vcf")).toBe(`${BUCH}/pg-vertrieb-a-b.vcf`);
    expect(ort(`${BUCH}/../x.vcf`)).toBeNull();
    expect(ort(`${BUCH}/pg-vertrieb-a.vcf`)).toEqual({ art: "karte", uid: "pg-vertrieb-a" });
  });
});

describe("Anmeldung", () => {
  it("ohne Passwort (oder zu kurz) aus", () => {
    expect(zugang({})).toBeNull();
    expect(zugang({ CARDDAV_PASSWORD: "kurz" })).toBeNull();
    expect(zugang({ CARDDAV_PASSWORD: PW })).toEqual({ benutzer: "vertrieb", passwort: PW });
    expect(zugang({ CARDDAV_PASSWORD: PW, CARDDAV_USER: "Ole@Example.de" })?.benutzer).toBe("ole@example.de");
  });

  it("Basic: richtig, falsch, fehlt; Benutzername ohne Groß/klein", () => {
    const z = zugang({ CARDDAV_PASSWORD: PW })!;
    expect(pruefeBasic(basic("Vertrieb", PW), z)).toBe("ok");
    expect(pruefeBasic(basic("vertrieb", PW + "1"), z)).toBe("falsch");
    expect(pruefeBasic(basic("ole", PW), z)).toBe("falsch");
    expect(pruefeBasic(null, z)).toBe("fehlt");
    expect(pruefeBasic("Bearer abc", z)).toBe("fehlt");
  });
});

describe("CardDAV-Antworten", () => {
  const vcard = buildVCard({ id: "a", name: "Agentur A", firstName: "Anna", lastName: "Alt", phones: ["0171 1234567"], updatedAt: new Date(0) })!;
  const buch: Adressbuch = { karten: [{ uid: "pg-vertrieb-a", vcard, etag: vcardEtag(vcard) }], ctag: "1-1-abc" };
  const deps = { laden: async () => buch, env };
  const req = (method: string, pfad: string, body = "", h: Record<string, string> = {}): Anfrage => ({
    method,
    pfad,
    body,
    headers: new Headers({ authorization: basic("vertrieb", PW), "x-real-ip": "10.0.0.1", ...h }),
  });

  beforeEach(() => resetRateLimits());

  it("404 ohne CARDDAV_PASSWORD, 401 ohne Anmeldung (mit WWW-Authenticate)", async () => {
    expect((await carddavAntwort(req("PROPFIND", BUCH), { laden: deps.laden, env: {} })).status).toBe(404);
    const a = await carddavAntwort({ ...req("PROPFIND", BUCH), headers: new Headers() }, deps);
    expect(a.status).toBe(401);
    expect(a.headers["WWW-Authenticate"]).toMatch(/^Basic realm=/);
  });

  it("drosselt nach 10 Fehlversuchen je IP, auch das richtige Passwort", async () => {
    for (let i = 0; i < 10; i++) expect((await carddavAntwort(req("PROPFIND", BUCH, "", { authorization: basic("vertrieb", "falsch") }), deps)).status).toBe(401);
    expect((await carddavAntwort(req("PROPFIND", BUCH), deps)).status).toBe(429);
    expect((await carddavAntwort(req("PROPFIND", BUCH, "", { "x-real-ip": "10.0.0.2" }), deps)).status).toBe(207);
  });

  it("in Produktion nur HTTPS", async () => {
    const prod = { laden: deps.laden, env: { ...env, NODE_ENV: "production" } };
    expect((await carddavAntwort(req("PROPFIND", BUCH, "", { "x-forwarded-proto": "http" }), prod)).status).toBe(403);
    expect((await carddavAntwort(req("PROPFIND", BUCH, "", { "x-forwarded-proto": "https" }), prod)).status).toBe(207);
  });

  it("PROPFIND Depth 0 auf das Adressbuch: resourcetype, displayname, getctag, sync-token, supported-report-set", async () => {
    const body = `<d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/"><d:prop><d:resourcetype/><d:displayname/><cs:getctag/><d:sync-token/><d:supported-report-set/><d:quota-used-bytes/></d:prop></d:propfind>`;
    const a = await carddavAntwort(req("PROPFIND", BUCH, body, { depth: "0" }), deps);
    expect(a.status).toBe(207);
    expect(a.headers["Content-Type"]).toContain("application/xml");
    expect(a.body).toContain('<d:multistatus xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav" xmlns:cs="http://calendarserver.org/ns/">');
    expect(a.body).toContain("<d:resourcetype><d:collection/><card:addressbook/></d:resourcetype>");
    expect(a.body).toContain("<d:displayname>Vertrieb performancegrowth</d:displayname>");
    expect(a.body).toContain("<cs:getctag>1-1-abc</cs:getctag>");
    expect(a.body).toContain(`<d:sync-token>${syncToken("1-1-abc")}</d:sync-token>`);
    expect(a.body).toContain("<card:addressbook-multiget/>");
    expect(a.body).toContain("<d:propstat><d:prop><d:quota-used-bytes/></d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat>");
    expect(a.body).not.toContain(".vcf");
  });

  it("PROPFIND Depth 1: Karten mit getetag; Einstieg und Principal führen zum Adressbuch", async () => {
    const body = `<propfind xmlns="DAV:"><prop><getetag/><getcontenttype/></prop></propfind>`;
    const a = await carddavAntwort(req("PROPFIND", BUCH, body, { depth: "1" }), deps);
    expect(a.body).toContain(`<d:href>${kartenHref("pg-vertrieb-a")}</d:href>`);
    expect(a.body).toContain(`<d:getetag>${buch.karten[0].etag.replace(/"/g, "&quot;")}</d:getetag>`);
    const root = await carddavAntwort(req("PROPFIND", "/api/carddav", `<propfind xmlns="DAV:"><prop><current-user-principal/></prop></propfind>`, { depth: "0" }), deps);
    expect(root.body).toContain("<d:current-user-principal><d:href>/api/carddav/principal</d:href></d:current-user-principal>");
    const p = await carddavAntwort(
      req("PROPFIND", "/api/carddav/principal", `<propfind xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><prop><C:addressbook-home-set/></prop></propfind>`, { depth: "0" }),
      deps,
    );
    expect(p.body).toContain("<card:addressbook-home-set><d:href>/api/carddav/adressbuecher</d:href></card:addressbook-home-set>");
    const home = await carddavAntwort(req("PROPFIND", "/api/carddav/adressbuecher", `<propfind xmlns="DAV:"><prop><resourcetype/></prop></propfind>`, { depth: "1" }), deps);
    expect(home.body).toContain(`<d:href>${BUCH}</d:href>`);
  });

  it("REPORT addressbook-multiget: Karte mit address-data (XML-maskiert), unbekannte 404", async () => {
    const body = `<C:addressbook-multiget xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><D:prop><D:getetag/><C:address-data/></D:prop><D:href>${kartenHref("pg-vertrieb-a")}</D:href><D:href>${BUCH}/pg-vertrieb-x.vcf</D:href></C:addressbook-multiget>`;
    const a = await carddavAntwort(req("REPORT", BUCH, body, { depth: "1" }), deps);
    expect(a.status).toBe(207);
    expect(a.body).toContain("<card:address-data>BEGIN:VCARD\r\nVERSION:3.0");
    expect(a.body).toContain(`<d:response><d:href>${BUCH}/pg-vertrieb-x.vcf</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response>`);
  });

  it("REPORT addressbook-query gibt alle Karten; sync-collection: erst alles, dann nichts, alter Stand 403", async () => {
    const q = await carddavAntwort(req("REPORT", BUCH, `<C:addressbook-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><D:prop><D:getetag/></D:prop></C:addressbook-query>`), deps);
    expect(q.body).toContain(kartenHref("pg-vertrieb-a"));
    const sync = (t: string) => `<d:sync-collection xmlns:d="DAV:"><d:sync-token>${t}</d:sync-token><d:sync-level>1</d:sync-level><d:prop><d:getetag/></d:prop></d:sync-collection>`;
    const erst = await carddavAntwort(req("REPORT", BUCH, sync("")), deps);
    expect(erst.body).toContain(kartenHref("pg-vertrieb-a"));
    expect(erst.body).toContain(`<d:sync-token>${syncToken("1-1-abc")}</d:sync-token>`);
    const gleich = await carddavAntwort(req("REPORT", BUCH, sync(syncToken("1-1-abc"))), deps);
    expect(gleich.body).not.toContain(".vcf");
    const alt = await carddavAntwort(req("REPORT", BUCH, sync(syncToken("0-0-old"))), deps);
    expect(alt.status).toBe(403);
    expect(alt.body).toContain("<d:valid-sync-token/>");
  });

  it("GET einer Karte mit ETag und 304; Schreiben 403, unbekannte Methode 405", async () => {
    const g = await carddavAntwort(req("GET", kartenHref("pg-vertrieb-a")), deps);
    expect(g.status).toBe(200);
    expect(g.headers["Content-Type"]).toBe("text/vcard; charset=utf-8");
    expect(g.body).toBe(vcard);
    expect((await carddavAntwort(req("GET", kartenHref("pg-vertrieb-a"), "", { "if-none-match": g.headers.ETag }), deps)).status).toBe(304);
    expect((await carddavAntwort(req("GET", `${BUCH}/pg-vertrieb-x.vcf`), deps)).status).toBe(404);
    for (const m of ["PUT", "DELETE", "PROPPATCH", "MKCOL"]) expect((await carddavAntwort(req(m, kartenHref("pg-vertrieb-a"), "x"), deps)).status).toBe(403);
    expect((await carddavAntwort(req("SEARCH", BUCH), deps)).status).toBe(405);
    const o = await carddavAntwort({ ...req("OPTIONS", BUCH), headers: new Headers() }, deps);
    expect(o.status).toBe(200);
    expect(o.headers.DAV).toBe("1, 3, addressbook");
  });

  it("kaputtes XML → 400", async () => {
    expect((await carddavAntwort(req("PROPFIND", BUCH, "<d:propfind xmlns:d='DAV:'><d:prop>"), deps)).status).toBe(400);
  });
});

describe("Middleware", () => {
  const mreq = (path: string, method = "GET", headers: Record<string, string> = {}) =>
    new NextRequest(`http://localhost:8080${path}`, { method, headers: new Headers({ host: "app.performancegrowth.de", ...headers }) });

  it("leitet /.well-known/carddav (auch PROPFIND) und PROPFIND auf / zum Endpunkt um", async () => {
    for (const [p, m] of [["/.well-known/carddav", "PROPFIND"], ["/.well-known/carddav", "GET"], ["/", "PROPFIND"]] as const) {
      const res = await middleware(mreq(p, m));
      expect(res.status).toBe(301);
      expect(new URL(res.headers.get("location")!).pathname).toBe("/api/carddav");
    }
  });

  it("lässt GET/PUT auf /api/carddav ohne Login-Cookie durch (kein Umweg über /login)", async () => {
    for (const m of ["GET", "PUT", "OPTIONS"]) {
      const res = await middleware(mreq(`${BUCH}/pg-vertrieb-a.vcf`, m, { authorization: basic("vertrieb", PW) }));
      expect(res.headers.get("location")).toBeNull();
      expect(res.headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("tunnelt PROPFIND als POST mit x-carddav-methode an den eigenen Server und gibt die Antwort zurück", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response("<d:multistatus/>", { status: 207, headers: { "content-type": "application/xml; charset=utf-8", "content-encoding": "gzip", dav: "1, 3, addressbook" } });
    });
    const port = process.env.PORT;
    process.env.PORT = "4321";
    try {
      const res = await middleware(mreq(BUCH, "PROPFIND", { authorization: basic("vertrieb", PW), depth: "1", "x-real-ip": "203.0.113.5", "x-carddav-methode": "DELETE" }));
      expect(res.status).toBe(207);
      expect(await res.text()).toBe("<d:multistatus/>");
      expect(res.headers.get("dav")).toBe("1, 3, addressbook");
      expect(res.headers.get("content-encoding")).toBeNull();
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe(`http://127.0.0.1:4321${BUCH}`);
      expect(calls[0].init.method).toBe("POST");
      const h = new Headers(calls[0].init.headers);
      expect(h.get("x-carddav-methode")).toBe("PROPFIND");
      expect(h.get("authorization")).toBe(basic("vertrieb", PW));
      expect(h.get("x-real-ip")).toBe("203.0.113.5");
      expect(h.get("depth")).toBe("1");
      expect(h.get("host")).toBeNull();
    } finally {
      vi.unstubAllGlobals();
      if (port === undefined) delete process.env.PORT;
      else process.env.PORT = port;
    }
  });

  it("Tunnel nur für /api/carddav und fremde Methoden", () => {
    expect(mussTunneln(BUCH, "PROPFIND")).toBe(true);
    expect(mussTunneln("/api/carddav", "REPORT")).toBe(true);
    expect(mussTunneln(BUCH, "GET")).toBe(false);
    expect(mussTunneln("/api/carddavx", "PROPFIND")).toBe(false);
    expect(mussTunneln("/buyer", "PROPFIND")).toBe(false);
  });
});
