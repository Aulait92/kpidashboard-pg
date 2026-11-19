// Öffentlich gesammelte Vermittlerliste importieren (Ole, 19.11.2026): Format erkennen, Trockenlauf ohne Schreiben,
// Sperrliste, „nie kontaktieren“, Abmeldung, bestehende Kunden (auch gleiche eigene Domain), Dubletten, vermutete
// E-Mails, vorhandene Kontakte nur ergänzen, Herkunft am Kontakt, gemischte Reihenfolge, 30.000 Zeilen, Tagesportion
// für Instantly mit Obergrenze je Domain. Nur synthetische Daten, kein Instantly-Aufruf (fetch wird überwacht).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { gesellschaftName, importContactsCsv, importVermittlerListe, listenZeile, teileName } from "@/lib/vertrieb/import-contacts";
import { instantlyPortion, portionCsv } from "@/lib/vertrieb/instantly-portion";
import { mailDomain } from "@/lib/vertrieb/mischen";
import { requireTestDb } from "./db";

const tag = Math.random().toString(36).slice(2, 8);
const KOPF = "quelle;gesellschaft;typ;firma;ansprechpartner;strasse;plz;ort;telefon;website;email;email_quelle;email_muster_vermutet;quelle_url;abgerufen_am";
const dom = (x: string) => `${x}-${tag}.test`;

type Z = Partial<Record<"quelle" | "gesellschaft" | "typ" | "firma" | "ansprechpartner" | "strasse" | "plz" | "ort" | "telefon" | "website" | "email" | "email_quelle" | "email_muster_vermutet" | "quelle_url" | "abgerufen_am", string>>;
const zeile = (z: Z) =>
  [z.quelle ?? "lvm", z.gesellschaft ?? "LVM Versicherung", z.typ ?? "Versicherungsvertreter (Agentur)", z.firma ?? "Agentur Beispiel", z.ansprechpartner ?? "Max Beispiel",
    z.strasse ?? "Teststr. 1", z.plz ?? "12345", z.ort ?? "Musterstadt", z.telefon ?? "+49301234567", z.website ?? `https://${dom("seite")}/a`, z.email ?? "",
    z.email_quelle ?? "Agenturseite (öffentlich angezeigt)", z.email_muster_vermutet ?? "", z.quelle_url ?? `https://${dom("quelle")}/a`, z.abgerufen_am ?? "2026-11-19"].join(";");
const csv = (zeilen: Z[]) => `﻿${KOPF}\n${zeilen.map(zeile).join("\n")}\n`;

const fetchSpy = vi.fn(async () => new Response("{}"));
const users: string[] = [];

async function aufraeumen() {
  await prisma.salesContact.deleteMany({ where: { email: { endsWith: `-${tag}.test` } } });
}

describe("Vermittlerliste", () => {
  beforeAll(async () => {
    requireTestDb();
    vi.stubGlobal("fetch", fetchSpy);
    process.env.VERTRIEB_SPERRLISTE = `gesperrt@${dom("sperr")},@${dom("sperrdomain")}`;
  });
  afterEach(() => expect(fetchSpy).not.toHaveBeenCalled());
  afterAll(async () => {
    await aufraeumen();
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    delete process.env.VERTRIEB_SPERRLISTE;
    vi.unstubAllGlobals();
  });

  it("bildet Namen und Gesellschaft ab", () => {
    expect(teileName("Alfons Michael Keil")).toEqual({ firstName: "Alfons Michael", lastName: "Keil" });
    expect(teileName("Marc von Bargen")).toEqual({ firstName: "Marc", lastName: "von Bargen" });
    expect(teileName("Christoph Kressin e. K.")).toEqual({ firstName: "Christoph", lastName: "Kressin" });
    expect(teileName("Paul & Patrik Knieriem")).toEqual({ firstName: "Paul", lastName: "Knieriem" });
    expect(teileName("Dr. Erika Muster - Beispiel")).toEqual({ firstName: "Erika", lastName: "Muster-Beispiel" });
    expect(teileName("")).toEqual({ firstName: null, lastName: null });
    expect(gesellschaftName("Deutsche Vermögensberatung AG (DVAG)")).toBe("DVAG");
    expect(gesellschaftName("LVM Versicherung")).toBe("LVM");
    expect(gesellschaftName("SIGNAL IDUNA")).toBe("Signal Iduna");
    expect(gesellschaftName("tecis Finanzdienstleistungen AG (Swiss Life)")).toBe("tecis Finanzdienstleistungen");
    expect(gesellschaftName("TELIS FINANZ AG")).toBe("TELIS FINANZ");
    const z = listenZeile({ email: " Info@A-Baum.Beispiel.TEST ", plz: "1234", website: "beispiel.test", firma: "", ansprechpartner: "Max Beispiel" });
    expect(z.email).toBe("info@a-baum.beispiel.test");
    expect(z.daten).toMatchObject({ zip: "01234", url: "https://beispiel.test", name: "Max Beispiel", firstName: "Max", lastName: "Beispiel" });
  });

  it("Trockenlauf zählt je Grund und Gesellschaft und schreibt nichts; Import legt an, ergänzt nur Leeres", async () => {
    // Bestand: vorhandener Kontakt (Stufe und Status bleiben), gesperrter Kontakt (auch seine eigene Domain),
    // abgemeldeter Kontakt, Kunde per verknüpftem Vertriebskontakt, Login eines Kunden (eigene Domain)
    const vorhanden = await prisma.salesContact.create({ data: { email: `alt@${dom("vorhanden")}`, name: "Bestand GmbH", stage: "TERMIN", legacyStatus: "Termin vereinbart", city: "Altstadt" } });
    const weitere = await prisma.salesContact.create({ data: { email: `haupt@${dom("weitere")}`, altEmails: [`zweit@${dom("weitere")}`], name: `haupt@${dom("weitere")}` } });
    await prisma.salesContact.create({ data: { email: `nein@${dom("nie")}`, name: "Nie", nieKontaktierenAt: new Date(), nieKontaktierenGrund: "austragen" } });
    const abgemeldet = await prisma.salesContact.create({ data: { email: `ab@${dom("abgemeldet")}`, name: "Ab" } });
    const kampagne = await prisma.salesCampaign.create({ data: { name: `Liste Test ${tag}` } });
    await prisma.salesCampaignLead.create({ data: { contactId: abgemeldet.id, campaignId: kampagne.id, unsubscribed: true } });
    await prisma.salesContact.create({ data: { email: `kunde@${dom("kundekontakt")}`, name: "Kunde", customerStage: "VERTRAG", stage: "GEWONNEN" } });
    const login = await prisma.user.create({ data: { email: `chef@${dom("kundenlogin")}`, passwordHash: "x", role: "BUYER" } });
    users.push(login.id);

    const text = csv([
      { email: `neu1@${dom("agentur1")}`, ansprechpartner: "Anna Neu" },
      { email: `NEU1@${dom("agentur1")}` }, // doppelt (Groß/klein egal)
      { email: `neu2@${dom("agentur2")}`, gesellschaft: "ERGO", quelle: "ergo" },
      { email: "keine-mail" },
      { email: "" },
      { email: `geraten@${dom("agentur3")}`, email_muster_vermutet: "vorname@domain" },
      { email: `gesperrt@${dom("sperr")}` },
      { email: `wer@${dom("sperrdomain")}` },
      { email: `info@${dom("nie")}` }, // gleiche eigene Domain wie ein gesperrter Kontakt
      { email: `ab@${dom("abgemeldet")}` },
      { email: `kunde@${dom("kundekontakt")}` },
      { email: `chef@${dom("kundenlogin")}` },
      { email: `buero@${dom("kundenlogin")}` }, // gleiche eigene Domain wie ein Kunden-Login
      { email: `alt@${dom("vorhanden")}`, ort: "Neustadt", telefon: "+4930999" },
      { email: `zweit@${dom("weitere")}`, firma: "Weitere Agentur" },
      { email: `max@freemail-${tag}.test`, gesellschaft: "ERGO" }, // Freemail und Sammeladressen sind erlaubt
    ]);
    const vorher = await prisma.salesContact.count();
    const vorschau = await importVermittlerListe(text);
    expect(await prisma.salesContact.count()).toBe(vorher);
    expect(vorschau).toMatchObject({
      angewendet: false,
      zeilen: 16,
      neu: 3,
      ergaenzt: 2,
      uebersprungen: { ohne_email: 2, vermutet: 1, doppelt: 1, sperrliste: 2, kunde: 3, nie_kontaktieren: 2, vorhanden: 2 },
    });
    expect(vorschau.jeGesellschaft.find((g) => g.name === "ERGO")).toEqual({ name: "ERGO", zeilen: 2, neu: 2 });
    expect(vorschau.jeGesellschaft.find((g) => g.name === "LVM")).toMatchObject({ zeilen: 14, neu: 1 });

    const r = await importVermittlerListe(text, { anwenden: true });
    expect(r).toMatchObject({ angewendet: true, neu: 3, ergaenzt: 2 });

    const neu = await prisma.salesContact.findUniqueOrThrow({ where: { email: `neu1@${dom("agentur1")}` }, include: { activities: true } });
    expect(neu).toMatchObject({
      name: "Agentur Beispiel", firstName: "Anna", lastName: "Neu", leaderNames: "Anna Neu", street: "Teststr. 1", zip: "12345", city: "Musterstadt",
      phone: "+49301234567", insurer: "LVM", description: "Versicherungsvertreter (Agentur)", stage: "NEU",
    });
    expect(neu.webEnrichAt).not.toBeNull();
    expect((neu.enrichment as { import: Record<string, string> }).import).toMatchObject({
      liste: "vermittler", quelle: "lvm", gesellschaft: "LVM Versicherung", quelleUrl: `https://${dom("quelle")}/a`, abgerufenAm: "2026-11-19",
    });
    expect(neu.activities).toHaveLength(1);
    expect(neu.activities[0]).toMatchObject({ type: "IMPORT" });
    expect(neu.activities[0].note).toContain(`https://${dom("quelle")}/a`);
    expect(neu.activities[0].note).toContain("abgerufen am 19.11.2026");

    // Vorhanden: nur leere Felder, Stufe und Status bleiben
    const alt = await prisma.salesContact.findUniqueOrThrow({ where: { id: vorhanden.id } });
    expect(alt).toMatchObject({ stage: "TERMIN", legacyStatus: "Termin vereinbart", city: "Altstadt", name: "Bestand GmbH", phone: "+4930999", insurer: "LVM" });
    // Über weitere Adresse erkannt, Name war nur die E-Mail
    expect(await prisma.salesContact.findUniqueOrThrow({ where: { id: weitere.id } })).toMatchObject({ name: "Weitere Agentur", email: `haupt@${dom("weitere")}` });
    for (const e of [`info@${dom("nie")}`, `buero@${dom("kundenlogin")}`, `chef@${dom("kundenlogin")}`, `geraten@${dom("agentur3")}`, `gesperrt@${dom("sperr")}`]) {
      expect(await prisma.salesContact.findUnique({ where: { email: e } })).toBeNull();
    }

    // Erneut: nichts mehr neu, nichts doppelt
    const nochmal = await importVermittlerListe(text, { anwenden: true });
    expect(nochmal).toMatchObject({ neu: 0, ergaenzt: 0 });
    expect(await prisma.salesActivity.count({ where: { contactId: neu.id } })).toBe(1);
    await prisma.salesCampaign.delete({ where: { id: kampagne.id } });
  });

  it("bisherige Agenturliste unverändert, Vermittlerliste nicht am Trockenlauf vorbei", async () => {
    const alt = await importContactsCsv(`name,email,city\nAlte Agentur,alt-format@${dom("altformat")},Altstadt\n`);
    expect(alt).toMatchObject({ rows: 1, created: 1 });
    expect(await prisma.salesContact.findUnique({ where: { email: `alt-format@${dom("altformat")}` } })).toMatchObject({ name: "Alte Agentur", city: "Altstadt" });
    await expect(importContactsCsv(csv([{ email: `x@${dom("y")}` }]))).rejects.toThrow(/Vorschau/);
  });

  it("30.000 Zeilen: schnell, gemischt gespeichert; Tagesportion mit Obergrenze je Domain, am selben Tag dieselbe", async () => {
    await aufraeumen();
    const ges = [
      ["dvag", "Deutsche Vermögensberatung AG (DVAG)", 12000, (i: number) => `berater${i}@dvag-${tag}.test`],
      ["ergo", "ERGO", 8000, (i: number) => `p${i}@ergo-${tag}.test`],
      ["lvm", "LVM Versicherung", 6000, (i: number) => `info@a${i}.lvm-${tag}.test`],
      ["makler", "Freie Makler", 4000, (i: number) => (i % 4 ? `kontakt@makler${i}-${tag}.test` : `makler${i}@freemail-${tag}.test`)],
    ] as const;
    // blockweise je Quelle, wie die Liste geliefert wird
    const zeilen: Z[] = ges.flatMap(([quelle, gesellschaft, n, mail]) => Array.from({ length: n }, (_, i) => ({ quelle, gesellschaft, email: mail(i), ansprechpartner: `Vor${i} Nach${i}` })));
    const text = csv(zeilen);
    expect(text.length).toBeGreaterThan(5_000_000);

    const t0 = Date.now();
    const vorschau = await importVermittlerListe(text);
    const tVorschau = Date.now() - t0;
    expect(vorschau.neu).toBe(30000);
    const t1 = Date.now();
    const r = await importVermittlerListe(text, { anwenden: true });
    const tImport = Date.now() - t1;
    expect(r.neu).toBe(30000);
    console.log(`30.000 Zeilen: Vorschau ${tVorschau} ms, Import ${tImport} ms`);
    expect(tVorschau).toBeLessThan(20_000);
    expect(tImport).toBeLessThan(120_000);

    // Gespeichert gemischt: nach createdAt nie zwei derselben Gesellschaft hintereinander (alle vier gleich lange übrig)
    const reihe = await prisma.salesContact.findMany({ where: { email: { endsWith: `-${tag}.test` } }, orderBy: { createdAt: "asc" }, select: { insurer: true }, take: 2000 });
    for (let i = 1; i < reihe.length; i++) expect(reihe[i].insurer).not.toBe(reihe[i - 1].insurer);
    expect(new Set(reihe.slice(0, 20).map((k) => k.insurer)).size).toBe(4);

    // Tagesportion: je Domain höchstens 30, gemischt, gesperrte raus
    const gesperrt = await prisma.salesContact.findFirstOrThrow({ where: { email: `p1@ergo-${tag}.test` } });
    await prisma.salesContact.update({ where: { id: gesperrt.id }, data: { nieKontaktierenAt: new Date(), nieKontaktierenGrund: "manuell" } });
    const heute = new Date("2026-11-20T08:00:00Z");
    const ansehen = await instantlyPortion({ menge: 500, proDomain: 30, now: heute });
    expect(await prisma.salesContact.count({ where: { enrichment: { path: ["instantlyPortion", "tag"], equals: "2026-11-20" } } })).toBe(0);
    const p = await instantlyPortion({ menge: 500, proDomain: 30, now: heute, anwenden: true });
    expect(p.zeilen.map((z) => z.email)).toEqual(ansehen.zeilen.map((z) => z.email));
    expect(p.zeilen).toHaveLength(500);
    const jeDomain = new Map<string, number>();
    for (const z of p.zeilen) jeDomain.set(mailDomain(z.email), (jeDomain.get(mailDomain(z.email)) ?? 0) + 1);
    expect(jeDomain.get(`dvag-${tag}.test`)).toBe(30);
    expect(jeDomain.get(`ergo-${tag}.test`)).toBe(30);
    expect(jeDomain.get(`lvm-${tag}.test`)).toBe(30);
    expect(Math.max(...jeDomain.values())).toBeLessThanOrEqual(30);
    expect(p.zeilen.some((z) => z.email === `p1@ergo-${tag}.test`)).toBe(false);
    for (let i = 1; i < 60; i++) expect(p.zeilen[i].gesellschaft).not.toBe(p.zeilen[i - 1].gesellschaft);
    expect(p.jeGesellschaft.DVAG).toBe(30);
    expect(portionCsv(p.zeilen).split("\r\n")[0]).toBe("﻿email,first_name,last_name,company_name,website,phone,city,gesellschaft");

    // Gleicher Tag: dieselbe Portion; nächster Tag: neue Kontakte
    const wieder = await instantlyPortion({ menge: 500, proDomain: 30, now: heute, anwenden: true });
    expect(wieder.wiederholt).toBe(true);
    expect(new Set(wieder.zeilen.map((z) => z.email))).toEqual(new Set(p.zeilen.map((z) => z.email)));
    const morgen = await instantlyPortion({ menge: 500, proDomain: 30, now: new Date("2026-11-21T08:00:00Z"), anwenden: true });
    expect(morgen.wiederholt).toBe(false);
    const gestern = new Set(p.zeilen.map((z) => z.email));
    expect(morgen.zeilen.some((z) => gestern.has(z.email))).toBe(false);
    expect(morgen.offen).toBe(30000 - 1 - 500 - morgen.zeilen.length);
  }, 300_000);
});
