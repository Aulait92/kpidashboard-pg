// Beispieldaten der öffentlichen App-Demo neu anlegen (Ole, 16.11.2026). Läuft NUR gegen die eigene Demo-Datenbank
// (APP_DEMO_DATABASE_URL, Schreib-Client über mitDemoSchreibClient) – beim Start und täglich im Cron, nie in einer Anfrage.
//
// Alles ist frei erfunden: Beispielmarke „Max Berger“, Namen aus lib/demo-data.ts, Nummern 0151 00000…,
// E-Mails @example.com. Keine Zugangsdaten zu WhatsApp, Kalender, Meta oder Stripe: in der Demo-Datenbank gibt es
// nichts, womit eine Seite nach außen sprechen könnte.
//
// Schutz gegen eine falsch gesetzte Variable: Die Demo-Datenbank trägt die Tabelle "_app_demo". Angelegt wird sie
// nur in einer Datenbank mit höchstens DEMO_MAX_KUNDEN Kunden (frisch migriert); ohne sie wird nichts gelöscht.

import { prisma, mitDemoSchreibClient } from "@/lib/prisma";
import { seedDemoData } from "@/lib/demo-data";
import { collectReportData, loadReportSettings } from "@/lib/monatsbericht/server";
import { reportSubject, type ReportModel } from "@/lib/monatsbericht/bericht";
import { shiftMonth } from "@/lib/monatsbericht/shared";
import { APP_DEMO_KUNDE_ID, APP_DEMO_KUNDE_NAME, DEMO_MAX_KUNDEN, appDemoEingerichtet } from "./db";

const DAY = 24 * 3600_000;
/** Tabellen, die Migrationen befüllen (Neuigkeiten, Login-Karten, Kostenregeln): bleiben stehen. */
const BEHALTEN = new Set(["_prisma_migrations", "_app_demo", "ProductUpdate", "LoginCard", "CostRule"]);

/** Ist das wirklich die Demo-Datenbank? Legt die Kennzeichen-Tabelle an, wenn die Datenbank frisch ist. */
async function demoDatenbankSicherstellen(): Promise<void> {
  const [t] = await prisma.$queryRawUnsafe<{ da: boolean }[]>(`SELECT to_regclass('public."_app_demo"') IS NOT NULL AS da`);
  if (t?.da) return;
  const kunden = await prisma.customer.count();
  if (kunden > DEMO_MAX_KUNDEN) throw new Error(`App-Demo: Ziel-Datenbank hat ${kunden} Kunden – das ist keine Demo-Datenbank. Nichts geändert.`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "_app_demo" (stand timestamptz)`);
  await prisma.$executeRawUnsafe(`INSERT INTO "_app_demo" (stand) VALUES (NULL)`);
}

/** Alle Daten der Demo-Datenbank leeren (außer den von Migrationen gepflegten Tabellen). */
async function leeren(): Promise<void> {
  const tabellen = await prisma.$queryRawUnsafe<{ t: string }[]>(`SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public'`);
  const weg = tabellen.map((x) => x.t).filter((t) => !BEHALTEN.has(t));
  if (weg.length) await prisma.$executeRawUnsafe(`TRUNCATE ${weg.map((t) => `"${t.replace(/"/g, "")}"`).join(", ")} CASCADE`);
}

/** Berliner Uhrzeit h:m am Tag von d (UTC-Rechnung wie lib/demo-data.ts). */
function berlin(d: Date, h: number, m = 0): Date {
  const x = new Date(d);
  x.setUTCHours(h, m, 0, 0);
  const bh = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(x));
  x.setUTCHours(h - (bh - h), m, 0, 0);
  return x;
}

export type AppDemoSeedErgebnis = { ok: true; leads: number; dauerMs: number } | { ok: false; grund: string };

export async function appDemoNeuAnlegen(now = new Date()): Promise<AppDemoSeedErgebnis> {
  if (!appDemoEingerichtet()) return { ok: false, grund: "nicht eingerichtet" };
  const start = Date.now();
  return mitDemoSchreibClient(async () => {
    await demoDatenbankSicherstellen();
    await leeren();
    const id = APP_DEMO_KUNDE_ID;
    await prisma.customer.create({
      data: { id, name: APP_DEMO_KUNDE_NAME, plan: "software", newUi: true, leadEmail: false, mailFeaturesOff: true, capiEnabled: false, crossSellReminder: false, policeReminder: false },
    });
    await prisma.onboarding.create({ data: { customerId: id, liveAt: new Date(now.getTime() - 70 * DAY) } }).catch(() => null);
    await prisma.whatsAppAccount.create({ data: { customerId: id, status: "connected", phoneNumber: "+49 151 00000000", displayName: "Max Berger Versicherungen" } });
    await prisma.agentConfig.create({ data: { customerId: id, active: true, name: "Assistent von Max" } });
    // Erstinformation vollständig (sonst Warnhinweis auf „Heute“), Platzhalter-PDF
    await prisma.erstinformation.create({
      data: {
        customerId: id,
        token: "app-demo-erstinfo",
        registerNummer: "D-0000-DEMO0-00",
        fileName: "erstinformation.pdf",
        contentType: "application/pdf",
        size: 8,
        data: Buffer.from("%PDF-1.4"),
        bestaetigtAt: now,
        statusAt: now,
      },
    });

    const r = await seedDemoData(id);

    // Wie im Alltag (tools/erklaervideos/local/ev_zustand.mjs): fast alle offenen Leads mit Wiedervorlage, zwei ohne
    const offen = ["Nicht erreicht", "Im Gespräch", "In Beratung", "Angebot gesendet"];
    const ohne = await prisma.lead.findMany({ where: { customerId: id, status: { in: offen }, closedAt: null, followUpAt: null }, orderBy: { createdAt: "desc" }, select: { id: true } });
    await prisma.lead.updateMany({ where: { id: { in: ohne.slice(2).map((l) => l.id) } }, data: { followUpAt: new Date(now.getTime() + 3 * DAY) } });

    // „Kein WhatsApp“: eine frische Anfrage, deren Nummer kein WhatsApp hat (Kennzeichen in Kontakte und Pipeline)
    const neu = await prisma.lead.findFirst({ where: { customerId: id, status: "Neuer Lead" }, orderBy: { createdAt: "desc" }, select: { id: true, phone: true } });
    if (neu) {
      await prisma.lead.update({ where: { id: neu.id }, data: { outreachStatus: "no_whatsapp", waUnavailableAt: new Date(now.getTime() - 2 * 3600_000), reached: false } });
      await prisma.conversation.deleteMany({ where: { leadId: neu.id } });
    }

    // Termin vom letzten Werktag ohne Ergebnis („Wie lief es?“)
    const dennis = await prisma.lead.findFirst({ where: { customerId: id, name: "Dennis Jung" }, select: { id: true } });
    if (dennis) {
      let gestern = now.getTime() - DAY;
      while ([0, 6].includes(new Date(gestern).getUTCDay())) gestern -= DAY;
      const s = berlin(new Date(gestern), 13);
      await prisma.appointment.create({ data: { customerId: id, leadId: dennis.id, mode: "video", startsAt: s, endsAt: new Date(s.getTime() + 30 * 60_000), status: "booked", reminderSentAt: now } });
    }

    // Terminvorbereitung und Präsentation: Dominik Schmid (wie die Präsentations-Demo, lib/demo-beratung.ts) hat heute
    // bzw. am nächsten Werktag einen Videotermin
    const dominik = await prisma.lead.findFirst({ where: { customerId: id, name: "Dominik Schmid" }, select: { id: true } });
    if (dominik) {
      let tag = now.getTime() + (Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(now)) >= 15 ? DAY : 0);
      while ([0, 6].includes(new Date(tag).getUTCDay())) tag += DAY;
      const s = berlin(new Date(tag), 16);
      await prisma.appointment.updateMany({ where: { leadId: dominik.id, status: "booked" }, data: { status: "cancelled", cancelledAt: now, cancelledBy: "lead" } });
      await prisma.lead.update({
        where: { id: dominik.id },
        data: {
          status: "In Beratung",
          reached: true,
          closedAt: null,
          closeValue: null,
          formData: [
            { label: "Lebenssituation", value: "Single" },
            { label: "Versicherungsinteresse", value: "Haftpflicht, Hausrat, Rechtsschutz" },
          ],
        },
      });
      const conv = await prisma.conversation.findFirst({ where: { leadId: dominik.id }, select: { id: true } });
      await prisma.appointment.create({
        data: { customerId: id, leadId: dominik.id, conversationId: conv?.id ?? null, mode: "video", startsAt: s, endsAt: new Date(s.getTime() + 30 * 60_000), status: "booked", reminderSentAt: now },
      });
      if (conv) {
        await prisma.conversation.update({
          where: { id: conv.id },
          data: {
            qualified: true,
            qualificationSummary: "Single, zieht gerade in eine größere Mietwohnung; möchte Haftpflicht, Hausrat und Rechtsschutz aus einer Hand. Bisher nur eine alte Haftpflicht von 2012. Bevorzugt Videocall.",
            qualificationData: { lebenssituation: "Single, zieht gerade in eine größere Mietwohnung", interesse: "Haftpflicht, Hausrat und Rechtsschutz", wohnflaeche: "68 m², ständig bewohnt", vorhanden: "alte Haftpflicht von 2012", wunsch: "Videocall" },
          },
        });
      }
    }

    // Monatsbericht des Vormonats (wie gesendet), Text fest statt KI
    const monat = shiftMonth(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit" }).format(now), -1);
    const settings = await loadReportSettings();
    const daten = await collectReportData(id, monat, settings, now);
    const { rawMeasures: _roh, ...rest } = daten;
    void _roh;
    const model: ReportModel = {
      ...rest,
      measures: [
        "Ihre Anzeigen auf die Zielgruppe mit den meisten Terminen konzentriert.",
        "Zwei neue Anzeigenmotive gestartet, das schwächste pausiert.",
      ],
    };
    await prisma.monthlyReport.create({
      data: {
        customerId: id,
        month: monat,
        rating: "gut",
        metrics: {},
        subject: reportSubject(model),
        body: {
          version: 2,
          paragraphs: ["Guten Tag Herr Berger, hier ist Ihr Rückblick auf den letzten Monat. Die Anfragen kamen gleichmäßig, aus den Terminen sind mehrere Abschlüsse entstanden."],
          tips: [],
          model,
        } as never,
        status: "sent",
        sentAt: new Date(now.getTime() - 10 * DAY),
      },
    });
    await prisma.$executeRawUnsafe(`UPDATE "_app_demo" SET stand = now()`);
    return { ok: true as const, leads: r.leads, dauerMs: Date.now() - start };
  });
}

let laeuft: Promise<AppDemoSeedErgebnis> | null = null;

/** Beim Start: neu anlegen, wenn noch nie oder vor mehr als 20 Stunden angelegt. Nie zweimal gleichzeitig. */
export async function appDemoAuffrischenWennNoetig(now = new Date()): Promise<AppDemoSeedErgebnis | null> {
  if (!appDemoEingerichtet()) return null;
  const stand = await mitDemoSchreibClient(async () => {
    const [t] = await prisma.$queryRawUnsafe<{ da: boolean }[]>(`SELECT to_regclass('public."_app_demo"') IS NOT NULL AS da`);
    if (!t?.da) return null;
    const [z] = await prisma.$queryRawUnsafe<{ stand: Date | null }[]>(`SELECT max(stand) AS stand FROM "_app_demo"`);
    return z?.stand ?? null;
  });
  if (stand && now.getTime() - new Date(stand).getTime() < 20 * 3600_000) return null;
  return appDemoNeuAnlegenEinmal(now);
}

/** Neu anlegen, aber nie zweimal gleichzeitig (Start und Cron). */
export function appDemoNeuAnlegenEinmal(now = new Date()): Promise<AppDemoSeedErgebnis> {
  if (!laeuft) laeuft = appDemoNeuAnlegen(now).finally(() => (laeuft = null));
  return laeuft;
}
