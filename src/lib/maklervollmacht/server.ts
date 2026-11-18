// Maklervollmacht digital (Ole, 18.11.2026; nur Makler): anlegen, Link, öffentliche Seite laden, unterschreiben,
// PDFs (gesamt und je Versicherer), Kopie an den Kunden, Widerruf. Rechtsgrundlage: docs/rechtstexte/maklervollmacht-2026-11-18.md.
// Regeln/Texte rein in lib/maklervollmacht/regeln.ts und texte.ts. Bestehende Verträge stehen in der Vollmacht (Json);
// nach der Unterschrift legt lib/maklervollmacht/uebertragung.ts sie als laufende Bestandsübertragung (LeadContract) an.
// Sie zählen erst nach Bestätigung, nur mit Bestandsprovision.

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { decryptBytes, encryptBytes } from "@/lib/encryption";
import { logLeadHistory } from "@/lib/lead-history";
import { asAnsprache, type Ansprache } from "@/lib/ansprache";
import { publicUrlOr } from "@/lib/public-url";
import {
  gesundheitNoetig,
  leseUebertragung,
  uebertragungsStand,
  versichererKey,
  versichererListe,
  type VvDaten,
  type VvEingabe,
  type VvVertrag,
} from "@/lib/maklervollmacht/regeln";
import {
  VV_TEXT_VERSION,
  einwilligungGesundheit,
  kopieMail,
  kundeName,
  maklerauftrag,
  protokoll,
  uebertragungsschreiben,
  vollmacht,
  type VvAbschnitt,
  type VvKontext,
  type VvKopie,
  type VvMakler,
} from "@/lib/maklervollmacht/texte";
import { sha256, vollmachtPdf } from "@/lib/maklervollmacht/pdf";

/** Link gilt 14 Tage (Rechtsprüfung 1.5), nach der Unterschrift ist er gesperrt. */
export const VV_LINK_TAGE = 14;
const DAY = 86_400_000;

export const vollmachtPfad = (token: string) => `/vollmacht/${token}`;
export const vollmachtLink = (token: string) => publicUrlOr(vollmachtPfad(token));

export async function istMakler(customerId: string): Promise<boolean> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { vermittlerTyp: true } });
  return c?.vermittlerTyp === "makler";
}

/** Angaben des Maklers aus der Erstinformation (Pflichtangaben), Rückfall Kundenname. */
export async function maklerDaten(customerId: string): Promise<VvMakler & { erstinfoToken: string | null }> {
  const [e, c] = await Promise.all([
    prisma.erstinformation.findUnique({ where: { customerId }, select: { name: true, firma: true, anschrift: true, telefon: true, email: true, registerNummer: true, token: true } }),
    prisma.customer.findUnique({ where: { id: customerId }, select: { name: true } }),
  ]);
  const name = e?.name?.trim() || e?.firma?.trim() || c?.name?.trim() || "Ihr Makler";
  return {
    name,
    firma: e?.firma?.trim() || null,
    anschrift: e?.anschrift?.trim() || null,
    registernummer: e?.registerNummer?.trim() || null,
    email: e?.email?.trim() || null,
    telefon: e?.telefon?.trim() || null,
    erstinfoToken: e?.token ?? null,
  };
}

/** Offene oder unterschriebene Vollmacht eines Leads anlegen bzw. die bestehende zurückgeben. */
export async function vollmachtAnlegen(leadId: string, customerId: string, opts: { userId?: string | null } = {}) {
  if (!(await istMakler(customerId))) return { ok: false as const, error: "Die Maklervollmacht gibt es nur für Makler." };
  const lead = await prisma.lead.findFirst({ where: { id: leadId, customerId }, select: { id: true, customer: { select: { leadAddress: true } } } });
  if (!lead) return { ok: false as const, error: "Kontakt nicht gefunden." };
  const offen = await prisma.maklervollmacht.findFirst({ where: { leadId, status: { in: ["offen", "unterschrieben", "eigene"] } }, orderBy: { createdAt: "desc" } });
  // Eigene Vollmacht liegt vor (Haken in der Karte): die App schickt diesem Kunden nichts
  if (offen?.status === "eigene") return { ok: false as const, error: "Für diesen Kunden liegt eine eigene Vollmacht vor." };
  if (offen && (offen.status === "unterschrieben" || offen.createdAt.getTime() > Date.now() - VV_LINK_TAGE * DAY)) return { ok: true as const, vollmacht: offen };
  const v = await prisma.maklervollmacht.create({
    data: { customerId, leadId, token: randomBytes(24).toString("base64url"), ansprache: asAnsprache(lead.customer.leadAddress) },
  });
  await logLeadHistory(leadId, "dokument", "Maklervollmacht angefordert", { customerId, userId: opts.userId ?? null });
  return { ok: true as const, vollmacht: v };
}

/** Vorschlag für die Formularfelder aus dem Kontakt (Name, E-Mail, Adresse aus dem Leadformular, falls vorhanden). */
async function vorschlag(leadId: string): Promise<Partial<VvDaten>> {
  const l = await prisma.lead.findUnique({ where: { id: leadId }, select: { name: true, email: true, formData: true } });
  // formData ist meist eine Liste [{label, value}] (Leadformular), ältere Einträge ein Objekt {feld: wert}
  const roh = l?.formData ?? {};
  const f: Record<string, unknown> = Array.isArray(roh)
    ? Object.fromEntries(
        roh.flatMap((x) => {
          const o = (x ?? {}) as { label?: unknown; value?: unknown };
          return typeof o.label === "string" ? [[o.label, o.value]] : [];
        }),
      )
    : (roh as Record<string, unknown>);
  const pick = (...keys: string[]) => {
    for (const k of Object.keys(f)) if (keys.some((x) => k.toLowerCase().replace(/[^a-zäöüß]/g, "").includes(x))) {
      const v = String(f[k] ?? "").trim();
      if (v) return v;
    }
    return "";
  };
  const name = (l?.name ?? "").trim();
  const [vorname, ...rest] = name.split(/\s+/);
  return {
    vorname: pick("vorname", "firstname") || vorname || "",
    nachname: pick("nachname", "lastname") || rest.join(" ") || "",
    strasse: pick("strasse", "straße", "street", "adresse"),
    plz: pick("plz", "postleitzahl", "zip").replace(/\D/g, "").slice(0, 5),
    ort: pick("ort", "stadt", "city", "wohnort"),
    email: l?.email ?? "",
  };
}

export type VvSeite =
  | { zustand: "ungueltig" }
  | { zustand: "abgelaufen"; makler: VvMakler }
  | { zustand: "fertig"; makler: VvMakler; an: Ansprache; customerId: string }
  | { zustand: "offen"; makler: VvMakler; an: Ansprache; customerId: string; vorschlag: Partial<VvDaten>; erstinfoUrl: string | null };

export async function ladeSeite(token: string, now = new Date()): Promise<VvSeite> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { zustand: "ungueltig" };
  const v = await prisma.maklervollmacht.findUnique({ where: { token } });
  // widerrufen bzw. „eigene Vollmacht liegt vor“: Link gesperrt
  if (!v || (v.status !== "offen" && v.status !== "unterschrieben")) return { zustand: "ungueltig" };
  const makler = await maklerDaten(v.customerId);
  const an = asAnsprache(v.ansprache);
  if (v.status === "unterschrieben") return { zustand: "fertig", makler, an, customerId: v.customerId };
  if (v.createdAt.getTime() < now.getTime() - VV_LINK_TAGE * DAY) return { zustand: "abgelaufen", makler };
  return {
    zustand: "offen",
    makler,
    an,
    customerId: v.customerId,
    vorschlag: await vorschlag(v.leadId),
    erstinfoUrl: makler.erstinfoToken ? publicUrlOr(`/erstinformation/${makler.erstinfoToken}`) : null,
  };
}

const berlin = (d: Date) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return { datum: `${p.day}.${p.month}.${p.year}`, uhrzeit: `${p.hour}:${p.minute}` };
};

/** IPv4 auf /24, IPv6 auf die ersten vier Blöcke kürzen (Protokoll im PDF ohne vollständige IP). */
export function ipKurz(ip: string | null): string | null {
  if (!ip) return null;
  const v4 = /^(\d+\.\d+\.\d+)\.\d+$/.exec(ip.trim());
  if (v4) return `${v4[1]}.0`;
  if (ip.includes(":")) return `${ip.split(":").slice(0, 4).join(":")}::`;
  return null;
}

function kontext(v: { id: string; signedAt: Date | null }, makler: VvMakler, kunde: VvDaten, vertraege: VvVertrag[]): VvKontext {
  const t = berlin(v.signedAt ?? new Date());
  return { makler, kunde, vertraege, datum: t.datum, uhrzeit: t.uhrzeit, dokumentId: v.id };
}

/** Gesamt-PDF für Makler und Kunde: Vollmacht, Maklerauftrag, ggf. Einwilligung, Protokoll mit Prüfsummen. */
async function gesamtPdf(c: VvKontext, p: { an: Ansprache; gesundheit: boolean; signatur: Uint8Array; ip: string | null; ua: string | null; weg: string; kopie: VvKopie }) {
  const dokumente = [vollmacht(c), maklerauftrag(c), ...(p.gesundheit ? [einwilligungGesundheit(c)] : [])];
  const ohneProtokoll = await vollmachtPdf({ titel: `Maklervollmacht ${kundeName(c.kunde)}`, abschnitte: dokumente, signaturPng: p.signatur, dokumentId: c.dokumentId, autor: c.makler.firma ?? c.makler.name });
  const hashes = [{ name: "Vollmacht, Maklerauftrag" + (p.gesundheit ? ", Einwilligung" : ""), sha256: sha256(ohneProtokoll) }];
  const geraet = p.ua ? p.ua.slice(0, 160) : null;
  return vollmachtPdf({
    titel: `Maklervollmacht ${kundeName(c.kunde)}`,
    abschnitte: [...dokumente, protokoll(c, { an: p.an, gesundheit: p.gesundheit, ipKurz: ipKurz(p.ip), geraet, weg: p.weg, hashes, kopie: p.kopie })],
    signaturPng: p.signatur,
    dokumentId: c.dokumentId,
    autor: c.makler.firma ?? c.makler.name,
  });
}

/**
 * Anrede für das Schreiben an den Versicherer aus dem Kontakt (Formular, Korrektur im Kontakt, Bestandskunde), nur wenn
 * der Nachname passt (unterschreibt z. B. der Ehepartner, bleibt es neutral). Nie aus dem Vornamen geraten.
 */
async function anredeAusKontakt(customerId: string, leadId: string, nachname: string): Promise<"Herr" | "Frau" | null> {
  try {
    const { ansprechpartner } = await import("@/lib/lead-anrede");
    const { kontaktParts, salutationOf } = await import("@/lib/ansprache");
    const { kontakt } = await ansprechpartner({ customerId, leadId });
    const last = kontaktParts(kontakt).last.trim().toLowerCase();
    if (last && last !== nachname.trim().toLowerCase()) return null;
    return salutationOf(kontakt.salutation);
  } catch {
    return null;
  }
}

export type VvUnterschriftErgebnis = { ok: true; mailGesendet: boolean } | { ok: false; error: string };

/** Öffentliche Seite: unterschreiben. Nur einmal je Link (Status offen → unterschrieben, gleichzeitige Klicks sicher). */
export async function unterschreiben(token: string, e: VvEingabe, meta: { ip: string | null; ua: string | null }, now = new Date()): Promise<VvUnterschriftErgebnis> {
  const v = await prisma.maklervollmacht.findUnique({ where: { token } });
  if (!v || v.status !== "offen") return { ok: false, error: "Dieser Link ist nicht mehr gültig." };
  if (v.createdAt.getTime() < now.getTime() - VV_LINK_TAGE * DAY) return { ok: false, error: "Dieser Link ist abgelaufen. Bitte fordern Sie einen neuen an." };
  const claimed = await prisma.maklervollmacht.updateMany({ where: { id: v.id, status: "offen" }, data: { status: "unterschrieben", signedAt: now } });
  if (!claimed.count) return { ok: false, error: "Diese Vollmacht ist schon unterschrieben." };

  const an = asAnsprache(v.ansprache);
  const makler = await maklerDaten(v.customerId);
  const gesundheit = e.gesundheit && gesundheitNoetig(e.vertraege);
  const daten: VvDaten = { ...e.daten, anrede: await anredeAusKontakt(v.customerId, v.leadId, e.daten.nachname) };
  const c = kontext({ id: v.id, signedAt: now }, makler, daten, e.vertraege);
  const pdfOpts = { an, gesundheit, signatur: e.signaturPng, ip: meta.ip, ua: meta.ua, weg: v.sentAt ? "Persönlicher Link per E-Mail" : "Persönlicher Link (im Termin oder vom Makler geteilt)" };
  // Fassung für den Kunden (Anhang der Kopie); ohne Adresse schon die endgültige
  const pdf = await gesamtPdf(c, { ...pdfOpts, kopie: e.daten.email ? { status: "anhang", email: e.daten.email } : { status: "keine_adresse" } });
  await prisma.maklervollmacht.update({
    where: { id: v.id },
    data: {
      daten,
      kopieStatus: e.daten.email ? null : "keine_adresse",
      vertraege: e.vertraege,
      gesundheit,
      textVersion: VV_TEXT_VERSION,
      signatur: encryptBytes(e.signaturPng),
      pdf: encryptBytes(pdf),
      signedIp: meta.ip?.slice(0, 64) ?? null,
      signedUa: meta.ua?.slice(0, 400) ?? null,
    },
  });
  await logLeadHistory(v.leadId, "dokument", `Maklervollmacht unterschrieben (${e.vertraege.length} ${e.vertraege.length === 1 ? "Vertrag" : "Verträge"})`, { customerId: v.customerId });
  await audit("maklervollmacht.unterschrieben", { entity: "Lead", entityId: v.leadId, customerId: v.customerId, details: { vollmachtId: v.id, vertraege: e.vertraege.length, gesundheit, textVersion: VV_TEXT_VERSION } });
  // Bestandsübertragung: je Vertrag ein laufender Vertrag am Lead, Aufgabe nach 4 Wochen (darf die Unterschrift nie scheitern lassen)
  await import("@/lib/maklervollmacht/uebertragung")
    .then((m) => m.uebertragungenAnlegen(v.id, now))
    .catch((err) => console.error("[maklervollmacht] Bestandsübertragung", err));

  const { sendToBuyersOfCustomer } = await import("@/lib/push");
  await sendToBuyersOfCustomer(v.customerId, {
    title: "Maklervollmacht unterschrieben",
    body: `${kundeName(e.daten)}: ${e.vertraege.length} ${e.vertraege.length === 1 ? "Vertrag" : "Verträge"} zur Übertragung`,
    url: `/buyer/leads/${v.leadId}`,
    tag: `vollmacht:${v.id}`,
  }).catch(() => {});

  let mailGesendet = false;
  if (e.daten.email) {
    try {
      const { leadVersandKontext, sendeLeadMail } = await import("@/lib/mail/lead-versand");
      const k = await leadVersandKontext(v.customerId, { leadId: v.leadId });
      const res = await sendeLeadMail(k, {
        to: e.daten.email,
        inhalt: () => kopieMail(an, e.daten, makler, c.datum),
        attachments: [{ fileName: `Maklervollmacht-${c.datum.replace(/\./g, "-")}.pdf`, contentType: "application/pdf", data: Buffer.from(pdf) }],
        protokoll: { customerId: v.customerId, leadId: v.leadId, art: "maklervollmacht" },
      });
      mailGesendet = res.sent;
    } catch (err) {
      console.error("[maklervollmacht] Kopie an Kunden", err);
    }
    // Gespeicherte Fassung (Nachweis für den Makler) mit dem tatsächlichen Versandstatus; die Prüfsummen bleiben gleich,
    // weil sie nur die Dokumente ohne Protokoll abdecken. Fehler hier blockieren die Unterschrift nicht.
    try {
      const jetzt = new Date();
      const t = berlin(jetzt);
      const kopie: VvKopie = mailGesendet ? { status: "gesendet", email: e.daten.email, datum: t.datum, uhrzeit: t.uhrzeit } : { status: "fehlgeschlagen", email: e.daten.email };
      const nachweis = await gesamtPdf(c, { ...pdfOpts, kopie });
      await prisma.maklervollmacht.update({ where: { id: v.id }, data: { pdf: encryptBytes(nachweis), kopieStatus: mailGesendet ? "gesendet" : "fehlgeschlagen", kopieAt: jetzt } });
    } catch (err) {
      console.error("[maklervollmacht] Versandstatus der Kopie", err);
    }
  }
  return { ok: true, mailGesendet };
}

/** Für die Kundenakte des Maklers */
export async function vollmachtFuerLead(leadId: string, customerId: string) {
  const v = await prisma.maklervollmacht.findFirst({
    where: { leadId, customerId, status: { not: "widerrufen" } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      token: true,
      status: true,
      vertraege: true,
      gesundheit: true,
      signedAt: true,
      sentAt: true,
      createdAt: true,
      kopieStatus: true,
      uebertragung: true,
      waSentAt: true,
      erinnerungAt: true,
      erinnerungStatus: true,
    },
  });
  if (!v) return null;
  const vertraege = (Array.isArray(v.vertraege) ? v.vertraege : []) as VvVertrag[];
  return {
    ...v,
    vertraege,
    versicherer: versichererListe(vertraege).map((x) => x.versicherer),
    stand: uebertragungsStand(vertraege, leseUebertragung(v.uebertragung)),
    link: vollmachtLink(v.token),
    abgelaufen: v.status === "offen" && v.createdAt.getTime() < Date.now() - VV_LINK_TAGE * DAY,
  };
}

/** Makler hakt ab: Schreiben an einen Versicherer gesendet (oder wieder offen). */
export async function uebertragungMarkieren(id: string, customerId: string, versicherer: string, gesendet: boolean, userId: string | null, now = new Date()): Promise<boolean> {
  const v = await prisma.maklervollmacht.findFirst({ where: { id, customerId, status: "unterschrieben" }, select: { id: true, leadId: true, vertraege: true, uebertragung: true } });
  if (!v) return false;
  const vertraege = (Array.isArray(v.vertraege) ? v.vertraege : []) as unknown as VvVertrag[];
  const gruppe = versichererListe(vertraege).find((g) => versichererKey(g.versicherer) === versichererKey(versicherer));
  if (!gruppe) return false;
  const u = leseUebertragung(v.uebertragung);
  const key = versichererKey(gruppe.versicherer);
  if (gesendet === !!u[key]) return true;
  if (gesendet) u[key] = now.toISOString();
  else delete u[key];
  await prisma.maklervollmacht.update({ where: { id: v.id }, data: { uebertragung: u } });
  await logLeadHistory(v.leadId, "dokument", gesendet ? `Schreiben an ${gruppe.versicherer} gesendet (Maklervollmacht)` : `Schreiben an ${gruppe.versicherer} wieder offen (Maklervollmacht)`, { customerId, userId });
  return true;
}

/**
 * PDF für den Makler: ohne Auswahl „gesamt“ (gespeichert), mit Versicherer dessen Übertragungsschreiben + Vollmacht
 * (+ Einwilligung), mit { offen: true } alle Schreiben an Versicherer, die noch nicht als gesendet abgehakt sind, in einer Datei.
 */
export async function vollmachtPdfFuer(id: string, customerId: string, versicherer: string | null | { offen: true }): Promise<{ name: string; pdf: Uint8Array } | null> {
  const v = await prisma.maklervollmacht.findFirst({ where: { id, customerId, status: "unterschrieben" } });
  if (!v?.pdf || !v.signatur || !v.daten) return null;
  const gespeichert = v.daten as unknown as VvDaten;
  const vertraege = (Array.isArray(v.vertraege) ? v.vertraege : []) as unknown as VvVertrag[];
  const datum = berlin(v.signedAt ?? v.createdAt).datum.replace(/\./g, "-");
  if (!versicherer) return { name: `Maklervollmacht-${gespeichert.nachname}-${datum}.pdf`, pdf: decryptBytes(v.pdf) };
  const alle = versichererListe(vertraege);
  const u = leseUebertragung(v.uebertragung);
  const auswahl =
    typeof versicherer === "string"
      ? alle.filter((g) => versichererKey(g.versicherer) === versichererKey(versicherer))
      : // alles abgehakt: alle Schreiben noch einmal
        alle.filter((g) => !u[versichererKey(g.versicherer)]).length
        ? alle.filter((g) => !u[versichererKey(g.versicherer)])
        : alle;
  if (!auswahl.length) return null;
  // Vollmachten von vor dem 18.11.2026 (ohne gespeicherte Anrede): Anrede jetzt aus dem Kontakt
  const kunde: VvDaten = gespeichert.anrede !== undefined ? gespeichert : { ...gespeichert, anrede: await anredeAusKontakt(customerId, v.leadId, gespeichert.nachname) };
  const makler = await maklerDaten(customerId);
  const c = kontext(v, makler, kunde, vertraege);
  const abschnitte: VvAbschnitt[] = auswahl.flatMap((g) => {
    const mitGesundheit = v.gesundheit && gesundheitNoetig(g.vertraege);
    return [uebertragungsschreiben(c, g.versicherer, g.vertraege, mitGesundheit), vollmacht(c), ...(mitGesundheit ? [einwilligungGesundheit({ ...c, vertraege: g.vertraege })] : [])];
  });
  const pdf = await vollmachtPdf({
    titel: `Bestandsübertragung ${auswahl.map((g) => g.versicherer).join(", ")} ${kundeName(kunde)}`,
    abschnitte,
    signaturPng: decryptBytes(v.signatur),
    dokumentId: v.id,
    autor: makler.firma ?? makler.name,
  });
  const slug = auswahl.length === 1 ? auswahl[0].versicherer.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "Versicherer" : "Versicherer";
  return { name: `Uebertragung-${slug}-${kunde.nachname}-${datum}.pdf`, pdf };
}

/** Link per E-Mail an den Kunden (Makler löst aus). */
export async function linkPerMail(id: string, customerId: string, userId: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const v = await prisma.maklervollmacht.findFirst({ where: { id, customerId, status: "offen" }, select: { id: true, token: true, leadId: true, ansprache: true, lead: { select: { email: true } } } });
  const to = v?.lead.email?.trim();
  if (!v) return { ok: false, error: "Vollmacht nicht gefunden." };
  if (!to) return { ok: false, error: "Beim Kontakt ist keine E-Mail-Adresse hinterlegt." };
  const { leadVersandKontext, sendeLeadMail } = await import("@/lib/mail/lead-versand");
  const { linkMail } = await import("@/lib/maklervollmacht/texte");
  const { anredeZeile } = await import("@/lib/ansprache");
  const { ansprechpartner } = await import("@/lib/lead-anrede");
  const an = asAnsprache(v.ansprache);
  const who = await ansprechpartner({ customerId, leadId: v.leadId });
  const k = await leadVersandKontext(customerId, { leadId: v.leadId, who });
  const makler = await maklerDaten(customerId);
  const res = await sendeLeadMail(k, {
    to,
    inhalt: () => linkMail(an, anredeZeile(an, who.kontakt), makler, vollmachtLink(v.token)),
    protokoll: { customerId, leadId: v.leadId, art: "maklervollmacht" },
  });
  if (!res.sent) return { ok: false, error: "Die E-Mail konnte nicht gesendet werden." };
  await prisma.maklervollmacht.update({ where: { id: v.id }, data: { sentAt: new Date() } });
  await logLeadHistory(v.leadId, "email", "Link zur Maklervollmacht per E-Mail gesendet", { customerId, userId });
  return { ok: true };
}

/**
 * Haken „Eigene Vollmacht liegt bereits vor“ (Ole, 18.11.2026): für diesen Kontakt schickt die App nichts (kein Link,
 * keine WhatsApp, keine Erinnerung). Rückgängig: wieder offen mit frischem Link (14 Tage). Nicht nach der Unterschrift.
 */
export async function eigeneVollmacht(leadId: string, customerId: string, an: boolean, userId: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await istMakler(customerId))) return { ok: false, error: "Die Maklervollmacht gibt es nur für Makler." };
  const lead = await prisma.lead.findFirst({ where: { id: leadId, customerId }, select: { id: true, customer: { select: { leadAddress: true } } } });
  if (!lead) return { ok: false, error: "Kontakt nicht gefunden." };
  const v = await prisma.maklervollmacht.findFirst({ where: { leadId, customerId, status: { not: "widerrufen" } }, orderBy: { createdAt: "desc" }, select: { id: true, status: true } });
  if (v?.status === "unterschrieben") return { ok: false, error: "Die Vollmacht ist schon unterschrieben." };
  if (an) {
    if (v?.status === "eigene") return { ok: true };
    if (v) await prisma.maklervollmacht.update({ where: { id: v.id }, data: { status: "eigene" } });
    else await prisma.maklervollmacht.create({ data: { customerId, leadId, token: randomBytes(24).toString("base64url"), ansprache: asAnsprache(lead.customer.leadAddress), status: "eigene" } });
    await logLeadHistory(leadId, "dokument", "Eigene Maklervollmacht liegt vor (die App schickt keine)", { customerId, userId });
    return { ok: true };
  }
  if (v?.status !== "eigene") return { ok: true };
  await prisma.maklervollmacht.update({ where: { id: v.id }, data: { status: "offen", createdAt: new Date(), waSentAt: null, erinnerungAt: null, erinnerungStatus: null } });
  await logLeadHistory(leadId, "dokument", "Eigene Maklervollmacht zurückgenommen", { customerId, userId });
  return { ok: true };
}

/** Customer.vollmachtVersand lesen (nur Makler, sonst null und nicht gefragt). */
export async function vollmachtVersandStand(customerId: string): Promise<{ makler: boolean; versand: "app" | "eigene" | null }> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { vermittlerTyp: true, vollmachtVersand: true } });
  const { asVollmachtVersand } = await import("@/lib/maklervollmacht/regeln");
  return { makler: c?.vermittlerTyp === "makler", versand: asVollmachtVersand(c?.vollmachtVersand) };
}

/** „Wer schickt sie?“ speichern (nur Inhaber, nicht in der Vorschau, nur Makler). */
export async function setzeVollmachtVersand(ctx: { customerId: string; teamRole?: string | null; preview?: boolean }, wert: string): Promise<boolean> {
  const { asVollmachtVersand } = await import("@/lib/maklervollmacht/regeln");
  const w = asVollmachtVersand(wert);
  if (!w || ctx.preview || ctx.teamRole === "advisor" || !(await istMakler(ctx.customerId))) return false;
  await prisma.customer.update({ where: { id: ctx.customerId }, data: { vollmachtVersand: w } });
  return true;
}

/** Kunde hat widerrufen (Makler trägt es ein): Link gesperrt, Dokumente bleiben als Nachweis. */
export async function widerrufen(id: string, customerId: string, userId: string | null): Promise<boolean> {
  const v = await prisma.maklervollmacht.findFirst({ where: { id, customerId, status: { not: "widerrufen" } }, select: { id: true, leadId: true } });
  if (!v) return false;
  await prisma.maklervollmacht.update({ where: { id: v.id }, data: { status: "widerrufen", widerrufenAt: new Date() } });
  await logLeadHistory(v.leadId, "dokument", "Maklervollmacht widerrufen", { customerId, userId });
  // Offene Bestandsübertragungen und ihre Aufgaben entfallen; bestätigte bleiben (Umschlüsselung ist schon erfolgt)
  await import("@/lib/maklervollmacht/uebertragung").then((m) => m.uebertragungenZurueckziehen(v.id)).catch((err) => console.error("[maklervollmacht] Widerruf Übertragung", err));
  return true;
}
