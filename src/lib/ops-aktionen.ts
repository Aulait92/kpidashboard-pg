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
  kunde_anschrift_setzen: {
    beschreibung: "Geschäftsanschrift des Kunden für Einwilligung und Erstinformation setzen (Webseiten-Angaben, sonst Vertriebskontakt)",
    felder: { customerId: "Kunden-ID", anschrift: "z. B. Legiendamm 6, 10179 Berlin" },
    run: async (p) => {
      const c = await kunde(text(p.customerId));
      if (!c) return { ok: false, error: "Kunde nicht gefunden." };
      const anschrift = text(p.anschrift, 160);
      if (!/\d{4,5}/.test(anschrift)) return { ok: false, error: "Anschrift mit PLZ angeben." };
      const ob = await prisma.onboarding.findUnique({ where: { customerId: c.id }, select: { id: true, websiteInfo: true } });
      if (ob) {
        const web = (ob.websiteInfo ?? {}) as Record<string, unknown>;
        await prisma.onboarding.update({ where: { id: ob.id }, data: { websiteInfo: { ...web, address: anschrift } } });
      } else {
        const m = anschrift.match(/^(.*?),\s*(\d{4,5})\s+(.+)$/);
        if (!m) return { ok: false, error: "Format „Straße Nr., PLZ Ort“." };
        const r = await prisma.salesContact.updateMany({ where: { customerId: c.id }, data: { street: m[1], zip: m[2], city: m[3] } });
        if (!r.count) return { ok: false, error: "Weder Onboarding noch Vertriebskontakt vorhanden." };
      }
      await audit("kunde.anschrift", { customerId: c.id, details: { anschrift }, actor: OPS_ACTOR });
      return { ok: true, info: `${c.name}: Anschrift gesetzt (${anschrift}).` };
    },
  },
  vertrieb_anrede_setzen: {
    beschreibung: "Anrede (Herr/Frau) eines Vertriebskontakts setzen, z. B. für „Hallo Herr Kuhn“ in der Angebotsmail",
    felder: { salesContactId: "ID des Vertriebskontakts", anrede: "Herr oder Frau" },
    run: async (p) => {
      const id = text(p.salesContactId);
      const anrede = text(p.anrede, 10);
      if (!/^(Herr|Frau)$/.test(anrede)) return { ok: false, error: "anrede: Herr oder Frau." };
      const c = await prisma.salesContact.findUnique({ where: { id }, select: { id: true, lastName: true } });
      if (!c) return { ok: false, error: "Kontakt nicht gefunden." };
      await prisma.salesContact.update({ where: { id }, data: { salutation: anrede } });
      await audit("vertrieb.anrede", { entity: "SalesContact", entityId: id, details: { anrede }, actor: OPS_ACTOR });
      return { ok: true, info: `Anrede gesetzt: ${anrede} ${c.lastName ?? ""}`.trim() };
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
  app_kalender_einschalten: {
    beschreibung:
      "Kunden ohne Online-Kalender umstellen („Ich habe keinen Online-Kalender“): App-Kalender an, Termine als Einladung per Mail, freie Zeiten aus den Beratungszeiten, eigene Termine per Weiterleitung; bleibt an, auch ohne Allianz oder Kalender-Link",
    felder: { customerId: "Kunden-ID" },
    run: async (p) => {
      const c = await kunde(text(p.customerId));
      if (!c) return { ok: false, error: "Kunde nicht gefunden." };
      const { ohneOnlineKalenderEinschalten } = await import("@/lib/calendar/sources");
      const r = await ohneOnlineKalenderEinschalten(c.id);
      if (!r.ok) return { ok: false, error: `${c.name}: ${r.error ?? "nicht möglich"}` };
      await audit("calendar.ohne_online_kalender", { entity: "CalendarConnection", customerId: c.id, actor: OPS_ACTOR });
      const { terminAdresseFuer } = await import("@/lib/calendar/termin-weiterleitung-server");
      const adresse = await terminAdresseFuer(c.id, c.id);
      return { ok: true, info: `${c.name}: App-Kalender an (ohne Online-Kalender). Termin-Adresse: ${adresse}. Test-Einladung bestätigt der Kunde in der Einrichtung.` };
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
  whatsapp_buchungsnummer: {
    beschreibung: "Lead mit „kein WhatsApp“ auf der Formular-Nummer hat online mit anderer Handynummer gebucht: diese Nummer als WhatsApp-Kontakt übernehmen (Sperre und SMS-Strecke aus), dann mit Termin die Terminbestätigung, nach einer Absage das Nachfassen per freigegebener Vorlage (followup_noshow, sonst followup bzw. followup_nudge)",
    felder: { customerId: "Kunden-ID", name: "Teil des Lead-Namens" },
    run: async (p) => {
      const name = text(p.name);
      if (name.length < 3) return { ok: false, error: "Name zu kurz." };
      const leads = await prisma.lead.findMany({ where: { customerId: text(p.customerId), name: { contains: name, mode: "insensitive" }, erasedAt: null }, select: { id: true }, take: 3 });
      if (leads.length !== 1) return { ok: false, error: `${leads.length} passende Leads, bitte genauer.` };
      const r = await (await import("@/lib/whatsapp/buchungsnummer")).buchungsnummerNachtragen(leads[0].id);
      if (!r.ok) return r;
      const n = r.nachricht;
      await audit("lead.whatsapp_buchungsnummer", {
        entity: "Lead",
        entityId: leads[0].id,
        details: { nummer: `…${r.nummer.slice(-4)}`, uebernommen: r.uebernommen, nachricht: n === null ? null : n === "terminbestaetigung" ? n : n.gesendet ? n.zweck : `nicht: ${n.grund}` },
        actor: OPS_ACTOR,
      });
      const kopf = `${r.uebernommen ? "Nummer übernommen" : "Nummer war schon übernommen"} (…${r.nummer.slice(-4)}).`;
      if (n === null) return { ok: true, info: `${kopf} ${r.hinweis ?? ""}`.trim() };
      if (n === "terminbestaetigung") return { ok: true, info: `${kopf} Terminbestätigung per WhatsApp versucht.` };
      return n.gesendet
        ? { ok: true, info: `${kopf} Nachfassen nach der Absage gesendet: ${n.modus === "template" ? `Vorlage ${n.zweck}` : `Freitext (${n.zweck}, 24-h-Fenster offen)`}.` }
        : { ok: false, error: `${kopf} Nachfassen nicht gesendet: ${n.grund}` };
    },
  },
  eigenbeleg_erstellen: {
    beschreibung: "Eigenbeleg (PDF) für eine Ausgabe ohne Originalbeleg erstellen, ablegen und fest zuordnen (kleine Beträge, auf Oles Anweisung)",
    felder: { umsatzId: "ID der Zahlung (diagnose q=belege&liste=offen)", gegenstand: "was gekauft wurde", zweck: "betrieblicher Zweck", empfaenger: "optional: Name des Empfängers", grund: "optional" },
    run: async (p) => {
      const gegenstand = text(p.gegenstand, 300);
      const zweck = text(p.zweck, 300);
      if (gegenstand.length < 3 || zweck.length < 3) return { ok: false, error: "Gegenstand und Zweck nötig." };
      const { eigenbelegErstellen } = await import("@/lib/belege/eigenbeleg");
      const r = await eigenbelegErstellen({ umsatzId: text(p.umsatzId, 40), gegenstand, zweck, empfaenger: text(p.empfaenger, 120) || undefined, grund: text(p.grund, 300) || undefined });
      if (!r.ok) return r;
      await audit("belege.eigenbeleg", { entity: "Beleg", entityId: r.id, details: { nummer: r.nummer }, actor: OPS_ACTOR });
      return { ok: true, info: `Eigenbeleg ${r.nummer} erstellt und zugeordnet.` };
    },
  },
  monatspaket_senden: {
    beschreibung: "Monatspaket (Belege als ZIP, Liste, USt-Vorschau) eines abgeschlossenen Monats an das Steuerbüro senden, Antworten an Ole (nur auf Oles Anweisung)",
    felder: { monat: "YYYY-MM, höchstens der Vormonat", erneut: "optional true: auch wenn schon gesendet", antwortAn: "optional: Adresse für Antworten (sonst ADMIN_EMAIL)" },
    run: async (p) => {
      const monat = text(p.monat, 7);
      const { paketSenden, vormonat } = await import("@/lib/belege/monatspaket");
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monat) || monat > vormonat()) return { ok: false, error: "Monat ungültig oder noch nicht abgeschlossen." };
      const alt = await prisma.monatsPaket.findUnique({ where: { monat }, select: { gesendetAm: true } });
      if (alt?.gesendetAm && p.erneut !== true) return { ok: false, error: `Schon gesendet am ${alt.gesendetAm.toISOString().slice(0, 10)} (erneut: true zum nochmal Senden).` };
      const antwort = text(p.antwortAn, 120);
      if (antwort && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(antwort)) return { ok: false, error: "Antwortadresse ungültig." };
      const r = await paketSenden(monat, { antwortAn: antwort || process.env.ADMIN_EMAIL?.trim() || null });
      await audit("belege.monatspaket", { details: { monat, ok: r.ok, ...(r.ok ? { anzahl: r.anzahl } : { error: r.error }) }, actor: OPS_ACTOR });
      return r.ok ? { ok: true, info: `Monatspaket ${monat} mit ${r.anzahl} Belegen gesendet (Download-Link).` } : r;
    },
  },
  belege_nachtrag_senden: {
    beschreibung: "Nachtrag ans Steuerbüro: genau diese Belege als Download-Link (z. B. fehlende Belege zu schon gebuchten Monaten), nur auf Oles Anweisung",
    felder: { belegIds: "Liste der Beleg-IDs (diagnose q=belege&liste=belege)", titel: "z. B. Nachtrag Januar bis Juli 2026", antwortAn: "optional: Adresse für Antworten", hinweis: "optional: Satz für die Mail" },
    run: async (p) => {
      const ids = Array.isArray(p.belegIds) ? [...new Set(p.belegIds.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length < 40))] : [];
      const titel = text(p.titel, 80);
      if (!ids.length || ids.length > 1000 || titel.length < 3) return { ok: false, error: "belegIds (1 bis 1000) und titel nötig." };
      const antwort = text(p.antwortAn, 120);
      if (antwort && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(antwort)) return { ok: false, error: "Antwortadresse ungültig." };
      const { nachtragSenden } = await import("@/lib/belege/monatspaket");
      const r = await nachtragSenden(ids, { titel, antwortAn: antwort || process.env.ADMIN_EMAIL?.trim() || null, hinweis: text(p.hinweis, 300) || undefined });
      await audit("belege.nachtrag", { details: { titel, anzahl: ids.length, ok: r.ok }, actor: OPS_ACTOR });
      return r.ok ? { ok: true, info: `Nachtrag „${titel}“ mit ${r.anzahl} Belegen gesendet (Download-Link).` } : r;
    },
  },
  umsatz_nachtragen: {
    beschreibung: "Umsatz (netto) für einen Monat nachtragen, z. B. Monate vor dem Pay-per-Lead-Start ohne Umsatzbuch (BWA), nur auf Oles Anweisung",
    felder: { monat: "YYYY-MM", betragNetto: "Netto in €", customerId: "optional: Kunden-ID", art: "setup | betreuung | sonstiges", notiz: "Herkunft, z. B. Rechnung R-00070" },
    run: async (p) => {
      const monat = text(p.monat, 7);
      const betrag = zahl(p.betragNetto);
      const art = text(p.art, 20) || "sonstiges";
      const notiz = text(p.notiz, 300);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monat) || !(betrag > 0) || betrag > 1_000_000 || notiz.length < 3) return { ok: false, error: "Monat, Betrag (netto > 0) und Notiz nötig." };
      if (!["setup", "betreuung", "sonstiges"].includes(art)) return { ok: false, error: "art: setup | betreuung | sonstiges" };
      const c = await kunde(text(p.customerId, 40));
      if (text(p.customerId, 40) && !c) return { ok: false, error: "Kunde nicht gefunden." };
      // Arten wie im Admin (Zahlen → Nachtrag): „setup“ (Einrichtung) oder „other“ (Sonstiges); Betreuung steht in der Notiz
      const m = await prisma.manualRevenue.create({ data: { month: monat, customerId: c?.id ?? null, amount: Math.round(betrag * 100) / 100, kind: art === "setup" ? "setup" : "other", note: art === "betreuung" ? `Betreuung: ${notiz}` : notiz, createdBy: OPS_ACTOR.email } });
      await audit("kpi.nachtrag", { entity: "ManualRevenue", entityId: m.id, customerId: c?.id ?? null, details: { monat, betrag, art, notiz }, actor: OPS_ACTOR });
      return { ok: true, info: `${monat}: ${betrag.toFixed(2)} € netto${c ? ` (${c.name})` : ""} nachgetragen.`, daten: { id: m.id } };
    },
  },
  bank_buchung_zuordnen: {
    beschreibung: "Eine einzelne Bankbuchung einer Kostenart zuordnen (ppl, software, ki, akquise, betrieb, ignore), ohne Regel",
    felder: { umsatzId: "ID der Buchung (diagnose q=bwa&liste=neu)", kostenart: "ppl | software | ki | akquise | betrieb | ignore", inklUst: "true, wenn der Betrag deutsche USt enthält" },
    run: async (p) => {
      const { COST_ACTIONS } = await import("@/lib/bank/rules");
      const aktion = text(p.kostenart, 20) as (typeof COST_ACTIONS)[number];
      if (!(COST_ACTIONS as readonly string[]).includes(aktion)) return { ok: false, error: "Kostenart ungültig." };
      const tx = await prisma.bankTransaction.findUnique({ where: { id: text(p.umsatzId, 40) }, select: { id: true, counterparty: true, amount: true } });
      if (!tx) return { ok: false, error: "Buchung nicht gefunden." };
      const { assignTransaction } = await import("@/lib/bank/server");
      await assignTransaction(tx.id, aktion, { vatIncluded: p.inklUst === true });
      await audit("bank.zuordnen", { details: { umsatzId: tx.id, aktion, inklUst: p.inklUst === true }, actor: OPS_ACTOR });
      return { ok: true, info: `${tx.counterparty ?? "Buchung"} ${Number(tx.amount).toFixed(2)} € → ${aktion}.` };
    },
  },
  ausgangsrechnungen_import: {
    beschreibung: "Ausgangsrechnungen aus dem Papierkram-CSV-Export übernehmen (gleiche Nummer = aktualisieren, Entwürfe nicht); die BWA zählt den Umsatz dann nach Rechnungen",
    felder: { csv: "Inhalt der Papierkram-Datei rechnungen.csv" },
    run: async (p) => {
      const csv = typeof p.csv === "string" ? p.csv : "";
      if (csv.length < 20 || csv.length > 2_000_000) return { ok: false, error: "csv fehlt oder ist zu groß." };
      const { importAusgangsrechnungen, parsePapierkramCsv } = await import("@/lib/ausgangsrechnungen");
      let zeilen;
      try {
        zeilen = parsePapierkramCsv(csv);
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "CSV nicht lesbar." };
      }
      const r = await importAusgangsrechnungen(zeilen);
      await audit("bwa.rechnungen_import", { details: { zeilen: zeilen.length, ...r }, actor: OPS_ACTOR });
      return { ok: true, info: `${zeilen.length} Rechnungen: ${r.neu} neu, ${r.aktualisiert} aktualisiert.` };
    },
  },
  ausgangsrechnung_bereich: {
    beschreibung: "Geschäftsbereich von Ausgangsrechnungen für die BWA festlegen (funnel, ppl, software, sonstiges; leer = Vorschlag)",
    felder: { nummern: "Rechnungsnummern (Liste)", bereich: "funnel | ppl | software | sonstiges | leer" },
    run: async (p) => {
      const { istBereich } = await import("@/lib/ausgangsrechnungen");
      const nummern = Array.isArray(p.nummern) ? p.nummern.filter((x): x is string => typeof x === "string").slice(0, 500) : [];
      const bereich = p.bereich === "" || p.bereich == null ? null : p.bereich;
      if (!nummern.length) return { ok: false, error: "nummern fehlt." };
      if (bereich !== null && !istBereich(bereich)) return { ok: false, error: "bereich muss funnel, ppl, software oder sonstiges sein." };
      const r = await prisma.ausgangsrechnung.updateMany({ where: { nummer: { in: nummern } }, data: { bereich } });
      await audit("bwa.rechnung_bereich", { details: { nummern, bereich }, actor: OPS_ACTOR });
      return { ok: true, info: `${r.count} von ${nummern.length} Rechnungen auf ${bereich ?? "Vorschlag"} gesetzt.` };
    },
  },
  allianz_termin_art: {
    beschreibung: "Allianz-Online-Kalender eines Kunden auf eine andere Termin-Art bzw. Person umstellen (wie im Admin unter Kalender), nur auf Oles Anweisung",
    felder: { customerId: "Kunden-ID", terminArt: "Name der Termin-Art, z. B. Online-Beratung", person: "Name der Person oder „alle“" },
    run: async (p) => {
      const customerId = text(p.customerId, 40);
      const { decodeAllianzCalendar } = await import("@/lib/calendar/allianz-online");
      const agent = await prisma.agentConfig.findUnique({ where: { customerId }, select: { allianzCalendarEnc: true } });
      const cal = decodeAllianzCalendar(agent?.allianzCalendarEnc);
      if (!cal) return { ok: false, error: "Kein Allianz-Online-Kalender verbunden." };
      const t = cal.templates.find((x) => x.name.toLowerCase() === text(p.terminArt, 120).toLowerCase());
      if (!t) return { ok: false, error: `Termin-Art unbekannt. Möglich: ${cal.templates.map((x) => x.name).join(", ")}` };
      const personName = text(p.person, 120).toLowerCase();
      const r = personName === "alle" || !personName ? null : cal.resources.find((x) => x.name.toLowerCase() === personName);
      if (r === undefined) return { ok: false, error: `Person unbekannt. Möglich: alle, ${cal.resources.map((x) => x.name).join(", ")}` };
      const { changeAllianz } = await import("@/lib/calendar/sources");
      const res = await changeAllianz(customerId, t.id, r?.id ?? null);
      if (res.error) return { ok: false, error: res.error };
      await audit("calendar.allianz_termin_art", { customerId, details: { terminArt: t.name, person: r?.name ?? "alle" }, actor: OPS_ACTOR });
      return { ok: true, info: `${res.info ?? "Umgestellt."} Person: ${r?.name ?? "alle"}.` };
    },
  },
  ausgangsrechnung_storniert: {
    beschreibung: "Ausgangsrechnung als storniert markieren, zählt dann nicht mehr in der BWA (nur auf Oles Anweisung; die Stornorechnung in Papierkram bleibt nötig, der nächste Import überschreibt den Status)",
    felder: { nummer: "Rechnungsnummer, z. B. R-00089", grund: "kurz, z. B. Auftrag nie zustande gekommen" },
    run: async (p) => {
      const nummer = text(p.nummer, 40);
      const grund = text(p.grund, 200);
      if (!nummer || grund.length < 3) return { ok: false, error: "nummer und grund nötig." };
      const r = await prisma.ausgangsrechnung.findUnique({ where: { nummer }, select: { id: true, status: true, notiz: true } });
      if (!r) return { ok: false, error: "Rechnung nicht gefunden." };
      await prisma.ausgangsrechnung.update({ where: { id: r.id }, data: { status: "storniert", notiz: [r.notiz, `Storniert (Ole): ${grund}`].filter(Boolean).join(" · ").slice(0, 500) } });
      await audit("bwa.rechnung_storniert", { details: { nummer, vorher: r.status, grund }, actor: OPS_ACTOR });
      return { ok: true, info: `${nummer} storniert (vorher „${r.status}“).` };
    },
  },
  umsatz_nachtrag_loeschen: {
    beschreibung: "Einen von Claude angelegten Umsatz-Nachtrag (ManualRevenue) wieder löschen",
    felder: { id: "ID des Nachtrags (Ergebnis von umsatz_nachtragen)" },
    run: async (p) => {
      const row = await prisma.manualRevenue.findUnique({ where: { id: text(p.id, 40) } });
      if (!row) return { ok: false, error: "Nachtrag nicht gefunden." };
      if (row.createdBy !== OPS_ACTOR.email) return { ok: false, error: "Nur eigene Nachträge (von Claude angelegt) löschen." };
      await prisma.manualRevenue.delete({ where: { id: row.id } });
      await audit("kpi.nachtrag", { entity: "ManualRevenue", entityId: row.id, customerId: row.customerId, details: { deleted: true, month: row.month, amount: Number(row.amount) }, actor: OPS_ACTOR });
      return { ok: true, info: `Nachtrag ${row.month} über ${Number(row.amount).toFixed(2)} € gelöscht.` };
    },
  },
  belege_stripe: {
    beschreibung: "Ausgangsrechnungen und Gutschriften aus Stripe jetzt als Belege übernehmen (sonst nachts)",
    felder: {},
    run: async () => {
      const r = await (await import("@/lib/belege/stripe")).syncStripeBelege();
      return { ok: true, info: `Stripe: ${r.rechnungen} Rechnungen, ${r.gutschriften} Gutschriften, ${r.neu} neu als Beleg.` };
    },
  },
  belege_postfach: {
    beschreibung: "Mails an die Beleg-Adresse jetzt bei Resend abholen und als Belege ablegen (sonst alle 15 Minuten); erneut=true verarbeitet Mails ohne Ergebnis noch einmal",
    felder: { erneut: "optional true" },
    run: async (p) => {
      const r = await (await import("@/lib/belege/eingang")).belegePostfachAbholen({ erneut: text(p.erneut) === "true" });
      return { ok: true, info: `${r.gesehen} Mails an die Beleg-Adresse, ${r.verarbeitet} neu verarbeitet.` };
    },
  },
  belege_abgleichen: {
    beschreibung: "Belege jetzt aus GetMyInvoices holen und eindeutig passenden Kontoumsätzen zuordnen (sonst nachts automatisch)",
    felder: {},
    run: async () => {
      const r = await (await import("@/lib/belege/server")).syncBelege();
      await audit("belege.abgleich", { details: { ...r }, actor: OPS_ACTOR });
      if (r.fehler) return { ok: false, error: r.fehler };
      return { ok: true, info: `${r.geholt} Belege geholt (${r.neu} neu), ${r.zugeordnet} neu zugeordnet.` };
    },
  },
  app_demo_neu_anlegen: {
    beschreibung: "Beispieldaten der App-Demo (und des App-Store-Prüferzugangs) sofort neu anlegen, nur in der Demo-Datenbank (sonst nachts)",
    felder: {},
    run: async () => {
      const r = await (await import("@/lib/app-demo/seed")).appDemoNeuAnlegenEinmal(new Date());
      await audit("app_demo.neu_angelegt", { details: { ...r }, actor: OPS_ACTOR });
      return r.ok ? { ok: true, info: `App-Demo neu angelegt (${r.leads} Leads, ${r.dauerMs} ms).` } : { ok: false, error: r.grund };
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
  bank_regel: {
    beschreibung: "Zuordnungsregel für Kontoumsätze anlegen oder ändern (Muster in Gegenpartei/Verwendungszweck → Kostenart oder ignore, z. B. Darlehenstilgung); wirkt auf offene und künftige Umsätze",
    felder: { muster: "Teil der Gegenpartei, z. B. rafael frenk", kostenart: "ppl | software | ki | akquise | betrieb | ignore", label: "Bezeichnung, z. B. Darlehen Rafael Frenk (Tilgung)" },
    run: async (p) => {
      const muster = text(p.muster, 80).toLowerCase();
      const { COST_ACTIONS } = await import("@/lib/bank/rules");
      const aktion = text(p.kostenart, 20) as (typeof COST_ACTIONS)[number];
      if (muster.length < 3 || !(COST_ACTIONS as readonly string[]).includes(aktion)) return { ok: false, error: "Muster oder Kostenart ungültig." };
      const label = text(p.label, 120) || null;
      const rule = await prisma.costRule.upsert({ where: { pattern: muster }, create: { pattern: muster, action: aktion, label, counterpartyOnly: true }, update: { action: aktion, label, counterpartyOnly: true } });
      const { applyRuleToOpen } = await import("@/lib/bank/server");
      const n = await applyRuleToOpen(rule.id);
      await audit("bank.regel", { details: { muster, aktion, angewendet: n }, actor: OPS_ACTOR });
      return { ok: true, info: `Regel „${muster}“ → ${aktion} gespeichert, auf ${n} offene Umsätze angewendet.` };
    },
  },
  bank_regel_ust: {
    beschreibung:
      "USt-Einstellung einer Bankregel ändern (inkl. 19 % USt bzw. ohne) und alle schon zugeordneten Buchungen dieser Regel neu rechnen; Kostenart und Status bleiben. vorschau=true rechnet nur. Standardregel ohne DB-Regel wird mit gleichem Muster angelegt.",
    felder: { muster: "Regel-Muster wie gespeichert oder eindeutiger Teil davon (q=bank-regeln)", inklUst: "true = Betrag enthält 19 % USt, false = ohne", vorschau: "true = nur rechnen, nichts ändern" },
    run: async (p) => {
      if (typeof p.inklUst !== "boolean" && p.inklUst !== "true" && p.inklUst !== "false") return { ok: false, error: "inklUst: true oder false." };
      const inklUst = p.inklUst === true || p.inklUst === "true";
      const vorschau = p.vorschau === true || p.vorschau === "true";
      const { regelUstSetzen } = await import("@/lib/bank/regel-ust");
      const r = await regelUstSetzen({ muster: text(p.muster, 80), inklUst, vorschau });
      if (!r.ok) return r;
      const e = r.ergebnis;
      if (!vorschau) {
        await audit("bank.regel_ust", {
          entity: "CostRule",
          entityId: e.regel.id,
          details: { muster: e.regel.muster, inklUst: { from: e.regel.inklUstVorher, to: inklUst }, buchungen: e.buchungen, geaendert: e.geaendert, nettoVorher: e.nettoVorher, nettoNachher: e.nettoNachher, angelegt: e.regel.angelegt },
          actor: OPS_ACTOR,
        });
      }
      return {
        ok: true,
        info: `${vorschau ? "Vorschau" : "Gespeichert"}: Regel „${e.regel.muster}“ ${inklUst ? "inkl. USt" : "ohne USt"}, ${e.buchungen} Buchungen, netto ${e.nettoVorher.toFixed(2)} → ${e.nettoNachher.toFixed(2)} € (2026: ${e.jahr2026.nettoVorher.toFixed(2)} → ${e.jahr2026.nettoNachher.toFixed(2)} €).`,
        daten: e,
      };
    },
  },
  bank_ruecklastschriften_verrechnen: {
    beschreibung:
      "Rücklastschriften (Gutschrift mit „Rückgabegrund“) mit ihrer Lastschrift gleicher End-to-End-Referenz verrechnen: beide „ignoriert“ (zurückgegeben bzw. Rücklastschrift), zählen nicht als Kosten. vorschau=true rechnet nur. Rückgabe-Entgelte der Bank bleiben Kosten.",
    felder: { vorschau: "true = nur rechnen, nichts ändern" },
    run: async (p) => {
      const vorschau = p.vorschau === true || p.vorschau === "true";
      const { ruecklastschriftenVerrechnen } = await import("@/lib/bank/ruecklastschriften");
      const r = await ruecklastschriftenVerrechnen({ vorschau });
      if (!vorschau) await audit("bank.ruecklastschriften", { details: { paare: r.paare, neu: r.neuVerrechnet, ohneLastschrift: r.ohneLastschrift, brutto: r.summeBrutto, nettoBisher: r.summeNettoBisher }, actor: OPS_ACTOR });
      return {
        ok: true,
        info: `${vorschau ? "Vorschau" : "Verrechnet"}: ${r.paare} Paare (${r.neuVerrechnet} neu), ${r.ohneLastschrift} ohne Lastschrift, ${r.summeBrutto.toFixed(2)} € brutto, bisher als Kosten ${r.summeNettoBisher.toFixed(2)} € netto.`,
        daten: r,
      };
    },
  },
  bank_zuordnen: {
    beschreibung: "Importierte Umsätze eines CSV-Kontos (z. B. n26) nach Gegenpartei einer Kostenart zuordnen: ppl, software, ki, akquise, betrieb oder ignore; legt keine Regel an",
    felder: { konto: "Kurzname, z. B. n26", muster: "Teil der Gegenpartei, z. B. outbrain", kostenart: "ppl | software | ki | akquise | betrieb | ignore" },
    run: async (p) => {
      const konto = text(p.konto, 30).toLowerCase();
      const muster = text(p.muster, 60);
      const { COST_ACTIONS } = await import("@/lib/bank/rules");
      const aktion = text(p.kostenart, 20) as (typeof COST_ACTIONS)[number];
      if (!/^[a-z0-9]{2,30}$/.test(konto) || muster.length < 2 || !(COST_ACTIONS as readonly string[]).includes(aktion)) return { ok: false, error: "Konto, Muster oder Kostenart ungültig." };
      const rows = await prisma.bankTransaction.findMany({ where: { accountKey: `csv:${konto}`, counterparty: { contains: muster, mode: "insensitive" } }, select: { id: true } });
      if (!rows.length) return { ok: false, error: "Keine passenden Umsätze." };
      const { assignTransaction } = await import("@/lib/bank/server");
      for (const r of rows) await assignTransaction(r.id, aktion, {});
      await audit("bank.zuordnen", { details: { konto, muster, aktion, anzahl: rows.length }, actor: OPS_ACTOR });
      return { ok: true, info: `${rows.length} Umsätze (${muster}) → ${aktion}.` };
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
  buchung_vorbereitung_nachsenden: {
    beschreibung:
      "Einmalig die neue Terminbestätigung mit der Frage nach der Vorbereitung (Vorlage booking_confirmation ab v5, Knöpfe „Ja, gern“/„Lieber im Termin“) an einen Lead mit kommendem Termin nachschicken, z. B. wenn er nach einer Online-Buchung nur die alte Bestätigung ohne Frage bekam. Ohne freigegebene v5 wird nichts gesendet. vorschau=true: nur prüfen.",
    felder: { customerId: "Kunden-ID", name: "Teil des Lead-Namens (oder leadId)", leadId: "optional statt name", vorschau: "true = nur prüfen, nichts senden" },
    run: async (p) => {
      const customerId = text(p.customerId);
      const leadId = text(p.leadId);
      const name = text(p.name);
      if (!leadId && name.length < 3) return { ok: false, error: "leadId oder Name (mind. 3 Zeichen) angeben." };
      const leads = await prisma.lead.findMany({
        where: { customerId, erasedAt: null, ...(leadId ? { id: leadId } : { name: { contains: name, mode: "insensitive" } }) },
        select: { id: true, name: true, phone: true },
        take: 3,
      });
      if (leads.length !== 1) return { ok: false, error: `${leads.length} passende Leads, bitte genauer.` };
      const r = await (await import("@/lib/whatsapp/termin-strecke")).vorbereitungNachsenden(leads[0].id, { vorschau: text(p.vorschau) === "true" });
      if (r.gesendet) await audit("lead.vorbereitung_nachgesendet", { entity: "Lead", entityId: leads[0].id, details: { termin: r.termin, vorlage: r.vorlage }, actor: OPS_ACTOR });
      return r.gesendet || (r.vorschau && r.wuerdeSenden) ? { ok: true, info: r.info, daten: r } : { ok: false, error: r.info };
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
  strecke_starten: {
    beschreibung: "Mail- bzw. SMS-Strecke für einen Lead ohne WhatsApp nachträglich starten (Auslöser kein_whatsapp), Lead über Kunde und Namen",
    felder: { customerId: "Kunden-ID", name: "Teil des Lead-Namens" },
    run: async (p) => {
      const name = text(p.name);
      if (name.length < 3) return { ok: false, error: "Name zu kurz." };
      const leads = await prisma.lead.findMany({ where: { customerId: text(p.customerId), name: { contains: name, mode: "insensitive" } }, select: { id: true, waUnavailableAt: true }, take: 3 });
      if (leads.length !== 1) return { ok: false, error: `${leads.length} passende Leads, bitte genauer.` };
      if (!leads[0].waUnavailableAt) return { ok: false, error: "Lead ist nicht als „kein WhatsApp“ markiert." };
      const r = await (await import("@/lib/mail-strecke/server")).starteMailStrecke(leads[0].id, "kein_whatsapp");
      await audit("lead.strecke_start", { entity: "Lead", entityId: leads[0].id, details: { ergebnis: r.ergebnis }, actor: OPS_ACTOR });
      return r.ergebnis === "gestartet" || r.ergebnis === "schon" ? { ok: true, info: JSON.stringify(r) } : { ok: false, error: JSON.stringify(r) };
    },
  },
  vertrieb_nummern_aus_verlauf: {
    beschreibung:
      "Telefonnummern aus dem Verlauf der Vertriebskontakte (Buchungsnotizen, Anrufnotizen, Importe, Antworten) als weitere Nummer übernehmen (Herkunft „aus Verlauf“, Verlaufseintrag „Neue Telefonnummer erkannt“). Ohne speichern=true nur Probelauf mit Zahlen und Beispielen.",
    felder: { speichern: "true = übernehmen, sonst nur Probelauf", contactId: "optional: nur dieser Vertriebskontakt" },
    run: async (p) => {
      const speichern = text(p.speichern) === "true";
      const id = text(p.contactId, 40);
      const { backfillPhonesFromHistory } = await import("@/lib/vertrieb/kontaktdaten-server");
      const r = await backfillPhonesFromHistory({ dryRun: !speichern, contactIds: id ? [id] : undefined });
      if (speichern) await audit("vertrieb.nummern_aus_verlauf", { entity: "SalesContact", details: { kontakte: r.contacts, eintraege: r.entries, nummern: r.phones }, actor: OPS_ACTOR });
      return {
        ok: true,
        info: `${speichern ? "Übernommen" : "Probelauf"}: ${r.contacts} Kontakte mit möglicher Nummer im Verlauf, ${r.entries} Einträge mit Nummer, ${r.phones} neue Nummer${r.phones === 1 ? "" : "n"}${speichern ? "" : " (nichts gespeichert)"}.`,
        daten: r.examples,
      };
    },
  },
  vertrieb_zentrale_nummern: {
    beschreibung:
      "Zentralen und Sammelnummern von Versicherern (z. B. SIGNAL IDUNA 0231 135-0, 040 4124-0, oder Festnetznummern bei mindestens 3 Kontakten) aus den automatisch erkannten weiteren Nummern der Vertriebskontakte entfernen (nur Herkunft „aus E-Mail“ und „aus Verlauf“, nie von Hand; Hauptnummer nur, wenn sie automatisch gesetzt wurde und eine andere Nummer da ist). Entfernte Nummern werden nicht wieder übernommen, Verlaufseintrag „Zentrale Nummer entfernt“. Ohne speichern=true nur Probelauf mit Zahlen und Beispielen.",
    felder: { speichern: "true = entfernen, sonst nur Probelauf", contactId: "optional: nur dieser Vertriebskontakt" },
    run: async (p) => {
      const speichern = text(p.speichern) === "true";
      const id = text(p.contactId, 40);
      const { removeSharedPhones } = await import("@/lib/vertrieb/kontaktdaten-server");
      const r = await removeSharedPhones({ dryRun: !speichern, contactIds: id ? [id] : undefined });
      if (speichern) {
        await audit("vertrieb.zentrale_nummern", {
          entity: "SalesContact",
          details: { kontakte: r.contacts, weitere: r.extrasRemoved, haupt: r.mainReplaced, nummern: r.sharedNumbers.slice(0, 30) },
          actor: OPS_ACTOR,
        });
      }
      return {
        ok: true,
        info: `${speichern ? "Entfernt" : "Probelauf"}: ${r.sharedNumbers.length} Zentral-/Sammelnummern, ${r.contacts} Kontakte, ${r.extrasRemoved} weitere Nummern, ${r.mainReplaced} Hauptnummern ersetzt (${r.mainKept} Hauptnummern bleiben: von Hand oder keine andere Nummer)${speichern ? "" : " (nichts gespeichert)"}.`,
        daten: { nummern: r.sharedNumbers.slice(0, 40), beispiele: r.examples },
      };
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
