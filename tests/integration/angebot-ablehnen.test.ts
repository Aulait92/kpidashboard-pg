// Angebot als abgelehnt markieren (Ole, 18.11.2026): Status, Grund und Verlauf, Aufgaben und Follow-ups enden,
// Zahlungserinnerungen stoppen, Kundenseite zeigt den Hinweis statt der Annahme, Kontakt verloren ja/nein,
// umgekehrte Frage beim Verloren-Markieren, „Wieder öffnen“ nur solange gültig, Auswertung der Gründe.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ mails: [] as { to: string }[] }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "user-agent": "Mozilla/5.0 Test" }), cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  getCurrentSession: async () => ({ userId: "admin-test", email: "admin@example.test", role: "ADMIN" }),
}));
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  sendCustomerMail: vi.fn(async (o: { to: string }) => (st.mails.push(o), { ok: true })),
}));
vi.mock("@/lib/push", async (orig) => ({
  ...(await orig<typeof import("@/lib/push")>()),
  sendToAdmins: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })),
}));

import { renderToStaticMarkup } from "react-dom/server";
import { prisma } from "@/lib/prisma";
import { acceptOffer } from "@/lib/offers";
import { angebotAblehnen, angebotWiederOeffnen } from "@/lib/vertrieb/angebot-ablehnen-server";
import { declineOfferAction, reopenOfferAction } from "@/app/admin/vertrieb/offer-actions";
import { logActivity, setStage } from "@/app/admin/vertrieb/actions";
import { runZahlungserinnerungen } from "@/lib/angebot-zahlungserinnerung-server";
import { ladeAngebote } from "@/lib/vertrieb/angebote-uebersicht";
import { loadVertriebZahlen } from "@/lib/vertrieb-zahlen";
import { toOfferRow } from "@/lib/offer-links";
import OfferPage from "@/app/angebot/[token]/page";
import { requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const DAY = 86_400_000;
const contactIds: string[] = [];
const HINWEIS = "Dieses Angebot ist nicht mehr gültig, melden Sie sich gern bei mir.";

async function kontakt(stage: "INTERESSE" | "TERMIN" = "TERMIN") {
  const tag = uid();
  const c = await prisma.salesContact.create({ data: { name: `Agentur Ablehnen ${tag}`, email: `ablehnen-${tag}@example.test`, stage } });
  contactIds.push(c.id);
  return c;
}

async function angebot(contactId: string, p: { status?: string; validDays?: number; acceptedAt?: Date | null; paymentStatus?: string; createdAt?: Date } = {}) {
  const tag = uid();
  return prisma.offer.create({
    data: {
      salesContactId: contactId,
      number: `PG-AB-${tag}`,
      token: `tok-ablehnen-${tag}-${uid()}${uid()}${uid()}`,
      status: p.status ?? "sent",
      sentAt: new Date(Date.now() - 2 * DAY),
      contactName: `Paul Ablehn${tag}`,
      company: `Agentur ${tag}`,
      email: `kunde-ablehnen-${tag}@example.test`,
      term: "12m",
      products: [{ name: "TKV", dailyBudget: 30 }],
      setupFee: 990,
      monthlyFee: 1190,
      softwareFee: 190,
      validUntil: new Date(Date.now() + (p.validDays ?? 14) * DAY),
      acceptedAt: p.acceptedAt ?? null,
      paymentStatus: p.paymentStatus ?? "none",
      termsUrl: "https://example.test/agb",
      dpaUrl: "https://example.test/avv",
      abschlussBonus: 200,
      ...(p.createdAt ? { createdAt: p.createdAt } : {}),
    },
  });
}

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

async function seite(token: string) {
  const el = await OfferPage({ params: Promise.resolve({ token }), searchParams: Promise.resolve({}) });
  return renderToStaticMarkup(el);
}

describe("Angebot als abgelehnt markieren", () => {
  beforeAll(() => {
    requireTestDb();
    process.env.APP_URL ||= "https://app.test";
  });
  afterAll(async () => {
    await prisma.offer.deleteMany({ where: { salesContactId: { in: contactIds } } });
    await prisma.salesContact.deleteMany({ where: { id: { in: contactIds } } });
  });

  it("setzt Status, Zeitpunkt, Grund und Notiz, schreibt den Verlauf, beendet Angebotsaufgaben und Follow-up; Kontakt bleibt (Nein)", async () => {
    const c = await kontakt();
    const o = await angebot(c.id);
    const nachfassen = await prisma.salesTask.create({ data: { contactId: c.id, title: "Nachfassen: Angebot", type: "NACHFASSEN", dueAt: new Date() } });
    const unterlagen = await prisma.salesTask.create({ data: { contactId: c.id, title: "Unterlagen senden", type: "UNTERLAGEN", dueAt: new Date() } });
    await prisma.salesFollowup.create({ data: { contactId: c.id, activeFor: c.id, status: "GEPLANT", source: "AUSGANG", dueAt: new Date(Date.now() + 30 * DAY), nextAt: new Date(Date.now() + 30 * DAY) } });

    const res = await declineOfferAction(o.id, { grund: "ZU_TEUER", notiz: "Budget erst nächstes Jahr", kontaktVerloren: false });
    expect(res.ok).toBe(true);

    const nach = await prisma.offer.findUniqueOrThrow({ where: { id: o.id } });
    expect(nach.status).toBe("declined");
    expect(nach.declinedAt).toBeInstanceOf(Date);
    expect(nach.declineReason).toBe("ZU_TEUER");
    expect(nach.declineNote).toBe("Budget erst nächstes Jahr");
    expect(nach.declinedPrevStatus).toBe("sent");

    const verlauf = await prisma.salesActivity.findMany({ where: { contactId: c.id } });
    const eintrag = verlauf.find((a) => a.outcome === `Angebot ${o.number} abgelehnt: Zu teuer / kein Budget`);
    expect(eintrag?.note).toContain("Budget erst nächstes Jahr");
    expect(eintrag?.note).toContain("1 offene Aufgabe erledigt.");
    expect(verlauf.some((a) => a.outcome === "Später-Follow-up gestoppt")).toBe(true);

    expect((await prisma.salesTask.findUniqueOrThrow({ where: { id: nachfassen.id } })).doneAt).not.toBeNull();
    expect((await prisma.salesTask.findUniqueOrThrow({ where: { id: unterlagen.id } })).doneAt).toBeNull();
    const f = await prisma.salesFollowup.findFirstOrThrow({ where: { contactId: c.id } });
    expect(f.status).toBe("GESTOPPT");
    expect(f.activeFor).toBeNull();

    const k = await prisma.salesContact.findUniqueOrThrow({ where: { id: c.id } });
    expect(k.stage).toBe("TERMIN");
    expect(k.lossReason).toBeNull();

    // Karte: abgelehnt mit Grund, „Wieder öffnen“ möglich, kein weiteres Ablehnen
    const row = toOfferRow(nach);
    expect(row.declineReason).toBe("Zu teuer / kein Budget");
    expect(row.kannWiederOeffnen).toBe(true);
    expect(row.kannAblehnen).toBe(false);

    // Zweites Ablehnen geht nicht
    expect((await angebotAblehnen(o.id, { grund: "KEIN_BEDARF" })).ok).toBe(false);
  });

  it("Kontakt auch verloren (Ja): gleiche Verloren-Logik mit demselben Grund, alle Aufgaben erledigt, „Später erneut ansprechen“ als Aufgabe", async () => {
    const c = await kontakt();
    const o = await angebot(c.id);
    await prisma.salesTask.create({ data: { contactId: c.id, title: "Unterlagen senden", type: "UNTERLAGEN", dueAt: new Date() } });
    const res = await angebotAblehnen(o.id, { grund: "HAT_ANBIETER", kontaktVerloren: true, spaeterAm: "2027-03-01" });
    expect(res).toMatchObject({ ok: true, verloren: true, spaeterAm: "2027-03-01" });

    const k = await prisma.salesContact.findUniqueOrThrow({ where: { id: c.id } });
    expect(k.stage).toBe("VERLOREN");
    expect(k.lossReason).toBe("HAT_ANBIETER");
    expect(await prisma.salesActivity.count({ where: { contactId: c.id, type: "STATUS", outcome: "Termin → Verloren" } })).toBe(1);

    const offen = await prisma.salesTask.findMany({ where: { contactId: c.id, doneAt: null } });
    expect(offen.map((t) => t.title)).toEqual(["Wieder melden"]);
    expect(offen[0].dueAt.toISOString().slice(0, 10)).toBe("2027-03-01");
    expect(offen[0].note).toContain(o.number);

    // Datum in der Vergangenheit wird abgelehnt
    const o2 = await angebot(c.id);
    expect((await angebotAblehnen(o2.id, { grund: "ZU_TEUER", spaeterAm: "2020-01-01" })).ok).toBe(false);
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: o2.id } })).status).toBe("sent");
  });

  it("angenommen ohne Zahlung: abgelehnt, keine Zahlungserinnerung mehr, Aufgabe „Zahlung offen“ erledigt; bezahlt geht nicht", async () => {
    const c = await kontakt();
    const o = await angebot(c.id, { status: "accepted", acceptedAt: new Date(Date.now() - 10 * DAY) });
    await prisma.salesTask.create({ data: { contactId: c.id, title: `Zahlung offen: ${o.company}`, type: "NACHFASSEN", dueAt: new Date() } });
    const res = await angebotAblehnen(o.id, { grund: "KEIN_INTERESSE", kontaktVerloren: false });
    expect(res.ok).toBe(true);
    expect(await prisma.salesTask.count({ where: { contactId: c.id, doneAt: null } })).toBe(0);
    const eintrag = await prisma.salesActivity.findFirst({ where: { contactId: c.id, outcome: { startsWith: `Angebot ${o.number} abgelehnt` } } });
    expect(eintrag?.note).toContain("Zahlungserinnerungen beendet.");

    st.mails.length = 0;
    await runZahlungserinnerungen(new Date());
    expect(st.mails.some((m) => m.to === o.email)).toBe(false);
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: o.id } })).paymentReminderCount).toBe(0);

    // Gegenprobe: bezahlt lässt sich nicht ablehnen
    const bezahlt = await angebot(c.id, { status: "accepted", acceptedAt: new Date(), paymentStatus: "paid" });
    const r2 = await angebotAblehnen(bezahlt.id, { grund: "ZU_TEUER" });
    expect(r2.ok).toBe(false);
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: bezahlt.id } })).status).toBe("accepted");
  });

  it("Kundenseite: Hinweis in Sie-Form statt Annahme, Annahme wird abgewiesen; offenes Angebot zeigt die Annahme", async () => {
    const c = await kontakt();
    const offen = await angebot(c.id);
    const htmlOffen = await seite(offen.token);
    expect(htmlOffen).toContain("Angebot annehmen");
    expect(htmlOffen).not.toContain(HINWEIS);

    const o = await angebot(c.id);
    await angebotAblehnen(o.id, { grund: "ZU_TEUER" });
    const html = await seite(o.token);
    expect(html).toContain(HINWEIS);
    expect(html).toContain("data-angebot-nicht-mehr-gueltig");
    expect(html).not.toContain("Angebot annehmen");
    expect(html).not.toContain('id="annehmen"');
    expect(html).not.toContain("Abschlussbonus");
    expect(HINWEIS).not.toMatch(/[–—]/);

    const accept = await acceptOffer(o.token, { name: "Paul Ablehner", termsAccepted: true, business: { company: "Agentur", vatId: "", confirmed: true }, ip: null, agent: null });
    expect(accept).toEqual({ ok: false, error: HINWEIS });
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("declined");
  });

  it("umgekehrt: Kontakt verloren mit offenem Angebot (Ja) lehnt es mit demselben Grund ab, Nein lässt es offen", async () => {
    const c1 = await kontakt();
    const o1 = await angebot(c1.id);
    await setStage(fd({ contactId: c1.id, stage: "VERLOREN", lossReason: "ZU_TEUER", competitor: "", declineOfferId: o1.id }));
    const n1 = await prisma.offer.findUniqueOrThrow({ where: { id: o1.id } });
    expect(n1.status).toBe("declined");
    expect(n1.declineReason).toBe("ZU_TEUER");
    expect((await prisma.salesContact.findUniqueOrThrow({ where: { id: c1.id } })).stage).toBe("VERLOREN");

    const c2 = await kontakt();
    const o2 = await angebot(c2.id);
    await setStage(fd({ contactId: c2.id, stage: "VERLOREN", lossReason: "ZU_TEUER", competitor: "" }));
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: o2.id } })).status).toBe("sent");

    // Fremdes Angebot wird nicht angefasst
    const c3 = await kontakt();
    const fremd = await angebot(c2.id);
    await setStage(fd({ contactId: c3.id, stage: "VERLOREN", lossReason: "ZU_TEUER", declineOfferId: fremd.id }));
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: fremd.id } })).status).toBe("sent");

    // Aktivität „Kein Interesse / Verloren“ mit Häkchen
    const c4 = await kontakt();
    const o4 = await angebot(c4.id);
    await logActivity(fd({ contactId: c4.id, type: "ANRUF", outcome: "verloren", lossReason: "KEIN_BEDARF", declineOfferId: o4.id }));
    const n4 = await prisma.offer.findUniqueOrThrow({ where: { id: o4.id } });
    expect(n4.status).toBe("declined");
    expect(n4.declineReason).toBe("KEIN_BEDARF");
  });

  it("Wieder öffnen: stellt den Status davor her, solange gültig; abgelaufen oder neuere Version nicht", async () => {
    const c = await kontakt();
    const o = await angebot(c.id, { createdAt: new Date(Date.now() - 3 * DAY) });
    await angebotAblehnen(o.id, { grund: "ZU_TEUER", notiz: "zu teuer" });
    const res = await reopenOfferAction(o.id);
    expect(res.ok).toBe(true);
    const n = await prisma.offer.findUniqueOrThrow({ where: { id: o.id } });
    expect(n).toMatchObject({ status: "sent", declinedAt: null, declineReason: null, declineNote: null, declinedPrevStatus: null });
    expect(await prisma.salesActivity.count({ where: { contactId: c.id, outcome: `Angebot ${o.number} wieder geöffnet` } })).toBe(1);
    expect(await seite(o.token)).toContain("Angebot annehmen");

    // Abgelaufen: nicht mehr
    const alt = await angebot(c.id, { validDays: -1 });
    await angebotAblehnen(alt.id, { grund: "ZU_TEUER" });
    expect(toOfferRow(await prisma.offer.findUniqueOrThrow({ where: { id: alt.id } })).kannWiederOeffnen).toBe(false);
    const r2 = await angebotWiederOeffnen(alt.id);
    expect(r2.ok).toBe(false);
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: alt.id } })).status).toBe("declined");

    // Neuere Version vorhanden: nicht
    await angebotAblehnen(o.id, { grund: "ZU_TEUER" });
    const r3 = await angebotWiederOeffnen(o.id);
    expect(r3).toEqual({ ok: false, error: "Es gibt schon eine neuere Version dieses Angebots." });
  });

  it("Auswertung: Übersicht und Zahlen zeigen „Abgelehnt: Grund × Anzahl“", async () => {
    const c = await kontakt();
    const a = await angebot(c.id);
    const b = await angebot(c.id);
    await angebotAblehnen(a.id, { grund: "UEBER_ALLIANZ" });
    await angebotAblehnen(b.id, { grund: "UEBER_ALLIANZ" });
    const { rows, ablehnGruende } = await ladeAngebote("abgelaufen");
    const zeile = rows.find((r) => r.id === a.id);
    expect(zeile).toMatchObject({ z: "abgelehnt", grund: "Macht es über die Allianz", kannWiederOeffnen: true, kannAblehnen: false });
    expect(ablehnGruende.find((g) => g.grund === "UEBER_ALLIANZ")?.anzahl).toBeGreaterThanOrEqual(2);

    const z = await loadVertriebZahlen("30");
    const schritt = z.steps.find((s) => s.key === "offers")!;
    expect(schritt.note).toMatch(/abgelehnt: .*Macht es über die Allianz × \d/);
    expect(schritt.rows.find((r) => r.id === a.id)?.status).toBe("abgelehnt: Macht es über die Allianz");
  });
});
