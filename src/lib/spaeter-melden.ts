// „Später melden“ am Kontakt (Ole, 18.11.2026): EIN Blatt statt „Alle pausieren“ (Paket P6) und „Bedenkzeit eintragen“
// (Paket P5). Der Vermittler wählt einen Tag (Standard 2 Wochen) bzw. „ohne Datum“, die App entscheidet den Weg:
//   Angebot liegt beim Kontakt   Bedenkzeit wie bisher (lib/lead-sequences.ts startBedenkzeit): laufende Abfolgen enden,
//                                am Tag startet das Nachfassen zum Angebot neu (nie die Terminvorschlags-Vorlage).
//   sonst                        Pause bis zu dem Tag (Lead.nachrichtenPausiertBis): Abfolgen und Erinnerungen warten, der
//                                WhatsApp-Cron setzt am Tag fort (lib/nachrichtenplan-aktionen.ts pausenBeenden).
//   ohne Datum                   Pause wie bisher „Alle pausieren“, bis „Fortsetzen“.
// Optional mit einem Tipp: E-Mail „Wie besprochen“ mit {melde_wann} („am Dienstag, 1. Dezember“), damit der Kontakt weiß,
// wann er wieder etwas hört (Vorlage wie_besprochen, Versand über sendeVorlagenMail mit allen Sperren, einmal je Tag).

import { prisma } from "@/lib/prisma";
import { berlinYmd } from "@/lib/absence";
import { bedenkzeitAusDatum, bedenkzeitDatum, istBedenkzeitWahl, tagKurz, tagLang } from "@/lib/bedenkzeit";
import { imAngebotsstand, startBedenkzeit } from "@/lib/lead-sequences";
import { fortsetzen, pausieren } from "@/lib/nachrichtenplan-aktionen";

export type SpaeterWann = { wahl?: string; datum?: string; ohneDatum?: boolean };
export type SpaeterWeg = "bedenkzeit" | "pause" | "ohne_datum";
export type SpaeterErgebnis =
  | { ok: true; weg: SpaeterWeg; bis: string | null; text: string; mail: "gesendet" | "nicht_gesendet" | null }
  | { ok: false; error: string };

/** Anlass der E-Mail „Wie besprochen“ (einmal je Kontakt und Tag). */
export const spaeterMailAnlass = (bis: Date) => `spaeter:${berlinYmd(bis)}`;

/** Tag aus der Wahl (1 Woche, 2 Wochen, Ende des Monats) bzw. einem Datum (ab morgen, höchstens 90 Tage); sonst null. */
export function spaeterTag(wann: SpaeterWann, now: Date): Date | null {
  return istBedenkzeitWahl(wann.wahl) ? bedenkzeitDatum(wann.wahl, now) : bedenkzeitAusDatum(wann.datum, now);
}

export async function spaeterMelden(leadId: string, wann: SpaeterWann, opts: { userId?: string | null; mail?: boolean; now?: Date } = {}): Promise<SpaeterErgebnis> {
  const now = opts.now ?? new Date();
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { customerId: true, erasedAt: true } });
  if (!lead || lead.erasedAt) return { ok: false, error: "Kontakt nicht gefunden." };
  const { logLeadHistory } = await import("@/lib/lead-history");
  const verlauf = (text: string) => logLeadHistory(leadId, "wiedervorlage", text, { customerId: lead.customerId, userId: opts.userId ?? null }).catch(() => null);

  if (wann.ohneDatum) {
    const r = await pausieren(leadId, now, null);
    await verlauf("Automatische Nachrichten pausiert (ohne Datum)");
    return { ok: true, weg: "ohne_datum", bis: null, text: r.ok ? r.text : "Pausiert", mail: null };
  }

  const bis = spaeterTag(wann, now);
  if (!bis) return { ok: false, error: "Bitte ein Datum ab morgen wählen (höchstens 90 Tage)." };
  let weg: SpaeterWeg;
  if (await imAngebotsstand(leadId, now)) {
    // Eine Pause ohne Datum endet hier: am Tag startet das Nachfassen zum Angebot neu (Bedenkzeit, P5)
    await fortsetzen(leadId, now);
    const seq = await startBedenkzeit(leadId, bis, { quelle: "vermittler", userId: opts.userId ?? null, now });
    if (!seq) return { ok: false, error: "Kontakt nicht gefunden." };
    weg = "bedenkzeit";
  } else {
    await pausieren(leadId, now, bis);
    await verlauf(`Später melden: pausiert bis ${tagKurz(bis)}, danach laufen die automatischen Nachrichten weiter`);
    weg = "pause";
  }

  let mail: "gesendet" | "nicht_gesendet" | null = null;
  if (opts.mail) {
    const { sendeVorlagenMail } = await import("@/lib/mail/vorlagen-mail");
    const tag = tagLang(bis);
    const r = await sendeVorlagenMail(leadId, "wie_besprochen", {
      automatisch: false,
      anlass: spaeterMailAnlass(bis),
      userId: opts.userId ?? null,
      now,
      werte: { melde_wann: `am ${tag}`, melde_datum: tag },
    }).catch(() => ({ sent: false as const, reason: "fehler" }));
    mail = r.sent ? "gesendet" : "nicht_gesendet";
  }
  const text = `Pausiert bis ${tagKurz(bis)}${mail === "gesendet" ? ", E-Mail ist raus" : mail === "nicht_gesendet" ? ", E-Mail ging nicht raus" : ""}`;
  return { ok: true, weg, bis: bis.toISOString(), text, mail };
}

/** Haken „Per E-Mail Bescheid geben“ im Blatt: nur mit Versand über die App (Adresse, Stufe nicht aus, keine Sperre). */
export async function spaeterMailStand(leadId: string): Promise<{ vorausgewaehlt: boolean } | null> {
  const { einTippMailStand } = await import("@/lib/mail/ein-tipp");
  const s = await einTippMailStand(leadId, "wie_besprochen", { anlass: "spaeter" }).catch(() => null);
  return s?.app ? { vorausgewaehlt: s.vorausgewaehlt } : null;
}
