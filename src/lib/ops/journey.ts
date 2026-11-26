// Diagnose q=journey[&tage=30] (Ole, 19.11.2026: „Je höher die Terminquote und je mehr Leute den Komplettcheck machen,
// umso mehr verdient der Vermittler“): Trichter der Lead-Reise je Vermittler, nur lesend und ohne Personendaten.
//
//   Lead → erste Antwort → Terminvorschlag erhalten → Terminvorschlag gelesen → Termin gebucht → Komplettcheck gefragt
//        → Komplettcheck ja → Vorbereitung gestartet → Vorbereitung fertig → Termin vorbei → erschienen
//
// Kohorte: Leads, die in den letzten N Tagen (Standard 30, höchstens 90) eingegangen sind (ohne Test-Leads), bei echten
// Kunden (nicht Test, nicht intern, nicht archiviert, nicht Demo/Support). WhatsApp und Mail-Strecke zusammen:
//   erste Antwort      eingehende WhatsApp-Nachricht bzw. Reaktion in der Mail-Strecke (Klick, Antwort)
//   Vorschlag erhalten Merker „termin_vorschlag“ im Chat bzw. Erstmail mit Zeiten
//   Vorschlag gelesen  Nachricht des Assistenten bis 2 Min. nach dem Merker mit Status „read“ bzw. Seite geöffnet
//   gebucht            irgendein Termin des Leads (auch abgesagt), Weg über Appointment.bookedVia
//   Komplettcheck      Appointment.komplettcheck (gefragt = nicht null)
//   Vorbereitung       Merker „vorbereitung_antwort“ mit art „ja“ (gestartet) bzw. „strecke_abschluss“ (fertig) im Chat;
//                      dazu „Weiter auf WhatsApp“ der Buchungsseite (Ole, 26.11.2026): Klicks und darüber gestartet
//   erschienen         Appointment.attendance „erschienen“ (nur Termine, die vorbei sind)
// Ausgabe je Vermittler als Kürzel (V1, V2, … nach Leads) mit der internen Kunden-ID, keine Namen von Personen.
// Rein: journeyAuswerten (Unit-Test tests/unit/journey.test.ts).

import { prisma } from "@/lib/prisma";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";

const DAY_MS = 24 * 60 * 60 * 1000;
const AUSGESCHLOSSEN = ["cust_google_review_demo", "app_demo_max_berger", SUPPORT_CUSTOMER_ID];

/** Ein Lead der Kohorte mit den erreichten Stufen (rein, ohne Personendaten). */
export type JourneyLead = {
  customerId: string;
  antwort: boolean;
  vorschlag: boolean;
  vorschlagGelesen: boolean;
  /** Vorbereitung im Chat gestartet bzw. fertig (Schluss der Strecke) */
  vorbereitung?: { gestartet: boolean; fertig: boolean; waKlick: boolean; ueberBuchungsseite: boolean };
  /** Erster Termin des Leads (falls gebucht) */
  termin: { via: string | null; komplettcheck: boolean | null; vorbei: boolean; erschienen: boolean; stundenBisBuchung: number } | null;
};

export const STUFEN = ["leads", "ersteAntwort", "vorschlagErhalten", "vorschlagGelesen", "gebucht", "komplettcheckGefragt", "komplettcheckJa", "vorbereitungGestartet", "vorbereitungFertig", "terminVorbei", "erschienen"] as const;
export type Stufe = (typeof STUFEN)[number];

export type Trichter = Record<Stufe, number> & {
  quoten: {
    antwortJeLead: number | null;
    terminJeLead: number | null;
    terminJeAntwort: number | null;
    terminJeVorschlag: number | null;
    komplettcheckJaJeTermin: number | null;
    komplettcheckJaJeGefragt: number | null;
    erschienenJeVorbei: number | null;
    vorbereitungJeTermin: number | null;
    vorbereitungFertigJeGestartet: number | null;
    /** „Weiter auf WhatsApp“: Anteil der Klicks, nach denen die Vorbereitung startete */
    waWeiterGestartetJeKlick: number | null;
  };
  /** „Weiter auf WhatsApp“ auf der Buchungsseite: Klicks und darüber gestartete Vorbereitungen */
  waWeiter: { klick: number; gestartet: number };
  /** Median Stunden vom Eingang bis zur Buchung */
  medianStundenBisTermin: number | null;
  /** Buchungen und Komplettcheck je Weg (bot, booking_page, mail_strecke, advisor, ohne) */
  jeWeg: Record<string, { gebucht: number; komplettcheckGefragt: number; komplettcheckJa: number }>;
};

const quote = (z: number, n: number) => (n ? Math.round((z / n) * 1000) / 10 : null);

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return Math.round((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 10) / 10;
}

/** Trichter für eine Menge von Leads (rein). Quoten in Prozent mit einer Nachkommastelle. */
export function trichter(leads: readonly JourneyLead[]): Trichter {
  const t = leads.filter((l) => l.termin).map((l) => l.termin!);
  const z = {
    leads: leads.length,
    ersteAntwort: leads.filter((l) => l.antwort).length,
    vorschlagErhalten: leads.filter((l) => l.vorschlag).length,
    vorschlagGelesen: leads.filter((l) => l.vorschlagGelesen).length,
    gebucht: t.length,
    komplettcheckGefragt: t.filter((x) => x.komplettcheck !== null).length,
    komplettcheckJa: t.filter((x) => x.komplettcheck === true).length,
    vorbereitungGestartet: leads.filter((l) => l.vorbereitung?.gestartet).length,
    vorbereitungFertig: leads.filter((l) => l.vorbereitung?.fertig).length,
    terminVorbei: t.filter((x) => x.vorbei).length,
    erschienen: t.filter((x) => x.vorbei && x.erschienen).length,
  };
  const waWeiter = { klick: leads.filter((l) => l.vorbereitung?.waKlick).length, gestartet: leads.filter((l) => l.vorbereitung?.ueberBuchungsseite).length };
  const jeWeg: Trichter["jeWeg"] = {};
  for (const x of t) {
    const w = (jeWeg[x.via ?? "ohne"] ??= { gebucht: 0, komplettcheckGefragt: 0, komplettcheckJa: 0 });
    w.gebucht++;
    if (x.komplettcheck !== null) w.komplettcheckGefragt++;
    if (x.komplettcheck === true) w.komplettcheckJa++;
  }
  return {
    ...z,
    quoten: {
      antwortJeLead: quote(z.ersteAntwort, z.leads),
      terminJeLead: quote(z.gebucht, z.leads),
      terminJeAntwort: quote(z.gebucht, z.ersteAntwort),
      terminJeVorschlag: quote(z.gebucht, z.vorschlagErhalten),
      komplettcheckJaJeTermin: quote(z.komplettcheckJa, z.gebucht),
      komplettcheckJaJeGefragt: quote(z.komplettcheckJa, z.komplettcheckGefragt),
      erschienenJeVorbei: quote(z.erschienen, z.terminVorbei),
      vorbereitungJeTermin: quote(z.vorbereitungGestartet, z.gebucht),
      vorbereitungFertigJeGestartet: quote(z.vorbereitungFertig, z.vorbereitungGestartet),
      waWeiterGestartetJeKlick: quote(waWeiter.gestartet, waWeiter.klick),
    },
    waWeiter,
    medianStundenBisTermin: median(t.map((x) => x.stundenBisBuchung)),
    jeWeg,
  };
}

/** Gesamt und je Vermittler (Kürzel V1, V2, … absteigend nach Leads), rein. */
export function journeyAuswerten(leads: readonly JourneyLead[]): { gesamt: Trichter; jeVermittler: ({ kuerzel: string; customerId: string } & Trichter)[] } {
  const gruppen = new Map<string, JourneyLead[]>();
  for (const l of leads) gruppen.set(l.customerId, [...(gruppen.get(l.customerId) ?? []), l]);
  const jeVermittler = [...gruppen.entries()]
    .sort((x, y) => y[1].length - x[1].length || x[0].localeCompare(y[0]))
    .map(([customerId, ls], i) => ({ kuerzel: `V${i + 1}`, customerId, ...trichter(ls) }));
  return { gesamt: trichter(leads), jeVermittler };
}

/** Rohdaten laden (begrenzt auf die Kohorte; nie Namen, Nummern, Adressen oder Inhalte). */
export async function ladeJourney(tage: number, now = new Date()): Promise<JourneyLead[]> {
  const seit = new Date(now.getTime() - tage * DAY_MS);
  const kunden = await prisma.customer.findMany({ where: { isTest: false, archived: false, plan: { not: "internal" }, id: { notIn: AUSGESCHLOSSEN } }, select: { id: true } });
  const leads = await prisma.lead.findMany({
    where: { customerId: { in: kunden.map((k) => k.id) }, isTest: false, createdAt: { gte: seit } },
    select: { id: true, customerId: true, createdAt: true },
    take: 20_000,
  });
  if (!leads.length) return [];
  const leadIds = leads.map((l) => l.id);
  const [convs, strecken, termine] = await Promise.all([
    prisma.conversation.findMany({ where: { leadId: { in: leadIds } }, select: { id: true, leadId: true } }),
    prisma.leadMailStrecke.findMany({ where: { leadId: { in: leadIds } }, select: { leadId: true, reaktionAt: true, erstmailAt: true, zeiten: true } }),
    prisma.appointment.findMany({
      where: { leadId: { in: leadIds } },
      orderBy: { createdAt: "asc" },
      select: { leadId: true, createdAt: true, startsAt: true, bookedVia: true, komplettcheck: true, attendance: true, status: true },
    }),
  ]);
  const convIds = convs.map((c) => c.id);
  const [antworten, vorschlaege, vorbereitung] = await Promise.all([
    prisma.message.findMany({ where: { conversationId: { in: convIds }, direction: "inbound" }, distinct: ["conversationId"], select: { conversationId: true } }),
    prisma.message.findMany({ where: { conversationId: { in: convIds }, direction: "internal", kind: "termin_vorschlag" }, select: { conversationId: true, createdAt: true } }),
    // Merker der Strecke (termin-strecke.ts STRECKE): nur Art und Weg, keine Inhalte
    prisma.message.findMany({
      where: { conversationId: { in: convIds }, direction: "internal", kind: { in: ["vorbereitung_antwort", "strecke_abschluss", "buchungsseite_wa_klick"] } },
      select: { conversationId: true, kind: true, body: true },
    }),
  ]);
  const vorb = new Map<string, { gestartet: boolean; fertig: boolean; waKlick: boolean; ueberBuchungsseite: boolean }>();
  for (const m of vorbereitung) {
    const v = vorb.get(m.conversationId) ?? { gestartet: false, fertig: false, waKlick: false, ueberBuchungsseite: false };
    let d: { art?: unknown; via?: unknown } = {};
    try {
      d = JSON.parse(m.body ?? "{}");
    } catch {}
    if (m.kind === "vorbereitung_antwort" && d.art === "ja") {
      v.gestartet = true;
      if (d.via === "buchungsseite") v.ueberBuchungsseite = true;
    }
    if (m.kind === "strecke_abschluss") v.fertig = true;
    if (m.kind === "buchungsseite_wa_klick") v.waKlick = true;
    vorb.set(m.conversationId, v);
  }
  // Gelesen: Nachricht des Assistenten bis 2 Min. nach einem Vorschlags-Merker mit Status „read“
  const gelesen = new Set<string>();
  if (vorschlaege.length) {
    const vConvs = [...new Set(vorschlaege.map((v) => v.conversationId))];
    const read = await prisma.message.findMany({ where: { conversationId: { in: vConvs }, direction: "outbound", status: "read" }, select: { conversationId: true, createdAt: true } });
    for (const v of vorschlaege) {
      if (read.some((r) => r.conversationId === v.conversationId && r.createdAt >= v.createdAt && r.createdAt.getTime() - v.createdAt.getTime() <= 120_000)) gelesen.add(v.conversationId);
    }
  }
  const convsJeLead = new Map<string, string[]>();
  for (const c of convs) if (c.leadId) convsJeLead.set(c.leadId, [...(convsJeLead.get(c.leadId) ?? []), c.id]);
  const mitAntwort = new Set(antworten.map((x) => x.conversationId));
  const mitVorschlag = new Set(vorschlaege.map((x) => x.conversationId));
  const streckeJeLead = new Map(strecken.map((s) => [s.leadId, s]));
  const terminJeLead = new Map<string, (typeof termine)[number]>();
  for (const t of termine) if (t.leadId && !terminJeLead.has(t.leadId)) terminJeLead.set(t.leadId, t);
  return leads.map((l) => {
    const cs = convsJeLead.get(l.id) ?? [];
    const s = streckeJeLead.get(l.id);
    const t = terminJeLead.get(l.id);
    return {
      customerId: l.customerId,
      antwort: cs.some((c) => mitAntwort.has(c)) || !!s?.reaktionAt,
      vorschlag: cs.some((c) => mitVorschlag.has(c)) || (!!s?.erstmailAt && s.zeiten.length > 0),
      vorschlagGelesen: cs.some((c) => gelesen.has(c)) || (!!s?.erstmailAt && s.zeiten.length > 0 && !!s.reaktionAt),
      vorbereitung: {
        gestartet: cs.some((c) => vorb.get(c)?.gestartet),
        fertig: cs.some((c) => vorb.get(c)?.fertig),
        waKlick: cs.some((c) => vorb.get(c)?.waKlick),
        ueberBuchungsseite: cs.some((c) => vorb.get(c)?.ueberBuchungsseite),
      },
      termin: t
        ? {
            via: t.bookedVia,
            komplettcheck: t.komplettcheck,
            vorbei: t.startsAt.getTime() < now.getTime() && t.status !== "cancelled",
            erschienen: t.attendance === "erschienen",
            stundenBisBuchung: Math.max(0, (t.createdAt.getTime() - l.createdAt.getTime()) / 3_600_000),
          }
        : null,
    };
  });
}

export async function journeyDiagnose(params: URLSearchParams, now = new Date()) {
  const tage = Math.min(90, Math.max(1, Number(params.get("tage")) || 30));
  const r = journeyAuswerten(await ladeJourney(tage, now));
  return {
    tage,
    stufen: STUFEN,
    datenschutz: "Nur Anzahlen und Quoten je Vermittler (Kürzel und interne Kunden-ID), keine Namen, Nummern, Adressen oder Inhalte.",
    hinweis: "Kohorte = Leads der letzten N Tage; späte Buchungen junger Leads fehlen noch. Quoten in Prozent.",
    ...r,
  };
}
