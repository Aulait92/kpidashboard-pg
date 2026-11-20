// Erstinformation des Vermittlers (§ 15/16 VersVermV; Ole, 15.11.2026): speichern, öffentliche Adresse
// /erstinformation/<token>, PDF (hochgeladen oder aus den Angaben erzeugt) unter /erstinformation/<token>/pdf,
// Stand für Einrichtung und „Heute“. Reine Regeln und Texte: erstinformation-shared.ts.

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { publicUrlOr } from "@/lib/public-url";
import { asAnsprache, type Ansprache } from "@/lib/ansprache";
import {
  ERSTINFO_MAX_BYTES,
  asVerguetung,
  erstinfoAbschnitte,
  erstinfoDateiname,
  erstinfoDaten,
  erstinfoFehlt,
  isPdf,
  normalizeErstinfoUrl,
  normalizeRegisterNummer,
  papierHinweis,
  parseVersicherer,
  statusFromImpressum,
  type ErstinfoDaten,
  type ErstinfoWeb,
  type VermittlerStatus,
} from "@/lib/erstinformation-shared";

const newToken = () => crypto.randomBytes(9).toString("base64url");

/** Datensatz holen bzw. anlegen (Token entsteht einmal und bleibt). Registernummer aus dem Impressum vorbelegt. */
export async function getOrCreateErstinfo(customerId: string) {
  const found = await prisma.erstinformation.findUnique({ where: { customerId }, select: { id: true, token: true } });
  if (found) return found;
  const web = (await prisma.onboarding.findUnique({ where: { customerId }, select: { websiteInfo: true } }).catch(() => null))?.websiteInfo as
    | { registerNumber?: string | null }
    | null
    | undefined;
  try {
    return await prisma.erstinformation.create({
      data: { customerId, token: newToken(), registerNummer: normalizeRegisterNummer(web?.registerNumber) },
      select: { id: true, token: true },
    });
  } catch {
    // Gleichzeitig angelegt
    return prisma.erstinformation.findUniqueOrThrow({ where: { customerId }, select: { id: true, token: true } });
  }
}

/** Öffentliche Adresse der Erstinformation dieses Kunden (immer erreichbar, auch ohne PDF oder Link). */
export async function erstinfoUrlFor(customerId: string): Promise<string> {
  const { token } = await getOrCreateErstinfo(customerId);
  // Eigene Buchungsadresse, sonst App; ohne APP_URL (lokal, Tests) die Standardadresse
  return publicUrlOr(`/erstinformation/${token}`);
}

/** Datenschutzhinweise im Namen des Vermittlers (app/erstinformation/[token]/datenschutz, Ole 20.11.2026). */
export async function datenschutzUrlFor(customerId: string): Promise<string | null> {
  // Nur mit Name und Anschrift des Verantwortlichen (Datenschutz-Prüfung A3, docs/recht/datenschutz-vermittler-seite.md)
  const { daten } = await loadErstinfo(customerId);
  if (!daten.name?.trim() || !daten.anschrift?.trim()) return null;
  return `${await erstinfoUrlFor(customerId)}/datenschutz`;
}

/** Öffentliche Adresse des PDFs (für das WhatsApp-Dokument; Meta lädt es von dort). */
export async function erstinfoPdfUrlFor(customerId: string): Promise<string> {
  return `${await erstinfoUrlFor(customerId)}/pdf`;
}

const RECORD_SELECT = {
  token: true,
  anrede: true,
  statusAt: true,
  bestaetigtAt: true,
  registerNummer: true,
  name: true,
  firma: true,
  anschrift: true,
  telefon: true,
  email: true,
  versicherer: true,
  erlaubnis: true,
  beratung: true,
  beteiligungen: true,
  verguetung: true,
  zuwendungen: true,
  ihk: true,
  url: true,
  fileName: true,
  size: true,
  updatedAt: true,
} as const;

export type ErstinfoView = {
  token: string | null;
  /** Anrede des Vermittlers (Herr/Frau) für den Assistenten, kein Teil der Erstinformation */
  anrede: string | null;
  status: VermittlerStatus;
  statusAt: Date | null;
  bestaetigtAt: Date | null;
  registerNummer: string | null;
  url: string | null;
  fileName: string | null;
  size: number | null;
  updatedAt: Date | null;
  /** Pflichtangaben (gespeichert bzw. Vorschlag aus Impressum und Angebot) */
  daten: ErstinfoDaten;
  fehlt: string[];
  vollstaendig: boolean;
  /** Angaben aus dem Impressum der Website (zum Gegenprüfen) */
  impressum: { companyName: string | null; address: string | null; registerType: string | null; registerNumber: string | null; status: VermittlerStatus | null } | null;
};

export async function loadErstinfo(customerId: string): Promise<ErstinfoView> {
  const [c, e] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: { name: true, vermittlerTyp: true, onboarding: { select: { websiteInfo: true } } } }),
    prisma.erstinformation.findUnique({ where: { customerId }, select: RECORD_SELECT }),
  ]);
  const web = (c?.onboarding?.websiteInfo ?? null) as ErstinfoWeb;
  const impressum = web
    ? {
        companyName: web.companyName?.trim() || null,
        address: web.address?.trim() || null,
        registerType: web.registerType?.trim() || null,
        registerNumber: normalizeRegisterNummer(web.registerNumber),
        status: statusFromImpressum(web.registerType),
      }
    : null;
  const registerNummer = e?.registerNummer ?? impressum?.registerNumber ?? null;
  // Registernummer aus dem Impressum übernehmen (öffentliche Seite und Assistent lesen den Datensatz)
  if (!e?.registerNummer && impressum?.registerNumber) {
    await getOrCreateErstinfo(customerId).catch(() => null);
    await prisma.erstinformation.update({ where: { customerId }, data: { registerNummer: impressum.registerNumber } }).catch(() => null);
  }
  const daten = erstinfoDaten(e, web, { name: c?.name, vermittlerTyp: c?.vermittlerTyp });
  const fehlt = erstinfoFehlt(daten, { upload: !!e?.fileName, bestaetigt: !!e?.bestaetigtAt });
  return {
    token: e?.token ?? null,
    anrede: e?.anrede ?? null,
    status: daten.status,
    statusAt: e?.statusAt ?? null,
    bestaetigtAt: e?.bestaetigtAt ?? null,
    registerNummer,
    url: e?.url ?? null,
    fileName: e?.fileName ?? null,
    size: e?.size ?? null,
    updatedAt: e?.updatedAt ?? null,
    daten,
    fehlt,
    vollstaendig: fehlt.length === 0,
    impressum,
  };
}

/** Braucht dieser Kunde die Erstinformation? Nur mit WhatsApp-Assistent (Paket mit Software). */
export async function erstinfoRelevant(customerId: string): Promise<boolean> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { plan: true } });
  return !!c && c.plan !== "service";
}

export type SaveErstinfoInput = {
  status: string;
  registerNummer: string;
  /** Pflichtangaben (§ 15 Abs. 1 VersVermV); ohne eigenes PDF Pflicht */
  name?: string | null;
  firma?: string | null;
  anschrift?: string | null;
  telefon?: string | null;
  email?: string | null;
  /** Ein Versicherer je Zeile */
  versicherer?: string | null;
  erlaubnis?: string | null;
  beratung?: boolean;
  /** null/leer = keine Beteiligungen über 10 % */
  beteiligungen?: string | null;
  verguetung?: string[];
  zuwendungen?: boolean;
  ihk?: string | null;
  /** Eigener Link (alt, nur noch zusätzlich gespeichert) */
  url?: string | null;
  file?: { name: string; data: Uint8Array } | null;
  /** Hochgeladenes PDF entfernen */
  removeFile?: boolean;
  userId?: string | null;
  /** Anrede des Vermittlers (Herr/Frau, sonst leer) für den Assistenten (Ole, 17.11.2026) */
  anrede?: string | null;
};

const txt = (v: string | null | undefined, max: number) => (v ?? "").replace(/\r\n?/g, "\n").trim().slice(0, max);

export async function saveErstinfo(customerId: string, input: SaveErstinfoInput): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.status === "tippgeber") return { ok: false, error: "tippgeber" };
  if (!["makler", "mehrfachvertreter", "vertreter"].includes(input.status)) return { ok: false, error: "Bitte Ihren Status wählen." };
  const status = input.status as VermittlerStatus;
  const reg = normalizeRegisterNummer(input.registerNummer);
  if (!reg) return { ok: false, error: "Bitte die Registernummer so eingeben, wie sie im Vermittlerregister bzw. auf Ihrer IHK-Urkunde steht, z. B. D-XXXX-XXXXX-XX." };
  const url = input.url?.trim() ? normalizeErstinfoUrl(input.url) : null;
  if (input.url?.trim() && !url) return { ok: false, error: "Der Link ist ungültig. Bitte die vollständige Adresse eingeben, z. B. https://ihre-agentur.de/erstinformation." };
  const file = input.file && input.file.data.length ? input.file : null;
  if (file) {
    if (file.data.length > ERSTINFO_MAX_BYTES) return { ok: false, error: "Das PDF ist zu groß (höchstens 5 MB)." };
    if (!isPdf(file.data)) return { ok: false, error: "Bitte ein PDF hochladen." };
  }
  const { id } = await getOrCreateErstinfo(customerId);
  const current = await prisma.erstinformation.findUniqueOrThrow({ where: { id }, select: { fileName: true } });
  const upload = !!(file || (current.fileName && !input.removeFile));

  const versicherer = status === "makler" ? [] : parseVersicherer(input.versicherer);
  const data = {
    name: txt(input.name, 160),
    firma: txt(input.firma, 160),
    anschrift: txt(input.anschrift, 400),
    telefon: txt(input.telefon, 60),
    email: txt(input.email, 160),
    versicherer,
    erlaubnis: status === "mehrfachvertreter" ? (input.erlaubnis === "abs7" ? "abs7" : "abs1") : null,
    beratung: input.beratung ?? true,
    beteiligungen: txt(input.beteiligungen, 1000) || null,
    verguetung: asVerguetung(input.verguetung),
    zuwendungen: input.zuwendungen ?? false,
    ihk: txt(input.ihk, 160),
  };
  // Anrede Pflicht in der Einrichtung (Ole, 17.11.2026, Vermittler-Nennung „Herr Kannapinn“): Herr, Frau oder bewusst
  // keine („keine“: Vor- und Nachname). Nur geprüft, wenn das Formular sie mitschickt (undefined = unverändert).
  if (input.anrede !== undefined && !["Herr", "Frau", "keine"].includes(input.anrede ?? "")) {
    return { ok: false, error: "Bitte Ihre Anrede wählen. Der Assistent nennt Sie gegenüber Kunden z. B. „Herr Kannapinn“." };
  }
  const anrede = input.anrede === undefined ? undefined : input.anrede === "Herr" || input.anrede === "Frau" || input.anrede === "keine" ? input.anrede : null;
  // Ohne eigenes PDF erzeugen wir die Erstinformation aus den Angaben: dann alle Pflichtangaben prüfen
  if (status === "vertreter" && versicherer.length > 1) {
    return { ok: false, error: "Als Ausschließlichkeitsvertreter tragen Sie bitte genau einen Versicherer ein. Für mehrere Versicherer wählen Sie „Mehrfachvertreter“." };
  }
  if (!upload) {
    if (!data.name) return { ok: false, error: "Bitte Ihren Vor- und Nachnamen eintragen." };
    if (!data.anschrift) return { ok: false, error: "Bitte Ihre betriebliche Anschrift eintragen." };
    if (status === "vertreter" && versicherer.length !== 1) return { ok: false, error: "Bitte eintragen, für welchen Versicherer Sie tätig sind." };
    if (status === "mehrfachvertreter" && versicherer.length < 1) return { ok: false, error: "Bitte mindestens einen Versicherer eintragen, für den Sie tätig sind (einen je Zeile)." };
    if (!data.verguetung.length) return { ok: false, error: "Bitte die Art Ihrer Vergütung wählen." };
    if (!data.ihk) return { ok: false, error: "Bitte Ihre zuständige IHK eintragen (z. B. IHK München und Oberbayern)." };
  }

  const before = await prisma.customer.findUnique({ where: { id: customerId }, select: { name: true, vermittlerTyp: true } });
  if (before && before.vermittlerTyp !== status) {
    await prisma.customer.update({ where: { id: customerId }, data: { vermittlerTyp: status } });
    // Makler oder nicht bestimmt auch Provisionssätze und Garantien: Admin informieren
    if ((before.vermittlerTyp === "makler") !== (status === "makler")) {
      const { sendToAdmins } = await import("@/lib/push");
      await sendToAdmins({
        title: `Vermittlerstatus geändert: ${before.name}`,
        body: `Erstinformation: ${before.vermittlerTyp} → ${status}. Provisionssätze und Garantien prüfen.`,
        url: `/admin/kunden/${customerId}`,
        tag: `vermittlerstatus:${customerId}`,
      }).catch(() => {});
    }
  }
  const now = new Date();
  await prisma.erstinformation.update({
    where: { id },
    data: {
      ...data,
      ...(anrede !== undefined ? { anrede } : {}),
      registerNummer: reg,
      statusAt: now,
      bestaetigtAt: now,
      url,
      updatedById: input.userId ?? null,
      ...(file
        ? { fileName: file.name.replace(/[\\/\r\n"]/g, "_").slice(0, 160) || "erstinformation.pdf", contentType: "application/pdf", size: file.data.length, data: Buffer.from(file.data) }
        : input.removeFile
          ? { fileName: null, contentType: null, size: null, data: null }
          : {}),
    },
  });
  return { ok: true };
}

/** Erstinformation-Daten über den öffentlichen Token (Seite und PDF). */
export async function loadErstinfoByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(token)) return null;
  const e = await prisma.erstinformation.findUnique({
    where: { token },
    select: { ...RECORD_SELECT, customerId: true, customer: { select: { name: true, vermittlerTyp: true, leadAddress: true, onboarding: { select: { websiteInfo: true } } } } },
  });
  if (!e) return null;
  const daten = erstinfoDaten(e, (e.customer.onboarding?.websiteInfo ?? null) as ErstinfoWeb, e.customer);
  const fehlt = erstinfoFehlt(daten, { upload: !!e.fileName, bestaetigt: !!e.bestaetigtAt });
  return {
    customerId: e.customerId,
    fileName: e.fileName,
    updatedAt: e.updatedAt,
    an: asAnsprache(e.customer.leadAddress),
    daten,
    vollstaendig: fehlt.length === 0,
    /** Fehlende Pflichtangaben (Bezeichnungen, keine Werte; z. B. für Diagnose-Logzeilen) */
    fehlt,
  };
}

const stand = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

/** Erzeugtes PDF aus den Angaben (pdf-lib, ohne Browser). */
export async function erstinfoPdfAusDaten(daten: ErstinfoDaten, an: Ansprache, updatedAt: Date | null): Promise<Uint8Array> {
  const { textPdf } = await import("@/lib/mail/text-pdf");
  return textPdf({
    titel: "Erstinformation",
    kopf: ["Angaben nach § 15 Versicherungsvermittlungsverordnung (VersVermV)"],
    bloecke: erstinfoAbschnitte(daten),
    fuss: `${papierHinweis(an)}${updatedAt ? `\nStand: ${stand(updatedAt)}` : ""}`,
    autor: daten.firma || daten.name || undefined,
  });
}

/** Layout-Version des erzeugten PDFs: hochsetzen, wenn sich Text oder Gestaltung ändert (neuer Hash, neues PDF). */
const PDF_LAYOUT = "1";

/**
 * Hash der Quelldaten des PDFs (rein): gleiche Angaben, gleicher Stand → gleiches PDF. Ändert sich etwas, entsteht ein
 * neues PDF und eine neue Adresse (?v=…), damit WhatsApp bzw. Meta kein altes PDF aus dem Zwischenspeicher nimmt.
 */
export function erstinfoPdfHash(src: { daten: ErstinfoDaten; an: Ansprache; updatedAt: Date | null; upload?: { fileName: string | null; size?: number | null } | null }): string {
  const json = JSON.stringify({ v: PDF_LAYOUT, d: src.daten, an: src.an, stand: src.updatedAt ? stand(src.updatedAt) : "", upload: src.upload ?? null });
  return crypto.createHash("sha256").update(json).digest("hex").slice(0, 16);
}

// Zwischenspeicher der erzeugten PDFs je Token (im Prozess, klein): neu erzeugt nur, wenn sich der Hash ändert.
const PDF_CACHE = new Map<string, { hash: string; bytes: Uint8Array }>();
const PDF_CACHE_MAX = 200;

/** Nur für Tests: Zwischenspeicher leeren bzw. Größe lesen. */
export function erstinfoPdfCache() {
  return { clear: () => PDF_CACHE.clear(), size: () => PDF_CACHE.size, get: (token: string) => PDF_CACHE.get(token) ?? null };
}

/**
 * Das PDF, das Leads bekommen (§ 16 VersVermV: dauerhafter Datenträger): hochgeladenes PDF (z. B. Vorlage der
 * Gesellschaft), sonst aus den Angaben erzeugt (gleiche Quelle wie die Seite /erstinformation/<token>), zwischengespeichert
 * nach Hash der Angaben. null = Token unbekannt. dateiname = Name für das WhatsApp-Dokument („Erstinformation_<Agentur>.pdf“).
 */
export async function erstinfoDokument(
  where: { token: string } | { customerId: string },
): Promise<{ bytes: Uint8Array; fileName: string; dateiname: string; hash: string; token: string; vollstaendig: boolean; fehlt: string[] } | null> {
  const token = "token" in where ? where.token : (await getOrCreateErstinfo(where.customerId)).token;
  const info = await loadErstinfoByToken(token);
  if (!info) return null;
  const dateiname = erstinfoDateiname(info.daten.firma || info.daten.name);
  if (info.fileName) {
    const f = await prisma.erstinformation.findUnique({ where: { token }, select: { data: true, fileName: true, size: true } });
    if (f?.data) {
      const hash = erstinfoPdfHash({ daten: info.daten, an: info.an, updatedAt: info.updatedAt, upload: { fileName: f.fileName, size: f.size } });
      return { bytes: new Uint8Array(f.data), fileName: f.fileName ?? "Erstinformation.pdf", dateiname, hash, token, vollstaendig: info.vollstaendig, fehlt: info.fehlt };
    }
  }
  const hash = erstinfoPdfHash({ daten: info.daten, an: info.an, updatedAt: info.updatedAt });
  const hit = PDF_CACHE.get(token);
  let bytes: Uint8Array;
  if (hit && hit.hash === hash) {
    bytes = hit.bytes;
  } else {
    bytes = await erstinfoPdfAusDaten(info.daten, info.an, info.updatedAt);
    if (PDF_CACHE.size >= PDF_CACHE_MAX) PDF_CACHE.delete(PDF_CACHE.keys().next().value!);
    PDF_CACHE.set(token, { hash, bytes });
  }
  return { bytes, fileName: dateiname, dateiname, hash, token, vollstaendig: info.vollstaendig, fehlt: info.fehlt };
}

/**
 * PDF der Erstinformation für WhatsApp (Dokument bzw. Kopf der Vorlage): öffentliche Adresse mit Hash der Angaben
 * (/erstinformation/<token>/pdf?v=<hash>; der Token schützt die Adresse, Meta lädt die Datei dort) und Dateiname.
 * null = nicht vollständig bzw. nicht vorhanden.
 */
export async function erstinfoPdfFuerWhatsApp(customerId: string): Promise<{ link: string; filename: string; hash: string } | null> {
  if (!(await erstinfoBereit(customerId))) return null;
  const doc = await erstinfoDokument({ customerId });
  if (!doc) return null;
  return { link: `${await erstinfoPdfUrlFor(customerId)}?v=${doc.hash}`, filename: doc.dateiname, hash: doc.hash };
}

/**
 * PDF der Erstinformation im aktuellen Stand, auch wenn die Angaben noch unvollständig sind (vollstaendig = false).
 * Nur fürs Erstanschreiben, wenn die neueste freigegebene Vorlage das PDF im Kopf verlangt (templates.ts rankOutreach):
 * derselbe Inhalt wie die öffentliche Seite hinter dem Link der älteren Fassung. null = nicht erzeugbar.
 * fehlt: Bezeichnungen der fehlenden Pflichtangaben (ohne Werte, für Diagnose und Hinweis an den Vermittler).
 */
export async function erstinfoPdfStand(customerId: string): Promise<{ link: string; filename: string; hash: string; vollstaendig: boolean; fehlt: string[] } | null> {
  const doc = await erstinfoDokument({ customerId });
  if (!doc) return null;
  return { link: `${await erstinfoPdfUrlFor(customerId)}?v=${doc.hash}`, filename: doc.dateiname, hash: doc.hash, vollstaendig: doc.vollstaendig, fehlt: doc.fehlt };
}

/** Ist die Erstinformation dieses Kunden vollständig (darf als PDF an Leads gehen)? */
export async function erstinfoBereit(customerId: string): Promise<boolean> {
  const e = await loadErstinfo(customerId).catch(() => null);
  return !!e?.vollstaendig;
}
