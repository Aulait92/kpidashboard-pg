// Termine per Weiterleitung blockieren, Datenbank und Ablauf (Ole, 21.11.2026). Reine Teile, Texte und Regeln:
// lib/calendar/termin-weiterleitung.ts. Aufgerufen aus lib/mail/eingang.ts, wenn eine Mail an eine Termin-Adresse geht.
//
//   Zuordnung   Token der Adresse → KalenderWeiterleitung (Kalender-Schlüssel). Absender wird nicht geprüft (der Token
//               schützt); ohne gültige Kalenderdatei passiert nichts.
//   Blockieren  CalendarBlock mit quelle „weitergeleitet“, Hash der UID, SEQUENCE, Vorkommen. Gleiche UID mit gleicher oder
//               höherer SEQUENCE ersetzt die Blockierung (verschieben), Absage löscht sie (freigeben). Ältere Fassungen
//               ändern nichts. Gebuchte Lead-Termine bleiben bestehen; bei Überschneidung Push an den Vermittler.
//   Rückmeldung Mail an den Absender, wenn er zum Konto gehört (Login oder Berater-Adresse); sonst Push. Fremde Absender
//               ohne Kalenderdatei bekommen nichts (kein Rückstreu-Spam).
//   Schutz      Automatische Mails und eigene Absender werden ignoriert, höchstens 60 Eingänge je Kunde und Tag.
//               Keine Inhalte in Logs.

import { prisma } from "@/lib/prisma";
import { reineAdresse } from "@/lib/mail/antwort-adresse";
import { autoAntwortGrund, istSchleife, type EingangErgebnis } from "@/lib/mail/eingang";
import type { EingangApi, EmpfangenerAnhang } from "@/lib/mail/eingang-api";
import { userIdOfKey } from "@/lib/calendar/tokens";
import {
  kalenderAusMime,
  kalenderAusText,
  neuerToken,
  rueckmeldungErfolg,
  rueckmeldungFehler,
  TERMIN_QUELLE,
  terminAdresse,
  termineAusKalendern,
  ueberschneidungPush,
  type Angewendet,
  type FehlerGrund,
  type Rueckmeldung,
  type TerminAktion,
  type Ueberschneidung,
  type Zeitraum,
} from "@/lib/calendar/termin-weiterleitung";

export const TERMIN_LIMIT_TAG = 60;
const ROH_LIMIT = 15 * 1024 * 1024;
const ANHANG_LIMIT = 3 * 1024 * 1024;

const istEindeutigFehler = (e: unknown) => !!e && typeof e === "object" && (e as { code?: string }).code === "P2002";

/** Persönliche Termin-Adresse des Kalenders (legt den Token beim ersten Mal an). */
export async function terminAdresseFuer(calendarKey: string, customerId: string): Promise<string> {
  for (let i = 0; i < 3; i++) {
    const vorhanden = await prisma.kalenderWeiterleitung.findUnique({ where: { calendarKey }, select: { token: true } });
    if (vorhanden) return terminAdresse(vorhanden.token);
    try {
      const neu = await prisma.kalenderWeiterleitung.create({ data: { calendarKey, customerId, token: neuerToken() }, select: { token: true } });
      return terminAdresse(neu.token);
    } catch (e) {
      if (!istEindeutigFehler(e)) throw e;
    }
  }
  throw new Error("termin_adresse");
}

// ─── Blockierungen anwenden ────────────────────────────────────────────────

type Block = { startsAt: Date; endsAt: Date; sequence: number | null };
const gleich = (a: Block[], b: Zeitraum[]) =>
  a.length === b.length && a.every((x, i) => x.startsAt.getTime() === b[i].start.getTime() && x.endsAt.getTime() === b[i].end.getTime());

/**
 * Aktionen auf die Blockierungen eines Kalenders anwenden. Ganze Termine/Serien: veraltet, wenn die SEQUENCE kleiner ist
 * als die aller vorhandenen Blockierungen dieser UID (Ausnahmen einer Serie dürfen höhere haben); einzelne Vorkommen:
 * veraltet, wenn kleiner als die des Vorkommens.
 */
export async function wendeTerminAn(calendarKey: string, customerId: string, aktionen: TerminAktion[], now: Date): Promise<{ angewendet: Angewendet[]; neu: Zeitraum[] }> {
  const angewendet: Angewendet[] = [];
  const neu: Zeitraum[] = [];
  for (const a of aktionen) {
    const where = { calendarKey, quelle: TERMIN_QUELLE, uidHash: a.uidHash, ...(a.vorkommen ? { vorkommen: a.vorkommen } : {}) };
    const r = await prisma.$transaction(async (tx) => {
      const alt: Block[] = await tx.calendarBlock.findMany({ where, orderBy: { startsAt: "asc" }, select: { startsAt: true, endsAt: true, sequence: true } });
      const seqs = alt.map((b) => b.sequence ?? 0);
      const grenze = a.vorkommen ? Math.max(...seqs) : Math.min(...seqs);
      const altZeiten = alt.filter((b) => b.endsAt > now).map((b) => ({ start: b.startsAt, end: b.endsAt, vorkommen: null }));
      if (alt.length && a.sequence < grenze) return { art: "veraltet" as const, zeiten: [] };
      if (a.art === "freigeben") {
        if (!alt.length) return { art: "nicht_gefunden" as const, zeiten: [] };
        await tx.calendarBlock.deleteMany({ where });
        return { art: "freigegeben" as const, zeiten: altZeiten };
      }
      if (alt.length) await tx.calendarBlock.deleteMany({ where });
      await tx.calendarBlock.createMany({
        data: a.zeiten.map((z) => ({
          customerId,
          calendarKey,
          startsAt: z.start,
          endsAt: z.end,
          note: null,
          quelle: TERMIN_QUELLE,
          uidHash: a.uidHash,
          sequence: a.sequence,
          vorkommen: z.vorkommen,
        })),
      });
      const zukunft = alt.filter((b) => b.endsAt > now);
      return { art: zukunft.length && !gleich(zukunft, a.zeiten) ? ("verschoben" as const) : ("blockiert" as const), zeiten: a.zeiten };
    });
    angewendet.push({ art: r.art, serie: a.serie, zeiten: r.zeiten });
    if (r.art === "blockiert" || r.art === "verschoben") neu.push(...a.zeiten);
  }
  return { angewendet, neu };
}

/** Gebuchte Lead-Termine dieses Kalenders, die in neu blockierte Zeiten fallen (werden nicht abgesagt). */
export async function ueberschneidungen(calendarKey: string, customerId: string, zeiten: Zeitraum[]): Promise<Ueberschneidung[]> {
  if (!zeiten.length) return [];
  const min = new Date(Math.min(...zeiten.map((z) => z.start.getTime())) - 4 * 3600_000);
  const max = new Date(Math.max(...zeiten.map((z) => z.end.getTime())));
  const termine = await prisma.appointment.findMany({
    where: {
      customerId,
      status: "booked",
      startsAt: { gt: min, lt: max },
      OR: [{ calendarKey }, ...(userIdOfKey(calendarKey) ? [] : [{ calendarKey: null }])],
    },
    orderBy: { startsAt: "asc" },
    take: 50,
    select: { startsAt: true, endsAt: true, leadId: true, lead: { select: { name: true } } },
  });
  return termine
    .filter((t) => {
      const ende = t.endsAt ?? new Date(t.startsAt.getTime() + 30 * 60_000);
      return zeiten.some((z) => z.start < ende && z.end > t.startsAt);
    })
    .map((t) => ({ name: t.lead?.name?.trim() || "einem Lead", start: t.startsAt, leadId: t.leadId }));
}

// ─── Kalenderdaten aus der Mail ────────────────────────────────────────────

const istKalenderAnhang = (a: Pick<EmpfangenerAnhang, "filename" | "contentType">) =>
  /(text\/calendar|application\/ics|message\/rfc822)/i.test(a.contentType) || /\.(ics|vcs|eml)$/i.test(a.filename ?? "");

/** Rohmail (bevorzugt), sonst Kalender-Anhänge, sonst VCALENDAR im Text. */
export async function sammleKalender(api: EingangApi, emailId: string, mail: { text: string | null; html: string | null; rawUrl?: string | null }): Promise<string[]> {
  if (mail.rawUrl) {
    try {
      const roh = await api.datei(mail.rawUrl, ROH_LIMIT);
      const k = kalenderAusMime(roh);
      if (k.length) return k;
    } catch {
      console.error("[termin-weiterleitung] Rohmail nicht geladen");
    }
  }
  const out: string[] = [];
  const liste = (await api.anhaenge(emailId)).filter((a) => istKalenderAnhang(a) && a.size <= ANHANG_LIMIT).slice(0, 5);
  for (const a of liste) {
    if (!a.downloadUrl) continue;
    try {
      const buf = await api.datei(a.downloadUrl, ANHANG_LIMIT);
      out.push(...(/rfc822|\.eml$/i.test(`${a.contentType} ${a.filename ?? ""}`) ? kalenderAusMime(buf) : kalenderAusText(buf.toString("utf8"))));
    } catch {
      console.error("[termin-weiterleitung] Anhang nicht geladen");
    }
  }
  if (!out.length) out.push(...kalenderAusText(mail.text), ...kalenderAusText(mail.html));
  return [...new Set(out)];
}

// ─── Rückmeldung ───────────────────────────────────────────────────────────

/** Gehört der Absender zum Konto (Login, Berater-Adresse)? Nur dann geht eine Mail an ihn. */
async function absenderBekannt(customerId: string, from: string | null): Promise<boolean> {
  if (!from) return false;
  const [user, agent] = await Promise.all([
    prisma.user.findFirst({ where: { customerId, role: "BUYER", email: { equals: from, mode: "insensitive" } }, select: { id: true } }),
    prisma.agentConfig.findUnique({ where: { customerId }, select: { advisorEmail: true } }),
  ]);
  return !!user || agent?.advisorEmail?.trim().toLowerCase() === from;
}

async function sendePush(calendarKey: string, customerId: string, payload: { title: string; body: string; url: string; tag: string }): Promise<void> {
  try {
    const { sendToBuyersOfCustomer, sendToUser } = await import("@/lib/push");
    const userId = userIdOfKey(calendarKey);
    await (userId ? sendToUser(userId, payload) : sendToBuyersOfCustomer(customerId, payload));
  } catch {
    console.error("[termin-weiterleitung] Push fehlgeschlagen");
  }
}

async function melde(calendarKey: string, customerId: string, from: string | null, r: Rueckmeldung, o: { pushErlaubt: boolean; tag: string }): Promise<void> {
  if (await absenderBekannt(customerId, from)) {
    const { getAppUrl, sendCustomerMail } = await import("@/lib/email");
    let url: string | null = null;
    try {
      url = `${getAppUrl()}/buyer/kalender`;
    } catch {
      url = null;
    }
    const res = await sendCustomerMail({
      to: from!,
      subject: r.betreff,
      greeting: "Guten Tag,",
      paragraphs: r.absaetze,
      ...(url ? { button: { label: "Blockierte Zeiten ansehen", url } } : {}),
      replyTo: null,
    });
    if (!res.ok) throw new Error("rueckmeldung");
    return;
  }
  if (o.pushErlaubt) await sendePush(calendarKey, customerId, { title: r.betreff, body: r.absaetze[0] ?? "", url: "/buyer/kalender", tag: o.tag });
}

// ─── Ablauf ────────────────────────────────────────────────────────────────

async function abschliessen(id: string, data: { ergebnis: string; grund?: string | null; customerId?: string | null }) {
  await prisma.mailEingang.update({ where: { id }, data: { ...data, zuordnung: "termin", grund: data.grund?.slice(0, 80) ?? null } });
}

/**
 * Mail an eine Termin-Adresse verarbeiten (MailEingang ist schon reserviert). Wirft nur, wenn eine Wiederholung helfen
 * kann (API, Versand); Blockierungen sind dabei idempotent, Rückmeldung (weitergeleitetAt) und Push (pushAt) gehen je
 * Eingang höchstens einmal raus.
 */
export async function verarbeiteTerminMail(o: {
  eingangId: string;
  emailId: string;
  token: string;
  now: Date;
  api?: EingangApi;
  zeile: { weitergeleitetAt: Date | null; pushAt: Date | null };
  fromEvent?: string | null;
}): Promise<EingangErgebnis> {
  const { eingangId: id, now } = o;
  const adr = await prisma.kalenderWeiterleitung.findUnique({ where: { token: o.token }, select: { calendarKey: true, customerId: true } });
  if (!adr) {
    await abschliessen(id, { ergebnis: "ignoriert", grund: "termin_unbekannt" });
    return { ergebnis: "ignoriert", grund: "termin_unbekannt", eingangId: id };
  }
  const { calendarKey, customerId } = adr;
  const kunde = await prisma.customer.findUnique({ where: { id: customerId }, select: { dataDeletedAt: true } });
  if (!kunde || kunde.dataDeletedAt) {
    await abschliessen(id, { ergebnis: "ignoriert", grund: "kunde_geloescht" });
    return { ergebnis: "ignoriert", grund: "kunde_geloescht", eingangId: id };
  }
  const heute = await prisma.mailEingang.count({ where: { customerId, zuordnung: "termin", createdAt: { gt: new Date(now.getTime() - 86_400_000) } } });
  if (heute >= TERMIN_LIMIT_TAG) {
    await abschliessen(id, { ergebnis: "ignoriert", grund: "limit", customerId });
    return { ergebnis: "ignoriert", grund: "limit", eingangId: id };
  }
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    await abschliessen(id, { ergebnis: "fehler", grund: "kein_schluessel", customerId });
    return { ergebnis: "fehler", grund: "kein_schluessel", eingangId: id };
  }

  try {
    const api = o.api ?? (await import("@/lib/mail/eingang-api")).eingangApi(apiKey);
    const mail = await api.mail(o.emailId);
    const from = reineAdresse(mail.from) ?? reineAdresse(o.fromEvent) ?? null;
    if (istSchleife(from, mail.headers)) {
      await abschliessen(id, { ergebnis: "ignoriert", grund: "schleife", customerId });
      return { ergebnis: "ignoriert", grund: "schleife", eingangId: id };
    }
    const auto = autoAntwortGrund(mail.headers, mail.subject, from);
    if (auto) {
      await abschliessen(id, { ergebnis: "ignoriert", grund: `auto_${auto}`, customerId });
      return { ergebnis: "ignoriert", grund: "auto_antwort", eingangId: id };
    }

    const kalender = await sammleKalender(api, o.emailId, mail);
    const termine = termineAusKalendern(kalender, now);
    if (!termine.aktionen.length) {
      const grund: FehlerGrund = termine.eigene ? "eigener" : termine.vergangen ? "vergangen" : "kein_termin";
      // Ohne Kalenderdatei (Spam, Fremde): nur bekannten Absendern antworten, kein Push
      if (!o.zeile.weitergeleitetAt) {
        await melde(calendarKey, customerId, from, rueckmeldungFehler(grund), { pushErlaubt: grund !== "kein_termin", tag: `termin-weiterleitung:${id}` });
        await prisma.mailEingang.update({ where: { id }, data: { weitergeleitetAt: now } });
      }
      await abschliessen(id, { ergebnis: "hinweis", grund: `termin_${grund}`, customerId });
      return { ergebnis: "hinweis", grund: `termin_${grund}`, eingangId: id };
    }

    const { angewendet, neu } = await wendeTerminAn(calendarKey, customerId, termine.aktionen, now);
    const ueber = await ueberschneidungen(calendarKey, customerId, neu);
    if (!o.zeile.weitergeleitetAt) {
      await melde(calendarKey, customerId, from, rueckmeldungErfolg(angewendet, ueber), { pushErlaubt: true, tag: `termin-weiterleitung:${id}` });
      await prisma.mailEingang.update({ where: { id }, data: { weitergeleitetAt: now } });
    }
    if (!o.zeile.pushAt && ueber.length) {
      for (const u of ueber.slice(0, 3)) {
        const p = ueberschneidungPush(u);
        await sendePush(calendarKey, customerId, { ...p, url: u.leadId ? `/buyer/leads/${u.leadId}` : "/buyer/kalender", tag: `termin-ueberschneidung:${u.start.getTime()}` });
      }
      await prisma.mailEingang.update({ where: { id }, data: { pushAt: now } });
    }
    const grund = angewendet.map((a) => a.art).join(",").slice(0, 80);
    await abschliessen(id, { ergebnis: "termin", grund, customerId });
    return { ergebnis: "termin", grund, eingangId: id };
  } catch (err) {
    const grund = err instanceof Error ? err.message.replace(/[^\w:.-]/g, "_").slice(0, 80) : "fehler";
    await prisma.mailEingang.update({ where: { id }, data: { ergebnis: "fehler", grund, zuordnung: "termin", customerId } }).catch(() => null);
    console.error("[termin-weiterleitung] Fehler", grund);
    throw new Error(`termin_weiterleitung:${grund}`);
  }
}
