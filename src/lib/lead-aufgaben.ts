// Aufgaben am Lead nach dem Abschluss (P7, Ole 17.11.2026; Plan docs/plan-lead-verlauf.md Risiko 11, M6 in
// docs/plan-mail-vorlagen.md). Heute zeigt je Lead genau eine Wiedervorlage (Lead.followUpAt/followUpNote). Bisher
// legten „Police da?“ (14 Tage) und „Weiteres Produkt anbieten?“ (6 Wochen) sie nur an, wenn sie frei war: Eine offene
// Police-Aufgabe verdrängte so das Cross-Selling für immer (Zeitfenster 7 Tage).
//
// Jetzt: planeAufgabe legt eine LeadTask an (eine je Lead und Art). Ist die Wiedervorlage frei, wird sie sofort zur
// Wiedervorlage; sonst wartet sie und rückt nach, sobald die Wiedervorlage erledigt ist (aktiviereAufgaben, Cron alle
// 5 Minuten; nicht sofort beim Erledigen, damit „Rückgängig“ auf Heute sauber bleibt). Vor dem Aktivieren prüft je Art eine Regel, ob die Aufgabe noch nötig ist
// (Police schon da, weiterer Vertrag schon eingetragen, Lead nicht mehr im Abschluss). M6 (Willkommen, Unterlagen fehlen,
// Kündigung) legt weitere Arten mit planeAufgabe an, ohne etwas zu verdrängen; ihr Text gehört dann in
// NACH_ABSCHLUSS_TODOS (lib/vertraege-shared.ts), damit Heute sie bei Kontakten im Abschluss zeigt.

import { prisma } from "@/lib/prisma";

export type AufgabeArt = "police" | "cross_sell" | (string & {});

export type AufgabePlan = {
  leadId: string;
  customerId: string;
  kind: AufgabeArt;
  note: string;
  /** frühestens ab dann auf „Heute“ */
  dueAt: Date;
  /** nur aktivieren, solange der Lead in dieser Phase ist (z. B. „Abschluss“) */
  requiresStatus?: string | null;
};

/** Regel je Art: Grund, warum die Aufgabe entfällt (null = weiter nötig). */
type NochNoetig = (leadId: string) => Promise<string | null>;
const REGELN: Record<string, NochNoetig> = {
  // Police hängt schon am ersten Vertrag oder er ist gekündigt
  police: async (leadId) =>
    (await prisma.leadContract.count({ where: { primaryLeadId: leadId, OR: [{ fileId: { not: null } }, { status: "storniert" }] } })) ? "Police schon da" : null,
  // Weiterer Vertrag schon eingetragen
  // (Bestandsübertragungen aus der Maklervollmacht zählen nicht als weiterer Abschluss)
  cross_sell: async (leadId) => ((await prisma.leadContract.count({ where: { leadId, primaryLeadId: null, status: "aktiv", herkunft: null } })) ? "Weiterer Vertrag eingetragen" : null),
  // Paket M6: Kündigung schon gesendet (App oder eigenes Mailprogramm)
  kuendigung: async (leadId) => ((await prisma.contactMail.count({ where: { leadId, kind: "kuendigung", status: { not: "nicht_versendet" } } })) ? "Kündigung schon gesendet" : null),
};

/**
 * Aufgabe „Alten Vertrag kündigen: Haftpflicht bei HUK-Coburg“ beim Abschluss (Paket M6), wenn der Lead im Komplettcheck
 * (Lead.vorvertraege) einen Vertrag derselben Sparte genannt hat. Wartet hinter „Police fertig machen“, verdrängt nichts.
 * Die Mail „Kündigung alte Versicherung“ schreibt der Vermittler von Hand (Musterkündigung als PDF, Versicherer vorausgefüllt).
 */
export async function planeKuendigung(leadId: string, now = new Date()): Promise<"aktiv" | "wartet" | "vorhanden" | null> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { customerId: true, status: true, source: true, vorvertraege: true, erasedAt: true } });
  if (!lead || lead.erasedAt || lead.status !== "Abschluss") return null;
  const { vorvertraegeAus, zuErsetzendeVertraege } = await import("@/lib/whatsapp/vorvertraege");
  const v = vorvertraegeAus(lead.vorvertraege);
  if (!v?.liste.length) return null;
  const [vertrag, termin] = await Promise.all([
    prisma.leadContract.findUnique({ where: { primaryLeadId: leadId }, select: { sparte: true, productName: true } }),
    prisma.appointment.findMany({ where: { leadId }, orderBy: { startsAt: "desc" }, take: 5, select: { offersJson: true } }),
  ]);
  const { cleanAngebote, gewaehlte } = await import("@/lib/angebote-daten");
  const mitAngebot = termin.find((t) => t.offersJson);
  const angebote = mitAngebot ? gewaehlte(cleanAngebote(mitAngebot.offersJson)).map((i) => i.sparte) : [];
  const treffer = zuErsetzendeVertraege(v, [lead.source, vertrag?.sparte, vertrag?.productName, ...angebote])[0];
  if (!treffer) return null;
  const { kuendigungNote } = await import("@/lib/vertraege-shared");
  return planeAufgabe({ leadId, customerId: lead.customerId, kind: "kuendigung", note: kuendigungNote(treffer.sparte, treffer.gesellschaft), dueAt: now, requiresStatus: "Abschluss" }, now);
}

/** Aufgabe planen (einmal je Lead und Art) und, wenn die Wiedervorlage frei ist, sofort aktivieren. */
export async function planeAufgabe(p: AufgabePlan, now = new Date()): Promise<"aktiv" | "wartet" | "vorhanden"> {
  let created = true;
  await prisma.leadTask
    .create({ data: { leadId: p.leadId, customerId: p.customerId, kind: p.kind, note: p.note, dueAt: p.dueAt, requiresStatus: p.requiresStatus ?? null } })
    .catch(() => {
      created = false; // schon geplant (eindeutig je Lead und Art)
    });
  if (!created) return "vorhanden";
  const n = await aktiviereAufgaben(now, { leadId: p.leadId });
  return n > 0 ? "aktiv" : "wartet";
}

/** Wartende Aufgaben einer Art beenden (z. B. Cross-Selling nach einem weiteren Abschluss). */
export async function beendeAufgaben(leadId: string, kinds: AufgabeArt[], reason: string): Promise<number> {
  const r = await prisma.leadTask.updateMany({ where: { leadId, kind: { in: kinds }, status: "wartet" }, data: { status: "entfallen", endedReason: reason } });
  return r.count;
}

/**
 * Fällige wartende Aufgaben zur Wiedervorlage machen, wenn diese frei ist: je Lead die älteste zuerst, eine je Lauf
 * (die nächste folgt, wenn die Wiedervorlage wieder frei ist). Nicht mehr nötige Aufgaben entfallen.
 */
export async function aktiviereAufgaben(now = new Date(), opts: { leadId?: string } = {}): Promise<number> {
  const waiting = await prisma.leadTask.findMany({
    where: { status: "wartet", dueAt: { lte: now }, ...(opts.leadId ? { leadId: opts.leadId } : {}) },
    orderBy: { dueAt: "asc" },
    take: 500,
    select: { id: true, leadId: true, kind: true, note: true, requiresStatus: true, lead: { select: { status: true, erasedAt: true, followUpAt: true } } },
  });
  const done = new Set<string>();
  let n = 0;
  for (const t of waiting) {
    if (done.has(t.leadId)) continue;
    const end = async (reason: string) => {
      await prisma.leadTask.updateMany({ where: { id: t.id, status: "wartet" }, data: { status: "entfallen", endedReason: reason } });
    };
    if (t.lead.erasedAt) {
      await end("Kontakt gelöscht");
      continue;
    }
    if (t.requiresStatus && t.lead.status !== t.requiresStatus) {
      await end(`Phase: ${t.lead.status ?? "ohne"}`);
      continue;
    }
    if (t.lead.followUpAt) {
      done.add(t.leadId); // Wiedervorlage belegt: wartet weiter
      continue;
    }
    const grund = await (REGELN[t.kind]?.(t.leadId) ?? Promise.resolve(null));
    if (grund) {
      await end(grund);
      continue;
    }
    // Bedingt: nur wenn die Wiedervorlage noch frei ist (paralleler Lauf, inzwischen gesetzte Wiedervorlage)
    const r = await prisma.lead.updateMany({
      where: { id: t.leadId, followUpAt: null, ...(t.requiresStatus ? { status: t.requiresStatus } : {}) },
      data: { followUpAt: now, followUpNote: t.note },
    });
    done.add(t.leadId);
    if (!r.count) continue;
    await prisma.leadTask.update({ where: { id: t.id }, data: { status: "aktiv", activatedAt: now } });
    n++;
  }
  return n;
}
