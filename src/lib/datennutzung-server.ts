// Hinweis „KI-Hilfe und gemeinsames Anzeigenlernen“ (Ole, 24.11.2026), Datenbank-Teil. Texte und Regeln:
// lib/datennutzung.ts. Speicherung nach dem Muster der Policen-Freischaltung (lib/policen/freischaltung.ts):
//   - Stand am Kunden für die schnelle Prüfung (erste Anzeige, „Verstanden“, Widerspruch je Punkt),
//   - Nachweis in DatennutzungNachweis (nur anhängen: Login, Zeitpunkt, Textversion, Wortlaut),
//   - Eintrag im Änderungsprotokoll (audit, wird nach einem Jahr gelöscht).
// Stand und Nachweis entstehen in einer Transaktion: kein Stand ohne Nachweis.
//
//   ladeStand          Stand für Banner, Detailseite und Einstellungen; null = nichts zeigen
//   bestaetigtAm       Klick auf „Verstanden“ (für die Zeile „Bestätigt am …“ der Detailseite)
//   merkeAnzeige       erste Anzeige bei einem Inhaber festhalten (Beginn der 14 Tage), einmal je Textversion
//   bestaetigeHinweis  „Verstanden“ (Banner bzw. Detailseite): Banner weg für den ganzen Kunden
//   widerspreche       Widerspruch je Punkt: sofort wirksam, Aufgabe und Push an die Admins
//   nimmZurueck        Widerspruch je Punkt zurücknehmen: ebenfalls Nachweis, Aufgabe und Push

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import {
  BANNER_WORTLAUT,
  DATENNUTZUNG_EINTRAG,
  DATENNUTZUNG_VERSION,
  DETAIL_TEXT,
  DIALOG_TEXT,
  WIDERSPRUCH_PUNKTE,
  istInhaberLogin,
  istPunkt,
  istSoftwareKunde,
  istVerstanden,
  punktWortlaut,
  tagText,
  type Punkt,
} from "@/lib/datennutzung";

type Ctx = { customerId: string; email?: string | null; userId: string | null; preview: boolean; teamRole?: string | null; demo?: boolean };

export type DatennutzungStand = {
  /** Echter Inhaber-Login eines Software-Kunden: darf bestätigen, widersprechen und zurücknehmen (sonst nur lesen) */
  darf: boolean;
  /** Banner fällig: Inhaber, und für die aktuelle Textversion noch kein „Verstanden“ */
  banner: boolean;
  version: string;
  /** Erste Anzeige der aktuellen Textversion bei einem Inhaber */
  angezeigtAm: string | null;
  /** „Verstanden“ für die aktuelle Textversion */
  verstandenAm: string | null;
  /** Aktiver Widerspruch je Punkt (Zeitpunkt), null = kein Widerspruch */
  widerspruch: Record<Punkt, string | null>;
};

const STAND_SELECT = {
  plan: true,
  retainerMonthly: true,
  onboarding: { select: { id: true } },
  datennutzungAngezeigtAt: true,
  datennutzungAngezeigtVersion: true,
  datennutzungVerstandenAt: true,
  datennutzungVerstandenVersion: true,
  anzeigenlernenWiderspruchAt: true,
  awsWiderspruchAt: true,
  // Reines Bestellkonto (lib/ppl/bestellkonto.ts): Vertriebspartner, aber kein eigener aktiver Bezug
  _count: { select: { bestellPartner: true, leadSubscriptions: { where: { active: true } } } },
} as const;

// „Einmal je Textversion“: nur schreiben, solange noch keine oder eine andere Version steht (null eigens, weil
// „nicht gleich“ in SQL leere Felder nicht trifft)
const ANZEIGE_OFFEN = { OR: [{ datennutzungAngezeigtVersion: null }, { datennutzungAngezeigtVersion: { not: DATENNUTZUNG_VERSION } }] };
const VERSTANDEN_OFFEN = { OR: [{ datennutzungVerstandenVersion: null }, { datennutzungVerstandenVersion: { not: DATENNUTZUNG_VERSION } }] };

/**
 * Stand für diesen Login. null = nichts zeigen: Mitarbeiter (Berater), App-Demo (auch App-Store-Prüfer) und Kunden
 * ohne Software-Paket. In der Admin-Vorschau gibt es den Stand nur zum Lesen (darf = false, kein Banner).
 */
export async function ladeStand(ctx: Ctx): Promise<DatennutzungStand | null> {
  if (ctx.demo || ctx.teamRole === "advisor") return null;
  const c = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: STAND_SELECT });
  if (!c) return null;
  const bestellkonto = c._count.bestellPartner > 0 && c._count.leadSubscriptions === 0;
  if (!istSoftwareKunde(c, { bestellkonto })) return null;
  const darf = istInhaberLogin(ctx);
  const verstanden = istVerstanden(c);
  return {
    darf,
    banner: darf && !verstanden,
    version: DATENNUTZUNG_VERSION,
    angezeigtAm: c.datennutzungAngezeigtAt && c.datennutzungAngezeigtVersion === DATENNUTZUNG_VERSION ? c.datennutzungAngezeigtAt.toISOString() : null,
    verstandenAm: verstanden ? c.datennutzungVerstandenAt!.toISOString() : null,
    widerspruch: {
      anzeigenlernen: c.anzeigenlernenWiderspruchAt?.toISOString() ?? null,
      aws: c.awsWiderspruchAt?.toISOString() ?? null,
    },
  };
}

/**
 * Zeitpunkt des Klicks auf „Verstanden“ für die aktuelle Textversion (Banner oder Detailseite), sonst null. Die
 * Detailseite zeigt damit „Bestätigt am …“ nur nach einem echten Klick, nicht wenn die Kenntnis durch einen
 * Widerspruch belegt ist (Nachweis „verstanden“ mit Quelle „widerspruch“).
 */
export async function bestaetigtAm(customerId: string, verstandenAm: string | null): Promise<string | null> {
  if (!verstandenAm) return null;
  // Genau der Nachweis zum Stand am Kunden (gleicher Zeitpunkt aus derselben Transaktion)
  const r = await prisma.datennutzungNachweis.findFirst({
    where: { customerId, art: "verstanden", textVersion: DATENNUTZUNG_VERSION, quelle: { in: ["banner", "detailseite"] }, createdAt: new Date(verstandenAm) },
    select: { createdAt: true },
  });
  return r?.createdAt.toISOString() ?? null;
}

type Tx = Prisma.TransactionClient;

/** Widerspruch je Punkt setzen (nur wenn noch keiner steht) bzw. lösen (nur wenn einer steht); count = geändert. */
const widerspruchSetzen = (tx: Tx, id: string, p: Punkt, now: Date, userId: string | null) =>
  p === "aws"
    ? tx.customer.updateMany({ where: { id, awsWiderspruchAt: null }, data: { awsWiderspruchAt: now, awsWiderspruchUserId: userId } })
    : tx.customer.updateMany({ where: { id, anzeigenlernenWiderspruchAt: null }, data: { anzeigenlernenWiderspruchAt: now, anzeigenlernenWiderspruchUserId: userId } });
const widerspruchLoesen = (tx: Tx, id: string, p: Punkt) =>
  p === "aws"
    ? tx.customer.updateMany({ where: { id, awsWiderspruchAt: { not: null } }, data: { awsWiderspruchAt: null, awsWiderspruchUserId: null } })
    : tx.customer.updateMany({ where: { id, anzeigenlernenWiderspruchAt: { not: null } }, data: { anzeigenlernenWiderspruchAt: null, anzeigenlernenWiderspruchUserId: null } });

function nachweisDaten(ctx: Ctx, o: { art: "angezeigt" | "verstanden" | "widerspruch" | "ruecknahme"; punkt?: Punkt; wortlaut: string; quelle?: string; now: Date }) {
  return {
    customerId: ctx.customerId,
    art: o.art,
    punkt: o.punkt ?? null,
    textVersion: DATENNUTZUNG_VERSION,
    wortlaut: o.wortlaut,
    userId: ctx.userId,
    userEmail: ctx.email ?? null,
    quelle: o.quelle ?? null,
    createdAt: o.now,
  };
}

const actor = (ctx: Ctx) => ({ id: ctx.userId, email: ctx.email ?? null, role: "BUYER" });

/** Erste Anzeige festhalten, falls für diese Textversion noch keine steht (in einer laufenden Transaktion). */
async function anzeigeFesthalten(tx: Tx, ctx: Ctx, quelle: string, now: Date): Promise<boolean> {
  const r = await tx.customer.updateMany({
    where: { id: ctx.customerId, ...ANZEIGE_OFFEN },
    data: { datennutzungAngezeigtAt: now, datennutzungAngezeigtVersion: DATENNUTZUNG_VERSION },
  });
  if (!r.count) return false;
  await tx.datennutzungNachweis.create({ data: nachweisDaten(ctx, { art: "angezeigt", wortlaut: BANNER_WORTLAUT, quelle, now }) });
  return true;
}

/**
 * Erste Anzeige bei einem Inhaber (Beginn der 14 Tage, belegbar): Banner im Browser eingeblendet bzw. Detailseite
 * geöffnet. Einmal je Textversion und Kunde; weitere Aufrufe ändern nichts. true = jetzt festgehalten.
 */
export async function merkeAnzeige(ctx: Ctx, quelle: "banner" | "detailseite", now = new Date()): Promise<boolean> {
  const stand = await ladeStand(ctx);
  if (!stand?.darf || stand.angezeigtAm) return false;
  const neu = await prisma.$transaction((tx) => anzeigeFesthalten(tx, ctx, quelle, now));
  if (neu) await audit("datennutzung.angezeigt", { entity: "Customer", entityId: ctx.customerId, customerId: ctx.customerId, details: { version: DATENNUTZUNG_VERSION, quelle }, actor: actor(ctx) });
  return neu;
}

/** „Verstanden“ speichern (einmal je Textversion); holt die erste Anzeige nach, falls sie noch fehlt. */
async function verstandenSpeichern(ctx: Ctx, quelle: "banner" | "detailseite" | "widerspruch", now: Date): Promise<boolean> {
  const neu = await prisma.$transaction(async (tx) => {
    await anzeigeFesthalten(tx, ctx, quelle, now);
    const r = await tx.customer.updateMany({
      where: { id: ctx.customerId, ...VERSTANDEN_OFFEN },
      data: { datennutzungVerstandenAt: now, datennutzungVerstandenVersion: DATENNUTZUNG_VERSION, datennutzungVerstandenUserId: ctx.userId },
    });
    if (!r.count) return false;
    await tx.datennutzungNachweis.create({ data: nachweisDaten(ctx, { art: "verstanden", wortlaut: BANNER_WORTLAUT, quelle, now }) });
    return true;
  });
  if (neu) await audit("datennutzung.verstanden", { entity: "Customer", entityId: ctx.customerId, customerId: ctx.customerId, details: { version: DATENNUTZUNG_VERSION, quelle }, actor: actor(ctx) });
  return neu;
}

/**
 * „Verstanden“: Datum, Login und Textversion am Kunden und im Nachweis. Danach ist das Banner für den ganzen Kunden
 * weg (alle Inhaber, alle Geräte). Ein zweiter Klick ändert nichts. false = dieser Login darf das nicht.
 */
export async function bestaetigeHinweis(ctx: Ctx, quelle: "banner" | "detailseite", now = new Date()): Promise<boolean> {
  const stand = await ladeStand(ctx);
  if (!stand?.darf) return false;
  if (!stand.verstandenAm) await verstandenSpeichern(ctx, quelle, now);
  return true;
}

export type WiderspruchErgebnis = { ok: true; punkte: Punkt[] } | { ok: false; error: string };

const NUR_INHABER = "Das kann nur der Inhaber Ihres Zugangs.";

/**
 * Widerspruch gegen einen oder beide Punkte. Sofort wirksam (lib/anzeigenlernen.ts bzw. lib/datennutzung-sperre.ts),
 * je Punkt mit Datum und Login am Kunden und im Nachweis; Aufgabe und Push an die Admins. Ein Widerspruch belegt auch
 * die Kenntnis des Hinweises: das Banner verschwindet, im Nachweis steht „verstanden“ mit Quelle „widerspruch“.
 * punkte = die neu widersprochenen (schon widersprochene bleiben unverändert).
 */
export async function widerspreche(ctx: Ctx, auswahl: unknown, now = new Date()): Promise<WiderspruchErgebnis> {
  const stand = await ladeStand(ctx);
  if (!stand?.darf) return { ok: false, error: NUR_INHABER };
  const gewaehlt = WIDERSPRUCH_PUNKTE.filter((p) => Array.isArray(auswahl) && auswahl.includes(p));
  if (!gewaehlt.length) return { ok: false, error: "Bitte mindestens einen Punkt wählen." };
  const neu: Punkt[] = [];
  for (const p of gewaehlt) {
    const gesetzt = await prisma.$transaction(async (tx) => {
      const r = await widerspruchSetzen(tx, ctx.customerId, p, now, ctx.userId);
      if (!r.count) return false;
      await tx.datennutzungNachweis.create({ data: nachweisDaten(ctx, { art: "widerspruch", punkt: p, wortlaut: punktWortlaut(p), quelle: "detailseite", now }) });
      return true;
    });
    if (!gesetzt) continue;
    neu.push(p);
    await audit("datennutzung.widerspruch", { entity: "Customer", entityId: ctx.customerId, customerId: ctx.customerId, details: { punkt: p, version: DATENNUTZUNG_VERSION }, actor: actor(ctx) });
  }
  if (!stand.verstandenAm) await verstandenSpeichern(ctx, "widerspruch", now);
  if (neu.length) await meldeAdmins(ctx, "widerspruch", neu, { now, angezeigtAm: stand.angezeigtAm });
  return { ok: true, punkte: neu };
}

/** Widerspruch zu einem Punkt zurücknehmen: sofort wieder an, Nachweis, Aufgabe und Push an die Admins. */
export async function nimmZurueck(ctx: Ctx, punkt: unknown, now = new Date()): Promise<WiderspruchErgebnis> {
  const stand = await ladeStand(ctx);
  if (!stand?.darf) return { ok: false, error: NUR_INHABER };
  if (!istPunkt(punkt)) return { ok: false, error: "Punkt nicht gefunden." };
  const geloest = await prisma.$transaction(async (tx) => {
    const r = await widerspruchLoesen(tx, ctx.customerId, punkt);
    if (!r.count) return false;
    await tx.datennutzungNachweis.create({
      data: nachweisDaten(ctx, { art: "ruecknahme", punkt, wortlaut: `${DETAIL_TEXT.zuruecknehmen}: ${DIALOG_TEXT.punkte[punkt].label}`, quelle: "detailseite", now }),
    });
    return true;
  });
  if (!geloest) return { ok: true, punkte: [] };
  await audit("datennutzung.ruecknahme", { entity: "Customer", entityId: ctx.customerId, customerId: ctx.customerId, details: { punkt, version: DATENNUTZUNG_VERSION }, actor: actor(ctx) });
  await meldeAdmins(ctx, "ruecknahme", [punkt], { now, angezeigtAm: stand.angezeigtAm });
  return { ok: true, punkte: [punkt] };
}

const FRIST_MS = 14 * 24 * 60 * 60 * 1000;
const uhrzeit = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(d);

/** Titel und Notiz der Admin-Aufgabe (rein, getestet). */
export function adminAufgabe(o: { art: "widerspruch" | "ruecknahme"; name: string; punkte: Punkt[]; customerId: string; email: string | null; now: Date; angezeigtAm: string | null }): { title: string; note: string; push: { title: string; body: string } } {
  const liste = o.punkte.map((p) => DIALOG_TEXT.punkte[p].label).join(" und ");
  const wer = `am ${tagText(o.now)} um ${uhrzeit(o.now)} Uhr von ${o.email ?? "unbekannt"} (Einstellungen → ${DATENNUTZUNG_EINTRAG})`;
  const ort = `Kunden-ID ${o.customerId} · Kundenakte: /admin/neu/kunden/${o.customerId}`;
  if (o.art === "ruecknahme") {
    return {
      title: `Widerspruch zurückgenommen ${o.name}: ${liste}`,
      note: [
        `Im Kundenbereich zurückgenommen ${wer}.`,
        o.punkte.includes("anzeigenlernen") ? "Anzeigenlernen: Der Kunde nimmt wieder am gemeinsamen Lernen teil." : null,
        o.punkte.includes("aws") ? "Amazon Web Services: KI-Hilfe für Gesprächszusammenfassungen, Vorschläge für die Gründe und das Auslesen von Unterlagen sind für das Konto wieder an." : null,
        "Zu tun: nichts, zur Kenntnis.",
        ort,
      ]
        .filter(Boolean)
        .join("\n"),
      push: { title: `Widerspruch zurückgenommen: ${o.name}`, body: liste },
    };
  }
  const frist = o.angezeigtAm
    ? `Banner erstmals angezeigt am ${tagText(o.angezeigtAm)}, der Widerspruch kam ${o.now.getTime() - new Date(o.angezeigtAm).getTime() <= FRIST_MS ? "innerhalb" : "nach Ablauf"} der 14 Tage.`
    : "Banner bisher keinem Inhaber angezeigt, der Widerspruch kam über die Detailseite.";
  return {
    title: `Widerspruch ${o.name}: ${liste}`,
    note: [
      `Im Kundenbereich widersprochen ${wer}.`,
      frist,
      o.punkte.includes("anzeigenlernen")
        ? "Anzeigenlernen: Der Kunde ist ab sofort vom gemeinsamen Lernen ausgenommen. Zu tun: prüfen, ob seine Anzeigen schon als Vorlage für andere Kunden genutzt wurden, und diese Anzeigen ersetzen."
        : null,
      o.punkte.includes("aws")
        ? "Amazon Web Services: KI-Hilfe für Gesprächszusammenfassungen, Vorschläge für die Gründe und das Auslesen von Unterlagen sind für das Konto ab sofort aus. Zu tun: nichts weiter."
        : null,
      ort,
    ]
      .filter(Boolean)
      .join("\n"),
    push: { title: `Widerspruch: ${o.name}`, body: liste },
  };
}

/** Aufgabe in „Heute“ des Admins und Push (wie bei der Kündigung im Kundenbereich). Fehler stoppen den Ablauf nicht. */
async function meldeAdmins(ctx: Ctx, art: "widerspruch" | "ruecknahme", punkte: Punkt[], o: { now: Date; angezeigtAm: string | null }) {
  try {
    const c = await prisma.customer.findUnique({
      where: { id: ctx.customerId },
      select: { name: true, salesContact: { select: { id: true } }, onboarding: { select: { salesContactId: true } } },
    });
    const a = adminAufgabe({ art, name: c?.name ?? "Kunde", punkte, customerId: ctx.customerId, email: ctx.email ?? null, now: o.now, angezeigtAm: o.angezeigtAm });
    await prisma.salesTask.create({
      data: { contactId: c?.salesContact?.id ?? c?.onboarding?.salesContactId ?? null, type: "SONSTIGES", title: a.title.slice(0, 250), note: a.note, dueAt: o.now },
    });
    const { sendToAdmins } = await import("@/lib/push");
    await sendToAdmins({ ...a.push, url: `/admin/neu/kunden/${ctx.customerId}`, tag: `datennutzung:${ctx.customerId}` }).catch(() => {});
  } catch (err) {
    reportError(err, "datennutzung-aufgabe", { customer: ctx.customerId });
  }
}
