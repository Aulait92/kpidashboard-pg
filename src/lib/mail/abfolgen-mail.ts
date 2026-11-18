// Automatische E-Mails in den Abfolgen (Pakete M4/M6, Ole 18.11.2026, docs/plan-mail-vorlagen.md). Jeder Mail-Schritt
// geht über die zentrale Funktion sendeVorlagenMail (lib/mail/vorlagen-mail.ts): Stufe je Vorlage, Sperren (Abmeldung,
// STOPP, Abschluss, Absage, Antwort, gelöscht, ruhend, „Meine Gesellschaft erlaubt das nicht“), Idempotenz je Abfolge
// und Schritt, höchstens eine automatische Mail je Lead und Berliner Tag.
//
//   nicht_erreicht       einmal nach dem 2. gezählten erfolglosen Anrufversuch (planeNichtErreichtMail, Auslöser in
//                        lib/call-attempts.ts), 2 Std. nach einer etwaigen WhatsApp, mit den nächsten zwei Zeiten aus dem
//                        Anrufplan ({rueckruf_1}, {rueckruf_2})
//   nicht_erschienen     No-Show-Abfolge am selben Tag, 2 Std. nach der WhatsApp, mit persönlichem Buchungslink
//   wie_besprochen       Neustart nach der Bedenkzeit (nur Versand über die App), „wie besprochen melde ich mich heute …“
//   nachfassen_angebot   Angebot Tag 5 mit [Angebot ansehen] und [Rückruf wünschen]
//   unterlagen_fehlen    Erinnerung 3 Tage nach der Mail des Vermittlers ohne Antwort oder Upload (starteUnterlagenErinnerung);
//                        Stufe „ein Tipp“ genügt, weil der Vermittler sie mit seiner Mail angestoßen hat
// Die Schritte selbst plant lib/lead-sequences.ts (Versandfenster Mo bis Sa 9 bis 19 Uhr, Stopp-Gründe vor jedem Schritt).

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { a, asAnsprache } from "@/lib/ansprache";
import { rueckrufZeitenAusPlan } from "@/lib/call-plan";
import { leseMailAblauf } from "@/lib/mail/ablauf";
import { MAIL_ARTEN } from "@/lib/mail/kontakt-mail";
import { tagText, type Werte } from "@/lib/mail/platzhalter";
import type { MailKnopf } from "@/lib/mail/rahmen";
import { ladeSperrDaten, sperrGrund, type SperrGrund } from "@/lib/mail/sperren";
import { berlinTag, sendeVorlagenMail } from "@/lib/mail/vorlagen-mail";
import type { VorlageKey } from "@/lib/mail/vorlagen";
import type { SequenceCtx, SequenceLogEntry } from "@/lib/lead-sequences";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Abstand zur WhatsApp desselben Anlasses (Regel 6). */
export const MAIL_NACH_WA_MS = 2 * HOUR;
/** Erinnerung „Unterlagen fehlen“ nach so vielen Tagen ohne Antwort oder Upload. */
export const UNTERLAGEN_ERINNERUNG_TAGE = 3;

export type AbfolgenSeq = { id: string; leadId: string; customerId: string; step: number; kind?: string; startedAt: Date; neustartAt?: Date | null; daten?: unknown };
export type AbfolgenMailStep = { vorlage: VorlageKey; knoepfe?: ("angebot" | "rueckruf")[]; zusatz?: (c: SequenceCtx) => Partial<Werte> };

/** Kurz für den Verlauf der Abfolge (ohne Inhalte). */
const GRUND_KURZ: Record<SperrGrund | "schon_gesendet" | "tageslimit", string> = {
  geloescht: "Kontakt gelöscht",
  ruhend: "Konto ruht",
  mail_aus: "E-Mail-Funktionen aus",
  keine_adresse: "keine E-Mail-Adresse",
  abgemeldet: "von E-Mails abgemeldet",
  stufe: "in den Einstellungen nicht automatisch",
  status: "Kontakt abgeschlossen oder abgesagt",
  antwort: "Kontakt hat geantwortet",
  schon_gesendet: "schon gesendet",
  tageslimit: "heute schon eine E-Mail",
};

/** Adresse am Kontakt, sonst die aus dem Chat. */
async function adresseVon(customerId: string, lead: { id: string; email: string | null; phone: string | null }): Promise<string | null> {
  if (lead.email?.trim()) return lead.email.trim();
  const conv = await prisma.conversation.findFirst({
    where: { customerId, OR: [{ leadId: lead.id }, ...(lead.phone ? [{ contactPhone: lead.phone }] : [])], contactEmail: { not: null } },
    orderBy: { lastMessageAt: "desc" },
    select: { contactEmail: true },
  });
  return conv?.contactEmail?.trim() || null;
}

const datenVon = (raw: unknown): Record<string, unknown> => (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {});

/** Mail-Schritt einer Abfolge senden (wirft nicht). Ergebnis als Eintrag für den Verlauf der Abfolge. */
export async function sendeAbfolgenMail(seq: AbfolgenSeq, step: AbfolgenMailStep, now = new Date()): Promise<SequenceLogEntry> {
  const base = { at: now.toISOString(), step: seq.step, action: "email" as const };
  const lead = await prisma.lead.findUnique({
    where: { id: seq.leadId },
    select: {
      id: true,
      email: true,
      phone: true,
      erasedAt: true,
      followUpAt: true,
      followUpNote: true,
      callAttempts: true,
      callPlanStartedAt: true,
      lastCallAttemptAt: true,
      customer: { select: { leadAddress: true } },
    },
  });
  if (!lead || lead.erasedAt) return { ...base, result: "skipped", detail: "Kontakt gelöscht" };
  const to = await adresseVon(seq.customerId, lead);
  if (!to) return { ...base, result: "skipped", detail: "keine E-Mail-Adresse" };
  const an = asAnsprache(lead.customer.leadAddress);
  const werte: Partial<Werte> = {};
  const knoepfe: MailKnopf[] = [];
  let betreffVorsatz: string | null = null;
  let freigegeben = false;

  switch (step.vorlage) {
    case "nicht_erreicht": {
      // Die nächsten zwei Versuche aus dem Anrufplan (lib/call-plan.ts); ohne Plan die Standardzeiten
      const z = rueckrufZeitenAusPlan(lead, now);
      if (z) [werte.rueckruf_1, werte.rueckruf_2] = z;
      break;
    }
    case "nachfassen_angebot":
    case "wie_besprochen": {
      const m = await import("@/lib/angebot-senden-server");
      const g = await m.angebotMailAngaben(lead.id, step.knoepfe ?? [], now);
      if (g.angebot) knoepfe.push({ label: "Angebot ansehen", url: g.angebot });
      if (g.rueckruf) {
        knoepfe.push({ label: "Rückruf wünschen", url: g.rueckruf });
        werte.rueckruf_link = g.rueckruf;
      }
      if (step.vorlage === "wie_besprochen") {
        // Neustart nach der Bedenkzeit: „wie besprochen melde ich mich heute bei Ihnen zu Ihrem Angebot zu Hausrat“
        werte.melde_wann = "heute";
        werte.melde_datum = tagText(berlinTag(now), now);
        werte.ihr_produkt = `${a(an, "deinem", "Ihrem")} Angebot${g.thema ? ` zu ${g.thema}` : ""}`;
      } else if (g.thema) {
        werte.produkt = g.thema;
      }
      break;
    }
    case "unterlagen_fehlen": {
      const fehlende = datenVon(seq.daten).fehlende;
      if (typeof fehlende !== "string" || !fehlende.trim()) return { ...base, result: "skipped", detail: "keine fehlenden Angaben gespeichert" };
      werte.fehlende_unterlagen = fehlende;
      betreffVorsatz = "Erinnerung: ";
      freigegeben = true;
      break;
    }
    default:
      break;
  }

  const r = await sendeVorlagenMail(lead.id, step.vorlage, {
    anlass: `abfolge:${seq.id}:${seq.step}`,
    automatisch: true,
    freigegeben,
    // Antwort seit dem Anlass (Neustart nach der Bedenkzeit bzw. Start der Abfolge) stoppt die Mail
    antwortSeit: seq.neustartAt ?? seq.startedAt,
    werte,
    knoepfe,
    betreffVorsatz,
    to,
    now,
  });
  if (r.sent) return { ...base, result: "sent", detail: MAIL_ARTEN[step.vorlage] };
  if (r.reason in GRUND_KURZ) return { ...base, result: "skipped", detail: GRUND_KURZ[r.reason as keyof typeof GRUND_KURZ] };
  if (r.reason === "not_configured") return { ...base, result: "skipped", detail: "Versand nicht eingerichtet" };
  return { ...base, result: "failed", detail: String(r.reason).slice(0, 160) };
}

/** Darf diese Vorlage für den Lead automatisch raus (Stufe, Sperren, Adresse)? null = ja, sonst der Grund. */
export async function automatischMoeglich(leadId: string, key: VorlageKey, o: { freigegeben?: boolean } = {}): Promise<SperrGrund | null> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, customerId: true, email: true, phone: true, customer: { select: { mailAblauf: true } } } });
  if (!lead) return "geloescht";
  const to = await adresseVon(lead.customerId, lead);
  const d = await ladeSperrDaten(leadId, { to });
  return sperrGrund(d, { vorlage: key, automatisch: true, stufe: leseMailAblauf(lead.customer.mailAblauf).stufen[key], freigegeben: o.freigegeben });
}

export type GeplanteMail = { at: Date; sofort: boolean };

/**
 * Auslöser „Nicht erreicht“ (Paket M4): einmal je Lead nach dem 2. gezählten erfolglosen Anrufversuch. Geht 2 Std. nach
 * einer WhatsApp der letzten 2 Std. (bzw. nach der noch ausstehenden WhatsApp der Nicht-erreicht-Abfolge), sonst gleich.
 * Plant nichts, wenn die Mail nicht automatisch raus darf (Stufe, Sperren, keine Adresse). Liefert den Zeitpunkt.
 */
export async function planeNichtErreichtMail(leadId: string, now = new Date()): Promise<GeplanteMail | null> {
  if (await prisma.leadSequence.count({ where: { leadId, kind: "nicht_erreicht_mail" } })) return null;
  if (await automatischMoeglich(leadId, "nicht_erreicht")) return null;
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { customerId: true, phone: true } });
  if (!lead) return null;
  const [wa, offen] = await Promise.all([
    prisma.message.findFirst({
      where: {
        direction: "outbound",
        createdAt: { gt: new Date(now.getTime() - MAIL_NACH_WA_MS) },
        conversation: { customerId: lead.customerId, OR: [{ leadId }, ...(lead.phone ? [{ contactPhone: lead.phone }] : [])] },
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    // WhatsApp der Nicht-erreicht-Abfolge steht noch aus (z. B. außerhalb des Versandfensters)
    prisma.leadSequence.findFirst({ where: { leadId, kind: "not_reached", stoppedAt: null, step: 0 }, select: { nextAt: true } }),
  ]);
  const waAt = offen?.nextAt ? new Date(Math.max(offen.nextAt.getTime(), now.getTime())) : (wa?.createdAt ?? null);
  // Versand nur Mo bis Sa 9 bis 19 Uhr (wie alle Mail-Schritte): der Zeitpunkt im Fenster nach dem Anruf stimmt dann
  const { naechsterVersand } = await import("@/lib/angebot-senden");
  const at = naechsterVersand(waAt ? new Date(waAt.getTime() + MAIL_NACH_WA_MS) : now);
  const fmt = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", minute: "2-digit" }).format(at);
  await prisma.leadSequence.create({
    data: {
      leadId,
      customerId: lead.customerId,
      kind: "nicht_erreicht_mail",
      step: 0,
      // Antwort seit der WhatsApp bzw. dem Anruf stoppt die Mail
      startedAt: wa && !offen ? wa.createdAt : now,
      nextAt: at,
      log: [{ at: now.toISOString(), step: -1, action: "plan", result: "planned", detail: `E-Mail „Nicht erreicht“ geplant: ${at.getTime() > now.getTime() + 60_000 ? `${fmt} Uhr` : "gleich"}` }] as unknown as Prisma.InputJsonValue,
    },
  });
  return { at, sofort: at.getTime() <= now.getTime() + 60_000 };
}

/** Stand der Mail „Nicht erreicht“ für das Fenster nach dem Anruf. */
export async function nichtErreichtMailStand(leadId: string, now = new Date()): Promise<{ geplant: GeplanteMail | null; gesendetAt: Date | null; automatisch: boolean }> {
  const [seq, gesendet, grund] = await Promise.all([
    prisma.leadSequence.findFirst({ where: { leadId, kind: "nicht_erreicht_mail" }, orderBy: { startedAt: "desc" }, select: { nextAt: true, stoppedAt: true } }),
    prisma.contactMail.findFirst({ where: { leadId, kind: "nicht_erreicht", status: { not: "nicht_versendet" } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    automatischMoeglich(leadId, "nicht_erreicht"),
  ]);
  const { naechsterVersand } = await import("@/lib/angebot-senden");
  const versand = seq?.nextAt ? naechsterVersand(new Date(Math.max(seq.nextAt.getTime(), now.getTime()))) : null;
  const geplant = seq && !seq.stoppedAt && versand ? { at: versand, sofort: versand.getTime() <= now.getTime() + 60_000 } : null;
  return { geplant, gesendetAt: gesendet?.createdAt ?? null, automatisch: !grund };
}

/**
 * Erinnerung „Unterlagen fehlen“ (Paket M6): nach der Mail des Vermittlers (App oder eigenes Mailprogramm) eine kleine
 * Abfolge, die nach 3 Tagen ohne Antwort oder Upload automatisch erinnert und danach eine Aufgabe anlegt. Eine schon
 * laufende Erinnerung wird durch die neue ersetzt. null, wenn die Erinnerung nicht automatisch raus darf (Stufe „aus“,
 * Sperren, keine Adresse): dann legt der Aufrufer wie bisher eine Aufgabe an.
 */
export async function starteUnterlagenErinnerung(leadId: string, fehlende: string, o: { userId?: string | null; now?: Date } = {}): Promise<Date | null> {
  const now = o.now ?? new Date();
  const liste = fehlende.trim().slice(0, 2000);
  if (!liste) return null;
  if (await automatischMoeglich(leadId, "unterlagen_fehlen", { freigegeben: true })) return null;
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { customerId: true } });
  if (!lead) return null;
  const { stopSequences } = await import("@/lib/lead-sequences");
  const alt = await prisma.leadSequence.findFirst({ where: { leadId, kind: "unterlagen", stoppedAt: null }, select: { id: true } });
  if (alt) await stopSequences(leadId, "Neue Mail „Unterlagen fehlen“", { now, nurId: alt.id });
  const at = new Date(now.getTime() + UNTERLAGEN_ERINNERUNG_TAGE * DAY);
  const tag = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "numeric" }).format(at);
  await prisma.leadSequence.create({
    data: {
      leadId,
      customerId: lead.customerId,
      kind: "unterlagen",
      step: 0,
      startedAt: now,
      nextAt: at,
      daten: { fehlende: liste },
      log: [{ at: now.toISOString(), step: -1, action: "plan", result: "planned", detail: `Erinnerung per E-Mail am ${tag}, falls nichts kommt` }] as unknown as Prisma.InputJsonValue,
    },
  });
  const { logLeadHistory } = await import("@/lib/lead-history");
  await logLeadHistory(leadId, "wiedervorlage", `Unterlagen fehlen: Erinnerung per E-Mail am ${tag}, falls bis dahin nichts kommt`, { customerId: lead.customerId, userId: o.userId ?? null }).catch(() => null);
  return at;
}
