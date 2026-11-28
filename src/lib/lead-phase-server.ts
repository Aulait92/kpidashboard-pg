// Phase eines Kontakts laden und das Nachfassen danach ausrichten (Regeln: lib/lead-phase.ts, Ole 27.11.2026).
//   passtNochZurPhase  zentrale Prüfung vor jedem automatischen Schritt (runSequences über stopReasonFor), beim Planen
//                      (startSequence, restartSilentSequence) und vor jeder Anruf-Aufgabe des Anrufplans
//   phasenWechsel      nach jedem Statuswechsel (syncFollowUpWithStatus): Abfolgen und Anrufplan der alten Phase
//                      stoppen, die Strecke der neuen Phase starten („Angebot gesendet“: Nachfassen zum Angebot)
//   bereinigeNachfassen  Bereinigung bestehender Kontakte (Ops-Aktion „nachfassen-bereinigen“), Trockenlauf und echt,
//                      idempotent; dieselbe Zählung liefert die Diagnose „nachfassen-phase“
// Verlauf ohne Personendaten (nur Phase und Anzahl).

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { isReplaceableCallTask } from "@/lib/call-plan";
import { ANGEBOT_KINDS, ANRUFPLAN, PHASE_LABEL, leadPhase, passtZurPhase, phasenGrund, type LeadPhase } from "@/lib/lead-phase";
import { KALENDER_VOLL_AUFGABE, SEQUENCES, startSequence, stopSequences, type SequenceKind } from "@/lib/lead-sequences";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Anruf-Aufgaben, die nur in der offenen Phase (kein Termin, kein Angebot) Sinn ergeben: der Anrufplan und die
 * Anruf-Schritte bzw. Ersatz-Aufgaben von „Nicht erreicht“ und „Chat ruht“. Eigene Wiedervorlagen bleiben immer.
 */
const OFFENE_AUFGABEN = new Set<string>([
  ...[SEQUENCES.not_reached, SEQUENCES.silent].flatMap((d) => d.steps.map((s) => (s.action === "call" ? s.note : s.action === "whatsapp" ? s.fallbackNote : ""))),
  KALENDER_VOLL_AUFGABE,
]);
OFFENE_AUFGABEN.delete("");
export const istOffenePhasenAufgabe = (note: string | null | undefined) => isReplaceableCallTask(note) || (!!note && OFFENE_AUFGABEN.has(note));

type PhasenLead = { id: string; status: string | null; stornoState: string | null; erasedAt: Date | null };

/** Phase für mehrere Leads auf einmal (Bereinigung, Diagnose, Zählung). */
export async function phasenFuer(leads: PhasenLead[], now: Date): Promise<Map<string, LeadPhase>> {
  const ids = leads.map((l) => l.id);
  if (!ids.length) return new Map();
  const [kommend, war, angebotSeq, angebotTermin] = await Promise.all([
    prisma.appointment.findMany({ where: { leadId: { in: ids }, status: "booked", startsAt: { gt: now } }, select: { leadId: true }, distinct: ["leadId"] }),
    prisma.appointment.findMany({
      where: { leadId: { in: ids }, startsAt: { lte: now }, status: { in: ["booked", "completed"] }, OR: [{ attendance: null }, { attendance: { not: "nicht_erschienen" } }] },
      select: { leadId: true },
      distinct: ["leadId"],
    }),
    prisma.leadSequence.findMany({ where: { leadId: { in: ids }, stoppedAt: null, kind: { in: ANGEBOT_KINDS } }, select: { leadId: true }, distinct: ["leadId"] }),
    prisma.appointment.findMany({ where: { leadId: { in: ids }, angebotGesendetAt: { gt: new Date(now.getTime() - 60 * DAY) } }, select: { leadId: true }, distinct: ["leadId"] }),
  ]);
  const set = (rows: { leadId: string | null }[]) => new Set(rows.map((r) => r.leadId));
  const [k, w, as, at] = [set(kommend), set(war), set(angebotSeq), set(angebotTermin)];
  return new Map(
    leads.map((l) => [
      l.id,
      leadPhase({ status: l.status, storno: !!l.stornoState, kommenderTermin: k.has(l.id), terminWar: w.has(l.id), angebot: as.has(l.id) || at.has(l.id) }),
    ]),
  );
}

/** Phase eines Leads (null, wenn er fehlt). */
export async function ladePhase(leadId: string, now = new Date()): Promise<LeadPhase | null> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, status: true, stornoState: true, erasedAt: true } });
  if (!lead) return null;
  return (await phasenFuer([lead], now)).get(lead.id) ?? null;
}

/**
 * Passt die Abfolge (Art) bzw. der Anrufplan noch zum Stand des Kontakts? null = ja, sonst der Grund („Passt nicht mehr
 * zum Stand: Angebot gesendet“). Die übrigen Stopp-Gründe (Antwort des Leads, Stopp, Schalter …) prüft stopReasonFor.
 */
export async function passtNochZurPhase(leadId: string, art: SequenceKind | typeof ANRUFPLAN | string, now = new Date()): Promise<string | null> {
  const phase = await ladePhase(leadId, now);
  if (!phase) return "Lead gelöscht";
  return passtZurPhase(art, phase) ? null : phasenGrund(phase);
}

export type PhasenWechselErgebnis = { phase: LeadPhase; gestoppt: number; anrufplan: boolean; gestartet: SequenceKind | null };

/** Abfolgen und Anrufplan, die nicht zur Phase passen, beenden (ohne Verlauf, ohne Neustart). */
async function raeumeAuf(leadId: string, phase: LeadPhase, now: Date): Promise<{ gestoppt: string[]; anrufplan: boolean }> {
  const laufend = await prisma.leadSequence.findMany({ where: { leadId, stoppedAt: null }, select: { id: true, kind: true } });
  const gestoppt: string[] = [];
  for (const s of laufend.filter((x) => !passtZurPhase(x.kind, phase))) if (await stopSequences(leadId, phasenGrund(phase), { now, nurId: s.id })) gestoppt.push(s.kind);
  let anrufplan = false;
  if (!passtZurPhase(ANRUFPLAN, phase)) {
    const l = await prisma.lead.findUnique({ where: { id: leadId }, select: { followUpNote: true, autoCallAt: true } });
    if (l && istOffenePhasenAufgabe(l.followUpNote)) {
      const r = await prisma.lead.updateMany({ where: { id: leadId, followUpNote: l.followUpNote }, data: { followUpAt: null, followUpNote: null, callbackSnoozedUntil: null } });
      anrufplan = r.count > 0;
    }
    // Auslöser „keine Antwort nach dem Erstanschreiben“ (lib/anruf-ausloeser-server.ts) gilt als erledigt
    if (l && !l.autoCallAt) await prisma.lead.update({ where: { id: leadId }, data: { autoCallAt: now } });
  }
  return { gestoppt, anrufplan };
}

function verlaufText(phase: LeadPhase, gestoppt: string[], anrufplan: boolean, gestartet: SequenceKind | null): string | null {
  const namen = [...new Set(gestoppt)].map((k) => `„${SEQUENCES[k as SequenceKind]?.label ?? k}“`);
  const teile = [namen.length ? `${namen.join(", ")} beendet` : null, anrufplan ? "Anrufplan beendet" : null, gestartet ? "Nachfassen zum Angebot geplant" : null].filter(Boolean);
  return teile.length ? `Nachfassen an den Stand „${PHASE_LABEL[phase]}“ angepasst: ${teile.join(", ")}` : null;
}

/**
 * Statuswechsel (zentral über syncFollowUpWithStatus): alles der alten Phase stoppen und die Strecke der neuen starten.
 * „Angebot gesendet“ ohne laufendes Nachfassen zum Angebot: „offer_status“ (Tag 3 WhatsApp, Tag 7 Anruf-Aufgabe, Tag 14
 * „Soll ich das Angebot schließen?“); über die App bzw. „selbst gesendet“ startet weiter das eigene Nachfassen (P3).
 */
export async function phasenWechsel(leadId: string, now = new Date(), opts: { userId?: string | null } = {}): Promise<PhasenWechselErgebnis | null> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, customerId: true, status: true, stornoState: true, erasedAt: true } });
  if (!lead || lead.erasedAt) return null;
  const phase = (await phasenFuer([lead], now)).get(lead.id)!;
  const { gestoppt, anrufplan } = await raeumeAuf(leadId, phase, now);
  let gestartet: SequenceKind | null = null;
  if (phase === "angebot" && (lead.status ?? "").trim().toLowerCase() === "angebot gesendet") {
    const angebotLaeuft = await prisma.leadSequence.count({ where: { leadId, stoppedAt: null, kind: { in: ANGEBOT_KINDS } } });
    if (!angebotLaeuft) gestartet = (await startSequence(leadId, "offer_status", now)) ? "offer_status" : null;
  }
  const text = verlaufText(phase, gestoppt, anrufplan, gestartet);
  if (text) {
    const { logLeadHistory } = await import("@/lib/lead-history");
    await logLeadHistory(leadId, "wiedervorlage", text, { customerId: lead.customerId, userId: opts.userId ?? null }).catch(() => null);
  }
  return { phase, gestoppt: gestoppt.length, anrufplan, gestartet };
}

// ─── Bereinigung bestehender Kontakte (Ops) ──────────────────────────────────────────────────────────────────────────

export type BereinigungKunde = { kunde: string; leads: number; abfolgen: number; schritte: number; anrufplan: number; angebotGestartet: number };
export type BereinigungErgebnis = { echt: boolean; geprueft: number; betroffen: number; jeKunde: BereinigungKunde[] };

/** Offene Schritte einer laufenden Abfolge (ab dem aktuellen, ohne übersprungene). */
const offeneSchritte = (s: { kind: string; step: number; uebersprungen: number[] }) => {
  const def = SEQUENCES[s.kind as SequenceKind];
  if (!def) return 0;
  let n = 0;
  for (let i = s.step; i < def.steps.length; i++) if (!s.uebersprungen.includes(i)) n++;
  return n;
};

/**
 * Kontakte, deren geplante Abfolgen bzw. Anrufplan nicht mehr zur Phase passen (z. B. „Chat ruht“ bei „Angebot
 * gesendet“). Trockenlauf (echt=false) zählt nur, je Kunde: betroffene Leads, Abfolgen, offene Schritte, Anrufpläne,
 * fehlendes Nachfassen zum Angebot. Echt: wie phasenWechsel. Idempotent (ein zweiter Lauf findet nichts mehr). Ohne Namen.
 */
export async function bereinigeNachfassen(o: { echt: boolean; now?: Date; kunde?: string | null; max?: number }): Promise<BereinigungErgebnis> {
  const now = o.now ?? new Date();
  const where: Prisma.LeadWhereInput = {
    erasedAt: null,
    ...(o.kunde ? { customerId: o.kunde } : {}),
    OR: [{ sequences: { some: { stoppedAt: null } } }, { followUpNote: { startsWith: "Anrufversuch " } }, { followUpNote: { in: [...OFFENE_AUFGABEN] } }, { status: "Angebot gesendet" }],
  };
  const leads = await prisma.lead.findMany({
    where,
    select: { id: true, customerId: true, status: true, stornoState: true, erasedAt: true, followUpNote: true, sequences: { where: { stoppedAt: null }, select: { id: true, kind: true, step: true, uebersprungen: true } } },
    take: Math.min(5000, o.max ?? 5000),
    orderBy: { createdAt: "asc" },
  });
  const phasen = await phasenFuer(leads, now);
  const jeKunde = new Map<string, BereinigungKunde>();
  let betroffen = 0;
  for (const l of leads) {
    const phase = phasen.get(l.id)!;
    const falsch = l.sequences.filter((s) => !passtZurPhase(s.kind, phase));
    const plan = !passtZurPhase(ANRUFPLAN, phase) && istOffenePhasenAufgabe(l.followUpNote);
    // „Angebot gesendet“ ohne Nachfassen: nur, wenn sonst etwas falsch lief (alte Strecke) bzw. gar nichts mehr läuft
    const ohneAngebot =
      phase === "angebot" && (l.status ?? "").trim().toLowerCase() === "angebot gesendet" && !l.sequences.some((s) => (ANGEBOT_KINDS as string[]).includes(s.kind)) && (falsch.length > 0 || plan);
    if (!falsch.length && !plan && !ohneAngebot) continue;
    betroffen++;
    const k = jeKunde.get(l.customerId) ?? { kunde: l.customerId, leads: 0, abfolgen: 0, schritte: 0, anrufplan: 0, angebotGestartet: 0 };
    k.leads++;
    k.abfolgen += falsch.length;
    k.schritte += falsch.reduce((n, s) => n + offeneSchritte(s), 0);
    if (plan) k.anrufplan++;
    if (o.echt) {
      const { gestoppt, anrufplan } = await raeumeAuf(l.id, phase, now);
      let gestartet: SequenceKind | null = null;
      if (ohneAngebot) gestartet = (await startSequence(l.id, "offer_status", now)) ? "offer_status" : null;
      if (gestartet) k.angebotGestartet++;
      const text = verlaufText(phase, gestoppt, anrufplan, gestartet);
      if (text) {
        const { logLeadHistory } = await import("@/lib/lead-history");
        await logLeadHistory(l.id, "wiedervorlage", text, { customerId: l.customerId, userId: null }).catch(() => null);
      }
    } else if (ohneAngebot) k.angebotGestartet++;
    jeKunde.set(l.customerId, k);
  }
  return { echt: o.echt, geprueft: leads.length, betroffen, jeKunde: [...jeKunde.values()].sort((x, y) => y.leads - x.leads) };
}


/** Merker der einmaligen Bereinigung (Ole, 28.11.2026). */
export const EINMAL_BEREINIGUNG_KEY = "nachfassen-bereinigung-2026-11-28";

/** Einmalige echte Bereinigung aus dem Cron: läuft nur, solange der Merker fehlt; Ergebnis (nur Zahlen) im Merker. */
export async function einmalNachfassenBereinigen(now = new Date()): Promise<BereinigungErgebnis | null> {
  const da = await prisma.systemHeartbeat.findUnique({ where: { key: EINMAL_BEREINIGUNG_KEY }, select: { key: true } });
  if (da) return null;
  // Merker zuerst setzen (zwei parallele Cron-Läufe), Ergebnis danach nachtragen
  const angelegt = await prisma.systemHeartbeat.createMany({ data: [{ key: EINMAL_BEREINIGUNG_KEY, at: now, ok: true, note: "läuft" }], skipDuplicates: true });
  if (!angelegt.count) return null;
  try {
    const r = await bereinigeNachfassen({ echt: true, now });
    await prisma.systemHeartbeat.update({ where: { key: EINMAL_BEREINIGUNG_KEY }, data: { note: JSON.stringify({ geprueft: r.geprueft, betroffen: r.betroffen, jeKunde: r.jeKunde }).slice(0, 2000) } });
    return r;
  } catch (e) {
    await prisma.systemHeartbeat.update({ where: { key: EINMAL_BEREINIGUNG_KEY }, data: { ok: false, note: e instanceof Error ? e.name : "Fehler" } });
    throw e;
  }
}
