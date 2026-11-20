// Eigener PKV-Funnel (lib/funnel, Ole 20.11.2026): Konfiguration, Abbruchregeln, Prüfregeln, Felder für den
// Pay-per-Lead-Eingang, Ergebnis beim Abnehmer, Meta-Payload ohne Klartextdaten, Funnel-Adresse und Middleware.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getRedirectUrl, getRewrittenUrl, isRewrite } from "next/experimental/testing/server";
import {
  ablauf,
  datumTippen,
  geburtsdatumOk,
  naechsterSchritt,
  PKV_BEITRAG,
  pplFelder,
  pruefeAlles,
  pruefeSchritt,
  saubereAntworten,
  testSchritte,
  texteFuer,
  type Antworten,
} from "@/lib/funnel/definition";
import { PKV_TEXTE, PKV_VERSICHERER } from "@/lib/funnel/pkv-beitrag-texte";
import { decideFunnelHost, gueltigeBesuchId, parseFunnelHosts } from "@/lib/funnel/host";
import { fbcAusFbclid, leadEreignis, qualitaetAn, qualitaetEventName, qualitaetsEreignis, userData } from "@/lib/funnel/meta";
import { bewerteLead, saubereQuelle, type LeadFakten } from "@/lib/funnel/server";
import { categoryLabels } from "@/lib/ppl/perspective";
import { factsFrom } from "@/lib/ppl/engine";
import { EXPERIMENTE } from "@/lib/experimente";
import { securityHeaderRules } from "@/lib/security-headers";
import { RESERVED_SEGMENTS } from "@/lib/public-booking-host";
import { middleware } from "@/middleware";

const HEUTE = new Date("2026-11-20T10:00:00Z");
const f = PKV_BEITRAG;
const schritt = (id: string) => f.schritte.find((s) => s.id === id)!;

const VOLL: Antworten = {
  versichert: "Privat",
  versicherung: "DKV",
  situation: "Angestellt",
  dauer: "11 bis 20 Jahre",
  beitrag: "890",
  geburtsdatum: "14.03.1975",
  plz: "80331",
  ort: "München",
  vorname: "Erika",
  nachname: "Muster",
  email: "erika.muster@example.de",
  telefon: "0151 23456781",
};

describe("Funnel-Konfiguration", () => {
  it("7 Fragen in der Reihenfolge wie bei Perspective, eindeutige Schritte, Endseiten je Abbruch", () => {
    const ids = f.schritte.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ablauf(f).map((s) => s.id)).toEqual(["start", "versicherung", "situation", "dauer", "beitrag", "geburtsdatum", "wohnort", "fast-fertig", "name", "kontakt"]);
    const nr = f.schritte.flatMap((s) => ("frageNr" in s && s.frageNr ? [s.frageNr] : []));
    expect(nr).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(f.fragenGesamt).toBe(7);
    expect(f.schritte.filter((s) => s.art === "ende").map((s) => (s as { grund: string }).grund).sort()).toEqual(["gesetzlich", "unter_650"]);
    expect(PKV_VERSICHERER.at(-1)).toBe("Sonstige");
    const sit = schritt("situation");
    expect(sit.art === "auswahl" ? sit.optionen : []).toHaveLength(9);
  });

  it("Abbruchregeln: gesetzlich und Beitrag unter 650 € enden freundlich, sonst weiter", () => {
    expect(naechsterSchritt(f, "start", { versichert: "Gesetzlich" })).toEqual({ id: "ende-gesetzlich", abbruch: "gesetzlich" });
    expect(naechsterSchritt(f, "start", { versichert: "Privat" })).toEqual({ id: "versicherung", abbruch: null });
    expect(naechsterSchritt(f, "beitrag", { beitrag: "649" })).toEqual({ id: "ende-beitrag", abbruch: "unter_650" });
    expect(naechsterSchritt(f, "beitrag", { beitrag: "650" })).toEqual({ id: "geburtsdatum", abbruch: null });
    expect(naechsterSchritt(f, "beitrag", { beitrag: "1.200,50" }).id).toBe("geburtsdatum");
    expect(naechsterSchritt(f, "kontakt", VOLL).id).toBe("danke");
  });

  it("Prüfregeln je Feld", () => {
    expect(pruefeSchritt(schritt("start"), {})).toHaveProperty("versichert");
    expect(pruefeSchritt(schritt("versicherung"), { versicherung: "Erfunden AG" })).toHaveProperty("versicherung");
    expect(pruefeSchritt(schritt("beitrag"), { beitrag: "abc" })).toHaveProperty("beitrag");
    expect(pruefeSchritt(schritt("beitrag"), { beitrag: "900" })).toEqual({});
    expect(geburtsdatumOk("14.03.1975", HEUTE)).toBe("14.03.1975");
    expect(geburtsdatumOk("1.3.1975", HEUTE)).toBe("01.03.1975");
    expect(geburtsdatumOk("31.02.1980", HEUTE)).toBeNull();
    expect(geburtsdatumOk("21.11.2008", HEUTE)).toBeNull(); // 17 Jahre
    expect(geburtsdatumOk("20.11.2008", HEUTE)).toBe("20.11.2008"); // heute 18
    expect(geburtsdatumOk("01.01.1920", HEUTE)).toBeNull();
    expect(pruefeSchritt(schritt("wohnort"), { plz: "8033", ort: "München" })).toHaveProperty("plz");
    expect(pruefeSchritt(schritt("wohnort"), { plz: "80331", ort: "M" })).toHaveProperty("ort");
    expect(pruefeSchritt(schritt("wohnort"), { plz: "80331", ort: "Frankfurt am Main" })).toEqual({});
    expect(pruefeSchritt(schritt("name"), { vorname: "Jo", nachname: "Müller-Lüdenscheidt" })).toEqual({});
    expect(pruefeSchritt(schritt("name"), { vorname: "J", nachname: "123" })).toEqual({ vorname: PKV_TEXTE.name.fehlerVorname, nachname: PKV_TEXTE.name.fehlerNachname });
    expect(pruefeSchritt(schritt("kontakt"), { email: "a@b", telefon: "123" })).toEqual({ email: PKV_TEXTE.kontakt.fehlerEmail, telefon: PKV_TEXTE.kontakt.fehlerTelefon });
    expect(pruefeSchritt(schritt("kontakt"), { email: "x@y.de", telefon: "+49 151 23456781" })).toEqual({});
    expect(pruefeSchritt(schritt("kontakt"), { email: "x@y.de", telefon: "+43 660 1234567" })).toHaveProperty("telefon");
  });

  it("Geburtsdatum beim Tippen", () => {
    expect(datumTippen("14031975")).toBe("14.03.1975");
    expect(datumTippen("1.3.")).toBe("01.03.");
    expect(datumTippen("01.03.1975")).toBe("01.03.1975");
    expect(datumTippen("140")).toBe("14.0");
    expect(datumTippen("14.")).toBe("14.");
    expect(datumTippen("14")).toBe("14");
    expect(datumTippen("14.03.19756")).toBe("14.03.1975");
  });

  it("Gesamtprüfung auf dem Server: Fehler, Abbruch, ok", () => {
    expect(pruefeAlles(f, VOLL, HEUTE)).toEqual({ ok: true });
    expect(pruefeAlles(f, { ...VOLL, versichert: "Gesetzlich" }, HEUTE)).toMatchObject({ ok: false, abbruch: "gesetzlich", schritt: "start" });
    expect(pruefeAlles(f, { ...VOLL, beitrag: "500" }, HEUTE)).toMatchObject({ ok: false, abbruch: "unter_650", schritt: "beitrag" });
    expect(pruefeAlles(f, { ...VOLL, plz: "1" }, HEUTE)).toMatchObject({ ok: false, abbruch: null, schritt: "wohnort" });
    expect(saubereAntworten({ ...VOLL, unbekannt: "x", plz: "  80331 " })).toEqual({ ...VOLL, plz: "80331" });
  });

  it("Felder für den PPL-Eingang heißen wie bei den Perspective-Leads (PKV) und ergeben dieselben Filter-Merkmale", () => {
    const felder = pplFelder(f, VOLL, HEUTE);
    expect(felder).toEqual({
      Vorname: "Erika",
      Nachname: "Muster",
      "E-Mail": "erika.muster@example.de",
      Telefonnummer: "+4915123456781",
      Geburtsdatum: "14.03.1975",
      Postleitzahl: "80331",
      Ort: "München",
      "Aktuelle Versicherung": "DKV",
      "Wie lange in PKV?": "11 bis 20 Jahre",
      "Monatlicher Beitrag": "890",
      Situation: "Angestellt",
      "Gesetzlich oder privat?": "Privat",
      Source: f.quelle,
    });
    for (const label of categoryLabels("pkv")) expect(Object.keys(felder)).toContain(label);
    const facts = factsFrom(felder);
    expect(facts).toMatchObject({ plz: "80331", insurer: "DKV", contribution: 890, civilServant: false });
    expect(factsFrom(pplFelder(f, { ...VOLL, situation: "Beamter" }, HEUTE)).civilServant).toBe(true);
  });

  it("Fassung b je Schritt: Beispiel vorhanden, aber aus (alle sehen a)", () => {
    expect(testSchritte(f)).toEqual([{ schritt: "start", experiment: "funnel_pkv_beispiel" }]);
    expect(texteFuer(schritt("start"), "a").ueberschrift).toBe(PKV_TEXTE.start.ueberschrift);
    expect(texteFuer(schritt("start"), "b").ueberschrift).toBe(PKV_TEXTE.startB.ueberschrift);
    expect(texteFuer(schritt("start"), "b").frage).toBe(PKV_TEXTE.start.frage);
    expect(texteFuer(schritt("versicherung"), "b")).toEqual(schritt("versicherung").texte);
    const d = EXPERIMENTE.funnel_pkv_beispiel;
    expect(d).toMatchObject({ aktiv: false, ziel: "ppl_erreicht", reifTage: 14, ohneEreignis: "ppl_unbekannt" });
    expect(d.anzeigeZiele).toEqual(expect.arrayContaining(["funnel_lead", "ppl_termin", "ppl_abschluss", "ppl_umsatz"]));
  });

  it("Texte: keine Gedankenstriche, nur „bis zu 50 %“ als Zahl-Versprechen, Einwilligung nennt den Knopf", () => {
    const alle: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === "string") alle.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(PKV_TEXTE);
    for (const t of alle) expect(t, t).not.toMatch(/[–—]/);
    expect(alle.join(" ")).not.toMatch(/sehr wahrscheinlich|garant/i);
    expect(alle.filter((t) => /%/.test(t))).toEqual([PKV_TEXTE.name.ueberschrift]);
    expect(PKV_TEXTE.kontakt.einwilligung).toContain(`„${PKV_TEXTE.kontakt.knopf}“`);
  });
});

describe("Ergebnis beim Abnehmer (bewerteLead)", () => {
  const basis: LeadFakten = {
    poolStatus: "delivered",
    lieferweg: "app",
    lead: { isTest: false, kundeTest: false, status: "Neuer Lead", reached: false, closedAt: null, stornoState: null, stornoReason: null, termine: 0 },
    umsatz: 55,
    reklamiert: false,
  };
  const mit = (l: Partial<NonNullable<LeadFakten["lead"]>>, x: Partial<LeadFakten> = {}) => bewerteLead({ ...basis, ...x, lead: { ...basis.lead!, ...l } });

  it("Neuer Lead in der App: geliefert, mit Rückmeldemöglichkeit, noch nichts gemeldet", () => {
    expect(mit({})).toEqual({ geliefert: true, rueckmeldungMoeglich: true, rueckmeldung: false, erreicht: false, termin: false, abschluss: false, umsatz: true });
  });
  it("Nicht erreicht ist Rückmeldung, aber nicht erreicht; Im Gespräch bzw. Kein Interesse = erreicht", () => {
    expect(mit({ status: "Nicht erreicht" })).toMatchObject({ rueckmeldung: true, erreicht: false });
    expect(mit({ status: "Im Gespräch" })).toMatchObject({ erreicht: true, termin: false });
    expect(mit({ status: "Kein Interesse" })).toMatchObject({ erreicht: true });
    expect(mit({ reached: true })).toMatchObject({ erreicht: true });
  });
  it("Termin und Abschluss", () => {
    expect(mit({ termine: 1 })).toMatchObject({ erreicht: true, termin: true, abschluss: false });
    expect(mit({ status: "In Beratung" })).toMatchObject({ termin: true });
    expect(mit({ status: "Abschluss" })).toMatchObject({ erreicht: true, termin: true, abschluss: true });
    expect(mit({ closedAt: new Date() })).toMatchObject({ abschluss: true });
  });
  it("Storno wegen Nichterreichbarkeit oder falscher Daten zählt nie als erreicht; anderer Grund nur nicht als Umsatz", () => {
    expect(mit({ status: "Im Gespräch", stornoState: "approved", stornoReason: "Kontaktdaten unbekannt" })).toMatchObject({ erreicht: false, umsatz: false, rueckmeldung: true });
    expect(mit({ status: "Im Gespräch", stornoState: "approved", stornoReason: "Wohnsitz im Ausland" })).toMatchObject({ erreicht: true, umsatz: false });
    expect(mit({ status: "Im Gespräch", stornoState: "rejected", stornoReason: "Telefonnummer falsch" })).toMatchObject({ erreicht: true, umsatz: true });
    expect(mit({ status: "Im Gespräch" }, { reklamiert: true })).toMatchObject({ erreicht: false, umsatz: false });
  });
  it("Versand per E-Mail: Ergebnis unbekannt; nicht geliefert, Test: nichts", () => {
    expect(mit({ status: "Im Gespräch" }, { lieferweg: "email" })).toMatchObject({ geliefert: true, rueckmeldungMoeglich: false });
    expect(bewerteLead({ ...basis, poolStatus: "duplicate", lead: null })).toMatchObject({ geliefert: false, erreicht: false });
    expect(mit({ isTest: true, status: "Abschluss" })).toMatchObject({ geliefert: false, abschluss: false });
    expect(mit({}, { umsatz: 0 })).toMatchObject({ umsatz: false });
  });
});

describe("Meta: Conversions API ohne Klartextdaten", () => {
  const nutzer = { besuchId: "b-1234567890abcdef", email: " Erika.Muster@Example.de ", telefon: "4915123456781", vorname: "Erika", nachname: "Muster", geburtsdatum: "14.03.1975", plz: "80331", ort: "München", fbc: "fb.1.1700000000000.AbCdEf123", fbp: "fb.1.1700000000000.123456789", ip: "203.0.113.5", userAgent: "Mozilla/5.0" };

  it("Personendaten nur als SHA-256 nach Meta-Normalisierung, Kennungen ungehasht", () => {
    const u = userData(nutzer);
    const json = JSON.stringify(u);
    for (const klar of ["erika", "Erika", "muster", "example", "4915123456781", "80331", "münchen", "München", "19750314", "b-1234567890abcdef"]) expect(json).not.toContain(klar);
    const sha = (x: string) => createHash("sha256").update(x).digest("hex");
    expect(u.em).toEqual([sha("erika.muster@example.de")]);
    expect(u.ph).toEqual([sha("4915123456781")]);
    expect(u.db).toEqual([sha("19750314")]);
    expect(u.ct).toEqual([sha("münchen")]);
    expect(u.external_id).toEqual([sha(nutzer.besuchId)]);
    expect(u.fbc).toBe(nutzer.fbc);
    expect(u.fbp).toBe(nutzer.fbp);
    expect(u.client_ip_address).toBe("203.0.113.5");
    expect(u.client_user_agent).toBe("Mozilla/5.0");
    expect(Object.keys(u).sort()).toEqual(["client_ip_address", "client_user_agent", "country", "ct", "db", "em", "external_id", "fbc", "fbp", "fn", "ln", "ph", "zp"]);
  });

  it("Lead-Ereignis mit event_id (gleich wie im Pixel), Qualitäts-Ereignis mit Wert und fester event_id", () => {
    const zeit = new Date("2026-11-20T10:00:00Z");
    const e = leadEreignis({ eventId: "abc12345-xyz", zeit, url: "https://beitrag.pkv-tarife.com/", nutzer, produkt: "PKV-Tarifoptimierung" });
    expect(e).toMatchObject({ event_name: "Lead", event_id: "abc12345-xyz", action_source: "website", event_time: Math.floor(zeit.getTime() / 1000), event_source_url: "https://beitrag.pkv-tarife.com/" });
    const q = qualitaetsEreignis({ zeit, wert: 54.62, nutzer, produkt: "PKV-Tarifoptimierung" });
    expect(q).toMatchObject({ event_name: "LeadErreicht", event_id: `q-${nutzer.besuchId}`, custom_data: { value: 54.62, currency: "EUR" } });
    expect(JSON.stringify([e, q])).not.toMatch(/erika|muster|4915123456781/i);
  });

  it("Qualitäts-Ereignis standardmäßig aus, Name einstellbar; fbc aus fbclid", () => {
    expect(qualitaetAn({})).toBe(false);
    expect(qualitaetAn({ FUNNEL_META_QUALITAET: "an" })).toBe(true);
    expect(qualitaetEventName({})).toBe("LeadErreicht");
    expect(qualitaetEventName({ FUNNEL_META_QUALITAET_EVENT: "Purchase" })).toBe("Purchase");
    expect(fbcAusFbclid("IwAR0abcdefghijk", 1700000000000)).toBe("fb.1.1700000000000.IwAR0abcdefghijk");
    expect(fbcAusFbclid("kurz", 1)).toBeNull();
  });

  it("Herkunft: nur Tracking-Schlüssel, fbclid nur als vorhanden", () => {
    expect(saubereQuelle({ utm_source: "facebook", utm_campaign: "PKV Herbst", email: "x@y.de", fbclid: "IwAR0abcdef", ad_id: "{{ad.id}}" })).toEqual({ utm_source: "facebook", utm_campaign: "PKV Herbst", fbclid: true });
    expect(saubereQuelle({})).toBeNull();
  });
});

describe("Funnel-Adresse", () => {
  it("Zuordnung Host → Funnel, Standard beitrag.pkv-tarife.com", () => {
    expect([...parseFunnelHosts(undefined)]).toEqual([["beitrag.pkv-tarife.com", "pkv-beitrag"]]);
    expect([...parseFunnelHosts("a.de=pkv-beitrag, b.de=x")]).toEqual([["a.de", "pkv-beitrag"], ["b.de", "x"]]);
  });
  it("Entscheidungen", () => {
    const d = (pathname: string, host = "beitrag.pkv-tarife.com", search = "") => decideFunnelHost({ host, pathname, search });
    expect(d("/")).toEqual({ kind: "rewrite", pathname: "/f/pkv-beitrag", funnel: "pkv-beitrag" });
    expect(d("/", "beitrag.pkv-tarife.com:443")).toMatchObject({ kind: "rewrite" });
    expect(d("/api/funnel/ereignis")).toMatchObject({ kind: "serve" });
    expect(d("/_next/static/x.js")).toMatchObject({ kind: "serve" });
    expect(d("/f/pkv-beitrag")).toMatchObject({ kind: "serve" });
    expect(d("/robots.txt")).toEqual({ kind: "robots" });
    expect(d("/login", undefined, "?utm_source=fb")).toEqual({ kind: "redirect", location: "/?utm_source=fb" });
    expect(d("/admin")).toMatchObject({ kind: "redirect" });
    expect(d("/", "app.performancegrowth.de")).toEqual({ kind: "pass" });
    expect(gueltigeBesuchId("123e4567-e89b-12d3-a456-426614174000")).toBeTruthy();
    expect(gueltigeBesuchId("x;drop")).toBeNull();
    expect(RESERVED_SEGMENTS.has("f")).toBe(true);
  });
  it("CSP erlaubt den Meta-Pixel nur auf den Funnel-Seiten", () => {
    const rules = securityHeaderRules({});
    const funnel = rules.filter((r) => r.source === "/f/:path*" || r.has?.some((h) => h.type === "host"));
    expect(funnel).toHaveLength(2);
    for (const r of funnel) expect(r.headers[0].value).toContain("https://connect.facebook.net");
    expect(funnel[1].has).toEqual([{ type: "host", value: "beitrag\\.pkv-tarife\\.com" }]);
    const andere = rules.filter((r) => !funnel.includes(r)).flatMap((r) => r.headers.map((h) => h.value));
    expect(andere.join(" ")).not.toContain("facebook");
  });
});

describe("Middleware: eigene Funnels", () => {
  const req = (url: string, cookie?: string) => {
    const u = new URL(url);
    const headers = new Headers({ host: u.host });
    if (cookie) headers.set("cookie", cookie);
    return new NextRequest(`http://localhost:8080${u.pathname}${u.search}`, { headers });
  };

  it("beitrag.pkv-tarife.com/ zeigt den Funnel, vergibt die Besucher-ID, nicht indexieren", async () => {
    const res = await middleware(req("https://beitrag.pkv-tarife.com/?utm_source=fb"));
    expect(isRewrite(res)).toBe(true);
    expect(new URL(getRewrittenUrl(res)!).pathname).toBe("/f/pkv-beitrag");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const cookie = res.cookies.get("pf_bid");
    expect(gueltigeBesuchId(cookie?.value)).toBeTruthy();
    expect(cookie?.httpOnly).toBe(true);
  });

  it("vorhandene Besucher-ID bleibt; andere Pfade der App nicht erreichbar", async () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    const res = await middleware(req("https://beitrag.pkv-tarife.com/", `pf_bid=${id}`));
    expect(res.cookies.get("pf_bid")).toBeUndefined();
    const login = await middleware(req("https://beitrag.pkv-tarife.com/login"));
    expect(login.status).toBe(307);
    expect(new URL(getRedirectUrl(login)!).pathname).toBe("/");
  });

  it("/f/pkv-beitrag auf der App-Adresse ohne Login, mit Besucher-ID", async () => {
    process.env.AUTH_SECRET ||= "localtestsecret_localtestsecret_0123456789";
    const res = await middleware(req("https://app.performancegrowth.de/f/pkv-beitrag"));
    expect(res.status).toBe(200);
    expect(getRedirectUrl(res)).toBeNull();
    expect(res.cookies.get("pf_bid")).toBeTruthy();
    const api = await middleware(req("https://app.performancegrowth.de/api/funnel/ereignis"));
    expect(getRedirectUrl(api)).toBeNull();
  });
});
