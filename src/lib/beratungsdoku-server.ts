// Beratungsdokumentation als Angebot, Datenbank-Teil (Paket B, Ole 18.11.2026). Reine Teile: lib/beratungsdoku.ts.
//
//   Schalter          Customer.beratungsdokuAn (Standard aus): Einstellungen und, optional eingeklappt, die Einrichtung.
//                     Aus = nirgends sichtbar (Terminkarte, Blatt, Aktionen prüfen ihn).
//   ladeBeratungsdoku Entwurf aus Terminvorbereitung, Vergleichsblatt, Angaben, Notizen und Tarifauswahl; Kopf; Versandweg;
//                     letzte Fassung zu diesem Termin
//   bdAblegen         PDF unter Dokumente („Beratungsdokumentation“, Aufbewahrung wie M5, lib/lead-files.ts)
//   bdSenden          E-Mail in Textform mit dem PDF und dem Link /dokumentation/<token> zur Bestätigung; je Termin und
//                     Inhalt nur einmal (Doppelklick, @@unique appointmentId + inhaltHash); ältere Fassungen „ersetzt“
//   bdSeite / bdBestaetigen  öffentliche Seite: Aufruf zeigt nur an, bestätigt wird nur per POST (Link-Scanner); zweite
//                     Bestätigung ändert nichts; danach liegt ein PDF mit Zeitstempel der Bestätigung unter Dokumente
//   bdKartenStand     „offen“ bzw. „erledigt“ für die Terminkarte
//   bdNutzung         Messung für Admin Betreuen › Qualität & Nutzung (eingeschaltet, Dokumente je Termin)
// Kein Rat durch die App, keine digitale Unterschrift.

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { asAnsprache, type Ansprache } from "@/lib/ansprache";
import { appointmentScope, type TeamCtx } from "@/lib/team";
import { beitragAus, beitragEffektiv, cleanAngebote, gewaehlte } from "@/lib/angebote-daten";
import { angebotThema, kombiSatz } from "@/lib/angebot-senden";
import { topicOf } from "@/lib/lead-sequences";
import { istTierLead } from "@/lib/gesundheitsdaten";
import { publicUrlOr } from "@/lib/public-url";
import { saveLeadFile } from "@/lib/lead-files";
import { logLeadHistory } from "@/lib/lead-history";
import { textPdf } from "@/lib/mail/text-pdf";
import { beraterName } from "@/lib/mail/beratung-pdf";
import type { VorschlagInfo } from "@/lib/mail/beratung";
import { vorschlagInfo } from "@/lib/mail/gruende-ki";
import { bedrockEu } from "@/lib/ki-eu-konfig";
import {
  BD_ABSCHNITTE,
  BD_LINK_TAGE,
  bdDateiname,
  bdFehlt,
  bdMail,
  bdPdfInhalt,
  bdSauber,
  beratungsdokuEntwurf,
  type BdInhalt,
  type BdKopf,
  type BdVertrag,
} from "@/lib/beratungsdoku";

const DAY = 86_400_000;

/** Prüfsumme des Inhalts (je Termin und Inhalt eine Fassung; Nachweis, was gesendet und bestätigt wurde). */
export function bdHash(i: BdInhalt, an: Ansprache): string {
  return createHash("sha256")
    .update(`${an}\u0000${BD_ABSCHNITTE.map((k) => i[k].trim()).join("\u0000")}`)
    .digest("hex");
}

// ─── Schalter ───────────────────────────────────────────────────────────────────────────────

export async function beratungsdokuAn(customerId: string): Promise<boolean> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { beratungsdokuAn: true } });
  return c?.beratungsdokuAn === true;
}

/**
 * Schalter setzen (nur Inhaber, nicht in der Vorschau). Einschalten merkt den Zeitpunkt für die Messung. Jede Antwort
 * (Schalter, Frage in der Einrichtung, Frage nach dem ersten Termin-Ergebnis) gilt als beantwortet: nie wieder fragen.
 */
export async function setzeBeratungsdoku(ctx: { customerId: string; teamRole?: string | null; preview?: boolean }, an: boolean, now = new Date()): Promise<boolean> {
  if (ctx.preview || ctx.teamRole === "advisor") return false;
  await prisma.customer.update({
    where: { id: ctx.customerId },
    data: an ? { beratungsdokuAn: true, beratungsdokuAnAt: now, beratungsdokuGefragtAt: now } : { beratungsdokuAn: false, beratungsdokuGefragtAt: now },
  });
  return true;
}

type FrageKunde = { plan: string | null; beratungsdokuAn: boolean; beratungsdokuGefragtAt: Date | null };

/** Noch fragen? Mit Software, Schalter aus und nie beantwortet (Inhaber und Vorschau prüft bdFrageFaellig). */
export const bdFrageOffen = (c: FrageKunde | null): boolean => !!c && c.plan !== "service" && !c.beratungsdokuAn && !c.beratungsdokuGefragtAt;

/**
 * Einmal nach dem ersten Termin-Ergebnis (Angebot, Abschluss) fragen, ob die Beratungsdokumentation vorbereitet werden
 * soll (Ole, 18.11.2026)? Nur der Inhaber (nur er darf den Schalter ändern), nicht in der Vorschau.
 */
export async function bdFrageFaellig(ctx: { customerId: string; teamRole?: string | null; preview?: boolean } | null): Promise<boolean> {
  if (!ctx || ctx.preview || ctx.teamRole === "advisor") return false;
  const c = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { plan: true, beratungsdokuAn: true, beratungsdokuGefragtAt: true } });
  return bdFrageOffen(c);
}

// ─── Gespeicherte Fassung ───────────────────────────────────────────────────────────────────

/** Was in Beratungsdoku.inhalt steht: Abschnitte und Kopf (für PDF und Seite ohne erneutes Laden des Termins). */
type Gespeichert = { abschnitte: BdInhalt; kopf: { kunde: string; produkt: string; berater: string; termin: string | null } };

function gespeichert(x: unknown): Gespeichert {
  const o = (x && typeof x === "object" ? x : {}) as Partial<Gespeichert>;
  const k = (o.kopf ?? {}) as Partial<Gespeichert["kopf"]>;
  return {
    abschnitte: bdSauber(o.abschnitte),
    kopf: { kunde: String(k.kunde ?? ""), produkt: String(k.produkt ?? ""), berater: String(k.berater ?? ""), termin: typeof k.termin === "string" ? k.termin : null },
  };
}
const kopfAus = (g: Gespeichert): BdKopf => ({ ...g.kopf, termin: g.kopf.termin ? new Date(g.kopf.termin) : null });

// ─── Termin und Entwurf ─────────────────────────────────────────────────────────────────────

async function termin(appointmentId: string, ctx: TeamCtx) {
  return prisma.appointment.findFirst({
    where: { id: appointmentId, ...appointmentScope(ctx), leadId: { not: null } },
    select: {
      id: true,
      startsAt: true,
      offersJson: true,
      klaerenErledigt: true,
      conversationId: true,
      lead: {
        select: {
          id: true,
          customerId: true,
          name: true,
          email: true,
          source: true,
          status: true,
          formData: true,
          vorvertraege: true,
          erasedAt: true,
          customer: { select: { leadAddress: true, mailFeaturesOff: true, beratungsdokuAn: true } },
        },
      },
    },
  });
}
type Termin = NonNullable<Awaited<ReturnType<typeof termin>>>;

function tarifeAus(offersJson: unknown, fallbackThema: string) {
  const d = cleanAngebote(offersJson ?? {});
  const alle = d.items.filter((i) => !i.zusatz);
  const items = gewaehlte(d).filter((i) => !i.zusatz);
  const thema = items.length ? angebotThema(items.map((i) => i.sparte), fallbackThema) : fallbackThema;
  return {
    thema,
    auswahl: items.map((i) => ({ sparte: i.sparte, gesellschaft: i.gesellschaft, tarif: i.tarif, beitrag: beitragEffektiv(i), leistungen: i.leistungen })),
    tarife: alle.map((i) => ({ sparte: i.sparte, gesellschaft: i.gesellschaft, tarif: i.tarif, beitrag: beitragEffektiv(i), gewaehlt: i.gewaehlt })),
    kombi: kombiSatz(beitragAus(d).rabatt, thema),
    schutz: d.schutz ?? [],
  };
}

/** Geprüfte Verträge aus dem Vergleichsblatt, ohne Gesundheitssparten (nur lesen). */
async function vertraegeAusVergleich(leadId: string, customerId: string, now: Date): Promise<BdVertrag[]> {
  try {
    if (!(await prisma.policenAuszug.count({ where: { leadId, customerId } }))) return [];
    const [{ ladeVergleich }, { GESUNDHEITS_SPARTEN, SPARTE_LABEL }] = await Promise.all([import("@/lib/policen/auslesen/server"), import("@/lib/policen/auslesen/felder")]);
    const v = await ladeVergleich(leadId, customerId, now);
    return v.vertraege
      .filter((k) => k.geprueft && !GESUNDHEITS_SPARTEN.includes(k.sparte))
      .map((k) => {
        const w = k.felder.versicherer?.w;
        return { sparte: SPARTE_LABEL[k.sparte], versicherer: typeof w === "string" && w.trim() ? w.trim() : null, monat: k.monat };
      });
  } catch (err) {
    console.error("[beratungsdoku] Vergleichsblatt", err instanceof Error ? err.message : err);
    return [];
  }
}

export type BdLetzte = { id: string; status: string; gesendetAt: string | null; gesendetAn: string | null; bestaetigtAt: string | null; inhalt: BdInhalt };

export type BdInfo = {
  leadId: string;
  an: Ansprache;
  entwurf: BdInhalt;
  kopf: { kunde: string; produkt: string; berater: string; termin: string };
  email: string | null;
  /** Über die App senden möglich (Adresse, E-Mail-Funktionen an, Versandweg eingerichtet) */
  appVersand: boolean;
  /** Warum nicht (ein Satz, Sie-Form) */
  ohneVersand: string | null;
  /** Letzte Fassung zu diesem Termin */
  letzte: BdLetzte | null;
  /** „Vorschlag erstellen“ für die Begründung (null = keine EU-KI) */
  vorschlag: VorschlagInfo;
};

async function letzteFassung(appointmentId: string): Promise<BdLetzte | null> {
  const r = await prisma.beratungsdoku.findFirst({
    where: { appointmentId, status: { in: ["abgelegt", "gesendet", "bestaetigt"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, gesendetAt: true, gesendetAn: true, bestaetigtAt: true, inhalt: true },
  });
  return r
    ? { id: r.id, status: r.status, gesendetAt: r.gesendetAt?.toISOString() ?? null, gesendetAn: r.gesendetAn, bestaetigtAt: r.bestaetigtAt?.toISOString() ?? null, inhalt: gespeichert(r.inhalt).abschnitte }
    : null;
}

/** Entwurf, Kopf und Versandweg fürs Blatt; null ohne Termin, bei gelöschtem Kontakt oder Schalter aus. */
export async function ladeBeratungsdoku(appointmentId: string, ctx: TeamCtx, now = new Date()): Promise<BdInfo | null> {
  const t = await termin(appointmentId, ctx);
  const lead = t?.lead;
  if (!t || !lead || lead.erasedAt || !lead.customer.beratungsdokuAn) return null;
  return infoFuer(t, ctx, now);
}

async function infoFuer(t: Termin, ctx: TeamCtx, now: Date): Promise<BdInfo> {
  const lead = t.lead!;
  const an = asAnsprache(lead.customer.leadAddress);
  const [conv, notizen, vorbereitung, vertraege, letzte, { leadVersandKontext, resendBereit }] = await Promise.all([
    t.conversationId
      ? prisma.conversation.findUnique({ where: { id: t.conversationId }, select: { qualificationData: true, qualificationSummary: true, contactEmail: true } })
      : prisma.conversation.findFirst({ where: { leadId: lead.id }, orderBy: { lastMessageAt: "desc" }, select: { qualificationData: true, qualificationSummary: true, contactEmail: true } }),
    prisma.leadHistory.findMany({
      where: { leadId: lead.id, kind: "notiz", createdAt: { gte: new Date(t.startsAt.getTime() - 3 * DAY) } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { text: true },
    }),
    import("@/lib/termin-vorbereitung-server").then((m) => m.loadVorbereitung(t.id, ctx)),
    vertraegeAusVergleich(lead.id, lead.customerId, now),
    letzteFassung(t.id),
    import("@/lib/mail/lead-versand"),
  ]);
  const { klaerenPunkte } = await import("@/lib/terminvorbereitung-neu");
  const { thema, auswahl, tarife, kombi, schutz } = tarifeAus(t.offersJson, topicOf(lead.formData, lead.source, an));
  const entwurf = beratungsdokuEntwurf({
    an,
    produkt: thema,
    formData: lead.formData,
    qualificationData: conv?.qualificationData,
    qualificationSummary: conv?.qualificationSummary,
    vorvertraege: lead.vorvertraege,
    schutz,
    klaeren: vorbereitung ? { punkte: klaerenPunkte(vorbereitung), erledigt: t.klaerenErledigt } : undefined,
    notizen: notizen.map((n) => n.text),
    auswahl,
    kombi,
    tier: istTierLead(lead.source),
    tarife,
    vertraege,
    status: lead.status,
  });
  const k = await leadVersandKontext(lead.customerId, { leadId: lead.id, schreiber: ctx.userId ?? null, nurLesen: true });
  const email = lead.email?.trim() || conv?.contactEmail?.trim() || null;
  const weg = !!k.postfach || resendBereit();
  const ohneVersand = !email
    ? "Keine E-Mail-Adresse bekannt. Tragen Sie sie am Kontakt ein oder legen Sie die Dokumentation nur ab."
    : lead.customer.mailFeaturesOff
      ? "E-Mail-Funktionen sind aus. Sie können die Dokumentation ablegen und das PDF selbst weitergeben."
      : !weg
        ? "Der Versand über die App ist gerade nicht eingerichtet."
        : null;
  return {
    leadId: lead.id,
    an,
    entwurf,
    kopf: { kunde: lead.name?.trim() || "", produkt: thema, berater: await beraterName(ctx.userId, vorbereitung?.termin.berater || k.daten.name), termin: t.startsAt.toISOString() },
    email,
    appVersand: !ohneVersand,
    ohneVersand,
    letzte,
    vorschlag: vorschlagInfo({ konfig: bedrockEu(), themen: [lead.source, thema], auswahl }),
  };
}

// ─── PDF, Ablage, Versand ───────────────────────────────────────────────────────────────────

type Vorbereitet = { ok: true; t: Termin; an: Ansprache; inhalt: BdInhalt; kopf: Gespeichert["kopf"]; hash: string; pdf: { fileName: string; data: Uint8Array } } | { ok: false; error: string };

async function vorbereiten(appointmentId: string, ctx: TeamCtx, roh: unknown, now: Date): Promise<Vorbereitet> {
  const t = await termin(appointmentId, ctx);
  const lead = t?.lead;
  if (!t || !lead || lead.erasedAt) return { ok: false, error: "Termin nicht gefunden." };
  if (!lead.customer.beratungsdokuAn) return { ok: false, error: "Die Beratungsdokumentation ist in Ihren Einstellungen aus." };
  const inhalt = bdSauber(roh);
  const fehlt = bdFehlt(inhalt);
  if (fehlt) return { ok: false, error: fehlt };
  const an = asAnsprache(lead.customer.leadAddress);
  const vb = await import("@/lib/termin-vorbereitung-server").then((m) => m.loadVorbereitung(t.id, ctx));
  const { thema } = tarifeAus(t.offersJson, topicOf(lead.formData, lead.source, an));
  const kopf = { kunde: lead.name?.trim() || "", produkt: thema.slice(0, 200) || "Versicherung", berater: await beraterName(ctx.userId, vb?.termin.berater ?? ""), termin: t.startsAt.toISOString() };
  const pdf = await bdPdf({ an, inhalt, kopf, now });
  return { ok: true, t, an, inhalt, kopf, hash: bdHash(inhalt, an), pdf };
}

async function bdPdf(o: { an: Ansprache; inhalt: BdInhalt; kopf: Gespeichert["kopf"]; now: Date; bestaetigtAt?: Date | null }) {
  const k = kopfAus({ abschnitte: o.inhalt, kopf: o.kopf });
  const inhalt = bdPdfInhalt({ ...k, an: o.an, inhalt: o.inhalt, now: o.now, bestaetigtAt: o.bestaetigtAt });
  return { fileName: bdDateiname(k.kunde, o.now, !!o.bestaetigtAt), data: await textPdf({ ...inhalt, autor: k.berater || undefined }) };
}

/** PDF zum Ansehen (nicht abgelegt). */
export async function bdPdfVorschau(appointmentId: string, ctx: TeamCtx, roh: unknown, now = new Date()) {
  const v = await vorbereiten(appointmentId, ctx, roh, now);
  return v.ok ? { ok: true as const, pdf: v.pdf } : v;
}

const istEindeutig = (e: unknown) => !!e && typeof e === "object" && (e as { code?: string }).code === "P2002";

export type BdErgebnis = { ok: true; id: string; status: string; schon?: boolean } | { ok: false; error: string };

/** Nur ablegen (z. B. auf Papier übergeben): PDF unter Dokumente; gleicher Inhalt zum selben Termin nur einmal. */
export async function bdAblegen(appointmentId: string, ctx: TeamCtx, roh: unknown, deps: { now?: Date; userId?: string | null } = {}): Promise<BdErgebnis> {
  const now = deps.now ?? new Date();
  const v = await vorbereiten(appointmentId, ctx, roh, now);
  if (!v.ok) return v;
  const lead = v.t.lead!;
  const schon = await prisma.beratungsdoku.findUnique({ where: { appointmentId_inhaltHash: { appointmentId, inhaltHash: v.hash } }, select: { id: true, status: true } });
  if (schon) return { ok: true, id: schon.id, status: schon.status, schon: true };
  let id: string;
  try {
    id = (
      await prisma.beratungsdoku.create({
        data: { customerId: lead.customerId, leadId: lead.id, appointmentId, inhalt: { abschnitte: v.inhalt, kopf: v.kopf }, ansprache: v.an, inhaltHash: v.hash, status: "abgelegt", createdById: deps.userId ?? ctx.userId ?? null },
        select: { id: true },
      })
    ).id;
  } catch (e) {
    if (!istEindeutig(e)) throw e;
    const r = await prisma.beratungsdoku.findUnique({ where: { appointmentId_inhaltHash: { appointmentId, inhaltHash: v.hash } }, select: { id: true, status: true } });
    return r ? { ok: true, id: r.id, status: r.status, schon: true } : { ok: false, error: "Bitte noch einmal versuchen." };
  }
  const f = await saveLeadFile({ leadId: lead.id, customerId: lead.customerId, kind: "beratungsdoku", fileName: v.pdf.fileName, data: v.pdf.data, userId: deps.userId ?? ctx.userId ?? null, verlauf: `Beratungsdokumentation abgelegt: ${v.pdf.fileName}` });
  if (!f.ok) {
    await prisma.beratungsdoku.delete({ where: { id } }).catch(() => null);
    return f;
  }
  await prisma.beratungsdoku.update({ where: { id }, data: { dateiId: f.id } });
  return { ok: true, id, status: "abgelegt" };
}

/**
 * Senden in Textform: E-Mail mit dem PDF und dem Link zur Bestätigung. Erst reservieren (status „sendet“, eindeutig je
 * Termin und Inhalt), dann senden; scheitert der Versand, wird die Reservierung zurückgenommen.
 */
export async function bdSenden(appointmentId: string, ctx: TeamCtx, roh: unknown, deps: { now?: Date; userId?: string | null } = {}): Promise<BdErgebnis> {
  const now = deps.now ?? new Date();
  const userId = deps.userId ?? ctx.userId ?? null;
  const v = await vorbereiten(appointmentId, ctx, roh, now);
  if (!v.ok) return v;
  const lead = v.t.lead!;
  if (lead.customer.mailFeaturesOff) return { ok: false, error: "E-Mail-Funktionen sind aus. Bitte die Dokumentation ablegen und das PDF selbst weitergeben." };
  const { ladeSperrDaten, sperrGrund, SPERR_TEXT } = await import("@/lib/mail/sperren");
  const d = await ladeSperrDaten(lead.id);
  const grund = sperrGrund(d, { vorlage: "beratungsdoku", automatisch: false });
  if (grund || !d.adresse) return { ok: false, error: grund ? SPERR_TEXT[grund] : SPERR_TEXT.keine_adresse };

  // Reservierung
  const token = randomBytes(24).toString("base64url");
  let id: string;
  let vorher: { status: string; dateiId: string | null } | null = null;
  try {
    id = (
      await prisma.beratungsdoku.create({
        data: { customerId: lead.customerId, leadId: lead.id, appointmentId, inhalt: { abschnitte: v.inhalt, kopf: v.kopf }, ansprache: v.an, inhaltHash: v.hash, status: "sendet", token, createdById: userId },
        select: { id: true },
      })
    ).id;
  } catch (e) {
    if (!istEindeutig(e)) throw e;
    const r = await prisma.beratungsdoku.findUnique({ where: { appointmentId_inhaltHash: { appointmentId, inhaltHash: v.hash } }, select: { id: true, status: true, dateiId: true } });
    if (!r) return { ok: false, error: "Bitte noch einmal versuchen." };
    // Schon abgelegt: dieselbe Fassung jetzt senden (nur einer übernimmt)
    const u = r.status === "abgelegt" ? await prisma.beratungsdoku.updateMany({ where: { id: r.id, status: "abgelegt" }, data: { status: "sendet", token } }) : { count: 0 };
    if (!u.count) return { ok: true, id: r.id, status: r.status, schon: true };
    id = r.id;
    vorher = { status: "abgelegt", dateiId: r.dateiId };
  }
  const zuruecknehmen = () =>
    (vorher ? prisma.beratungsdoku.update({ where: { id }, data: { status: vorher.status, token: null } }) : prisma.beratungsdoku.delete({ where: { id } })).catch(() => null);

  try {
    const [{ bereiteVorlagenMail, vorlagenInhalt }, { sendeLeadMail }] = await Promise.all([import("@/lib/mail/vorlagen-mail"), import("@/lib/mail/lead-versand")]);
    const vb = await bereiteVorlagenMail(lead.id, "beratungsdoku", { automatisch: false, userId, now });
    if (!vb?.to) {
      await zuruecknehmen();
      return { ok: false, error: SPERR_TEXT.keine_adresse };
    }
    const m = bdMail(v.an, { produkt: v.kopf.produkt, termin: new Date(v.kopf.termin!) });
    const url = publicUrlOr(`/dokumentation/${token}`);
    const res = await sendeLeadMail(vb.kontext, {
      to: vb.to,
      inhalt: (sig) => vorlagenInhalt({ subject: m.subject, body: m.body }, vb.werte, sig, { knoepfe: [{ label: m.knopf, url }] }),
      attachments: [{ fileName: v.pdf.fileName, contentType: "application/pdf", data: Buffer.from(v.pdf.data) }],
      protokoll: { customerId: lead.customerId, leadId: lead.id, art: "beratungsdoku", automatisch: false, userId },
    });
    if (!res.sent) {
      await zuruecknehmen();
      return { ok: false, error: res.reason === "not_configured" ? "Der Versand über die App ist gerade nicht eingerichtet." : `Senden hat nicht geklappt (${res.reason}).` };
    }
    let dateiId = vorher?.dateiId ?? null;
    if (!dateiId) {
      const f = await saveLeadFile({ leadId: lead.id, customerId: lead.customerId, kind: "beratungsdoku", fileName: v.pdf.fileName, data: v.pdf.data, userId, verlauf: `Beratungsdokumentation per E-Mail gesendet: ${v.pdf.fileName}` });
      if (f.ok) dateiId = f.id;
      else console.error("[beratungsdoku] Ablage", f.error);
    } else await logLeadHistory(lead.id, "dokument", `Beratungsdokumentation per E-Mail gesendet: ${v.pdf.fileName}`, { customerId: lead.customerId, userId });
    await prisma.$transaction([
      prisma.beratungsdoku.update({ where: { id }, data: { status: "gesendet", gesendetAt: now, gesendetAn: vb.to.slice(0, 320), dateiId } }),
      // Ältere, noch nicht bestätigte Fassungen zu diesem Termin gelten als ersetzt
      prisma.beratungsdoku.updateMany({ where: { appointmentId, id: { not: id }, status: "gesendet" }, data: { status: "ersetzt" } }),
    ]);
    return { ok: true, id, status: "gesendet" };
  } catch (err) {
    console.error("[beratungsdoku] senden", err instanceof Error ? err.message : err);
    await zuruecknehmen();
    return { ok: false, error: "Senden hat nicht geklappt. Bitte noch einmal versuchen." };
  }
}

// ─── Öffentliche Seite ──────────────────────────────────────────────────────────────────────

export type BdSeite =
  | { zustand: "ungueltig" }
  | { zustand: "abgelaufen"; an: Ansprache; customerId: string; berater: string }
  | { zustand: "ersetzt"; an: Ansprache; customerId: string; berater: string }
  | {
      zustand: "offen" | "bestaetigt";
      an: Ansprache;
      customerId: string;
      berater: string;
      kopf: BdKopf;
      inhalt: BdInhalt;
      gesendetAt: Date;
      bestaetigtAt: Date | null;
    };

const tokenForm = (t: string) => /^[A-Za-z0-9_-]{24,64}$/.test(t);

async function perToken(token: string) {
  if (!tokenForm(token)) return null;
  return prisma.beratungsdoku.findUnique({
    where: { token },
    select: {
      id: true,
      customerId: true,
      leadId: true,
      status: true,
      ansprache: true,
      inhalt: true,
      gesendetAt: true,
      bestaetigtAt: true,
      dateiId: true,
      bestaetigtDateiId: true,
      lead: { select: { erasedAt: true } },
    },
  });
}

/** Seite laden (nur lesen, speichert nichts). */
export async function bdSeite(token: string, now = new Date()): Promise<BdSeite> {
  const r = await perToken(token);
  if (!r || r.lead.erasedAt || !r.gesendetAt || !["gesendet", "bestaetigt", "ersetzt"].includes(r.status)) return { zustand: "ungueltig" };
  const an = asAnsprache(r.ansprache);
  const g = gespeichert(r.inhalt);
  const basis = { an, customerId: r.customerId, berater: g.kopf.berater };
  if (r.status === "ersetzt") return { zustand: "ersetzt", ...basis };
  if (r.status !== "bestaetigt" && r.gesendetAt.getTime() < now.getTime() - BD_LINK_TAGE * DAY) return { zustand: "abgelaufen", ...basis };
  return { zustand: r.status === "bestaetigt" ? "bestaetigt" : "offen", ...basis, kopf: kopfAus(g), inhalt: g.abschnitte, gesendetAt: r.gesendetAt, bestaetigtAt: r.bestaetigtAt };
}

export type BdBestaetigung = { ok: true; schon: boolean } | { ok: false; grund: "ungueltig" | "abgelaufen" | "ersetzt" };

/** Erhalt bestätigen (nur aus der Server-Aktion der Seite, also nur per POST). Doppelklick ändert nichts. */
export async function bdBestaetigen(token: string, now = new Date()): Promise<BdBestaetigung> {
  const s = await bdSeite(token, now);
  if (s.zustand === "bestaetigt") return { ok: true, schon: true };
  if (s.zustand !== "offen") return { ok: false, grund: s.zustand };
  const r = (await perToken(token))!;
  const u = await prisma.beratungsdoku.updateMany({ where: { id: r.id, status: "gesendet" }, data: { status: "bestaetigt", bestaetigtAt: now } });
  if (!u.count) return { ok: true, schon: true };
  // Nachweis: PDF mit Zeitstempel der Bestätigung unter Dokumente (Aufbewahrung wie jede Beratungsdokumentation)
  const g = gespeichert(r.inhalt);
  const an = asAnsprache(r.ansprache);
  const zeit = `${new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(now)} Uhr`;
  try {
    const pdf = await bdPdf({ an, inhalt: g.abschnitte, kopf: g.kopf, now: r.gesendetAt ?? now, bestaetigtAt: now });
    const f = await saveLeadFile({ leadId: r.leadId, customerId: r.customerId, kind: "beratungsdoku", fileName: pdf.fileName, data: pdf.data, userId: null, verlauf: `Erhalt der Beratungsdokumentation bestätigt am ${zeit}: ${pdf.fileName}` });
    if (f.ok) await prisma.beratungsdoku.update({ where: { id: r.id }, data: { bestaetigtDateiId: f.id } });
    else await logLeadHistory(r.leadId, "dokument", `Erhalt der Beratungsdokumentation bestätigt am ${zeit}`, { customerId: r.customerId, userId: null });
  } catch (err) {
    console.error("[beratungsdoku] bestätigt, PDF", err instanceof Error ? err.message : err);
    await logLeadHistory(r.leadId, "dokument", `Erhalt der Beratungsdokumentation bestätigt am ${zeit}`, { customerId: r.customerId, userId: null });
  }
  // Push an den zuständigen Vermittler (Ole, 18.11.2026); Fehler stoppen die Bestätigung nicht
  try {
    const lead = await prisma.lead.findUnique({ where: { id: r.leadId }, select: { name: true } });
    await (await import("@/lib/team")).notifyLeadPush(r.leadId, {
      title: `Beratungsdokumentation bestätigt: ${lead?.name?.trim() || "Kunde"}`,
      body: "Der Erhalt ist bestätigt, das PDF liegt am Kontakt.",
      url: `/buyer/leads/${r.leadId}`,
      tag: `beratungsdoku:${r.id}`,
    });
  } catch (err) {
    console.error("[beratungsdoku] Push", err instanceof Error ? err.name : "fehler");
  }
  return { ok: true, schon: false };
}

/** PDF für die Seite (bestätigte Fassung, sonst die gesendete); nur solange die Seite gültig ist. */
export async function bdSeitenPdf(token: string, now = new Date()): Promise<{ fileName: string; data: Uint8Array } | null> {
  const s = await bdSeite(token, now);
  if (s.zustand !== "offen" && s.zustand !== "bestaetigt") return null;
  const r = await perToken(token);
  const id = r?.bestaetigtDateiId ?? r?.dateiId;
  if (!r || !id) return null;
  const f = await prisma.leadFile.findFirst({ where: { id, leadId: r.leadId, kind: "beratungsdoku" }, select: { fileName: true, data: true } });
  return f ? { fileName: f.fileName, data: new Uint8Array(f.data) } : null;
}

// ─── Terminkarte und Messung ────────────────────────────────────────────────────────────────

/** Dokumentiert („erledigt“) oder noch nicht („offen“) je Termin. */
export async function bdKartenStand(appointmentIds: string[]): Promise<Map<string, "offen" | "erledigt">> {
  const ids = [...new Set(appointmentIds.filter(Boolean))];
  const map = new Map<string, "offen" | "erledigt">(ids.map((id) => [id, "offen"]));
  if (!ids.length) return map;
  const rows = await prisma.beratungsdoku.findMany({ where: { appointmentId: { in: ids }, status: { in: ["abgelegt", "gesendet", "bestaetigt", "ersetzt"] } }, select: { appointmentId: true } });
  for (const r of rows) if (r.appointmentId) map.set(r.appointmentId, "erledigt");
  return map;
}

/** Wie lange nach dem Termin die Terminkarte die Dokumentation noch anbietet, wenn das Ergebnis schon eingetragen ist. */
export const BD_KARTE_TAGE = 14;

export type BdNutzung = {
  eingeschaltet: number;
  termine: number;
  dokumentiert: number;
  gesendet: number;
  bestaetigt: number;
  /** dokumentierte Termine / Termine bei eingeschalteten Vermittlern (null ohne Termine) */
  jeTermin: number | null;
  kunden: { id: string; name: string; anSeit: Date | null; termine: number; dokumentiert: number; bestaetigt: number }[];
};

/**
 * Messung (Admin): eingeschaltete Vermittler (ohne Test und Archiv) und für die letzten `tage` Tage Termine (vorbei, nicht
 * abgesagt, nicht „nicht erschienen“), dokumentierte Termine, gesendete und bestätigte Fassungen.
 */
export async function bdNutzung(tage: number, now = new Date()): Promise<BdNutzung> {
  const seit = new Date(now.getTime() - tage * DAY);
  const kunden = await prisma.customer.findMany({ where: { beratungsdokuAn: true, isTest: false, archived: false }, select: { id: true, name: true, beratungsdokuAnAt: true }, orderBy: { name: "asc" } });
  const ids = kunden.map((k) => k.id);
  const [termine, dokus] = ids.length
    ? await Promise.all([
        prisma.appointment.findMany({
          where: { customerId: { in: ids }, leadId: { not: null }, startsAt: { gte: seit, lt: now }, status: { in: ["booked", "completed"] }, OR: [{ attendance: null }, { attendance: { not: "nicht_erschienen" } }] },
          select: { id: true, customerId: true },
        }),
        prisma.beratungsdoku.findMany({ where: { customerId: { in: ids }, createdAt: { gte: seit }, status: { not: "sendet" } }, select: { customerId: true, appointmentId: true, status: true, gesendetAt: true } }),
      ])
    : [[], []];
  const je = new Map(kunden.map((k) => [k.id, { id: k.id, name: k.name, anSeit: k.beratungsdokuAnAt, termine: 0, dokumentiert: new Set<string>(), bestaetigt: 0 }]));
  for (const t of termine) je.get(t.customerId)!.termine++;
  let gesendet = 0;
  let bestaetigt = 0;
  for (const d of dokus) {
    const k = je.get(d.customerId)!;
    if (d.appointmentId) k.dokumentiert.add(d.appointmentId);
    if (d.gesendetAt) gesendet++;
    if (d.status === "bestaetigt") {
      bestaetigt++;
      k.bestaetigt++;
    }
  }
  const liste = [...je.values()].map((k) => ({ ...k, dokumentiert: k.dokumentiert.size }));
  const summeTermine = liste.reduce((s, k) => s + k.termine, 0);
  const dokumentiert = liste.reduce((s, k) => s + k.dokumentiert, 0);
  return {
    eingeschaltet: kunden.length,
    termine: summeTermine,
    dokumentiert,
    gesendet,
    bestaetigt,
    jeTermin: summeTermine ? Math.round((dokumentiert / summeTermine) * 100) / 100 : null,
    kunden: liste,
  };
}
