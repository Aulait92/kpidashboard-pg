// Datenschutz und Recht im Vertrieb (Ole, 19.11.2026): Erkennung in Antworten, Sperre (App, Instantly, eigene Domain),
// Aufgabe mit Frist, Push bei Abmahnung, Nachweisprotokoll (nur anhängen), Antwortvorlagen und die Sicherung gegen
// Wiederholung: gesperrter Kontakt wird nicht angeschrieben (a) über eine neue Adresse derselben eigenen Domain, (b) über
// einen neuen Import, (c) über einen laufenden Follow-up-Schritt; (d) bei Konzern-Domain nur die Person.
// Instantly und Push gemockt, nur Platzhalterdaten.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => ({ calls: [] as { title: string; body: string; url?: string }[] }));
vi.mock("@/lib/push", () => ({
  sendToAdmins: async (p: { title: string; body: string; url?: string }) => {
    push.calls.push(p);
    return { sent: 1, failed: 0 };
  },
}));

import { prisma } from "@/lib/prisma";
import { recordReply } from "@/lib/vertrieb/instantly";
import { domainHash, emailHash, kontaktGesperrt } from "@/lib/vertrieb/sperrliste";
import { nieKontaktierenAufheben, vorUploadPruefen } from "@/lib/vertrieb/nie-kontaktieren-server";
import { planFollowup, sendFollowupStep } from "@/lib/vertrieb/followup";
import { importContactsCsv, importVermittlerListe } from "@/lib/vertrieb/import-contacts";
import { instantlyPortion } from "@/lib/vertrieb/instantly-portion";
import { rechtsFaelle, rechtsFaelleVon, rechtsVorlageEntwurf, rechtsVorlageSenden, antwortProtokollieren, kartenFaelle } from "@/lib/vertrieb/datenschutz-recht-server";
import { vertriebArt17Loeschen } from "@/lib/vertrieb/art17";
import { requireTestDb } from "./db";

const tag = Math.random().toString(36).slice(2, 8);
const campaign = `Recht Test ${tag}`;
const BOX = `ole-${tag}@growth.test`;
/** eigene Agentur-Domains (Platzhalter, je Test eigene) */
const dom = (x: string) => `${x}-${tag}.de`;
const ids: string[] = [];
let n = 0;

type Call = { method: string; path: string; body: Record<string, unknown> | null };
let calls: Call[] = [];
const blocklist: string[] = [];

async function makeContact(email: string, extra: Record<string, unknown> = {}) {
  const c = await prisma.salesContact.create({
    data: {
      email,
      name: `Agentur Muster ${++n}`,
      salutation: "Herr",
      firstName: "Max",
      lastName: `Muster${n}`,
      enrichment: { import: { liste: "vermittler", quelle: "vertretersuche", gesellschaft: "Beispiel AG", emailQuelle: "Impressum", quelleUrl: "https://vertretung.example/max", abgerufenAm: "2026-11-01", importiertAm: "2026-11-02T10:00:00Z" } },
      ...extra,
    },
  });
  ids.push(c.id);
  return c;
}

async function antwort(contactId: string, text: string, sentAt = new Date()) {
  const c = await prisma.salesContact.findUniqueOrThrow({ where: { id: contactId } });
  await recordReply(contactId, { instantlyId: `in-${contactId}-${Math.random()}`, subject: "AW: Neue Kunden für Ihre Agentur", text, fromEmail: c.email, threadId: `thr-${contactId}`, eaccount: BOX, isAutoReply: false, sentAt, campaign });
  return prisma.salesContact.findUniqueOrThrow({ where: { id: contactId }, include: { tasks: true, emails: true } });
}

const posts = (p: string) => calls.filter((c) => c.method === "POST" && c.path.startsWith(p));
const blockWerte = () => posts("/block-lists-entries").map((p) => String(p.body?.bl_value));

beforeAll(async () => {
  requireTestDb();
  process.env.INSTANTLY_API_KEY = "test";
  process.env.INSTANTLY_AUTO_SYNC = "1";
  delete process.env.ANTHROPIC_API_KEY;
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const u = new URL(String(url));
    const path = u.pathname.replace("/api/v2", "") + u.search;
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method, path, body });
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
    if (path.startsWith("/block-lists-entries") && method === "GET") return json({ items: blocklist.filter((b) => b === u.searchParams.get("search")).map((b) => ({ bl_value: b })) });
    if (path.startsWith("/block-lists-entries") && method === "POST") {
      blocklist.push(String(body?.bl_value));
      return json({ id: `bl-${blocklist.length}`, bl_value: body?.bl_value });
    }
    if (path.startsWith("/campaigns/search-by-contact")) return json({ items: [{ id: "camp-a" }] });
    if (path.startsWith("/leads/update-interest-status")) return json({}, 202);
    if (path.startsWith("/leads/list")) return json({ items: [{ id: "lead-a", email: body?.search }] });
    if (path.startsWith("/leads/") && method === "DELETE") return json({ id: path.split("/")[2] });
    if (path.startsWith("/emails/reply")) return json({ id: `out-${Math.random()}`, thread_id: "thr-x" });
    if (path.startsWith("/accounts/")) return json({ email: BOX, first_name: "Ole", last_name: "Muster", signature: "Ole" });
    return json({ items: [] });
  });
});
beforeEach(() => {
  calls = [];
  push.calls = [];
});
afterAll(async () => {
  vi.unstubAllGlobals();
  delete process.env.INSTANTLY_API_KEY;
  delete process.env.INSTANTLY_AUTO_SYNC;
  await prisma.salesContact.deleteMany({ where: { id: { in: ids } } });
  await prisma.salesContact.deleteMany({ where: { email: { contains: tag } } });
  await prisma.salesCampaign.deleteMany({ where: { name: campaign } });
  // Das Nachweisprotokoll bleibt (nur anhängen); die Test-Datenbank wird verworfen.
});

describe("Datenschutz und Recht: Erkennen und Fall anlegen", () => {
  it("Abmahnung: Kategorie Datenschutz/Recht, gesperrt, eigene Domain gesperrt, Aufgabe sofort, Push, Protokoll", async () => {
    const c = await makeContact(`info@${dom("abmahn")}`);
    const eingang = new Date("2026-11-19T10:00:00Z");
    const nach = await antwort(c.id, "Das ist ein Verstoß gegen § 7 UWG. Ich habe die Mail an meine Kanzlei weitergeleitet.", eingang);

    expect(nach.emails[0].rechtsArt).toBe("abmahnung");
    expect(nach.emails[0].sentiment).toBe("NEGATIV"); // nie neutral
    expect(nach.nieKontaktierenAt).not.toBeNull();
    expect(nach.sperrHashes).toContain(domainHash(dom("abmahn")));
    expect(blockWerte()).toEqual(expect.arrayContaining([c.email, dom("abmahn")]));
    expect(posts("/leads/update-interest-status").length).toBeGreaterThan(0);

    const aufgabe = nach.tasks.find((t) => t.title.startsWith("Abmahnung"));
    expect(aufgabe?.title).toBe("Abmahnung bzw. rechtliche Drohung: sofort prüfen");
    expect(aufgabe?.note).toContain("Keine Unterlassungserklärung unterschreiben. Zur Prüfung an Claude geben.");
    expect(aufgabe!.dueAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(push.calls).toHaveLength(1);
    expect(push.calls[0].body).toBe("Keine Unterlassungserklärung unterschreiben. Zur Prüfung an Claude geben.");

    const [fall] = await rechtsFaelleVon(c.id);
    expect(fall).toMatchObject({ art: "abmahnung", contactId: c.id, wer: "automatisch", status: "ueberfaellig", antwortAt: null, loeschAt: null });
    expect(fall.eingangAt.toISOString()).toBe(eingang.toISOString());
    expect(fall.fristAt.toISOString()).toBe(eingang.toISOString());
    // keine Inhalte und keine Adressen im Protokoll
    const zeilen = await prisma.datenschutzFallEreignis.findMany({ where: { contactId: c.id } });
    expect(JSON.stringify(zeilen)).not.toContain(c.email);
    expect(JSON.stringify(zeilen)).not.toContain("Kanzlei");

    // gleicher Eingang noch einmal (Webhook und Abgleich): kein zweiter Fall
    const { rechtsFallAnlegen } = await import("@/lib/vertrieb/datenschutz-recht-server");
    expect((await rechtsFallAnlegen(c.id, { art: "abmahnung", eingang, quelle: "antwort" })).neu).toBe(false);
    expect(await rechtsFaelleVon(c.id)).toHaveLength(1);
  });

  it("Ein Klick erledigt alles (Ole, 24.11.2026): „Als erledigt vermerken“ schließt die Abmahnungs-Aufgabe mit", async () => {
    const c = await makeContact(`buero@${dom("abmahn-klick")}`);
    const nach = await antwort(c.id, "Das ist unzulässige Werbung nach § 7 UWG, meine Anwältin prüft das.");
    const aufgabe = nach.tasks.find((t) => t.title.startsWith("Abmahnung bzw. rechtliche Drohung"));
    expect(aufgabe?.doneAt).toBeNull(); // vorher offen
    const [fall] = await rechtsFaelleVon(c.id);
    // „Als erledigt vermerken“ in der Karte (ohne Vorlage) läuft über antwortProtokollieren
    expect(await antwortProtokollieren(fall.fallId, { at: new Date(), wer: "admin@growth.test", detail: "manuell" })).toBe(true);
    const danach = await prisma.salesTask.findUniqueOrThrow({ where: { id: aufgabe!.id } });
    expect(danach.doneAt).not.toBeNull(); // Aufgabe mitgeschlossen, nicht nur der Fall
    expect(await prisma.salesTask.count({ where: { contactId: c.id, doneAt: null, title: { startsWith: "Abmahnung" } } })).toBe(0);
  });

  it("Abmahnung mit Auskunftsverlangen: zwei Fälle (Abmahnung und Auskunft) mit eigener Aufgabe (Ole, 24.11.2026)", async () => {
    const c = await makeContact(`kontakt@${dom("abmahn-auskunft")}`);
    const nach = await antwort(c.id, "Ich habe Ihre Mail an meine Kanzlei weitergeleitet. Teilen Sie mir gemäß Art. 15 DSGVO mit, woher Sie meine Daten haben.");
    const arten = (await rechtsFaelleVon(c.id)).map((f) => f.art).sort();
    expect(arten).toEqual(["abmahnung", "auskunft"]);
    expect(nach.emails[0].rechtsArt).toBe("abmahnung");
    const titel = (await prisma.salesTask.findMany({ where: { contactId: c.id, doneAt: null } })).map((t) => t.title);
    expect(titel.some((t) => t.startsWith("Abmahnung bzw. rechtliche Drohung"))).toBe(true);
    expect(titel.some((t) => t.startsWith("Auskunft nach Art. 15"))).toBe(true);
    // Abmahnung erledigt: die Auskunft bleibt offen (eigene Pflicht)
    const abm = (await rechtsFaelleVon(c.id)).find((f) => f.art === "abmahnung")!;
    await antwortProtokollieren(abm.fallId, { at: new Date(), wer: "admin@growth.test", detail: "manuell" });
    const offen = (await prisma.salesTask.findMany({ where: { contactId: c.id, doneAt: null } })).map((t) => t.title);
    expect(offen.some((t) => t.startsWith("Auskunft nach Art. 15"))).toBe(true);
    expect(offen.some((t) => t.startsWith("Abmahnung"))).toBe(false);
  });

  it("ältere Abmahnung mit offener Auskunftsaufgabe: Karte bietet die Auskunftsvorlage an", async () => {
    const c = await makeContact(`buero@${dom("alt-abmahn")}`);
    const { rechtsFallAnlegen } = await import("@/lib/vertrieb/datenschutz-recht-server");
    await rechtsFallAnlegen(c.id, { art: "abmahnung", grund: "widerspruch", eingang: new Date("2026-11-23T11:06:00Z"), quelle: "antwort" });
    expect((await kartenFaelle(c.id))[0].auskunftOffen).toBe(false);
    await prisma.salesTask.create({ data: { contactId: c.id, title: "Auskunft nach Art. 15 beantworten, Frist 30.11.2026", type: "SONSTIGES", dueAt: new Date() } });
    expect((await kartenFaelle(c.id))[0]).toMatchObject({ art: "abmahnung", auskunftOffen: true });
  });

  it("§ 7 UWG ohne Anwalt mit Auskunftsverlangen: nur Fall „Auskunft“, keine Abmahnung", async () => {
    const c = await makeContact(`info@${dom("uwg-ruege")}`);
    await antwort(c.id, "Das ist unzulässige Werbung nach § 7 UWG. Teilen Sie mir gemäß Art. 15 DSGVO mit, aus welcher Quelle meine Daten stammen.");
    expect((await rechtsFaelleVon(c.id)).map((f) => f.art)).toEqual(["auskunft"]);
  });

  it("Abmahnung mit Löschverlangen: keine automatische Löschung, nur Sperre, Aufgabe mit Hinweis (Ole, 19.11.2026)", async () => {
    const c = await makeContact(`chef@${dom("abmahnloesch")}`);
    const nach = await antwort(c.id, "Löschen Sie umgehend meine Daten. Ich habe die Sache an meinen Anwalt übergeben, Schadensersatz behalte ich mir vor.");
    expect(nach.emails[0].rechtsArt).toBe("abmahnung");
    expect(nach.art17GeloeschtAt).toBeNull();
    expect(nach.email).toBe(c.email);
    expect(nach.emails).toHaveLength(1); // Beleg bleibt
    expect(nach.nieKontaktierenAt).not.toBeNull();
    expect(nach.sperrHashes).toContain(domainHash(dom("abmahnloesch")));
    expect(calls.filter((x) => x.method === "DELETE")).toHaveLength(0);
    const aufgabe = nach.tasks.find((t) => t.title === "Abmahnung bzw. rechtliche Drohung: sofort prüfen");
    expect(aufgabe?.note).toContain("Keine Unterlassungserklärung unterschreiben. Zur Prüfung an Claude geben.");
    expect(aufgabe?.note).toContain("Löschung erst nach Prüfung per Knopf (Belege sichern).");
    expect(push.calls).toHaveLength(1);
    const [fall] = await rechtsFaelleVon(c.id);
    expect(fall).toMatchObject({ art: "abmahnung", loeschAt: null });
  });

  it("Widerspruch: Frist 7 Tage; Sperre lässt sich nicht aufheben; normales Löschen bleibt gesperrt", async () => {
    const c = await makeContact(`kontakt@${dom("wider")}`);
    const eingang = new Date("2026-11-19T10:00:00Z");
    const nach = await antwort(c.id, "Ich widerspreche der Nutzung meiner Daten für Werbung.", eingang);
    expect(nach.emails[0].rechtsArt).toBe("widerspruch");
    expect(nach.tasks.map((t) => t.title)).toContain("Widerspruch bestätigen, Frist 26.11.2026");
    expect(push.calls).toHaveLength(0);
    expect(await nieKontaktierenAufheben(c.id)).toBe(false);
    expect(await kontaktGesperrt(c.id)).toBe(true);
  });

  it("Protokoll ist unveränderbar (Datenbank-Trigger)", async () => {
    const e = await prisma.datenschutzFallEreignis.findFirstOrThrow({ where: { contactId: { in: ids } } });
    await expect(prisma.datenschutzFallEreignis.update({ where: { id: e.id }, data: { wer: "jemand" } })).rejects.toThrow();
    await expect(prisma.datenschutzFallEreignis.delete({ where: { id: e.id } })).rejects.toThrow();
    await expect(prisma.datenschutzFallEreignis.deleteMany({ where: { id: e.id } })).rejects.toThrow();
  });

  it("reine Austragung ist kein Rechtsfall", async () => {
    const c = await makeContact(`aus@${dom("aus")}`);
    const nach = await antwort(c.id, "Bitte austragen.");
    expect(nach.nieKontaktierenGrund).toBe("austragen");
    expect(nach.emails[0].rechtsArt).toBeNull();
    expect(await rechtsFaelleVon(c.id)).toHaveLength(0);
    expect(nach.sperrHashes).toEqual([]);
  });
});

describe("Sicherung gegen Wiederholung", () => {
  it("(a) neue Adresse derselben eigenen Domain wird nicht angeschrieben (Upload, Versand, Follow-up)", async () => {
    const c = await makeContact(`chef@${dom("eigen")}`);
    await antwort(c.id, "Unterlassen Sie künftig solche Mails.");
    // neue Adresse derselben Agentur, z. B. später über Instantly oder von Hand angelegt
    const kollege = await makeContact(`buero@${dom("eigen")}`, { stage: "SPAETER" });
    expect(await kontaktGesperrt(kollege.id)).toBe(true);
    const p = await vorUploadPruefen([`neu@${dom("eigen")}`, kollege.email, `x@mail.${dom("eigen")}`]);
    expect(p.erlaubt).toEqual([]);
    expect(p.gesperrt.map((g) => g.grund)).toEqual(["nie_kontaktieren", "nie_kontaktieren", "nie_kontaktieren"]);
    await prisma.salesEmail.create({ data: { contactId: kollege.id, direction: "IN", instantlyId: `in-k-${kollege.id}`, subject: "AW: Test", text: "Gerne im März.", eaccount: BOX, campaign, sentAt: new Date(Date.now() - 86400000) } });
    expect(await planFollowup(kollege.id, { source: "ANTWORT", dueAt: new Date(Date.now() - 60_000) })).toBeNull();
  });

  it("(b) neuer Import (CSV und Vermittlerliste) legt die gesperrte Adresse bzw. Domain nicht an", async () => {
    const c = await makeContact(`leitung@${dom("import")}`);
    await antwort(c.id, "Woher haben Sie meine Adresse? Auskunft nach Art. 15 DSGVO bitte.");
    const csv = `name,email\nNeu Eins,neu1@${dom("import")}\nFrei,frei@${dom("frei")}\n`;
    const r = await importContactsCsv(csv);
    expect(r.skipped).toBeGreaterThanOrEqual(1);
    expect(await prisma.salesContact.findUnique({ where: { email: `neu1@${dom("import")}` } })).toBeNull();
    expect(await prisma.salesContact.findUnique({ where: { email: `frei@${dom("frei")}` } })).not.toBeNull();
    ids.push((await prisma.salesContact.findUniqueOrThrow({ where: { email: `frei@${dom("frei")}` } })).id);

    const KOPF = "quelle;gesellschaft;typ;firma;ansprechpartner;strasse;plz;ort;telefon;website;email;email_quelle;email_muster_vermutet;quelle_url;abgerufen_am";
    const zeile = (email: string) => ["lvm", "LVM Versicherung", "Agentur", "Agentur Beispiel", "Max Beispiel", "Teststr. 1", "12345", "Musterstadt", "", "", email, "Impressum", "", "https://quelle.example/a", "2026-11-19"].join(";");
    const liste = `${KOPF}\n${zeile(`neu2@${dom("import")}`)}\n${zeile(c.email)}\n`;
    const v = await importVermittlerListe(liste, { anwenden: true });
    expect(v.uebersprungen.nie_kontaktieren).toBe(2);
    expect(await prisma.salesContact.findUnique({ where: { email: `neu2@${dom("import")}` } })).toBeNull();
  });

  it("(c) laufender Follow-up-Schritt sendet nicht mehr, Tagesportion lässt den Kontakt weg", async () => {
    const c = await makeContact(`team@${dom("folge")}`, { stage: "SPAETER" });
    await prisma.salesEmail.create({ data: { contactId: c.id, direction: "IN", instantlyId: `in-f-${c.id}`, subject: "AW: Test", text: "Gerne im März.", eaccount: BOX, campaign, sentAt: new Date(Date.now() - 2 * 86400000) } });
    const f = await planFollowup(c.id, { source: "ANTWORT", dueAt: new Date(Date.now() - 60_000) });
    expect(f).not.toBeNull();
    // zweiter Kontakt derselben Agentur mit laufendem Follow-up
    const zweiter = await makeContact(`chef@${dom("folge")}`, { stage: "SPAETER" });
    await prisma.salesEmail.create({ data: { contactId: zweiter.id, direction: "IN", instantlyId: `in-f-${zweiter.id}`, subject: "AW: Test", text: "Gerne im März.", eaccount: BOX, campaign, sentAt: new Date(Date.now() - 2 * 86400000) } });
    const f2 = await planFollowup(zweiter.id, { source: "ANTWORT", dueAt: new Date(Date.now() - 60_000) });
    expect(f2).not.toBeNull();
    // heutige Tagesportion schon vergeben, dann kommt der Widerspruch
    const heute = new Date();
    const dritter = await makeContact(`portion@${dom("folge")}`);
    const vorher = await instantlyPortion({ menge: 100000, proDomain: 100000, now: heute, anwenden: true });
    expect(vorher.zeilen.map((z) => z.email)).toContain(dritter.email);

    await antwort(c.id, "Bitte keine Werbung mehr, ich widerspreche.");
    calls = [];
    expect(await sendFollowupStep(f!.id, { manual: true })).not.toHaveProperty("sent");
    expect(await sendFollowupStep(f2!.id, { manual: true })).toEqual({ stopped: "Sperrliste" });
    expect(posts("/emails/reply")).toHaveLength(0);
    const nachher = await instantlyPortion({ menge: 100000, proDomain: 100000, now: heute });
    expect(nachher.wiederholt).toBe(true);
    expect(nachher.zeilen.map((z) => z.email)).not.toContain(dritter.email);
  });

  it("(d) Konzern-Domain: nur die Person, ein anderer DVAG-Kontakt bleibt erreichbar", async () => {
    const p = await makeContact(`max.muster-${tag}@dvag.de`);
    const anderer = await makeContact(`erika.beispiel-${tag}@dvag.de`);
    const nach = await antwort(p.id, "Ich widerspreche der Verwendung meiner Daten. Das ist ein Verstoß gegen § 7 UWG.");
    expect(nach.nieKontaktierenAt).not.toBeNull();
    expect(nach.sperrHashes.some((h) => h === domainHash("dvag.de"))).toBe(false);
    expect(blockWerte()).toContain(p.email);
    expect(blockWerte()).not.toContain("dvag.de");
    expect(await kontaktGesperrt(anderer.id)).toBe(false);
    const up = await vorUploadPruefen([anderer.email, `neu-${tag}@dvag.de`, p.email]);
    expect(up.erlaubt).toEqual([anderer.email, `neu-${tag}@dvag.de`]);
    expect(up.gesperrt).toEqual([{ email: p.email, grund: "nie_kontaktieren" }]);
  });

  it("(d) Portal-Domain mit mehr als 3 Vertriebskontakten: nur die Person", async () => {
    const d = dom("portal");
    const k = [];
    for (let i = 0; i < 4; i++) k.push(await makeContact(`v${i}@${d}`));
    const nach = await antwort(k[0].id, "Ich widerspreche jeder weiteren Werbung.");
    expect(nach.nieKontaktierenAt).not.toBeNull();
    expect(nach.sperrHashes).not.toContain(domainHash(d));
    expect(blockWerte()).not.toContain(d);
    expect(await kontaktGesperrt(k[1].id)).toBe(false);
  });
});

describe("Löschung, Auskunft und Antwortvorlagen", () => {
  it("Löschverlangen: Hülle mit Adress- und Domain-Hash, Löschdatum im Protokoll, Bestätigung sendbar", async () => {
    const c = await makeContact(`loesch@${dom("loesch")}`);
    const eingang = new Date(Date.now() - 3600_000);
    const nach = await antwort(c.id, "Löschen Sie bitte umgehend meine Daten.", eingang);
    expect(nach.art17GeloeschtAt).not.toBeNull();
    // Aufgabe „Löschung bestätigen“ überdauert die Löschung (ohne Personenbezug)
    expect(nach.tasks.map((t) => t.title)).toContain(`Löschung bestätigen (Art. 17), Frist ${new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }).format(new Date(eingang.getTime() + 7 * 86400000))}`);
    expect(nach.sperrHashes).toEqual(expect.arrayContaining([emailHash(c.email), domainHash(dom("loesch"))]));
    expect(blockWerte()).toEqual(expect.arrayContaining([c.email, dom("loesch")]));
    const [fall] = await rechtsFaelleVon(c.id);
    expect(fall.art).toBe("loeschung");
    expect(fall.loeschAt).not.toBeNull();
    // neue Adresse derselben Agentur kommt nicht wieder rein
    expect((await vorUploadPruefen([`andere@${dom("loesch")}`])).erlaubt).toEqual([]);

    // Entwurf: Löschdatum, ohne Namen (gelöscht); Auskunft geht nicht mehr
    const e = await rechtsVorlageEntwurf(c.id, "loeschung");
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.text.startsWith("Guten Tag,")).toBe(true);
    expect(e.sendbar).toBe(true); // Antwortziel aus dem Protokoll (Instantly-ID der Anfrage, Postfach)
    expect((await rechtsVorlageEntwurf(c.id, "auskunft")).ok).toBe(false);

    calls = [];
    const r = await rechtsVorlageSenden(c.id, { fallId: fall.fallId, vorlage: "loeschung", betreff: e.betreff, text: e.text, wer: "admin@growth.test" });
    expect(r).toEqual({ ok: true });
    expect(posts("/emails/reply")).toHaveLength(1);
    expect(posts("/emails/reply")[0].body).toMatchObject({ eaccount: BOX });
    const danach = (await rechtsFaelleVon(c.id))[0];
    expect(danach.status).toBe("beantwortet");
    expect(danach.antwortVorlage).toBe("loeschung");
    expect(await prisma.salesTask.count({ where: { contactId: c.id, doneAt: null, title: { startsWith: "Löschung bestätigen" } } })).toBe(0);
    // Hülle: Inhalt der Antwort wird nicht gespeichert
    expect(await prisma.salesEmail.count({ where: { contactId: c.id } })).toBe(0);
    const proto = await prisma.datenschutzFallEreignis.findMany({ where: { fallId: fall.fallId }, orderBy: { createdAt: "asc" } });
    expect(proto.map((p) => p.ereignis)).toEqual(["eingang", "loeschung", "antwort"]);
    expect(proto.find((p) => p.ereignis === "antwort")?.wer).toBe("admin@growth.test");
  });

  it("Knopf „Auf Verlangen löschen“ ohne Fall legt Fall „Löschung“ mit Löschdatum an (wer = Admin)", async () => {
    const c = await makeContact(`knopf@${dom("knopf")}`);
    const r = await vertriebArt17Loeschen(c.id, { quelle: "admin", wer: "admin@growth.test" });
    expect(r.status).toBe("geloescht");
    const [fall] = await rechtsFaelleVon(c.id);
    expect(fall).toMatchObject({ art: "loeschung", wer: "admin@growth.test" });
    expect(fall.loeschAt).not.toBeNull();
    const h = await prisma.salesContact.findUniqueOrThrow({ where: { id: c.id } });
    expect(h.sperrHashes).toContain(domainHash(dom("knopf")));
  });

  it("Auskunft: Entwurf aus der Akte, Senden nur auf Knopfdruck, danach beantwortet", async () => {
    const c = await makeContact(`auskunft@${dom("auskunft")}`);
    await antwort(c.id, "Woher haben Sie meine Daten? Ich verlange Auskunft nach Art. 15 DSGVO.");
    expect(posts("/emails/reply")).toHaveLength(0); // nichts automatisch
    const e = await rechtsVorlageEntwurf(c.id, "auskunft");
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.text).toContain("Quell-URL: https://vertretung.example/max");
    expect(e.text).toContain(`E-Mail: ${c.email}`);
    expect(e.text).toContain("Wir haben keinen Datenschutzbeauftragten bestellt.");
    expect(e.text).not.toMatch(/[–—]/);
    expect(e.hinweis).toBeNull();
    const [fall] = await rechtsFaelleVon(c.id);
    expect(fall.art).toBe("auskunft");
    calls = [];
    expect(await rechtsVorlageSenden(c.id, { fallId: fall.fallId, vorlage: "auskunft", betreff: e.betreff, text: `${e.text} – Ende`, wer: "admin@growth.test" })).toEqual({ ok: true });
    const gesendet = posts("/emails/reply")[0].body as { body: { text: string } };
    expect(gesendet.body.text).not.toMatch(/[–—]/); // Sicherheitsnetz beim Versand
    expect((await rechtsFaelleVon(c.id))[0].status).toBe("beantwortet");
    expect(await prisma.salesTask.count({ where: { contactId: c.id, doneAt: null, title: { startsWith: "Auskunft nach Art. 15" } } })).toBe(0);
    // Antwort zählt nicht als Werbung: Sperre bleibt
    expect(await kontaktGesperrt(c.id)).toBe(true);
  });

  it("Liste „Datenschutz und Recht“ und vermerkte Antwort", async () => {
    const alle = await rechtsFaelle();
    const eigene = alle.filter((f) => f.contactId && ids.includes(f.contactId));
    expect(eigene.length).toBeGreaterThanOrEqual(6);
    const offen = eigene.find((f) => f.status !== "beantwortet")!;
    expect(await antwortProtokollieren(offen.fallId, { at: new Date(), wer: "admin@growth.test", detail: "manuell" })).toBe(true);
    expect((await rechtsFaelle()).find((f) => f.fallId === offen.fallId)?.status).toBe("beantwortet");
  });
});
