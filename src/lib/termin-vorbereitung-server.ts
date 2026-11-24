// Terminvorbereitung laden (Datenbank), siehe lib/termin-vorbereitung.ts.

import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { angebotOhneGesundheitsdaten, angeboteAuslesen, bausteinSchalten, cleanAngebote, paketWaehlen, sparteSchalten, tarifWaehlen, type AngeboteDaten } from "@/lib/angebote";
import { entscheidungsPakete, folien, markeFuer, paketName, praesentationCss } from "@/lib/praesentation";
import { beitragAus, beitragEffektiv } from "@/lib/angebote-daten";
import { praesentationsVariante } from "@/lib/praesentation-variante-server";
import { zusageAm } from "@/lib/praesentation-messung";
import { asAnsprache } from "@/lib/ansprache";
import { logoDataUri } from "@/lib/branding-logo";
import { appointmentScope, type TeamCtx } from "@/lib/team";
import { displayProduct } from "@/lib/products";
import { currentStammdaten } from "@/lib/lead-stammdaten";
import { personFromCustomerName } from "@/lib/advisor-name";
import { abschnitte, offenePunkte, VORBEREITUNG_VORLAUF_MS, type VorbereitungDaten } from "@/lib/termin-vorbereitung";

const formAnswers = (raw: unknown): { label: string; value: string }[] =>
  Array.isArray(raw)
    ? raw.flatMap((x) =>
        x && typeof x === "object" && typeof (x as { label?: unknown }).label === "string" && typeof (x as { value?: unknown }).value === "string" && (x as { value: string }).value.trim()
          ? [{ label: (x as { label: string }).label, value: (x as { value: string }).value }]
          : [],
      )
    : [];

/** Daten für Seite und PDF; null, wenn der Termin nicht in den Sichtbereich dieses Logins gehört. */
export async function loadVorbereitung(appointmentId: string, ctx: TeamCtx): Promise<(VorbereitungDaten & { id: string; leadId: string | null }) | null> {
  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, ...appointmentScope(ctx) },
    select: {
      id: true,
      leadId: true,
      conversationId: true,
      startsAt: true,
      mode: true,
      meetUrl: true,
      calendarKey: true,
      preparedAt: true,
      confirmedAt: true,
      komplettcheck: true,
      customer: { select: { name: true } },
      lead: { select: { name: true, phone: true, email: true, source: true, formData: true, contactOverrides: true, assignedUserId: true, vorvertraege: true } },
    },
  });
  if (!appt) return null;
  const conv = appt.conversationId
    ? await prisma.conversation.findUnique({ where: { id: appt.conversationId }, select: { qualificationSummary: true, qualificationData: true, contactName: true, contactPhone: true } })
    : appt.leadId
      ? await prisma.conversation.findFirst({ where: { leadId: appt.leadId }, orderBy: { lastMessageAt: "desc" }, select: { qualificationSummary: true, qualificationData: true, contactName: true, contactPhone: true } })
      : null;
  const beraterId = appt.calendarKey?.startsWith("user:") ? appt.calendarKey.slice(5) : appt.lead?.assignedUserId ?? null;
  const berater = beraterId ? (await prisma.user.findUnique({ where: { id: beraterId }, select: { displayName: true } }))?.displayName : null;
  const st = appt.lead ? currentStammdaten({ ...appt.lead }) : null;
  const adresse = st ? [st.street, [st.zip, st.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null : null;
  return {
    id: appt.id,
    leadId: appt.leadId,
    lead: {
      name: appt.lead?.name ?? conv?.contactName ?? "Kontakt",
      telefon: appt.lead?.phone ?? conv?.contactPhone ?? null,
      email: appt.lead?.email ?? null,
      adresse,
      produkt: appt.lead?.source ? displayProduct(appt.lead.source) : "Beratung",
    },
    termin: { startsAt: appt.startsAt, mode: appt.mode, berater: berater || personFromCustomerName(appt.customer.name), meetUrl: appt.meetUrl },
    zusammenfassung: conv?.qualificationSummary ?? null,
    formular: formAnswers(appt.lead?.formData),
    angaben: conv?.qualificationData ?? null,
    vorbereitetAm: appt.preparedAt,
    zugesagtAm: appt.confirmedAt ?? null,
    komplettcheck: appt.komplettcheck ?? null,
    vorvertraege: appt.lead?.vorvertraege ?? null,
  };
}

export type VorbereitungAufgabe = { id: string; leadId: string | null; name: string; produkt: string; startsAt: Date; mode: string; offen: number; heute: boolean };

/** Aufgaben „Termin vorbereiten“: gebuchte Termine in den nächsten 36 Std., noch nicht als vorbereitet abgehakt. */
export async function listVorbereitungen(ctx: TeamCtx, now = new Date()): Promise<VorbereitungAufgabe[]> {
  const appts = await prisma.appointment.findMany({
    where: { ...appointmentScope(ctx), status: "booked", preparedAt: null, startsAt: { gt: now, lte: new Date(now.getTime() + VORBEREITUNG_VORLAUF_MS) } },
    orderBy: { startsAt: "asc" },
    take: 20,
    select: { id: true },
  });
  const day = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short" }).format(d);
  const out: VorbereitungAufgabe[] = [];
  for (const a of appts) {
    const d = await loadVorbereitung(a.id, ctx);
    if (!d) continue;
    out.push({
      id: d.id,
      leadId: d.leadId,
      name: d.lead.name,
      produkt: d.lead.produkt,
      startsAt: d.termin.startsAt,
      mode: d.termin.mode,
      offen: offenePunkte(abschnitte(d)).length,
      heute: day(d.termin.startsAt) === day(now),
    });
  }
  return out;
}

/** Als vorbereitet abhaken bzw. zurücknehmen. */
export async function setPrepared(appointmentId: string, ctx: TeamCtx & { userId?: string | null }, prepared: boolean): Promise<boolean> {
  const n = await prisma.appointment.updateMany({
    where: { id: appointmentId, ...appointmentScope(ctx) },
    data: prepared ? { preparedAt: new Date(), preparedById: ctx.userId ?? null } : { preparedAt: null, preparedById: null },
  });
  return n.count > 0;
}

// ─── Angebote zum Termin (lib/angebote.ts) ─────────────────────────────────

/**
 * Angebote auslesen (freigeschaltet 15.11.2026, docs/datenschutz.md): nur für Produkte ohne Gesundheitsangaben
 * (angebotOhneGesundheitsdaten); Notschalter ANGEBOTE_AUSLESEN=0 sperrt es für alle außer Testkunden.
 */
export async function angeboteAuslesenErlaubt(customerId: string, produkt: string | null | undefined): Promise<boolean> {
  if (!angebotOhneGesundheitsdaten(produkt)) return false;
  if (process.env.ANGEBOTE_AUSLESEN !== "0") return true;
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { isTest: true } });
  return !!c?.isTest;
}

export async function loadAngebote(appointmentId: string, ctx: TeamCtx) {
  const a = await prisma.appointment.findFirst({
    where: { id: appointmentId, ...appointmentScope(ctx) },
    select: { offersJson: true, offersConfirmedAt: true, leadId: true },
  });
  if (!a) return null;
  const dateien = a.leadId
    ? await prisma.leadFile.findMany({ where: { leadId: a.leadId, kind: "angebot" }, orderBy: { createdAt: "desc" }, select: { id: true, fileName: true } })
    : [];
  return { angebote: cleanAngebote(a.offersJson), bestaetigt: a.offersConfirmedAt, dateien };
}

/** Angebote aus den hochgeladenen Dateien („Angebot“) des Leads auslesen und unbestätigt speichern. */
export async function auslesenUndSpeichern(appointmentId: string, ctx: TeamCtx): Promise<{ ok: true; anzahl: number } | { ok: false; error: string }> {
  const a = await prisma.appointment.findFirst({ where: { id: appointmentId, ...appointmentScope(ctx) }, select: { leadId: true, lead: { select: { source: true } } } });
  if (!a?.leadId) return { ok: false, error: "Termin nicht gefunden." };
  if (!(await angeboteAuslesenErlaubt(ctx.customerId, a.lead?.source)))
    return { ok: false, error: "Für dieses Produkt lesen wir Angebote nicht automatisch aus, weil sie Gesundheitsangaben enthalten können. Bitte tragen Sie die Angebote von Hand ein." };
  const files = await prisma.leadFile.findMany({ where: { leadId: a.leadId, kind: "angebot" }, orderBy: { createdAt: "desc" }, take: 5, select: { fileName: true, contentType: true, data: true } });
  const res = await angeboteAuslesen(
    files.map((f) => ({ fileName: f.fileName, contentType: f.contentType, data: new Uint8Array(f.data) })),
    { customerId: ctx.customerId, appointmentId, userId: ctx.userId, weg: "angebote" },
  );
  // Fehler oder Gesundheitssparte erkannt: nichts speichern, offersJson bleibt wie es war
  if ("error" in res) return { ok: false, error: res.error };
  await prisma.appointment.update({ where: { id: appointmentId }, // Tarifauswahl der neuen Terminvorbereitung gilt dann nicht mehr (ältere Angebote werden wieder gelesen)
    data: { offersJson: res as unknown as Prisma.InputJsonValue, offersConfirmedAt: null, tarifauswahl: Prisma.DbNull } });
  return { ok: true, anzahl: res.items.length };
}

/** Angebote speichern (geprüft vom Berater); bestaetigen = für die Präsentation freigeben. */
export async function angeboteSpeichern(appointmentId: string, ctx: TeamCtx, raw: unknown, bestaetigen: boolean): Promise<boolean> {
  const d = cleanAngebote(raw);
  const n = await prisma.appointment.updateMany({
    where: { id: appointmentId, ...appointmentScope(ctx) },
    data: { offersJson: d as unknown as Prisma.InputJsonValue, offersConfirmedAt: bestaetigen && d.items.length ? new Date() : null, tarifauswahl: Prisma.DbNull },
  });
  return n.count > 0;
}

/** Daten für die Präsentation: Termin, bestätigte Angebote, Marke des Kunden. */
export async function loadPraesentation(appointmentId: string, ctx: TeamCtx) {
  const d = await loadVorbereitung(appointmentId, ctx);
  if (!d) return null;
  const [ang, kunde] = await Promise.all([
    loadAngebote(appointmentId, ctx),
    prisma.customer.findUnique({
      where: { id: ctx.customerId },
      select: {
        name: true,
        vermittlerTyp: true,
        maklerMarkthinweis: true,
        leadAddress: true,
        brandLogo: true,
        brandLogoType: true,
        brandLogoConfirmedAt: true,
        tarifGesellschaften: true,
        erstinformation: { select: { firma: true, name: true, bestaetigtAt: true } },
      },
    }),
  ]);
  const logo = kunde?.brandLogo && kunde.brandLogoType && kunde.brandLogoConfirmedAt ? logoDataUri(new Uint8Array(kunde.brandLogo), kunde.brandLogoType) : null;
  // Absender für Endkunden (Go-live-Prüfung 19.11.2026, W7): bestätigte Firma bzw. Name aus der Erstinformation, sonst Kundenname
  const ei = kunde?.erstinformation?.bestaetigtAt ? kunde.erstinformation : null;
  const absender = ei?.firma?.trim() || ei?.name?.trim() || kunde?.name || "Ihre Beratung";
  const marke = markeFuer(
    {
      name: absender,
      markenText: kunde?.name ?? absender,
      gesellschaft: kunde?.tarifGesellschaften?.[0] ?? null,
      vermittlerTyp: kunde?.vermittlerTyp,
      maklerMarkthinweis: kunde?.maklerMarkthinweis,
    },
    logo,
  );
  const an = asAnsprache(kunde?.leadAddress);
  const angebote = ang?.bestaetigt ? ang.angebote : null;
  // Fassung (lib/praesentation-variante-server.ts): B Standard, C im Splittest; beim Laden nur lesen, nicht zuteilen
  const variante = await praesentationsVariante(d.leadId ?? appointmentId);
  const zugesagtAm = await zusageAm(appointmentId);
  const fs = folien(d, angebote, marke, an, { variante, zugesagtAm });
  // Für den Kundenlink (Abschluss-Leiste): gewählte Tarife und Beitrag wie auf der Folie „Ihre Entscheidung“
  const summe = angebote ? beitragAus(angebote).endbeitrag : null;
  const produkte = (angebote?.items ?? []).filter((i) => i.gewaehlt && beitragEffektiv(i) != null).map((i) => paketName(i));
  return {
    d,
    marke,
    folien: fs,
    css: praesentationCss(marke),
    angeboteBestaetigt: !!ang?.bestaetigt,
    variante,
    zugesagtAm,
    an,
    abschluss: { summe, produkte },
  };
}

/**
 * Im Termin umschalten (Präsentation): Baustein an/ab oder Stufe wählen. Die Bestätigung bleibt; PDF, Kundenlink und
 * Dokumentation zeigen die gewählte Fassung. Gibt die neuen Folien zurück.
 */
async function auswahlAendern(appointmentId: string, ctx: TeamCtx, fn: (d: AngeboteDaten) => AngeboteDaten | null) {
  const a = await prisma.appointment.findFirst({ where: { id: appointmentId, ...appointmentScope(ctx) }, select: { offersJson: true, offersConfirmedAt: true } });
  if (!a?.offersConfirmedAt) return null;
  const neu = fn(cleanAngebote(a.offersJson));
  if (!neu) return null;
  await prisma.appointment.update({ where: { id: appointmentId }, data: { offersJson: neu as unknown as Prisma.InputJsonValue } });
  return loadPraesentation(appointmentId, ctx);
}

export const bausteinUmschalten = (appointmentId: string, ctx: TeamCtx, item: number, baustein: number, aktiv: boolean) =>
  auswahlAendern(appointmentId, ctx, (d) => bausteinSchalten(d, item, baustein, aktiv));

export const tarifUmschalten = (appointmentId: string, ctx: TeamCtx, item: number) => auswahlAendern(appointmentId, ctx, (d) => tarifWaehlen(d, item));

export const sparteUmschalten = (appointmentId: string, ctx: TeamCtx, item: number) => auswahlAendern(appointmentId, ctx, (d) => sparteSchalten(d, item));

/** Fassung C, Folie „Ihre Entscheidung“: ein Paket wählen (je Sparte eine Stufe, Indizes im Angebot). */
export const paketUmschalten = (appointmentId: string, ctx: TeamCtx, items: number[]) => auswahlAendern(appointmentId, ctx, (d) => paketWaehlen(d, items));

// ─── Kundenlink (Ole, 15.11.2026): der Stand aus dem Termin zum Nachlesen, ohne Schalter und Sprechzettel ─────

export const KUNDENLINK_TAGE = 14;

/** Link erstellen bzw. verlängern; nur mit bestätigten Angeboten. */
export async function kundenlinkErstellen(appointmentId: string, ctx: TeamCtx, now = new Date()): Promise<{ token: string; bis: Date } | null> {
  const a = await prisma.appointment.findFirst({ where: { id: appointmentId, ...appointmentScope(ctx) }, select: { offersConfirmedAt: true, shareToken: true, shareExpiresAt: true } });
  if (!a?.offersConfirmedAt) return null;
  const token = a.shareToken && a.shareExpiresAt && a.shareExpiresAt > now ? a.shareToken : randomBytes(24).toString("base64url");
  const bis = new Date(now.getTime() + KUNDENLINK_TAGE * 24 * 3600_000);
  await prisma.appointment.update({ where: { id: appointmentId }, data: { shareToken: token, shareExpiresAt: bis } });
  return { token, bis };
}

export async function kundenlinkBeenden(appointmentId: string, ctx: TeamCtx): Promise<boolean> {
  const n = await prisma.appointment.updateMany({ where: { id: appointmentId, ...appointmentScope(ctx) }, data: { shareToken: null, shareExpiresAt: null } });
  return n.count > 0;
}

export async function kundenlinkStand(appointmentId: string, ctx: TeamCtx, now = new Date()): Promise<{ token: string; bis: Date } | null> {
  const a = await prisma.appointment.findFirst({ where: { id: appointmentId, ...appointmentScope(ctx) }, select: { shareToken: true, shareExpiresAt: true } });
  return a?.shareToken && a.shareExpiresAt && a.shareExpiresAt > now ? { token: a.shareToken, bis: a.shareExpiresAt } : null;
}

/** Präsentation zum Kundenlink; null, wenn unbekannt, abgelaufen oder die Angebote nicht mehr bestätigt sind. */
export async function loadKundenPraesentation(token: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const a = await prisma.appointment.findUnique({ where: { shareToken: token }, select: { id: true, customerId: true, shareExpiresAt: true, offersConfirmedAt: true } });
  if (!a?.shareExpiresAt || a.shareExpiresAt <= now || !a.offersConfirmedAt) return null;
  const p = await loadPraesentation(a.id, { customerId: a.customerId, userId: null, teamRole: "owner" });
  if (!p) return null;
  // ohne Sprechhinweise und Einwand-Folien (nur für den Vermittler)
  const folien = p.folien.map((f) => ({ id: f.id, titel: f.titel, html: f.html }));
  return {
    customerId: a.customerId,
    name: p.d.lead.name,
    berater: p.d.termin.berater,
    marke: p.marke,
    folien,
    css: p.css,
    bis: a.shareExpiresAt,
    variante: p.variante,
    zugesagtAm: p.zugesagtAm,
    an: p.an,
    abschluss: p.abschluss,
  };
}

/** Termin zum Kundenlink für die Messung (Folie erreicht, Zusage); null, wenn unbekannt oder abgelaufen. */
export async function kundenlinkTermin(token: string, now = new Date()): Promise<{ appointmentId: string; customerId: string; leadId: string | null; name: string | null } | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const a = await prisma.appointment.findUnique({
    where: { shareToken: token },
    select: { id: true, customerId: true, leadId: true, shareExpiresAt: true, offersConfirmedAt: true, lead: { select: { name: true } } },
  });
  if (!a?.shareExpiresAt || a.shareExpiresAt <= now || !a.offersConfirmedAt) return null;
  return { appointmentId: a.id, customerId: a.customerId, leadId: a.leadId, name: a.lead?.name ?? null };
}

/**
 * Kundenlink, Fassung C: der Kunde wählt auf „Ihre Entscheidung“ eines der gezeigten Pakete (nur diese, keine freie
 * Kombination), solange er noch nicht zugesagt hat. Danach zeigen Folien, Leiste, Termin und Beratungsdokumentation
 * die neue Auswahl; die Zusage gilt für sie. null, wenn Link, Fassung oder Paket nicht passen.
 */
export async function kundenlinkPaketWaehlen(token: string, items: number[], now = new Date()) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token) || !Array.isArray(items) || !items.length || items.length > 8 || !items.every((n) => Number.isInteger(n) && n >= 0 && n < 20)) return null;
  const a = await prisma.appointment.findUnique({ where: { shareToken: token }, select: { id: true, leadId: true, shareExpiresAt: true, offersConfirmedAt: true, offersJson: true } });
  if (!a?.shareExpiresAt || a.shareExpiresAt <= now || !a.offersConfirmedAt) return null;
  if ((await praesentationsVariante(a.leadId ?? a.id)) !== "C" || (await zusageAm(a.id))) return null;
  const d = cleanAngebote(a.offersJson);
  if (!entscheidungsPakete(d).some((p) => p.items.length === items.length && p.items.every((x, k) => x === items[k]))) return null;
  const neu = paketWaehlen(d, items);
  if (!neu) return null;
  await prisma.appointment.update({ where: { id: a.id }, data: { offersJson: neu as unknown as Prisma.InputJsonValue } });
  return loadKundenPraesentation(token, now);
}

/** Termin im Sichtbereich des Logins für die Messung im Deck; null sonst. */
export async function terminFuerMessung(appointmentId: string, ctx: TeamCtx): Promise<{ appointmentId: string; customerId: string; leadId: string | null } | null> {
  const a = await prisma.appointment.findFirst({ where: { id: appointmentId, ...appointmentScope(ctx) }, select: { id: true, customerId: true, leadId: true } });
  return a ? { appointmentId: a.id, customerId: a.customerId, leadId: a.leadId } : null;
}
