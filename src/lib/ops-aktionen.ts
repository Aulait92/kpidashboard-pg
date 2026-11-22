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
  werbekosten_abgleichen: {
    beschreibung: "Werbekosten eines Kunden mit eigenem Werbekonto sofort abgleichen (je Anzeige ab Startdatum und je Tag), statt auf den Lauf um 5 Uhr zu warten",
    felder: { customerId: "Kunden-ID" },
    run: async (p) => {
      const c = await kunde(text(p.customerId));
      if (!c) return { ok: false, error: "Kunde nicht gefunden." };
      const k = await prisma.customer.findUnique({ where: { id: c.id }, select: { metaAdAccountId: true } });
      const konto = (k?.metaAdAccountId ?? "").replace(/^act_/, "");
      if (!/^\d+$/.test(konto)) return { ok: false, error: "Kein eigenes Werbekonto hinterlegt." };
      const { syncAnzeigeKosten } = await import("@/lib/anzeige-kosten");
      const r = await syncAnzeigeKosten({ voll: true, nurKonto: konto });
      const { syncCustomerAdSpend } = await import("@/lib/meta");
      const t = await syncCustomerAdSpend();
      const z = r.konten[0];
      await audit("meta.werbekosten_abgleich", { entity: "Customer", entityId: c.id, customerId: c.id, actor: OPS_ACTOR, details: { gespeichert: r.gespeichert, fehler: z?.fehler ?? null } });
      return z?.fehler ? { ok: false, error: `${c.name}: ${z.fehler}` } : { ok: true, info: `${c.name}: ${r.gespeichert} Kostenzeilen je Anzeige (${z?.von ?? "?"} bis ${z?.bis ?? "?"}), Tageswerte für ${t.customers} Kundenkonten aktualisiert.` };
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
  lead_falsche_nummer: {
    beschreibung: "Offenen Lead mit eindeutig falscher Nummer auf „Verloren: falsche Daten“ setzen (nur wenn die Prüfung greift)",
    felder: { leadId: "ID des Leads" },
    run: async (p) => {
      const l = await prisma.lead.findUnique({ where: { id: text(p.leadId) }, select: { id: true, customerId: true, phone: true, status: true, isTest: true } });
      if (!l?.customerId) return { ok: false, error: "Lead nicht gefunden." };
      if (l.status && l.status !== "Neuer Lead") return { ok: false, error: `Lead ist nicht mehr neu (Status ${l.status}).` };
      const grund = (await import("@/lib/ppl/telefon-pruefung")).offensichtlichFalscheNummer(l.phone);
      if (!grund) return { ok: false, error: "Nummer ist nicht eindeutig falsch." };
      await (await import("@/lib/lead-intake")).alsFalscheDatenVerloren(l.id, l.customerId, grund);
      await audit("lead.falsche_nummer", { entity: "Lead", entityId: l.id, details: { grund }, actor: OPS_ACTOR });
      return { ok: true, info: `Verloren: falsche Daten (${grund})` };
    },
  },
  lead_nummer_korrigieren: {
    beschreibung: "Nummer eines Leads mit der aktuellen Regel neu einlesen (z. B. „+1 0175…“ → 49175…); hat sich etwas geändert und ging noch kein Erstanschreiben raus, wird es jetzt geschickt",
    felder: { customerId: "Kunden-ID", telefon: "bisher gespeicherte Nummer (nur Ziffern)" },
    run: async (p) => {
      const alt = text(p.telefon).replace(/\D/g, "");
      if (alt.length < 8) return { ok: false, error: "Nummer fehlt." };
      const l = await prisma.lead.findFirst({ where: { customerId: text(p.customerId), phone: alt }, select: { id: true, customerId: true, phone: true, outreachStatus: true } });
      if (!l?.customerId || !l.phone) return { ok: false, error: "Lead nicht gefunden." };
      const neu = (await import("@/lib/whatsapp/phone")).normalizePhone(`+${l.phone}`);
      if (!neu) return { ok: false, error: "Nummer ungültig." };
      // „sent_booked“ (schon gebucht) ist auch gesendet: sonst ging die Erstnachricht doppelt raus (22.11.2026)
      const offen = !l.outreachStatus?.startsWith("sent");
      // Schon korrigiert, aber die Erstnachricht hing (z. B. „kein WhatsApp“ der alten Nummer): erneut versuchen
      await prisma.lead.update({ where: { id: l.id }, data: { phone: neu, waUnavailableAt: null, ...(offen ? { outreachAt: null, outreachStatus: null } : {}) } });
      await audit("lead.nummer_korrigiert", { entity: "Lead", entityId: l.id, details: { neu: `…${neu.slice(-4)}` }, actor: OPS_ACTOR });
      const r = offen ? await (await import("@/lib/whatsapp/outreach")).runOutreach(l.customerId, { leadIds: [l.id] }) : null;
      return { ok: true, info: `Nummer korrigiert (…${neu.slice(-4)})${r ? `, Erstanschreiben: ${r.sent} gesendet, ${r.failed} Fehler, ${r.skipped} übersprungen${r.errors.length ? ` (${r.errors.slice(0, 2).join("; ").slice(0, 300)})` : ""}` : ""}` };
    },
  },
  whatsapp_neu_versuchen: {
    beschreibung: "Lead galt als „kein WhatsApp“ (z. B. falsche Nummer, inzwischen korrigiert): Sperre aufheben und neu versuchen, mit Termin die Terminbestätigung, sonst das Erstanschreiben",
    felder: { customerId: "Kunden-ID", name: "Teil des Lead-Namens" },
    run: async (p) => {
      const name = text(p.name);
      if (name.length < 3) return { ok: false, error: "Name zu kurz." };
      const leads = await prisma.lead.findMany({ where: { customerId: text(p.customerId), name: { contains: name, mode: "insensitive" }, erasedAt: null }, select: { id: true }, take: 3 });
      if (leads.length !== 1) return { ok: false, error: `${leads.length} passende Leads, bitte genauer.` };
      const r = await (await import("@/lib/whatsapp/kein-whatsapp")).nachNummernKorrektur(leads[0].id);
      await audit("lead.whatsapp_neu", { entity: "Lead", entityId: leads[0].id, details: { ergebnis: r }, actor: OPS_ACTOR });
      return r === "nichts" ? { ok: false, error: "Nichts versucht (keine Sperre „kein WhatsApp“ oder keine Nummer)." } : { ok: true, info: r === "termin" ? "Terminbestätigung per WhatsApp versucht." : "Erstanschreiben per WhatsApp versucht." };
    },
  },
  bank_csv_importieren: {
    beschreibung: "Kontoumsätze aus einer CSV in die Buchhaltung (Geld › Kosten) übernehmen, je Konto getrennt (z. B. n26 für geschäftliche Ausgaben vom Privatkonto); Regeln greifen, Rest steht offen zum Zuordnen. Ohne Oberfläche.",
    felder: { konto: "Kurzname, nur Kleinbuchstaben/Ziffern, z. B. n26", csv: "Inhalt der CSV-Datei" },
    run: async (p) => {
      const konto = text(p.konto, 30).toLowerCase();
      if (!/^[a-z0-9]{2,30}$/.test(konto)) return { ok: false, error: "Konto: nur Kleinbuchstaben und Ziffern." };
      const csv = typeof p.csv === "string" ? p.csv : "";
      if (csv.length < 20 || csv.length > 2_000_000) return { ok: false, error: "CSV fehlt oder ist zu groß." };
      const { parseBankCsv } = await import("@/lib/bank/csv");
      const parsed = parseBankCsv(csv, "auto");
      if (parsed.error) return { ok: false, error: parsed.error };
      const { importTransactions } = await import("@/lib/bank/server");
      const r = await importTransactions(`csv:${konto}`, parsed.rows, { source: "csv" });
      await audit("bank.sync", { details: { csv: konto, rows: parsed.rows.length, created: r.created }, actor: OPS_ACTOR });
      return { ok: true, info: `${konto}: ${parsed.rows.length} Umsätze gelesen (${parsed.skipped} übersprungen), ${r.created} neu, ${r.existing} schon da, ${r.assigned} per Regel zugeordnet, ${r.open} offen zum Zuordnen.` };
    },
  },
  buchungslink_senden: {
    beschreibung: "Buchungslink per WhatsApp an einen Lead ohne Termin schicken (einmal je Chat, nur im offenen 24-h-Fenster), Lead über Kunde und Namen",
    felder: { customerId: "Kunden-ID", name: "Teil des Lead-Namens" },
    run: async (p) => {
      const name = text(p.name);
      if (name.length < 3) return { ok: false, error: "Name zu kurz." };
      const leads = await prisma.lead.findMany({ where: { customerId: text(p.customerId), name: { contains: name, mode: "insensitive" } }, select: { id: true, name: true }, take: 3 });
      if (leads.length !== 1) return { ok: false, error: `${leads.length} passende Leads, bitte genauer.` };
      const conv = await prisma.conversation.findFirst({ where: { leadId: leads[0].id }, orderBy: { lastMessageAt: "desc" }, select: { id: true, windowExpiresAt: true } });
      if (!conv) return { ok: false, error: "Kein WhatsApp-Chat." };
      if (!conv.windowExpiresAt || conv.windowExpiresAt.getTime() < Date.now()) return { ok: false, error: "24-Stunden-Fenster ist zu." };
      const ok = await (await import("@/lib/whatsapp/knopf")).buchungslinkNachAbsage(conv.id);
      if (!ok) return { ok: false, error: "Nicht gesendet (schon Termin, Link schon gesendet oder kein Kalender)." };
      await audit("lead.buchungslink", { entity: "Lead", entityId: leads[0].id, details: {}, actor: OPS_ACTOR });
      return { ok: true, info: "Buchungslink gesendet." };
    },
  },
  bezug_aktiv: {
    beschreibung: "Pay-per-Lead-Bezug pausieren bzw. wieder einschalten (aktiv true/false), z. B. für einen Tag keine Lieferung",
    felder: { subscriptionId: "ID des Bezugs", aktiv: "true oder false" },
    run: async (p) => {
      const aktiv = text(p.aktiv) === "true";
      const sub = await prisma.leadSubscription.findUnique({ where: { id: text(p.subscriptionId) }, select: { id: true, active: true, customer: { select: { name: true } } } });
      if (!sub) return { ok: false, error: "Bezug nicht gefunden." };
      if (sub.active !== aktiv) await prisma.leadSubscription.update({ where: { id: sub.id }, data: { active: aktiv } });
      await audit(aktiv ? "subscription.resume" : "subscription.pause", { entity: "LeadSubscription", entityId: sub.id, details: { kunde: sub.customer?.name ?? null }, actor: OPS_ACTOR });
      return { ok: true, info: `${sub.customer?.name ?? "Bezug"}: ${aktiv ? "liefert wieder" : "pausiert"}` };
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
