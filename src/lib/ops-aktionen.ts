// Schreib-Schnittstelle für Claude (Ole, 21.11.2026: „ja, bau die schnittstelle“): eng begrenzte Liste erlaubter
// Admin-Aktionen über POST /api/ops/aktion, Schlüssel OPS_ACTION_TOKEN (≥ 32 Zeichen, getrennt von Lese- und
// Upload-Schlüssel, lib/ops-auth.ts). Jede Aktion steht im Audit-Log mit „ops-aktion (Claude)“. Nicht erlaubt: Löschen,
// Zahlungen/Stripe direkt, Angebotspreise, Lead-Daten. Neue Aktionen nur hier in AKTIONEN eintragen.

import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";
import { opsTokenOk } from "@/lib/ops-auth";

export const OPS_ACTOR: AuditActor = { role: "system", email: "ops-aktion (Claude)" };

export function aktionAuthorized(req: Request, env: Record<string, string | undefined> = process.env): boolean {
  return opsTokenOk(req.headers, env.OPS_ACTION_TOKEN);
}

type Ergebnis = { ok: true; info?: string; daten?: unknown } | { ok: false; error: string };
type Aktion = { beschreibung: string; felder: Record<string, string>; run: (p: Record<string, unknown>) => Promise<Ergebnis> };

const text = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const zahl = (v: unknown) => (typeof v === "number" ? v : Number(String(v ?? "").replace(",", ".")));

async function kunde(id: string) {
  return id ? prisma.customer.findUnique({ where: { id }, select: { id: true, name: true } }) : null;
}

export const AKTIONEN: Record<string, Aktion> = {
  produkt_anlegen: {
    beschreibung: "Produkt für einen Kunden anlegen, ohne Aufpreis (In Einrichtung, Aufgabe „Kampagne aufsetzen“)",
    felder: { customerId: "Kunden-ID", product: "Produktname, z. B. KFZ", dailyBudget: "Tagesbudget Meta in €" },
    run: async (p) => {
      const c = await kunde(text(p.customerId));
      if (!c) return { ok: false, error: "Kunde nicht gefunden." };
      const { adminProduktAnlegen } = await import("@/lib/produkt-buchen");
      const r = await adminProduktAnlegen({ customerId: c.id, product: text(p.product, 60), dailyBudget: zahl(p.dailyBudget), actor: OPS_ACTOR });
      return r.ok ? { ok: true, info: `${c.name}: ${text(p.product, 60)} angelegt. ${r.note ?? ""}`.trim() } : r;
    },
  },
  produkt_starten: {
    beschreibung: "Produkt in Einrichtung auf „Gestartet“ setzen (Budgetzeile, Mail an den Kunden)",
    felder: { bookingId: "ID der Produktbuchung" },
    run: async (p) => {
      const { startProduct } = await import("@/lib/produkt-buchen");
      const r = await startProduct(text(p.bookingId), OPS_ACTOR);
      return r.ok ? { ok: true, info: `Gestartet. ${r.note ?? ""}`.trim() } : r;
    },
  },
  pilot_setzen: {
    beschreibung: "Pilot bis Datum setzen (YYYY-MM-DD) oder entfernen (leer)",
    felder: { customerId: "Kunden-ID", pilotBis: "YYYY-MM-DD oder leer" },
    run: async (p) => {
      const c = await kunde(text(p.customerId));
      if (!c) return { ok: false, error: "Kunde nicht gefunden." };
      const { parsePilotBis } = await import("@/lib/pilot");
      const { setzePilot } = await import("@/lib/pilot-server");
      const parsed = parsePilotBis(text(p.pilotBis));
      if (!parsed.ok) return parsed;
      const r = await setzePilot(c.id, parsed.value);
      if (!r.ok) return r;
      await audit("pilot.set", { entity: "Customer", entityId: c.id, customerId: c.id, details: { pilotBis: text(p.pilotBis) || null }, actor: OPS_ACTOR });
      return { ok: true, info: parsed.value ? `${c.name}: Pilot bis ${text(p.pilotBis)}.` : `${c.name}: Pilot entfernt.` };
    },
  },
  plaetze_setzen: {
    beschreibung: "Inklusive aktive Verkäufer und Preis je weiterem Verkäufer setzen, danach Abo abgleichen",
    felder: { customerId: "Kunden-ID", seatsIncluded: "1 bis 100", seatMonthly: "€ je weiterem Verkäufer" },
    run: async (p) => {
      const c = await prisma.customer.findUnique({ where: { id: text(p.customerId) }, select: { id: true, name: true, seatsIncluded: true, seatMonthly: true } });
      if (!c) return { ok: false, error: "Kunde nicht gefunden." };
      const included = zahl(p.seatsIncluded);
      const price = p.seatMonthly === undefined ? Number(c.seatMonthly ?? 0) : zahl(p.seatMonthly);
      if (!Number.isInteger(included) || included < 1 || included > 100 || !Number.isFinite(price) || price < 0 || price > 10_000) return { ok: false, error: "Ungültige Werte." };
      await prisma.customer.update({ where: { id: c.id }, data: { seatsIncluded: included, seatMonthly: price } });
      await audit("billing.seats", { entity: "Customer", entityId: c.id, customerId: c.id, details: { seatsIncluded: { from: c.seatsIncluded, to: included }, seatMonthly: { from: c.seatMonthly != null ? Number(c.seatMonthly) : null, to: price } }, actor: OPS_ACTOR });
      const { syncSeatBilling } = await import("@/lib/billing");
      const s = await syncSeatBilling(c.id, { force: true });
      return { ok: true, info: `${c.name}: ${included} inklusive, ${price} € je weiterem.${s.ok && s.note ? ` ${s.note}` : !s.ok ? ` Abgleich: ${s.error}` : ""}` };
    },
  },
  video_link_setzen: {
    beschreibung: "Festen Video-Link (z. B. Webex-Raum) setzen; schon gebuchte Videotermine ohne Link bekommen ihn",
    felder: { customerId: "Kunden-ID", videoRoomUrl: "https://…/meet/vorname.nachname" },
    run: async (p) => {
      const c = await kunde(text(p.customerId));
      if (!c) return { ok: false, error: "Kunde nicht gefunden." };
      const { pruefeVideoLink } = await import("@/lib/video-raum");
      const g = pruefeVideoLink(text(p.videoRoomUrl, 300));
      if (!g.ok) return g;
      if (!g.url) return { ok: false, error: "Bitte einen Link angeben." };
      await prisma.agentConfig.upsert({ where: { customerId: c.id }, create: { customerId: c.id, videoRoomUrl: g.url }, update: { videoRoomUrl: g.url } });
      await audit("calendar.video_room", { entity: "AgentConfig", customerId: c.id, actor: OPS_ACTOR });
      const { videoRaumNachtragen } = await import("@/lib/video-raum-server");
      const n = await videoRaumNachtragen(c.id, g.url);
      return { ok: true, info: `${c.name}: Video-Link gesetzt${n ? `, ${n} gebuchte Videotermine nachgetragen` : ""}.` };
    },
  },
  aufgabe_erledigen: {
    beschreibung: "Admin-Aufgabe abhaken",
    felder: { taskId: "ID der Aufgabe" },
    run: async (p) => {
      const t = await prisma.salesTask.findUnique({ where: { id: text(p.taskId) }, select: { id: true, title: true, doneAt: true } });
      if (!t) return { ok: false, error: "Aufgabe nicht gefunden." };
      if (!t.doneAt) await prisma.salesTask.update({ where: { id: t.id }, data: { doneAt: new Date() } });
      await audit("task.done", { entity: "SalesTask", entityId: t.id, details: { title: t.title }, actor: OPS_ACTOR });
      return { ok: true, info: `Erledigt: ${t.title}` };
    },
  },
  produkte_auflisten: {
    beschreibung: "Produktbuchungen eines Kunden auflisten (nur lesen, für IDs)",
    felder: { customerId: "Kunden-ID" },
    run: async (p) => {
      const rows = await prisma.productBooking.findMany({ where: { customerId: text(p.customerId) }, select: { id: true, product: true, status: true, dailyBudget: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 20 });
      return { ok: true, daten: rows.map((r) => ({ ...r, dailyBudget: Number(r.dailyBudget) })) };
    },
  },
  aufgaben_auflisten: {
    beschreibung: "Offene Admin-Aufgaben auflisten, optional gefiltert nach Text im Titel (nur lesen)",
    felder: { suche: "Text im Titel (optional)" },
    run: async (p) => {
      const q = text(p.suche, 80);
      const rows = await prisma.salesTask.findMany({ where: { doneAt: null, ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}) }, select: { id: true, title: true, dueAt: true }, orderBy: { dueAt: "asc" }, take: 30 });
      return { ok: true, daten: rows };
    },
  },
};

/** Aktion ausführen (Name aus AKTIONEN), unbekannte ablehnen. */
export async function fuehreAktionAus(name: string, params: Record<string, unknown>): Promise<Ergebnis> {
  const a = Object.prototype.hasOwnProperty.call(AKTIONEN, name) ? AKTIONEN[name] : null;
  if (!a) return { ok: false, error: `Unbekannte Aktion. Erlaubt: ${Object.keys(AKTIONEN).join(", ")}` };
  try {
    return await a.run(params);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 200) : "Fehler" };
  }
}
