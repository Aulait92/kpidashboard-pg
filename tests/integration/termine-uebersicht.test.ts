// Termin-Übersicht (Verkaufen → Termine) mit Datenbank: lädt Termine, Ergebnisse, Aufgaben und Angebote nur lesend,
// lässt verschobene Termine, ersetzte Angebotsversionen und Testangebote weg, filtert nach Ansicht und Chip.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ladeTerminUebersicht } from "@/lib/vertrieb/termine-uebersicht-server";
import { requireTestDb } from "./db";

const NOW = new Date();
const H = 3600_000;
const T = 24 * H;
const vor = (ms: number) => new Date(NOW.getTime() - ms);
const uid = Math.random().toString(36).slice(2, 8);
const ids: string[] = [];

async function kontakt(name: string, extra: Record<string, unknown> = {}) {
  const c = await prisma.salesContact.create({ data: { name: `${name} ${uid}`, email: `${name.replace(/\W/g, "").toLowerCase()}-${uid}@test.local`, stage: "TERMIN", ...extra } });
  ids.push(c.id);
  return c;
}
let n = 0;
const angebot = (contactId: string, extra: Record<string, unknown> = {}) =>
  prisma.offer.create({
    data: {
      salesContactId: contactId, number: `TU-${uid}-${++n}`, token: `tu-${uid}-${n}`, contactName: "Test", company: `Firma ${n} ${uid}`, term: "12m", products: [],
      setupFee: 1000, monthlyFee: 500, softwareFee: 0, validUntil: new Date(NOW.getTime() + 10 * T), ...extra,
    },
  });

describe("Termin-Übersicht laden (Datenbank)", () => {
  let a = "", b = "", c = "";
  beforeAll(async () => {
    requireTestDb();
    const entscheidung = await prisma.salesBookingType.upsert({ where: { slug: "entscheidung" }, update: {}, create: { slug: "entscheidung", title: "Entscheidungs-Call mit Ole" } });
    // A: Erstgespräch vor 6 Tagen, Ergebnis „Angebot geschickt“, Angebot V1 ersetzt, V2 seit 5 Tagen ungeöffnet; dazu ein verschobener Termin
    a = (await kontakt("Agentur Anton", { firstName: "Anton", lastName: "Alt", city: "Bonn" })).id;
    const review = await prisma.salesTask.create({ data: { contactId: a, title: "Wie lief der Termin mit Anton Alt?", type: "TERMIN", dueAt: vor(6 * T - H), doneAt: vor(6 * T - 2 * H) } });
    await prisma.salesMeeting.create({ data: { contactId: a, title: "Meta-Leads-Call mit Ole Kannapinn", startAt: vor(6 * T), reviewTaskId: review.id } });
    await prisma.salesMeeting.create({ data: { contactId: a, title: "Meta-Leads-Call mit Ole Kannapinn", startAt: vor(7 * T), status: "VERSCHOBEN" } });
    await prisma.salesActivity.create({ data: { contactId: a, type: "TERMIN", outcome: "Termin gehabt, Angebot geschickt", note: "Will zwei Produkte\nRest", occurredAt: vor(6 * T - 2 * H) } });
    await prisma.salesActivity.create({ data: { contactId: a, type: "COLD_MAIL", outcome: "Gesendet", note: "Kampagne", occurredAt: vor(10 * H) } });
    await angebot(a, { status: "superseded", sentAt: vor(6 * T), createdAt: vor(6 * T) });
    await angebot(a, { status: "sent", sentAt: vor(5 * T), createdAt: vor(5 * T) });
    await angebot(a, { status: "accepted", isTest: true, acceptedAt: vor(H), createdAt: vor(H) });
    // B: Entscheidungs-Call vor 2 Tagen ohne Ergebnis (Nachfrage offen)
    b = (await kontakt("Agentur Berta")).id;
    const offen = await prisma.salesTask.create({ data: { contactId: b, title: "Wie lief der Termin?", type: "TERMIN", dueAt: vor(T) } });
    await prisma.salesMeeting.create({ data: { contactId: b, title: "Entscheidungs-Call", startAt: vor(2 * T), bookingTypeId: entscheidung.id, reviewTaskId: offen.id, inviteeName: "Berta Bauer" } });
    // C: Erstgespräch morgen, gewonnen
    c = (await kontakt("Agentur Carl", { stage: "GEWONNEN" })).id;
    await prisma.salesMeeting.create({ data: { contactId: c, title: "Onboarding mit Ole", startAt: new Date(NOW.getTime() + T) } });
  });

  afterAll(async () => {
    await prisma.offer.deleteMany({ where: { salesContactId: { in: ids } } });
    await prisma.salesContact.deleteMany({ where: { id: { in: ids } } });
  });

  const meine = <T extends { kontakt: { id: string } }>(zs: T[]) => zs.filter((z) => ids.includes(z.kontakt.id));

  it("Letzte 30 Tage: Ergebnis, Stand, nächster Schritt; verschobene Termine fehlen", async () => {
    const { zeilen, aufmerksamkeit } = await ladeTerminUebersicht({ ansicht: "30" }, NOW);
    const z = meine(zeilen);
    expect(z.map((x) => x.kontakt.id)).toEqual([b, a]);
    expect(z[1]).toMatchObject({
      person: "Anton Alt",
      agentur: `Agentur Anton ${uid}, Bonn`,
      artLabel: "Erstgespräch",
      ergebnis: { art: "eingetragen", label: "Angebot geschickt", notiz: "Will zwei Produkte" },
      angebot: { stand: "offen" },
      schritt: { art: "schritt", text: "Angebot läuft" },
    });
    expect(z[0]).toMatchObject({ person: "Berta Bauer", artLabel: "Entscheidungs-Call", ergebnis: { art: "fehlt", reviewOffen: true }, schritt: { art: "keiner" } });
    expect(z[0].ergebnisHref).toBe(`/admin/neu/vertrieb/kontakte/${b}#ergebnis`);

    const meinePunkte = aufmerksamkeit.filter((p) => p.title.includes(uid) || p.title.includes("Berta Bauer"));
    expect(meinePunkte.map((p) => p.title)).toEqual(["Ergebnis fehlt: Berta Bauer", `Angebot ohne Reaktion: Firma 2 ${uid}`]);
  });

  it("Kommende und Filter", async () => {
    const kommend = await ladeTerminUebersicht({ ansicht: "kommend" }, NOW);
    expect(meine(kommend.zeilen).map((x) => [x.kontakt.id, x.artLabel, x.schritt.art])).toEqual([[c, "Onboarding", "schritt"]]);
    const ohne = await ladeTerminUebersicht({ ansicht: "30", filter: "ohne" }, NOW);
    expect(meine(ohne.zeilen).map((x) => x.kontakt.id)).toEqual([b]);
    const offen = await ladeTerminUebersicht({ ansicht: "30", filter: "angebot" }, NOW);
    expect(meine(offen.zeilen).map((x) => x.kontakt.id)).toEqual([a]);
    expect(offen.anzahl.angebot).toBeGreaterThanOrEqual(1);
    const alle = await ladeTerminUebersicht({ ansicht: "alle", filter: "gewonnen" }, NOW);
    expect(meine(alle.zeilen).map((x) => x.kontakt.id)).toEqual([c]);
  });
});
