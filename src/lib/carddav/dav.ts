// Adressbuch „Vertrieb performancegrowth“ fürs iPhone (CardDAV, nur lesend, Ole 22.11.2026).
// Ruft ein Interessent zurück, zeigt das iPhone, wer es ist. Diese Datei beantwortet eine Anfrage vollständig
// (Anmeldung, PROPFIND, REPORT, GET), ohne Datenbank: Die Karten kommen über `laden` (lib/carddav/server.ts).
//
// Routing (Next.js 16): Route Handler (app/…/route.ts) kennen nur GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS und
// antworten auf PROPFIND/REPORT selbst mit 405. Deshalb tunnelt die Middleware diese Methoden als POST an den
// Route Handler src/app/api/carddav/[[...pfad]]/route.ts (Begründung und Ablauf: lib/carddav/tunnel.ts). Außerdem
// leitet sie /.well-known/carddav (und PROPFIND auf /) dorthin um und lässt /api/carddav ohne Login-Cookie durch.
//
// Aufbau (ohne abschließende Schrägstriche, weil Next „/x/“ per 308 auf „/x“ umleitet):
//   /api/carddav                          Einstieg (current-user-principal)
//   /api/carddav/principal                Benutzer (addressbook-home-set)
//   /api/carddav/adressbuecher            Adressbuch-Sammlung
//   /api/carddav/adressbuecher/vertrieb   das Adressbuch (getctag, sync-token)
//   /api/carddav/adressbuecher/vertrieb/<uid>.vcf   eine Karte
//
// Anmeldung: HTTP Basic, Benutzer „vertrieb“ (oder CARDDAV_USER), Passwort CARDDAV_PASSWORD (mindestens 24 Zeichen,
// Vergleich in konstanter Zeit). Ohne gültiges CARDDAV_PASSWORD ist das Adressbuch aus (404). In Produktion nur HTTPS.
// Fehlversuche je IP gedrosselt (LIMITS.carddavLogin). Sicherheit und Widerruf: docs/sicherheit-carddav.md.

import { createHash, timingSafeEqual } from "node:crypto";
import { LIMITS, clientIp, hit, isLimited } from "@/lib/rate-limit";
import {
  NS,
  type DavAnfrage,
  type QName,
  davError,
  escapeXml,
  hrefPfad,
  multistatus,
  parseDavRequest,
  propXml,
  responseXml,
  statusResponseXml,
} from "./xml";

export const BASIS = "/api/carddav";
export const PRINCIPAL = `${BASIS}/principal`;
export const HOME = `${BASIS}/adressbuecher`;
export const BUCH = `${HOME}/vertrieb`;
export const ANZEIGENAME = "Vertrieb performancegrowth";
export const STANDARD_BENUTZER = "vertrieb";
export const MIN_PASSWORT = 24;
const REALM = "performancegrowth Vertrieb";

export type Karte = { uid: string; vcard: string; etag: string };
export type Adressbuch = { karten: Karte[]; ctag: string };

export type Anfrage = { method: string; pfad: string; headers: Headers; body: string };
export type Antwort = { status: number; headers: Record<string, string>; body: string };

export type Umgebung = { CARDDAV_PASSWORD?: string; CARDDAV_USER?: string; NODE_ENV?: string };

/** Zugangsdaten aus der Umgebung; null = Adressbuch aus. */
export function zugang(env: Umgebung): { benutzer: string; passwort: string } | null {
  const passwort = env.CARDDAV_PASSWORD ?? "";
  if (passwort.trim().length < MIN_PASSWORT) return null;
  return { benutzer: (env.CARDDAV_USER?.trim() || STANDARD_BENUTZER).toLowerCase(), passwort };
}

function gleich(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Basic-Anmeldung prüfen. "fehlt" = kein (lesbarer) Authorization-Header. */
export function pruefeBasic(header: string | null, z: { benutzer: string; passwort: string }): "ok" | "fehlt" | "falsch" {
  const m = header?.match(/^Basic\s+([A-Za-z0-9+/=]+)\s*$/i);
  if (!m) return "fehlt";
  let decoded: string;
  try {
    decoded = Buffer.from(m[1], "base64").toString("utf8");
  } catch {
    return "falsch";
  }
  const i = decoded.indexOf(":");
  if (i < 0) return "falsch";
  const user = decoded.slice(0, i).trim().toLowerCase();
  const pass = decoded.slice(i + 1);
  // Beide Vergleiche immer ausführen (keine Abkürzung über den Benutzernamen)
  const okUser = gleich(user, z.benutzer);
  const okPass = gleich(pass, z.passwort);
  return okUser && okPass ? "ok" : "falsch";
}

const XML = { "Content-Type": "application/xml; charset=utf-8" };
const TEXT = { "Content-Type": "text/plain; charset=utf-8" };
const BASIS_HEADER = {
  "Cache-Control": "no-store, private",
  "X-Robots-Tag": "noindex, nofollow",
  DAV: "1, 3, addressbook",
};
const ERLAUBT = "OPTIONS, GET, HEAD, PROPFIND, REPORT";
const SCHREIBEN = new Set(["PUT", "DELETE", "PROPPATCH", "MKCOL", "MKCALENDAR", "MOVE", "COPY", "LOCK", "UNLOCK", "POST", "PATCH", "ACL", "BIND", "UNBIND", "REBIND"]);

const antwort = (status: number, body = "", headers: Record<string, string> = {}): Antwort => ({ status, body, headers: { ...BASIS_HEADER, ...headers } });
const text = (status: number, body: string, headers: Record<string, string> = {}) => antwort(status, body, { ...TEXT, ...headers });

type Ort = { art: "basis" } | { art: "principal" } | { art: "home" } | { art: "buch" } | { art: "karte"; uid: string } | null;

/** Pfad → Ressource. Unbekannte Pfade: null (404). */
export function ort(pfad: string): Ort {
  const p = hrefPfad(pfad);
  if (p === BASIS) return { art: "basis" };
  if (p === PRINCIPAL) return { art: "principal" };
  if (p === HOME) return { art: "home" };
  if (p === BUCH) return { art: "buch" };
  if (p.startsWith(`${BUCH}/`)) {
    const name = p.slice(BUCH.length + 1);
    const m = name.match(/^([A-Za-z0-9_-]{1,80})\.vcf$/);
    if (m) return { art: "karte", uid: m[1] };
  }
  return null;
}

export const kartenHref = (uid: string) => `${BUCH}/${uid}.vcf`;
export const syncToken = (ctag: string) => `https://performancegrowth.de/ns/carddav/sync/${ctag}`;

const q = (ns: string, name: string): QName => ({ ns, name });
const D = (name: string) => q(NS.DAV, name);
const C = (name: string) => q(NS.CARDDAV, name);
const CS = (name: string) => q(NS.CS, name);
const hrefEl = (h: string) => `<d:href>${escapeXml(h)}</d:href>`;

/** Eigenschaften je Ressource (Wert = XML-Inhalt). Reihenfolge = allprop. */
function eigenschaften(o: Exclude<Ort, null>, buch: Adressbuch, karte?: Karte): Map<string, { q: QName; xml: string }> {
  const map = new Map<string, { q: QName; xml: string }>();
  const set = (qn: QName, xml: string) => map.set(`${qn.ns}|${qn.name}`, { q: qn, xml });
  const lesen = "<d:privilege><d:read/></d:privilege><d:privilege><d:read-current-user-privilege-set/></d:privilege>";
  // Bei Karten nur das Nötige (Depth 1 über tausende Karten bleibt so klein)
  if (o.art !== "karte") {
    set(D("current-user-principal"), hrefEl(PRINCIPAL));
    set(D("principal-collection-set"), hrefEl(BASIS));
    set(D("current-user-privilege-set"), lesen);
  }
  switch (o.art) {
    case "basis":
      set(D("resourcetype"), "<d:collection/>");
      set(D("displayname"), escapeXml(ANZEIGENAME));
      break;
    case "principal":
      set(D("resourcetype"), "<d:principal/>");
      set(D("displayname"), escapeXml(ANZEIGENAME));
      set(D("principal-URL"), hrefEl(PRINCIPAL));
      set(C("addressbook-home-set"), hrefEl(HOME));
      break;
    case "home":
      set(D("resourcetype"), "<d:collection/>");
      set(D("displayname"), escapeXml(ANZEIGENAME));
      set(D("owner"), hrefEl(PRINCIPAL));
      break;
    case "buch":
      set(D("resourcetype"), "<d:collection/><card:addressbook/>");
      set(D("displayname"), escapeXml(ANZEIGENAME));
      set(D("owner"), hrefEl(PRINCIPAL));
      set(CS("getctag"), escapeXml(buch.ctag));
      set(D("sync-token"), escapeXml(syncToken(buch.ctag)));
      set(C("addressbook-description"), escapeXml("Alle Vertriebskontakte mit Telefonnummer (nur lesen)"));
      set(C("supported-address-data"), '<card:address-data-type content-type="text/vcard" version="3.0"/>');
      set(C("max-resource-size"), "102400");
      set(
        D("supported-report-set"),
        ["card:addressbook-multiget", "card:addressbook-query", "d:sync-collection"].map((r) => `<d:supported-report><d:report><${r}/></d:report></d:supported-report>`).join(""),
      );
      break;
    case "karte":
      if (karte) {
        set(D("resourcetype"), "");
        set(D("getetag"), escapeXml(karte.etag));
        set(D("getcontenttype"), "text/vcard; charset=utf-8");
        set(D("getcontentlength"), String(Buffer.byteLength(karte.vcard, "utf8")));
      }
      break;
  }
  return map;
}

/** Eine <d:response> für eine Ressource mit den gewünschten Eigenschaften (address-data nur für Karten). */
function antwortFuer(href: string, o: Exclude<Ort, null>, buch: Adressbuch, props: DavAnfrage["props"], karte?: Karte): string {
  const alle = eigenschaften(o, buch, karte);
  if (props === "propname") return responseXml(href, [...alle.values()].map((e) => propXml(e.q)));
  if (props === "allprop") return responseXml(href, [...alle.values()].map((e) => propXml(e.q, e.xml)));
  const found: string[] = [];
  const missing: QName[] = [];
  for (const p of props) {
    if (karte && p.ns === NS.CARDDAV && p.name === "address-data") {
      found.push(propXml(p, escapeXml(karte.vcard)));
      continue;
    }
    const e = alle.get(`${p.ns}|${p.name}`);
    if (e) found.push(propXml(e.q, e.xml));
    else missing.push(p);
  }
  return responseXml(href, found, missing);
}

const ms = (xml: string) => antwort(207, xml, XML);

function propfind(o: Exclude<Ort, null>, pfad: string, depth: string, req: DavAnfrage, buch: Adressbuch, karten: Map<string, Karte>): Antwort {
  if (o.art === "karte") {
    const k = karten.get(o.uid);
    if (!k) return text(404, "Nicht gefunden");
    return ms(multistatus([antwortFuer(kartenHref(o.uid), o, buch, req.props, k)]));
  }
  const self: Record<string, string> = { basis: BASIS, principal: PRINCIPAL, home: HOME, buch: BUCH };
  const out = [antwortFuer(self[o.art] ?? pfad, o, buch, req.props)];
  if (depth !== "0") {
    if (o.art === "basis") out.push(antwortFuer(PRINCIPAL, { art: "principal" }, buch, req.props), antwortFuer(HOME, { art: "home" }, buch, req.props));
    if (o.art === "home") out.push(antwortFuer(BUCH, { art: "buch" }, buch, req.props));
    if (o.art === "buch") for (const k of buch.karten) out.push(antwortFuer(kartenHref(k.uid), { art: "karte", uid: k.uid }, buch, req.props, k));
  }
  return ms(multistatus(out));
}

function report(o: Exclude<Ort, null>, req: DavAnfrage, buch: Adressbuch, karten: Map<string, Karte>): Antwort {
  const root = req.root;
  if (!root) return antwort(400, davError("<d:supported-report/>"), XML);
  const props: DavAnfrage["props"] = req.props === "allprop" || req.props === "propname" ? [D("getetag"), C("address-data")] : req.props;
  const kartenAntwort = (k: Karte) => antwortFuer(kartenHref(k.uid), { art: "karte", uid: k.uid }, buch, props, k);

  if (root.ns === NS.CARDDAV && root.name === "addressbook-multiget") {
    if (o.art !== "buch" && o.art !== "karte") return antwort(403, davError("<d:supported-report/>"), XML);
    const out = req.hrefs.map((h) => {
      const z = ort(h);
      const k = z?.art === "karte" ? karten.get(z.uid) : undefined;
      return k ? kartenAntwort(k) : statusResponseXml(h, 404);
    });
    return ms(multistatus(out));
  }
  if (root.ns === NS.CARDDAV && root.name === "addressbook-query") {
    // Filter werden nicht ausgewertet: Es gibt nur dieses eine Adressbuch, alle Karten zurück
    if (o.art !== "buch") return antwort(403, davError("<d:supported-report/>"), XML);
    return ms(multistatus(buch.karten.map(kartenAntwort)));
  }
  if (root.ns === NS.DAV && root.name === "sync-collection") {
    if (o.art !== "buch") return antwort(403, davError("<d:supported-report/>"), XML);
    const aktuell = syncToken(buch.ctag);
    const token = req.syncToken ?? "";
    const tokenXml = `<d:sync-token>${escapeXml(aktuell)}</d:sync-token>`;
    // Gleicher Stand: nichts geändert. Erste Abfrage: alles. Älterer Stand: Token ungültig (RFC 6578 3.2), dann lädt
    // der Client per PROPFIND neu (Löschungen merken wir uns nicht).
    if (token === aktuell) return ms(multistatus([], tokenXml));
    if (!token) return ms(multistatus(buch.karten.map(kartenAntwort), tokenXml));
    return antwort(403, davError("<d:valid-sync-token/>"), XML);
  }
  return antwort(403, davError("<d:supported-report/>"), XML);
}

export type Abhaengigkeiten = {
  laden: () => Promise<Adressbuch>;
  env?: Umgebung;
};

/** Beantwortet eine CardDAV-Anfrage vollständig. */
export async function carddavAntwort(a: Anfrage, deps: Abhaengigkeiten): Promise<Antwort> {
  const env = deps.env ?? (process.env as Umgebung);
  const z = zugang(env);
  if (!z) return text(404, "Nicht gefunden");
  const method = a.method.toUpperCase();

  // Nur HTTPS in Produktion (Railway setzt x-forwarded-proto); Basic schickt das Passwort sonst lesbar
  if (env.NODE_ENV === "production") {
    const proto = (a.headers.get("x-forwarded-proto") ?? "").split(",")[0].trim().toLowerCase();
    if (proto !== "https") return text(403, "Nur über HTTPS erreichbar.");
  }

  if (method === "OPTIONS") return antwort(200, "", { Allow: ERLAUBT });

  const ip = clientIp(a.headers);
  if (isLimited("carddavLogin", ip, LIMITS.carddavLogin)) {
    return text(429, "Zu viele Fehlversuche. Bitte später erneut versuchen.", { "Retry-After": "900" });
  }
  const login = pruefeBasic(a.headers.get("authorization"), z);
  if (login !== "ok") {
    if (login === "falsch") hit("carddavLogin", ip, LIMITS.carddavLogin);
    return text(401, "Anmeldung erforderlich", { "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"` });
  }

  const o = ort(a.pfad);
  if (SCHREIBEN.has(method)) {
    // Nur lesen: Änderungen am iPhone werden abgelehnt
    return antwort(403, davError("<d:need-privileges/>"), { ...XML, Allow: ERLAUBT });
  }
  if (!o) return text(404, "Nicht gefunden");

  if (method === "GET" || method === "HEAD") {
    if (o.art !== "karte") return text(200, `${ANZEIGENAME}: CardDAV-Adressbuch (nur lesen).`);
    const buch = await deps.laden();
    const k = buch.karten.find((x) => x.uid === o.uid);
    if (!k) return text(404, "Nicht gefunden");
    const inm = a.headers.get("if-none-match");
    if (inm && inm.split(",").map((s) => s.trim()).some((t) => t === k.etag || t === "*")) return antwort(304, "", { ETag: k.etag });
    return antwort(200, k.vcard, { "Content-Type": "text/vcard; charset=utf-8", ETag: k.etag });
  }

  if (method === "PROPFIND" || method === "REPORT") {
    const req = parseDavRequest(a.body);
    if (!req) return text(400, "Ungültiges XML");
    const buch = await deps.laden();
    const karten = new Map(buch.karten.map((k) => [k.uid, k]));
    if (method === "PROPFIND") {
      const depth = (a.headers.get("depth") ?? "infinity").trim().toLowerCase();
      return propfind(o, a.pfad, depth, req, buch, karten);
    }
    return report(o, req, buch, karten);
  }

  return text(405, "Methode nicht erlaubt", { Allow: ERLAUBT });
}
