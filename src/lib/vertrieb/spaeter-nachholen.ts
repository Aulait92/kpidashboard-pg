// Später-Follow-ups nachholen (Ole, 18.11.2026: Norbert Tetenborg schrieb „später“, war aber nicht im
// Später-Follow-up). Einmalig auslösbar über /api/ops/diagnose?q=spaeter-nachholen (Vorschau) bzw.
// &ausfuehren=1 (plant ein, mit Audit-Eintrag).
//
// 1. Fehlende Antworten der letzten 60 Tage aus Instantly holen (lib/vertrieb/instantly-nachholen.ts, nur lesend
//    gegenüber Instantly; Vorschau: nichts speichern). Ohne Follow-up-Planung dort, die macht Schritt 3.
// 2. Je Kontakt die letzte echte Antwort prüfen: Regeln (lib/vertrieb/spaeter.ts), gespeicherte Einstufung,
//    sonst KI (lib/vertrieb/spaeter-ki.ts, nur bei Hinweis auf später). Klare Absagen und Abwesenheitsnotizen nie.
// 3. Einplanen: Zeitpunkt aus der Antwort, sonst Standard-Abstand (3 Monate). Frühestens in 4 Tagen (Werktag
//    vormittags), zu frühe Termine werden je Postfach auf die folgenden Werktage verteilt. Es wird nichts gesendet:
//    der Versand läuft wie immer über den Cron (werktags 8 bis 17 Uhr), Stopp jederzeit im Kontakt.
// Doppelt ausgeschlossen: Kontakte mit laufendem Follow-up oder einem Follow-up seit dieser Antwort werden übersprungen.
import { audit, type AuditActor } from "@/lib/audit";
import type { LlmCall } from "@/lib/kampagnen/llm";
import { prisma } from "@/lib/prisma";
import { STAGE_LABEL } from "@/lib/vertrieb/crm";
import { addDays, dayKey, fmtDate } from "@/lib/vertrieb/dates";
import { STOP_STAGES, loadFollowupSettings, nurAutomatischVerloren, planFollowup, spread } from "@/lib/vertrieb/followup";
import { stripQuoted } from "@/lib/vertrieb/instantly";
import { nachholenAntworten, type NachholenEintrag } from "@/lib/vertrieb/instantly-nachholen";
import { isAutoReplyText } from "@/lib/vertrieb/sentiment";
import { hasLaterHint, isClearDecline, isLaterInterest, laterTiming, nextWorkdayKey } from "@/lib/vertrieb/spaeter";
import { spaeterLlm, spaeterPerKi } from "@/lib/vertrieb/spaeter-ki";
import { emailGesperrt, kontaktGesperrt } from "@/lib/vertrieb/sperrliste";

export type SpaeterNachholenEintrag = {
  kontaktId: string | null;
  name: string;
  agentur: string;
  /** geplanter Termin für Mail 1 (ISO) und als Datum */
  geplantFuer: string;
  geplantDatum: string;
  zeitpunkt: string | null;
  erkannt: "Regel" | "KI" | "gespeichert";
  grund: string;
  zitat: string;
  antwortVom: string;
  postfach: string | null;
  /** Antwort stand nur in Instantly (wird beim Ausführen gespeichert) */
  nurInInstantly: boolean;
  /** war nur automatisch „Verloren“ (Instantly „Kein Interesse“ bzw. Absage per Mail), wird „Später“ */
  ausVerloren: boolean;
};

export type SpaeterNachholenErgebnis = {
  vorschau: boolean;
  tage: number;
  /** frühester Termin (Werktag, YYYY-MM-DD) */
  fruehestens: string;
  instantly: { gelesen: number; fehlend: number; nachgeholt: number } | { fehler: string } | null;
  /** geprüfte Kontakte (letzte echte Antwort im Zeitraum) */
  geprueft: number;
  kiGeprueft: number;
  ki: "an" | "aus" | "ohne Schlüssel";
  /** wegen des Limits nicht per KI geprüft */
  kiNichtGeprueft: number;
  spaeter: number;
  eingeplant: number;
  uebersprungen: Record<string, number>;
  liste: SpaeterNachholenEintrag[];
};

type Kandidat = {
  key: string;
  contactId: string | null;
  lead: string | null;
  emailId: string | null;
  text: string;
  subject: string | null;
  sentAt: Date;
  sentiment: string | null;
  eaccount: string | null;
  nurInInstantly: boolean;
  ausVerloren?: boolean;
};

type Plan = Kandidat & { name: string; agentur: string; dueAt: Date; timing: string | null; erkannt: SpaeterNachholenEintrag["erkannt"]; grund: string };

const DAY = 86_400_000;
const KI_PARALLEL = 4;

const zitat = (t: string) => {
  const s = t.replace(/\s+/g, " ").trim();
  return s.length > 120 ? `${s.slice(0, 119)}…` : s;
};

/**
 * Übersehene Später-Antworten finden (vorschau, Standard) bzw. einplanen (vorschau: false).
 * Sendet nie etwas; geplante Termine liegen mindestens 3 Tage in der Zukunft.
 */
export async function spaeterNachholen(
  opts: {
    vorschau?: boolean;
    tage?: number;
    now?: Date;
    llm?: LlmCall | null;
    ki?: boolean;
    kiMax?: number;
    actor?: AuditActor;
    /** nur diese Kontakte (z. B. erst einen prüfen); Antworten ohne Kontakt im CRM entfallen dann */
    nurKontakte?: string[];
  } = {},
): Promise<SpaeterNachholenErgebnis> {
  const vorschau = opts.vorschau !== false;
  const tage = opts.tage ?? 60;
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - tage * DAY);
  const llm = opts.ki === false ? null : opts.llm === undefined ? spaeterLlm() : opts.llm;
  const kiMax = opts.kiMax ?? 60;
  // Frühestens in 4 Tagen (Werktag, vormittags): auch über ein Wochenende mindestens 3 volle Tage Vorlauf
  const fruehestens = nextWorkdayKey(dayKey(addDays(now, 4)));
  const r: SpaeterNachholenErgebnis = {
    vorschau,
    tage,
    fruehestens,
    instantly: null,
    geprueft: 0,
    kiGeprueft: 0,
    ki: opts.ki === false ? "aus" : llm ? "an" : "ohne Schlüssel",
    kiNichtGeprueft: 0,
    spaeter: 0,
    eingeplant: 0,
    uebersprungen: {},
    liste: [],
  };
  const skip = (why: string) => {
    r.uebersprungen[why] = (r.uebersprungen[why] ?? 0) + 1;
  };

  // 1. Antworten, die nur in Instantly liegen
  let fehlend: NachholenEintrag[] = [];
  if (process.env.INSTANTLY_API_KEY) {
    try {
      const n = await nachholenAntworten({ tage, anwenden: !vorschau, now, planen: false, mitText: true });
      r.instantly = { gelesen: n.gelesen, fehlend: n.fehlend, nachgeholt: n.nachgeholt };
      if (vorschau) fehlend = n.liste;
    } catch (e) {
      r.instantly = { fehler: e instanceof Error ? e.message.slice(0, 200) : "Fehler" };
    }
  }

  // 2. Letzte echte Antwort je Kontakt im Zeitraum (gespeichert, in der Vorschau auch die nur in Instantly)
  const kandidaten = new Map<string, Kandidat>();
  const mails = await prisma.salesEmail.findMany({
    where: { direction: "IN", isAutoReply: false, sentAt: { gte: since }, ...(opts.nurKontakte ? { contactId: { in: opts.nurKontakte } } : {}) },
    orderBy: { sentAt: "desc" },
    select: { id: true, contactId: true, text: true, subject: true, sentAt: true, sentiment: true, eaccount: true },
  });
  for (const m of mails) {
    if (kandidaten.has(m.contactId)) continue;
    kandidaten.set(m.contactId, {
      key: m.contactId,
      contactId: m.contactId,
      lead: null,
      emailId: m.id,
      text: stripQuoted(m.text ?? ""),
      subject: m.subject,
      sentAt: m.sentAt,
      sentiment: m.sentiment,
      eaccount: m.eaccount,
      nurInInstantly: false,
    });
  }
  for (const e of fehlend) {
    if (opts.nurKontakte && !(e.contactId && opts.nurKontakte.includes(e.contactId))) continue;
    const key = e.contactId ?? `lead:${e.lead}`;
    const at = new Date(e.at);
    const prev = kandidaten.get(key);
    if (prev && prev.sentAt >= at) continue;
    kandidaten.set(key, {
      key,
      contactId: e.contactId ?? null,
      lead: e.lead,
      emailId: null,
      text: e.text ?? "",
      subject: e.betreff,
      sentAt: at,
      sentiment: e.spaeter ? "SPAETER" : null,
      eaccount: e.postfach,
      nurInInstantly: true,
    });
  }

  // Prüfen: Kontakt, Follow-up, Sperrliste, Text; Regeln zuerst, KI für den Rest
  const plaene: Plan[] = [];
  const fuerKi: (Kandidat & { name: string; agentur: string })[] = [];
  for (const k of kandidaten.values()) {
    r.geprueft++;
    let name = k.lead ?? "";
    let agentur = "neu aus Instantly";
    if (k.contactId) {
      const c = await prisma.salesContact.findUnique({
        where: { id: k.contactId },
        select: {
          name: true,
          firstName: true,
          lastName: true,
          stage: true,
          followups: { select: { activeFor: true, createdAt: true, replyEmailId: true } },
          campaigns: { where: { unsubscribed: true }, select: { id: true }, take: 1 },
        },
      });
      if (!c) {
        skip("Kontakt fehlt");
        continue;
      }
      // „Verloren“ nur automatisch (Instantly-KI markiert „aktuell nicht, aber später“ gern als „Kein Interesse“): Text entscheidet
      const ausVerloren = c.stage === "VERLOREN" && (await nurAutomatischVerloren(k.contactId));
      if (STOP_STAGES.includes(c.stage) && !ausVerloren) {
        skip(`Stufe ${STAGE_LABEL[c.stage]}`);
        continue;
      }
      k.ausVerloren = ausVerloren;
      if (c.followups.some((f) => f.activeFor)) {
        skip("Follow-up läuft schon");
        continue;
      }
      // Seit dieser Antwort schon eingeplant (auch gestoppt oder beendet): nicht erneut
      if (c.followups.some((f) => (k.emailId && f.replyEmailId === k.emailId) || f.createdAt >= k.sentAt)) {
        skip("Follow-up seit der Antwort schon bearbeitet");
        continue;
      }
      if (c.campaigns.length) {
        skip("abgemeldet");
        continue;
      }
      if (await kontaktGesperrt(k.contactId)) {
        skip("Sperrliste");
        continue;
      }
      name = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.name;
      agentur = c.name;
    } else if (k.lead && emailGesperrt(k.lead)) {
      skip("Sperrliste");
      continue;
    }
    if (!k.text.trim()) {
      skip("Antwort ohne Text");
      continue;
    }
    if (isAutoReplyText(k.subject, k.text)) {
      skip("automatische Antwort");
      continue;
    }
    if (isClearDecline(k.text)) {
      skip("klare Absage");
      continue;
    }
    if (k.sentiment === "SPAETER" || isLaterInterest(k.text, k.sentAt)) {
      const t = laterTiming(k.text, k.sentAt, k.contactId ?? k.key);
      plaene.push({ ...k, name, agentur, dueAt: t.date, timing: t.label, erkannt: k.sentiment === "SPAETER" ? "gespeichert" : "Regel", grund: "Regel: Später-Interesse im Text" });
      continue;
    }
    if (llm && hasLaterHint(k.text)) {
      fuerKi.push({ ...k, name, agentur });
      continue;
    }
    skip("kein Später-Interesse");
  }

  // KI (begrenzt, wenige parallel)
  const kiListe = fuerKi.slice(0, kiMax);
  r.kiNichtGeprueft = fuerKi.length - kiListe.length;
  for (let i = 0; i < kiListe.length; i += KI_PARALLEL) {
    const batch = kiListe.slice(i, i + KI_PARALLEL);
    const res = await Promise.all(batch.map((k) => spaeterPerKi(k.text, k.sentAt, { llm, seed: k.contactId ?? k.key })));
    batch.forEach((k, j) => {
      r.kiGeprueft++;
      const hit = res[j];
      if (hit) plaene.push({ ...k, dueAt: hit.dueAt, timing: hit.timing, erkannt: "KI", grund: hit.grund || "KI: später relevant" });
      else skip("kein Später-Interesse (KI)");
    });
  }
  r.spaeter = plaene.length;

  // 3. Termine: frühestens in 4 Tagen, zu frühe je Postfach verteilen
  const settings = await loadFollowupSettings();
  const items = plaene.map((p) => ({ plan: p, dueAt: p.dueAt, eaccount: p.eaccount ?? "?", contactId: p.contactId ?? p.key }));
  spread(items, now, settings.perDay, fruehestens);

  for (const it of items.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())) {
    const p = { ...it.plan, dueAt: it.dueAt };
    const realId = p.contactId;
    if (!vorschau && realId) {
      // Nochmals prüfen (gleichzeitiger Lauf, Antwort dazwischen): nie doppelt
      if (await prisma.salesFollowup.findUnique({ where: { activeFor: realId }, select: { id: true } })) {
        skip("Follow-up läuft schon");
        continue;
      }
      const ok = await einplanen(realId, p, now).catch(() => false);
      if (!ok) {
        skip("nicht einplanbar (kein Instantly-Verlauf)");
        continue;
      }
      r.eingeplant++;
    }
    r.liste.push({
      kontaktId: realId,
      name: p.name,
      agentur: p.agentur,
      geplantFuer: p.dueAt.toISOString(),
      geplantDatum: fmtDate(p.dueAt),
      zeitpunkt: p.timing,
      erkannt: p.erkannt,
      grund: p.grund,
      zitat: zitat(p.text),
      antwortVom: p.sentAt.toISOString(),
      postfach: p.eaccount,
      nurInInstantly: p.nurInInstantly,
      ausVerloren: !!p.ausVerloren,
    });
  }

  if (!vorschau) {
    await audit("vertrieb.spaeter_nachholen", {
      entity: "SalesFollowup",
      actor: opts.actor,
      details: {
        tage,
        eingeplant: r.eingeplant,
        fruehestens,
        instantly: r.instantly,
        kontakte: r.liste.map((x) => ({ id: x.kontaktId, termin: x.geplantDatum, erkannt: x.erkannt })).slice(0, 200),
      },
    });
  }
  return r;
}

/** Antwort als Später einstufen, Stufe „Später“, Follow-up geplant (sendet nichts). */
async function einplanen(contactId: string, p: Plan, now: Date): Promise<boolean> {
  const email =
    p.emailId ??
    (
      await prisma.salesEmail.findFirst({
        where: { contactId, direction: "IN", isAutoReply: false, sentAt: { gte: new Date(p.sentAt.getTime() - 60_000), lte: new Date(p.sentAt.getTime() + 60_000) } },
        select: { id: true },
      })
    )?.id ??
    null;
  if (!email) return false;
  await prisma.salesEmail.update({ where: { id: email }, data: { sentiment: "SPAETER" } });
  const c = await prisma.salesContact.findUnique({ where: { id: contactId }, select: { stage: true } });
  if (!c || (STOP_STAGES.includes(c.stage) && !(c.stage === "VERLOREN" && p.ausVerloren))) return false;
  if (c.stage !== "SPAETER") {
    await prisma.salesContact.update({ where: { id: contactId }, data: { stage: "SPAETER", lossReason: null } });
    await prisma.salesActivity.create({
      data: {
        contactId,
        type: "STATUS",
        outcome: `${STAGE_LABEL[c.stage]} → ${STAGE_LABEL.SPAETER}`,
        note: `Antwort: gerne später (nachgeholt, erkannt per ${p.erkannt}${c.stage === "VERLOREN" ? ", vorher nur automatisch „Verloren“" : ""})`,
      },
    });
  }
  const f = await planFollowup(contactId, { source: "ANTWORT", replyEmailId: email, dueAt: p.dueAt, timing: p.timing, status: "GEPLANT", now });
  // Offene Antwort- bzw. Anruf-Aufgabe erledigt sich mit dem Einplanen (Ole, 18.11.2026)
  if (f) {
    await prisma.salesTask.updateMany({
      where: { contactId, doneAt: null, title: { in: ["Auf Cold-Mail-Antwort reagieren", "Interessent aus Cold Mail anrufen"] } },
      data: { doneAt: now },
    });
  }
  return !!f;
}
