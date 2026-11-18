// Gesprächszusammenfassung nach dem Termin, Datenbank-Teil (Paket M5, Ole 18.11.2026, docs/plan-mail-vorlagen.md).
// Stufe „ein Tipp“ (Vorlage „beratungsdoku“, Customer.mailAblauf): im Blatt „Angebot senden“ als Haken
// „Gesprächszusammenfassung mitsenden“ (geht als PDF mit der Angebots-Mail, lib/angebot-senden-server.ts) und nach
// „Habe ich selbst gesendet“ als Vorschlag „Zusammenfassung ablegen“ bzw. „per App senden“.
//
//   ladeZusammenfassung           Entwurf ohne KI (lib/mail/beratung.ts zusammenfassungEntwurf) aus Terminvorbereitung,
//                                 Chat-Angaben, Vorverträgen und Notizen; Kopf fürs PDF; KI-Knopf ja/nein; Versandwege
//   zusammenfassungKi             „Mit KI formulieren“ (nur EU-KI, nie bei Gesundheitssparten, lib/mail/beratung-ki.ts)
//   zusammenfassungPdfDaten       PDF für „PDF öffnen“, Teilen bzw. Herunterladen (Weg Mailprogramm), nicht abgelegt
//   zusammenfassungAblegen        PDF unter Dokumente als „Beratungsdokumentation“ (bleibt beim Löschen, lib/erasure.ts)
//   zusammenfassungSenden         Vorlage „Gesprächszusammenfassung“ über die App mit dem PDF, danach abgelegt
//   zusammenfassungSelbstGesendet „Gesendet?“ → Ja nach Mailprogramm oder Kopieren: Verlauf und Ablage
// Die App prüft vor jedem Ablegen und Senden, dass keine Stelle „[bitte ergänzen]“ mehr offen ist. Ansehen vor dem
// Senden erzwingt das Blatt (Knopf aktiv erst nach der Ansicht der aktuellen Fassung).

import { prisma } from "@/lib/prisma";
import { asAnsprache, type Ansprache } from "@/lib/ansprache";
import { appointmentScope, type TeamCtx } from "@/lib/team";
import { beitragAus, beitragEffektiv, cleanAngebote, gewaehlte } from "@/lib/angebote-daten";
import { angebotThema, kombiSatz } from "@/lib/angebot-senden";
import { topicOf } from "@/lib/lead-sequences";
import { istTierLead } from "@/lib/gesundheitsdaten";
import { bedrockEu } from "@/lib/ki-eu-konfig";
import { zusammenfassungEntwurf, zusammenfassungFehlt } from "@/lib/mail/beratung";
import { beraterName, beratungsPdf, type BeratungsPdf } from "@/lib/mail/beratung-pdf";
import { kiZusammenfassung, kiZusammenfassungStatus, type KiErgebnis } from "@/lib/mail/beratung-ki";
import { gruendeVorschlagen, vorschlagInfo, type VorschlagErgebnis } from "@/lib/mail/gruende-ki";
import type { VorschlagInfo } from "@/lib/mail/beratung";
import { leseMailAblauf } from "@/lib/mail/ablauf";
import { fuelle, werteFuer } from "@/lib/mail/platzhalter";
import { vorlageFuer } from "@/lib/mail/vorlagen-mail";
import { saveLeadFile } from "@/lib/lead-files";

export type ZusammenfassungText = { wuensche: string; rat: string; /** Text kam (zuletzt) von der KI */ ki?: boolean };

export type ZusammenfassungInfo = {
  an: Ansprache;
  entwurf: { wuensche: string; rat: string };
  /** Kopf des PDFs (Kunde, Thema, Berater) für die Ansicht im Blatt */
  kopf: { kunde: string; produkt: string; berater: string };
  /** Knopf „Mit KI formulieren“ zeigen (EU-KI eingerichtet, keine Gesundheitssparte) */
  ki: boolean;
  /** „Vorschlag erstellen“ für die Gründe (null = keine EU-KI) */
  vorschlag: VorschlagInfo;
  /** Über die App senden möglich (Adresse, Versandweg, E-Mail-Funktionen an) */
  appVersand: boolean;
  email: string | null;
  /** Vorlage „Gesprächszusammenfassung“ für Mailprogramm und Kopieren, {wuensche} und {rat} noch offen, ohne Signatur */
  mail: { subject: string; body: string };
  /** Zuletzt abgelegte Zusammenfassung zu diesem Termin */
  abgelegt: { id: string; fileName: string; createdAt: string } | null;
};

const DAY = 24 * 60 * 60 * 1000;

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
          phone: true,
          source: true,
          formData: true,
          vorvertraege: true,
          erasedAt: true,
          customer: { select: { leadAddress: true, mailAblauf: true, mailFeaturesOff: true } },
        },
      },
    },
  });
}
type Termin = NonNullable<Awaited<ReturnType<typeof termin>>>;

/** Gewählte Tarife (ohne Cross-Selling-Sparten), Thema, Kombi-Satz und Schutz-Überblick aus offersJson. */
function auswahlAus(offersJson: unknown, fallbackThema: string) {
  const d = cleanAngebote(offersJson ?? {});
  const items = gewaehlte(d).filter((i) => !i.zusatz);
  const thema = items.length ? angebotThema(items.map((i) => i.sparte), fallbackThema) : fallbackThema;
  return {
    thema,
    sparten: items.map((i) => i.sparte),
    auswahl: items.map((i) => ({ sparte: i.sparte, gesellschaft: i.gesellschaft, tarif: i.tarif, beitrag: beitragEffektiv(i), leistungen: i.leistungen })),
    kombi: kombiSatz(beitragAus(d).rabatt, thema),
    schutz: d.schutz ?? [],
  };
}

/** Stufe der Vorlage „Gesprächszusammenfassung“ (aus = kein Haken, kein Vorschlag). */
const stufeAn = (mailAblauf: unknown) => leseMailAblauf(mailAblauf).stufen.beratungsdoku !== "aus";

/** Entwurf, Kopf und Wege fürs Blatt; null ohne Termin bzw. bei Stufe „aus“. */
export async function ladeZusammenfassung(appointmentId: string, ctx: TeamCtx, now = new Date()): Promise<ZusammenfassungInfo | null> {
  const t = await termin(appointmentId, ctx);
  const lead = t?.lead;
  if (!t || !lead || lead.erasedAt || !stufeAn(lead.customer.mailAblauf)) return null;
  return zusammenfassungFuer(t, ctx, now);
}

async function zusammenfassungFuer(t: Termin, ctx: TeamCtx, now: Date): Promise<ZusammenfassungInfo> {
  const lead = t.lead!;
  const an = asAnsprache(lead.customer.leadAddress);
  const [conv, notizen, vorbereitung, abgelegt, { leadVersandKontext, resendBereit }] = await Promise.all([
    t.conversationId
      ? prisma.conversation.findUnique({ where: { id: t.conversationId }, select: { qualificationData: true, qualificationSummary: true, contactEmail: true } })
      : prisma.conversation.findFirst({ where: { leadId: lead.id }, orderBy: { lastMessageAt: "desc" }, select: { qualificationData: true, qualificationSummary: true, contactEmail: true } }),
    // Notizen rund um den Termin (ab 3 Tage vorher), neueste zuerst
    prisma.leadHistory.findMany({
      where: { leadId: lead.id, kind: "notiz", createdAt: { gte: new Date(t.startsAt.getTime() - 3 * DAY) } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { text: true },
    }),
    import("@/lib/termin-vorbereitung-server").then((m) => m.loadVorbereitung(t.id, ctx)),
    prisma.leadFile.findFirst({
      where: { leadId: lead.id, kind: "beratungsdoku", createdAt: { gte: new Date(t.startsAt.getTime() - DAY) } },
      orderBy: { createdAt: "desc" },
      select: { id: true, fileName: true, createdAt: true },
    }),
    import("@/lib/mail/lead-versand"),
  ]);
  const { klaerenPunkte } = await import("@/lib/terminvorbereitung-neu");
  const { thema, sparten, auswahl, kombi, schutz } = auswahlAus(t.offersJson, topicOf(lead.formData, lead.source, an));
  const entwurf = zusammenfassungEntwurf({
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
  });
  const k = await leadVersandKontext(lead.customerId, { leadId: lead.id, schreiber: ctx.userId ?? null, nurLesen: true });
  const email = lead.email?.trim() || conv?.contactEmail?.trim() || null;
  const vorlage = await vorlageFuer(lead.customerId, "beratungsdoku", an);
  const { ansprechpartner } = await import("@/lib/lead-anrede");
  const who = await ansprechpartner({ customerId: lead.customerId, leadId: lead.id, phone: lead.phone, name: lead.name });
  const werte = {
    ...werteFuer({ name: lead.name, source: thema, firstName: who.kontakt.firstName, lastName: who.kontakt.lastName, salutation: who.kontakt.salutation }, k.daten.name, { ansprache: an, now }),
    produkt: thema,
    signatur: "",
    wuensche: "{wuensche}",
    rat: "{rat}",
  };
  return {
    an,
    entwurf,
    kopf: { kunde: lead.name?.trim() || "", produkt: thema, berater: await beraterName(ctx.userId, vorbereitung?.termin.berater || k.daten.name) },
    ki: kiZusammenfassungStatus({ konfig: bedrockEu(), produkt: lead.source, sparten }).moeglich,
    vorschlag: vorschlagInfo({ konfig: bedrockEu(), themen: [lead.source, thema], auswahl }),
    appVersand: !!email && !lead.customer.mailFeaturesOff && (!!k.postfach || resendBereit()),
    email,
    mail: { subject: fuelle(vorlage.subject, werte).replace(/\s+/g, " ").trim(), body: fuelle(vorlage.body, werte) },
    abgelegt: abgelegt ? { id: abgelegt.id, fileName: abgelegt.fileName, createdAt: abgelegt.createdAt.toISOString() } : null,
  };
}

const sauber = (z: ZusammenfassungText) => ({ wuensche: String(z?.wuensche ?? "").slice(0, 6000), rat: String(z?.rat ?? "").slice(0, 6000), ki: z?.ki === true });

/** „Mit KI formulieren“: prüft die Freigabe erneut (EU-KI, keine Gesundheitssparte) und formuliert den Text um. */
export async function zusammenfassungKi(appointmentId: string, ctx: TeamCtx, text: ZusammenfassungText, deps: { client?: Parameters<typeof kiZusammenfassung>[1]["client"] } = {}): Promise<KiErgebnis> {
  const t = await termin(appointmentId, ctx);
  const lead = t?.lead;
  if (!t || !lead || lead.erasedAt) return { ok: false, error: "Termin nicht gefunden." };
  const an = asAnsprache(lead.customer.leadAddress);
  const { sparten } = auswahlAus(t.offersJson, "");
  const konfig = bedrockEu();
  if (!kiZusammenfassungStatus({ konfig, produkt: lead.source, sparten }).moeglich) return { ok: false, error: "Mit KI formulieren ist hier nicht möglich." };
  return kiZusammenfassung(sauber(text), { an, tier: istTierLead(lead.source), konfig, client: deps.client });
}

/**
 * „Vorschlag erstellen“ für die Gründe (Gesprächszusammenfassung und Beratungsdokumentation): Tarifauswahl vom Termin,
 * Wünsche aus dem Blatt (lib/mail/gruende-ki.ts filtert Gesundheitsangaben, strikt bei Gesundheitssparten).
 */
export async function gruendeVorschlag(
  appointmentId: string,
  ctx: TeamCtx,
  wuensche: string,
  deps: NonNullable<Parameters<typeof gruendeVorschlagen>[1]> = {},
): Promise<VorschlagErgebnis> {
  const t = await termin(appointmentId, ctx);
  const lead = t?.lead;
  if (!t || !lead || lead.erasedAt) return { ok: false, error: "Termin nicht gefunden." };
  const an = asAnsprache(lead.customer.leadAddress);
  const { thema, auswahl } = auswahlAus(t.offersJson, topicOf(lead.formData, lead.source, an));
  return gruendeVorschlagen(
    { an, themen: [lead.source, thema], auswahl, wuensche: String(wuensche ?? "").slice(0, 6000), tier: istTierLead(lead.source) },
    { konfig: deps.konfig, client: deps.client },
  );
}

/** PDF erzeugen (ohne Ablage), z. B. für „PDF öffnen“ oder das eigene Mailprogramm. */
export async function zusammenfassungPdfDaten(appointmentId: string, ctx: TeamCtx, text: ZusammenfassungText, now = new Date()): Promise<{ ok: true; pdf: BeratungsPdf; leadId: string; customerId: string } | { ok: false; error: string }> {
  const t = await termin(appointmentId, ctx);
  const lead = t?.lead;
  if (!t || !lead || lead.erasedAt) return { ok: false, error: "Termin nicht gefunden." };
  const z = sauber(text);
  const fehlt = zusammenfassungFehlt(z);
  if (fehlt) return { ok: false, error: fehlt };
  const an = asAnsprache(lead.customer.leadAddress);
  const { thema } = auswahlAus(t.offersJson, topicOf(lead.formData, lead.source, an));
  const vb = await import("@/lib/termin-vorbereitung-server").then((m) => m.loadVorbereitung(t.id, ctx));
  const pdf = await beratungsPdf({ an, kunde: lead.name ?? "", produkt: thema, berater: await beraterName(ctx.userId, vb?.termin.berater ?? ""), wuensche: z.wuensche, rat: z.rat, now });
  return { ok: true, pdf, leadId: lead.id, customerId: lead.customerId };
}

type Abgelegt = { ok: true; dateiId: string; fileName: string } | { ok: false; error: string };

/** PDF unter Dokumente ablegen (Dokumentart „Beratungsdokumentation“). */
export async function zusammenfassungAblegen(
  appointmentId: string,
  ctx: TeamCtx,
  text: ZusammenfassungText,
  deps: { now?: Date; userId?: string | null; verlauf?: string; fertig?: Awaited<ReturnType<typeof zusammenfassungPdfDaten>> } = {},
): Promise<Abgelegt> {
  const r = deps.fertig ?? (await zusammenfassungPdfDaten(appointmentId, ctx, text, deps.now));
  if (!r.ok) return r;
  const ki = text?.ki === true ? " (Entwurf mit KI formuliert, geprüft)" : "";
  const saved = await saveLeadFile({
    leadId: r.leadId,
    customerId: r.customerId,
    kind: "beratungsdoku",
    fileName: r.pdf.fileName,
    data: r.pdf.data,
    userId: deps.userId ?? ctx.userId ?? null,
    verlauf: `${deps.verlauf ?? "Gesprächszusammenfassung abgelegt"}${ki}: ${r.pdf.fileName}`,
  });
  return saved.ok ? { ok: true, dateiId: saved.id, fileName: r.pdf.fileName } : saved;
}

/** Vorlage „Gesprächszusammenfassung“ über die App senden (PDF im Anhang), danach abgelegt. */
export async function zusammenfassungSenden(appointmentId: string, ctx: TeamCtx, text: ZusammenfassungText, deps: { now?: Date; userId?: string | null } = {}): Promise<Abgelegt> {
  const t = await termin(appointmentId, ctx);
  const lead = t?.lead;
  if (!t || !lead || lead.erasedAt) return { ok: false, error: "Termin nicht gefunden." };
  if (!stufeAn(lead.customer.mailAblauf)) return { ok: false, error: "Die Gesprächszusammenfassung ist in Ihren Einstellungen aus." };
  const r = await zusammenfassungPdfDaten(appointmentId, ctx, text, deps.now);
  if (!r.ok) return r;
  const z = sauber(text);
  const { sendeVorlagenMail } = await import("@/lib/mail/vorlagen-mail");
  const res = await sendeVorlagenMail(lead.id, "beratungsdoku", {
    automatisch: false,
    userId: deps.userId ?? ctx.userId ?? null,
    werte: { wuensche: z.wuensche.trim(), rat: z.rat.trim() },
    anhaenge: [{ fileName: r.pdf.fileName, contentType: "application/pdf", data: Buffer.from(r.pdf.data) }],
    now: deps.now,
  });
  if (!res.sent) {
    const { SPERR_TEXT } = await import("@/lib/mail/sperren");
    const grund = (SPERR_TEXT as Record<string, string>)[res.reason] ?? (res.reason === "not_configured" ? "Der Versand über die App ist gerade nicht eingerichtet." : `Senden hat nicht geklappt (${res.reason}).`);
    return { ok: false, error: grund };
  }
  return zusammenfassungAblegen(appointmentId, ctx, text, { ...deps, fertig: r, verlauf: "Gesprächszusammenfassung per E-Mail gesendet und abgelegt" });
}

/**
 * „Gesendet?“ → Ja nach dem eigenen Mailprogramm bzw. Kopieren (Paket M1): Eintrag im Verlauf (Kennzeichen „eigenes
 * Mailprogramm“) und Ablage des PDFs, falls es noch nicht abgelegt ist (dateiId).
 */
export async function zusammenfassungSelbstGesendet(
  appointmentId: string,
  ctx: TeamCtx,
  input: ZusammenfassungText & { to: string; subject: string; text: string; dateiId?: string | null },
  deps: { now?: Date; userId?: string | null } = {},
): Promise<Abgelegt> {
  const t = await termin(appointmentId, ctx);
  const lead = t?.lead;
  if (!t || !lead || lead.erasedAt) return { ok: false, error: "Termin nicht gefunden." };
  const { protokolliereMail } = await import("@/lib/mail/kontakt-mail");
  await protokolliereMail(
    { customerId: lead.customerId, leadId: lead.id, art: "beratungsdoku", automatisch: false, userId: deps.userId ?? ctx.userId ?? null },
    { to: (input.to || lead.email || "unbekannt").slice(0, 320), subject: String(input.subject ?? "").trim().slice(0, 200) || "Gesprächszusammenfassung", text: String(input.text ?? "").trim().slice(0, 20000), status: "versendet", provider: "mailprogramm" },
    deps.now,
  );
  if (input.dateiId) {
    const f = await prisma.leadFile.findFirst({ where: { id: input.dateiId, leadId: lead.id, kind: "beratungsdoku" }, select: { id: true, fileName: true } });
    if (f) return { ok: true, dateiId: f.id, fileName: f.fileName };
  }
  return zusammenfassungAblegen(appointmentId, ctx, input, { ...deps, verlauf: "Gesprächszusammenfassung selbst gesendet und abgelegt" });
}
