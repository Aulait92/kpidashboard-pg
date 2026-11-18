// Aktionen unter „Nächste Nachrichten“ am Kontakt (Paket P6, Ole 17.11.2026). Sie ändern die echte Planung, nicht nur
// die Anzeige:
//   Überspringen   Abfolge-Schritt: LeadSequence.uebersprungen (runSequences schaltet ihn beim Fälligwerden ohne Versand
//                  weiter; kein Vorab-Check). Erinnerung: Appointment.erinnerungenUebersprungen (runReminders & Co.
//                  lassen sie aus). Rückgängig nimmt den Eintrag wieder heraus.
//   Verschieben    nächster Schritt einer Abfolge: nextAt auf die neue Zeit, die folgenden Schritte rücken um dieselbe
//                  Spanne mit (neustartAt, wie die Bedenkzeit in P5), Vorab-Check neu. Nächster Anrufversuch: Wiedervorlage.
//   Jetzt senden   nächster Schritt einer Abfolge (WhatsApp, E-Mail): sofort über runSequences (nurId, sofort), also mit
//                  denselben Stopp-Gründen, Vorlagen und Rückfällen wie im Lauf, aber ohne Versandfenster.
//   Alle pausieren Lead.nachrichtenPausiertAt: Abfolgen und Termin-Erinnerungen an den Lead warten. Fortsetzen rückt die
//                  laufenden Abfolgen um die Dauer der Pause nach (als hätte die Zeit stillgestanden); eine Wiedervorlage
//                  des Assistenten („meldet sich am …“) behält ihren Zeitpunkt, ist er vorbei, kommt sie gleich.
// Schlüssel der Einträge: lib/nachrichtenplan.ts (PlanEintrag.key).

import { prisma } from "@/lib/prisma";
import { describe, runSequences, SEQUENCES, type SequenceKind, type SequenceLogEntry } from "@/lib/lead-sequences";
import { ERINNERUNG_ARTEN, type ErinnerungKey } from "@/lib/nachrichtenplan";

const DAY = 24 * 60 * 60 * 1000;
/** Verschieben: höchstens so weit in die Zukunft. */
export const VERSCHIEBEN_MAX_TAGE = 90;

export type Ziel =
  | { art: "abfolge"; abfolgeId: string; schritt: number }
  | { art: "erinnerung"; terminId: string; erinnerung: ErinnerungKey }
  | { art: "anruf"; versuch: number };

/** Schlüssel eines Eintrags lesen (null: unbekannt bzw. ohne Aktion). */
export function zielAus(key: string): Ziel | null {
  const [art, a, b] = key.split(":");
  if (art === "abfolge" && a && /^\d+$/.test(b ?? "")) return { art: "abfolge", abfolgeId: a, schritt: Number(b) };
  if (art === "erinnerung" && a && (ERINNERUNG_ARTEN as readonly string[]).includes(b ?? "")) return { art: "erinnerung", terminId: a, erinnerung: b as ErinnerungKey };
  if (art === "anruf" && /^\d+$/.test(a ?? "")) return { art: "anruf", versuch: Number(a) };
  return null;
}

export type AktionsErgebnis = { ok: true; text: string } | { ok: false; error: string };
const fehler = (error: string): AktionsErgebnis => ({ ok: false, error });

async function abfolgeDesLeads(leadId: string, id: string) {
  const a = await prisma.leadSequence.findFirst({ where: { id, leadId } });
  if (!a || a.stoppedAt) return null;
  return a;
}

async function terminDesLeads(leadId: string, id: string) {
  return prisma.appointment.findFirst({ where: { id, leadId, status: "booked" }, select: { id: true, erinnerungenUebersprungen: true } });
}

/** Eintrag überspringen (true) bzw. wieder einplanen (false). */
export async function ueberspringen(leadId: string, key: string, an: boolean): Promise<AktionsErgebnis> {
  const z = zielAus(key);
  if (z?.art === "abfolge") {
    const a = await abfolgeDesLeads(leadId, z.abfolgeId);
    const def = a ? SEQUENCES[a.kind as SequenceKind] : null;
    if (!a || !def || z.schritt < a.step || z.schritt >= def.steps.length) return fehler("Dieser Schritt ist schon vorbei.");
    const liste = new Set(a.uebersprungen);
    if (an) liste.add(z.schritt);
    else liste.delete(z.schritt);
    // Bedingt: nur, solange der Schritt noch offen ist (parallel zum Lauf alle 5 Minuten)
    const n = await prisma.leadSequence.updateMany({
      where: { id: a.id, stoppedAt: null, step: { lte: z.schritt } },
      data: { uebersprungen: [...liste].sort((x, y) => x - y), ...(z.schritt === a.step ? { vorabCheckStep: null } : {}) },
    });
    if (!n.count) return fehler("Dieser Schritt ist schon vorbei.");
    return { ok: true, text: an ? "Übersprungen" : "Wieder eingeplant" };
  }
  if (z?.art === "erinnerung") {
    const t = await terminDesLeads(leadId, z.terminId);
    if (!t) return fehler("Termin nicht gefunden.");
    const liste = new Set(t.erinnerungenUebersprungen);
    if (an) liste.add(z.erinnerung);
    else liste.delete(z.erinnerung);
    await prisma.appointment.update({ where: { id: t.id }, data: { erinnerungenUebersprungen: [...liste] } });
    return { ok: true, text: an ? "Erinnerung übersprungen" : "Erinnerung wieder eingeplant" };
  }
  return fehler("Das lässt sich hier nicht überspringen.");
}

/** Nächsten Schritt einer Abfolge bzw. den nächsten Anrufversuch auf `at` legen. */
export async function verschieben(leadId: string, key: string, at: Date, now = new Date()): Promise<AktionsErgebnis> {
  if (!(at.getTime() > now.getTime())) return fehler("Bitte eine Zeit in der Zukunft wählen.");
  if (at.getTime() > now.getTime() + VERSCHIEBEN_MAX_TAGE * DAY) return fehler(`Höchstens ${VERSCHIEBEN_MAX_TAGE} Tage im Voraus.`);
  const z = zielAus(key);
  if (z?.art === "abfolge") {
    const a = await abfolgeDesLeads(leadId, z.abfolgeId);
    if (!a || a.step !== z.schritt || !a.nextAt) return fehler("Nur der nächste Schritt lässt sich verschieben.");
    const alt = Math.max(a.nextAt.getTime(), now.getTime());
    const delta = at.getTime() - alt;
    const base = a.neustartAt ?? a.startedAt;
    const n = await prisma.leadSequence.updateMany({
      where: { id: a.id, step: a.step, stoppedAt: null },
      // Die folgenden Schritte rücken mit (Tage ab neustartAt); Vorab-Check zum neuen Zeitpunkt neu
      data: { nextAt: at, neustartAt: new Date(base.getTime() + delta), vorabCheckStep: null },
    });
    if (!n.count) return fehler("Dieser Schritt ist gerade rausgegangen.");
    return { ok: true, text: "Verschoben" };
  }
  if (z?.art === "anruf") {
    // Der nächste Versuch des Anrufplans ist die Wiedervorlage auf „Heute“
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { followUpAt: true } });
    if (!lead?.followUpAt) return fehler("Kein Anrufversuch geplant.");
    await prisma.lead.update({ where: { id: leadId }, data: { followUpAt: at, callbackSnoozedUntil: at } });
    return { ok: true, text: "Anruf verschoben" };
  }
  return fehler("Das lässt sich nicht verschieben.");
}

/** Nächsten Schritt einer Abfolge sofort senden. Liefert, was passiert ist („WhatsApp gesendet“ bzw. der Rückfall). */
export async function jetztSenden(leadId: string, key: string, now = new Date()): Promise<AktionsErgebnis> {
  const z = zielAus(key);
  if (z?.art !== "abfolge") return fehler("Das lässt sich nicht sofort senden.");
  const a = await abfolgeDesLeads(leadId, z.abfolgeId);
  const def = a ? SEQUENCES[a.kind as SequenceKind] : null;
  const step = def?.steps[z.schritt];
  if (!a || !def || !step || a.step !== z.schritt) return fehler("Nur der nächste Schritt lässt sich sofort senden.");
  if (step.action === "call") return fehler("Anruf-Aufgaben stehen auf „Heute“.");
  if (a.uebersprungen.includes(z.schritt)) return fehler("Dieser Schritt ist übersprungen.");
  const n = await prisma.leadSequence.updateMany({ where: { id: a.id, step: a.step, stoppedAt: null }, data: { nextAt: now } });
  if (!n.count) return fehler("Dieser Schritt ist gerade rausgegangen.");
  await runSequences(now, { nurId: a.id, sofort: true });
  const nach = await prisma.leadSequence.findUnique({ where: { id: a.id }, select: { log: true, stoppedAt: true, stopReason: true, step: true } });
  const log = Array.isArray(nach?.log) ? (nach.log as unknown as SequenceLogEntry[]) : [];
  const letzter = log.at(-1);
  if (letzter && letzter.step === z.schritt && letzter.action !== "stop") {
    const text = describe(letzter, def.steps.length).replace(/ \(Schritt \d+ von \d+\)$/, "");
    return letzter.result === "failed" ? fehler(text) : { ok: true, text };
  }
  if (nach?.stoppedAt && nach.stopReason !== "Abgeschlossen") return fehler(`Nicht gesendet: ${nach.stopReason ?? "Nachfassen beendet"}`);
  return fehler("Nicht gesendet, bitte später noch einmal versuchen.");
}

/** „Alle pausieren“: Abfolgen und Termin-Erinnerungen an den Lead warten. */
export async function pausieren(leadId: string, now = new Date()): Promise<AktionsErgebnis> {
  await prisma.lead.updateMany({ where: { id: leadId, nachrichtenPausiertAt: null }, data: { nachrichtenPausiertAt: now } });
  return { ok: true, text: "Alle automatischen Nachrichten pausiert" };
}

/** „Fortsetzen“: laufende Abfolgen rücken um die Dauer der Pause nach (Wiedervorlage des Assistenten: Zeitpunkt bleibt). */
export async function fortsetzen(leadId: string, now = new Date()): Promise<AktionsErgebnis> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { nachrichtenPausiertAt: true } });
  const seit = lead?.nachrichtenPausiertAt;
  if (!seit) return { ok: true, text: "Läuft" };
  // Bedingt: nur einmal nachrücken, auch bei Doppelklick
  const n = await prisma.lead.updateMany({ where: { id: leadId, nachrichtenPausiertAt: seit }, data: { nachrichtenPausiertAt: null } });
  if (!n.count) return { ok: true, text: "Läuft" };
  const delta = Math.max(0, now.getTime() - seit.getTime());
  const laufend = await prisma.leadSequence.findMany({ where: { leadId, stoppedAt: null, nextAt: { not: null } } });
  for (const a of laufend) {
    const next = a.nextAt!;
    const recall = a.kind === "recall";
    const neu = recall ? new Date(Math.max(next.getTime(), now.getTime())) : new Date(next.getTime() + delta);
    await prisma.leadSequence.update({
      where: { id: a.id },
      data: { nextAt: neu, neustartAt: new Date((a.neustartAt ?? a.startedAt).getTime() + (recall ? 0 : delta)), vorabCheckStep: null },
    });
  }
  return { ok: true, text: "Automatische Nachrichten laufen wieder" };
}
