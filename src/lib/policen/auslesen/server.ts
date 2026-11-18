// Policen auslesen (Ole, 18.11.2026): Ablauf mit Datenbank. Eigener KI-Zugang NUR für Dokumente, getrennt vom
// Chat-Assistenten (lib/whatsapp/bot.ts, lib/kampagnen/llm.ts runAgent): dieses Modul importiert nichts aus dem Chat,
// der Chat nichts von hier (Test tests/unit/policen-auslesen-grenze.test.ts).
//
// Ein Dokument wird nur ausgelesen, wenn ALLES zutrifft (sonst kein Aufruf beim Anbieter):
//   0. Privater Policen-Bucket eingerichtet (lib/policen/ablage.ts, sonst ist Policen per WhatsApp aus),
//   1. Anbieter eingerichtet (POLICEN_OPENAI_API_KEY bzw. ausdrücklich Bedrock), kein Notschalter, nicht pausiert (401),
//   2. Kunde freigeschaltet (POLICEN_AUSLESEN_KUNDEN leer oder enthält ihn),
//   3. Einwilligung des Leads mit KI (PolicenNachweis: art einwilligung, ki = true, Textversion ab
//      AUSLESEN_MIN_TEXTVERSION; ein späterer Widerruf oder eine Ablehnung hebt sie auf) und kein Stichwort „ohne KI“
//      (Auflage A9, lib/policen/ohne-ki.ts; dann Sperre „ohne_ki“, Vergleichsblatt ohne Werte),
//   4. Sparte vorab ohne KI eindeutig und freigegeben (Sach sofort, PKV/BU/Leben nur mit Nachweis „keine Speicherung“),
//   5. Bremse: höchstens 15 Dokumente je Lead und POLICEN_AUSLESEN_MAX_PRO_TAG (Standard 200) je Tag.
// Gespeichert wird nur das bereinigte Feldobjekt (PolicenAuszug), nie Prompt, Rohantwort oder Volltext. Logs nur mit
// Zählern und Gründen, ohne Inhalte, Dateinamen oder Adressen.

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { decryptBytes } from "@/lib/encryption";
import { logLeadHistory } from "@/lib/lead-history";
import {
  auslesenAn,
  auslesenKonfigStatus,
  berlinTag,
  freigegebeneSparten,
  kundeFreigeschaltet,
  MAX_JE_LEAD,
  maxProTag,
  schluesselAblauf,
  schluesselFinger,
  ABLAUF_HINWEIS_TAGE,
  tageBisAblauf,
  textVersionKi,
} from "@/lib/policen/auslesen/konfig";
import {
  bereinige,
  felderAus,
  GESUNDHEITS_SPARTEN,
  isAuslesenSparte,
  korrigiere,
  monatsbetrag,
  SPARTE_LABEL,
  type AuslesenSparte,
  type Felder,
} from "@/lib/policen/auslesen/felder";
import { ersteSeiteText, sparteVorab } from "@/lib/policen/auslesen/sparte";
import { kiAbgelehnt } from "@/lib/policen/ohne-ki";
import { zusammenfassung, type Zusammenfassung } from "@/lib/policen/auslesen/zusammenfassung";
import type { DokumentTyp } from "@/lib/policen/auslesen/anbieter/typ";

const TYPEN: readonly DokumentTyp[] = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_VERSUCHE = 3;
const LAEUFT_MS = 5 * 60 * 1000;

const log = (was: string, x: Record<string, string | number | boolean | null> = {}) =>
  console.info(`[policen-auslesen] ${was}${Object.entries(x).map(([k, v]) => ` ${k}=${v}`).join("")}`);

// ─── Einstellungen, Einwilligung, Vorbedingungen ────────────────────────────

export async function einstellung() {
  return (await prisma.policenAuslesenEinstellung.findUnique({ where: { id: "global" } })) ?? null;
}

/** Nachweis „keine Speicherung“ beim Anbieter hinterlegt (Admin)? Schaltet PKV/BU/Leben frei. */
export async function zdrHinterlegt(): Promise<boolean> {
  return !!(await einstellung())?.zdrNachweisAm;
}

/** Pausiert nach 401 für genau diesen Schlüssel (ein neuer Schlüssel hebt die Pause auf). */
export async function pausiert(): Promise<boolean> {
  const e = await einstellung();
  return !!e?.schluesselUngueltigAt && !!e.schluesselFinger && e.schluesselFinger === schluesselFinger();
}

/**
 * Einwilligung mit KI für diesen Lead (Nachweis aus Policen per WhatsApp, PolicenNachweis). Maßgeblich ist der letzte
 * Eintrag zu Einwilligung, Ablehnung oder Widerruf; ein Stichwort „ohne KI“ (A9) schließt das Auslesen dauerhaft aus.
 */
export async function kiEinwilligung(leadId: string): Promise<{ gesundheit: boolean } | null> {
  const r = await prisma.policenNachweis
    .findFirst({ where: { leadId, art: { in: ["einwilligung", "abgelehnt", "widerruf"] } }, orderBy: { createdAt: "desc" }, select: { art: true, ki: true, textVersion: true } })
    .catch(() => null);
  if (!(r && r.art === "einwilligung" && r.ki === true)) return null;
  if (await kiAbgelehnt(leadId).catch(() => true)) return null;
  return textVersionKi(r.textVersion);
}

/** ohne_ki = der Kunde hat das Auslesen abgelehnt (Stichwort „ohne KI“, A9). */
export type Sperre = "aus" | "kunde" | "pause" | "einwilligung" | "ohne_ki";

/** Darf für diesen Lead überhaupt ausgelesen werden? null = ja, sonst der Grund („ohne KI“ geht allen vor). */
export async function sperreFuer(customerId: string, leadId: string): Promise<Sperre | null> {
  if (await kiAbgelehnt(leadId).catch(() => true)) return "ohne_ki";
  if (!auslesenAn()) return "aus";
  // Ohne privaten Policen-Bucket ist Policen per WhatsApp aus, dann auch das Auslesen
  const { ablageBereit } = await import("@/lib/policen/ablage");
  if (!ablageBereit()) return "aus";
  if (!kundeFreigeschaltet(customerId)) return "kunde";
  if (await pausiert()) return "pause";
  if (!(await kiEinwilligung(leadId))) return "einwilligung";
  return null;
}

// ─── Bremse ─────────────────────────────────────────────────────────────────

/** Einen Aufruf für heute zählen; false = Tageslimit erreicht (dann einmal am Tag Admins benachrichtigen). */
async function tagesKontingent(now: Date): Promise<boolean> {
  const tag = berlinTag(now);
  const max = maxProTag();
  const vorher = await prisma.policenAuslesenTag.findUnique({ where: { tag } });
  if ((vorher?.anzahl ?? 0) >= max) {
    await meldeTageslimit(tag, max);
    return false;
  }
  const z = await prisma.policenAuslesenTag.upsert({ where: { tag }, create: { tag, anzahl: 1 }, update: { anzahl: { increment: 1 } } });
  if (z.anzahl > max) {
    await meldeTageslimit(tag, max);
    return false;
  }
  return true;
}

async function meldeTageslimit(tag: string, max: number) {
  const n = await prisma.policenAuslesenTag.updateMany({ where: { tag, gemeldetAt: null }, data: { gemeldetAt: new Date() } });
  if (!n.count) return;
  log("tageslimit", { max });
  const { sendToAdmins } = await import("@/lib/push");
  await sendToAdmins({
    title: "Policen auslesen: Tageslimit erreicht",
    body: `Heute wurden ${max} Unterlagen ausgelesen. Weitere bleiben bis morgen nicht ausgelesen (POLICEN_AUSLESEN_MAX_PRO_TAG).`,
    tag: `policen-auslesen-limit:${tag}`,
    url: "/admin/neu/einstellungen/anbindungen",
  }).catch(() => null);
}

async function pausiere() {
  const finger = schluesselFinger();
  await prisma.policenAuslesenEinstellung.upsert({
    where: { id: "global" },
    create: { id: "global", schluesselUngueltigAt: new Date(), schluesselFinger: finger },
    update: { schluesselUngueltigAt: new Date(), schluesselFinger: finger },
  });
  await meldeSchluesselUngueltig(new Date());
}

/** „Schlüssel ungültig“ höchstens einmal je Tag an die Admins. */
async function meldeSchluesselUngueltig(now: Date) {
  const e = await einstellung();
  if (e?.ungueltigGemeldetAt && berlinTag(e.ungueltigGemeldetAt) === berlinTag(now)) return;
  await prisma.policenAuslesenEinstellung.update({ where: { id: "global" }, data: { ungueltigGemeldetAt: now } });
  log("schluessel-ungueltig");
  const { sendToAdmins } = await import("@/lib/push");
  await sendToAdmins({
    title: "Policen auslesen: Schlüssel ungültig",
    body: "OpenAI lehnt den Schlüssel ab (401). Das Auslesen ist pausiert, bis ein neuer Schlüssel in Railway hinterlegt ist (POLICEN_OPENAI_API_KEY).",
    tag: `policen-auslesen-401:${berlinTag(now)}`,
    url: "/admin/neu/einstellungen/anbindungen",
  }).catch(() => null);
}

// ─── Auslesen ───────────────────────────────────────────────────────────────

export type AuslesenErgebnis = { status: string } | null;

/** Inhalt der Unterlage (entschlüsselt, nur im Speicher): privater Policen-Bucket bzw. alte Ablage in der Datenbank. */
async function inhalt(doc: { customerId: string; storageKey: string | null; dateiSchluessel?: string | null; data: Uint8Array | null }): Promise<Buffer | null> {
  try {
    if (doc.storageKey) {
      const { holeAb } = await import("@/lib/policen/ablage");
      return await holeAb(doc.customerId, doc.storageKey, doc.dateiSchluessel);
    }
    return doc.data ? decryptBytes(Buffer.from(doc.data)) : null;
  } catch {
    return null;
  }
}

/**
 * Eine Unterlage auslesen. sparte = Wahl des Vermittlers (geht vor). Ohne erfüllte Vorbedingungen: nichts angelegt,
 * kein Aufruf. Mit Sparte unklar, nicht freigegeben oder Bremse: Zeile mit Status, kein Aufruf.
 */
export async function liesUnterlageAus(documentId: string, o: { sparte?: AuslesenSparte | null; now?: Date } = {}): Promise<AuslesenErgebnis> {
  const now = o.now ?? new Date();
  const doc = await prisma.leadDocument.findUnique({
    where: { id: documentId },
    select: { id: true, customerId: true, leadId: true, status: true, data: true, storageKey: true, dateiSchluessel: true, mimeType: true, sparte: true, auszug: true, lead: { select: { erasedAt: true } } },
  });
  if (!doc || doc.status !== "gespeichert" || doc.lead.erasedAt) return null;
  const sperre = await sperreFuer(doc.customerId, doc.leadId);
  if (sperre) return { status: `gesperrt:${sperre}` };

  const alt = doc.auszug;
  if (alt && !o.sparte) {
    if (alt.status === "ausgelesen" || alt.status === "leer") return { status: alt.status };
    if (alt.status === "laeuft" && now.getTime() - alt.updatedAt.getTime() < LAEUFT_MS) return { status: "laeuft" };
    if (alt.status === "fehler" && alt.versuche >= MAX_VERSUCHE) return { status: "fehler" };
  }
  if (alt?.uebernommenAt) return { status: alt.status };
  const vermittlerSparte = o.sparte ?? (alt?.sparteQuelle === "vermittler" && isAuslesenSparte(alt.sparte) ? alt.sparte : null);

  // Beanspruchen (eine Zeile je Unterlage; parallele Webhooks lesen nicht doppelt)
  const zeile = alt
    ? await prisma.policenAuszug.update({ where: { id: alt.id }, data: { status: "laeuft" } })
    : await prisma.policenAuszug.create({ data: { customerId: doc.customerId, leadId: doc.leadId, documentId: doc.id, status: "laeuft" } }).catch(() => null);
  if (!zeile) return { status: "laeuft" };
  const setze = (data: Parameters<typeof prisma.policenAuszug.update>[0]["data"]) => prisma.policenAuszug.update({ where: { id: zeile.id }, data });

  const typ = TYPEN.find((t) => t === doc.mimeType) ?? null;
  const daten = typ ? await inhalt(doc) : null;
  if (!typ || !daten) {
    await setze({ status: "fehler", versuche: MAX_VERSUCHE });
    log("nicht-lesbar");
    return { status: "fehler" };
  }

  // Sparte vorab, ohne KI: Vermittler, Unterlage, Textebene Seite 1 (nur lokal)
  const text = typ === "application/pdf" && !vermittlerSparte ? await ersteSeiteText(daten) : "";
  const vorab = sparteVorab({ vermittler: vermittlerSparte, unterlage: doc.sparte, text });
  if (!vorab) {
    await setze({ status: "sparte_offen", sparte: null, sparteQuelle: null });
    return { status: "sparte_offen" };
  }
  // PKV/BU/Leben: Nachweis „keine Speicherung“ beim Anbieter und eine Einwilligung, die Gesundheitsangaben nennt
  const einwilligung = await kiEinwilligung(doc.leadId);
  const gesundheitOk = !GESUNDHEITS_SPARTEN.includes(vorab.sparte) || !!einwilligung?.gesundheit;
  if (!gesundheitOk || !freigegebeneSparten({ zdr: await zdrHinterlegt() }).includes(vorab.sparte)) {
    await setze({ status: "gesperrt", sparte: vorab.sparte, sparteQuelle: vorab.quelle });
    return { status: "gesperrt" };
  }

  // Bremse: je Lead (Dokumente mit Aufruf) und je Tag
  const jeLead = await prisma.policenAuszug.count({ where: { leadId: doc.leadId, versuche: { gt: 0 }, NOT: { id: zeile.id } } });
  if ((zeile.versuche === 0 && jeLead >= MAX_JE_LEAD) || !(await tagesKontingent(now))) {
    await setze({ status: "limit", sparte: vorab.sparte, sparteQuelle: vorab.quelle });
    log("limit", { jeLead });
    return { status: "limit" };
  }

  const { waehleAnbieter } = await import("@/lib/policen/auslesen/anbieter");
  const anbieter = await waehleAnbieter();
  if (!anbieter) {
    await setze({ status: "fehler", sparte: vorab.sparte, sparteQuelle: vorab.quelle });
    return { status: "fehler" };
  }
  const r = await anbieter.liesAus({ data: daten, typ }, vorab.sparte);
  if (!r.ok) {
    await setze({ status: "fehler", sparte: vorab.sparte, sparteQuelle: vorab.quelle, versuche: { increment: 1 }, anbieter: anbieter.name, modell: anbieter.modell });
    log("fehler", { anbieter: anbieter.name, grund: r.grund, status: r.status ?? null });
    if (r.grund === "schluessel") await pausiere();
    return { status: "fehler" };
  }
  const b = bereinige(r.roh, vorab.sparte);
  // Andere Sparte laut Dokument: nichts übernehmen (im Zweifel nicht auslesen); der Vermittler kann die Sparte wählen
  if (b.sparte !== vorab.sparte) {
    await setze({ status: "sparte_abweichend", sparte: vorab.sparte, sparteQuelle: vorab.quelle, felder: Prisma.DbNull, versuche: { increment: 1 }, anbieter: anbieter.name, modell: r.modell, ausgelesenAt: now });
    log("sparte-abweichend", { anbieter: anbieter.name });
    return { status: "sparte_abweichend" };
  }
  const n = Object.keys(b.felder).length;
  await setze({
    status: n ? "ausgelesen" : "leer",
    sparte: vorab.sparte,
    sparteQuelle: vorab.quelle,
    felder: b.felder as Prisma.InputJsonValue,
    versuche: { increment: 1 },
    anbieter: anbieter.name,
    modell: r.modell,
    ausgelesenAt: now,
    geprueftAt: null,
    geprueftVonId: null,
  });
  log("ok", { anbieter: anbieter.name, felder: n, verworfen: b.verworfen });
  return { status: n ? "ausgelesen" : "leer" };
}

/** Nach Eingang bzw. Einwilligung: alle gespeicherten Unterlagen des Leads ohne Auszug auslesen (nacheinander). */
export async function nachEingang(leadId: string, now = new Date()): Promise<number> {
  if (!auslesenAn()) return 0;
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { customerId: true, erasedAt: true } });
  if (!lead || lead.erasedAt || (await sperreFuer(lead.customerId, leadId))) return 0;
  const docs = await prisma.leadDocument.findMany({
    where: { leadId, status: "gespeichert", OR: [{ auszug: null }, { auszug: { status: "fehler", versuche: { lt: MAX_VERSUCHE } } }] },
    orderBy: { createdAt: "asc" },
    select: { id: true },
    take: MAX_JE_LEAD + 5,
  });
  let n = 0;
  for (const d of docs) {
    const r = await liesUnterlageAus(d.id, { now });
    if (r?.status === "ausgelesen") n++;
  }
  return n;
}

// ─── Vergleichsblatt (Vermittler) ───────────────────────────────────────────

export type VertragKarte = {
  id: string;
  documentId: string;
  sparte: AuslesenSparte;
  felder: Felder;
  monat: number | null;
  geprueft: boolean;
  uebernommen: boolean;
  ausgelesenAt: string | null;
};
export type OffeneUnterlage = { documentId: string; auszugId: string | null; titel: string; status: string; sparte: AuslesenSparte | null; datum: string };
export type Vergleich = {
  an: boolean;
  sperre: Sperre | null;
  vertraege: VertragKarte[];
  offen: OffeneUnterlage[];
  zusammenfassung: Zusammenfassung;
  sparten: AuslesenSparte[];
  /** Bestandskunden-Modul sichtbar? Nur dann „In Bestand übernehmen“. */
  bestand: boolean;
};

/** Daten für das Vergleichsblatt. Zugriff prüft der Aufrufer (leadScope); in der Admin-Vorschau nie aufrufen. */
export async function ladeVergleich(leadId: string, customerId: string, now = new Date()): Promise<Vergleich> {
  const { loadBestandVisible } = await import("@/lib/bestand/sichtbar-server");
  const [docs, sperre, zdr, bestand] = await Promise.all([
    prisma.leadDocument.findMany({
      where: { leadId, customerId, status: "gespeichert" },
      orderBy: { createdAt: "asc" },
      select: { id: true, sparte: true, createdAt: true, auszug: true },
    }),
    sperreFuer(customerId, leadId),
    zdrHinterlegt(),
    loadBestandVisible(customerId).catch(() => false),
  ]);
  const vertraege: VertragKarte[] = [];
  const offen: OffeneUnterlage[] = [];
  // „ohne KI“ (A9): nie Werte zeigen, auch wenn noch ein Auszug da wäre
  const ohneKi = sperre === "ohne_ki";
  for (const d of docs) {
    const a = ohneKi ? null : d.auszug;
    if (a && (a.status === "ausgelesen" || a.status === "leer") && isAuslesenSparte(a.sparte)) {
      const felder = felderAus(a.felder, a.sparte);
      vertraege.push({
        id: a.id,
        documentId: d.id,
        sparte: a.sparte,
        felder,
        monat: monatsbetrag(felder),
        geprueft: !!a.geprueftAt,
        uebernommen: !!a.uebernommenAt,
        ausgelesenAt: a.ausgelesenAt?.toISOString() ?? null,
      });
      continue;
    }
    const sp = a && isAuslesenSparte(a.sparte) ? a.sparte : null;
    offen.push({
      documentId: d.id,
      auszugId: a?.id ?? null,
      titel: sp ? SPARTE_LABEL[sp] : "Unterlage",
      status: a?.status ?? (sperre ? "nicht_ausgelesen" : "neu"),
      sparte: sp,
      datum: d.createdAt.toISOString(),
    });
  }
  return {
    an: auslesenAn(),
    sperre,
    vertraege,
    offen,
    zusammenfassung: zusammenfassung(
      vertraege.map((v) => ({ id: v.id, sparte: v.sparte, felder: v.felder, geprueft: v.geprueft })),
      now,
    ),
    sparten: freigegebeneSparten({ zdr }),
    bestand,
  };
}

/** Kurzfassung für die Terminvorbereitung (Zeile mit Link); null = nichts anzuzeigen. ohneKi: auf Wunsch des Kunden. */
export async function vergleichKurz(leadId: string, customerId: string, now = new Date()) {
  const n = await prisma.policenAuszug.count({ where: { leadId, customerId } });
  if (!n && !auslesenAn()) return null;
  const docs = await prisma.leadDocument.count({ where: { leadId, customerId, status: "gespeichert" } });
  if (!docs) return null;
  const v = await ladeVergleich(leadId, customerId, now);
  const ohneKi = v.sperre === "ohne_ki" && v.offen.length > 0;
  if (!v.vertraege.length && !ohneKi && (v.sperre || !v.offen.length)) return null;
  return {
    vertraege: v.zusammenfassung.vertraege,
    monat: v.zusammenfassung.monatSumme,
    kuendigungen: v.zusammenfassung.kuendigungen.length,
    hinweise: v.zusammenfassung.doppelt.length + v.zusammenfassung.bausteine.length,
    offen: v.offen.length,
    ohneKi,
  };
}

type Wer = { customerId: string; userId: string | null; leadId: string };

async function auszugVon(w: Wer, id: string) {
  return prisma.policenAuszug.findFirst({ where: { id, leadId: w.leadId, customerId: w.customerId } });
}

/** Felder korrigieren (gleiche Whitelist und Filter wie die KI); Speichern gilt als geprüft. */
export async function korrigiereAuszug(w: Wer, id: string, eingaben: Record<string, unknown>): Promise<boolean> {
  const a = await auszugVon(w, id);
  if (!a || !isAuslesenSparte(a.sparte) || (a.status !== "ausgelesen" && a.status !== "leer")) return false;
  const felder = korrigiere(felderAus(a.felder, a.sparte), eingaben, a.sparte);
  await prisma.policenAuszug.update({ where: { id }, data: { felder: felder as Prisma.InputJsonValue, status: Object.keys(felder).length ? "ausgelesen" : "leer", geprueftAt: new Date(), geprueftVonId: w.userId } });
  await audit("policen.auslesen_korrigiert", { entity: "PolicenAuszug", entityId: id, customerId: w.customerId, details: { leadId: w.leadId, felder: Object.keys(eingaben).length }, actor: { id: w.userId, role: "BUYER" } });
  return true;
}

/** „Werte stimmen“ bzw. zurücknehmen. */
export async function bestaetigeAuszug(w: Wer, id: string, ja: boolean): Promise<boolean> {
  const a = await auszugVon(w, id);
  if (!a) return false;
  await prisma.policenAuszug.update({ where: { id }, data: ja ? { geprueftAt: new Date(), geprueftVonId: w.userId } : { geprueftAt: null, geprueftVonId: null } });
  return true;
}

/** Sparte wählen (Sparte unklar oder abweichend) und auslesen. */
export async function waehleSparte(w: Wer, documentId: string, sparte: AuslesenSparte): Promise<AuslesenErgebnis> {
  const doc = await prisma.leadDocument.findFirst({ where: { id: documentId, leadId: w.leadId, customerId: w.customerId, status: "gespeichert" }, select: { id: true } });
  if (!doc) return null;
  return liesUnterlageAus(doc.id, { sparte });
}

const BESTAND_LINIE: Record<AuslesenSparte, string> = {
  haftpflicht: "Haftpflicht",
  hausrat: "Hausrat",
  kfz: "KFZ",
  wohngebaeude: "Wohngebäude",
  rechtsschutz: "Rechtsschutz",
  pkv: "Kranken",
  bu: "BU",
  leben: "Vorsorge",
};
export const POLICEN_BESTAND_NOTIZ = "Aus Unterlagen vom Kunden übernommen";

/**
 * „In Bestand übernehmen“ (Rechtsprüfung K7): der Vermittler übernimmt den Vertrag ausdrücklich in seinen Bestand
 * (ExistingContract am Bestandskunden des Leads). Das bleibt auch nach der Löschung der Unterlage und des Auszugs.
 */
export async function uebernimmInBestand(w: Wer, id: string): Promise<{ existingContractId: string } | null> {
  const a = await auszugVon(w, id);
  if (!a || !isAuslesenSparte(a.sparte) || a.status !== "ausgelesen") return null;
  const { loadBestandVisible } = await import("@/lib/bestand/sichtbar-server");
  if (!(await loadBestandVisible(w.customerId))) return null;
  if (a.existingContractId) {
    const da = await prisma.existingContract.findUnique({ where: { id: a.existingContractId }, select: { id: true } });
    if (da) return { existingContractId: da.id };
  }
  const lead = await prisma.lead.findFirst({ where: { id: w.leadId, customerId: w.customerId, erasedAt: null }, select: { id: true, customerId: true, name: true, phone: true, email: true } });
  if (!lead) return null;
  const f = felderAus(a.felder, a.sparte);
  const s = (k: string) => (typeof f[k]?.w === "string" ? (f[k].w as string) : null);
  const monat = monatsbetrag(f);
  const { bestandskundeZuLead, refreshBestandSummary } = await import("@/lib/vertraege");
  const ec = await bestandskundeZuLead(lead, { consentAt: null, note: POLICEN_BESTAND_NOTIZ });
  const kuendbar = s("naechster_kuendigungstermin") ?? s("ablauf");
  const vertrag = await prisma.existingContract.create({
    data: {
      existingCustomerId: ec.id,
      line: BESTAND_LINIE[a.sparte],
      product: s("tarifname"),
      insurer: s("versicherer"),
      contractNo: s("versicherungsnummer"),
      startDate: s("beginn") ? new Date(`${s("beginn")}T00:00:00Z`) : null,
      renewalDate: kuendbar ? new Date(`${kuendbar}T00:00:00Z`) : null,
      annualPremium: monat != null ? Math.round(monat * 12 * 100) / 100 : null,
      status: "aktiv",
    },
    select: { id: true },
  });
  await refreshBestandSummary(ec.id);
  await prisma.policenAuszug.update({ where: { id }, data: { uebernommenAt: new Date(), uebernommenVonId: w.userId, existingContractId: vertrag.id, geprueftAt: a.geprueftAt ?? new Date(), geprueftVonId: a.geprueftVonId ?? w.userId } });
  await audit("policen.auslesen_bestand", { entity: "PolicenAuszug", entityId: id, customerId: w.customerId, details: { leadId: w.leadId, existingContractId: vertrag.id }, actor: { id: w.userId, role: "BUYER" } });
  await logLeadHistory(w.leadId, "dokument", `${SPARTE_LABEL[a.sparte]} in den Bestand übernommen`, { customerId: w.customerId, userId: w.userId });
  return { existingContractId: vertrag.id };
}

// ─── Täglich (Cron 03:00 UTC) und Diagnose ──────────────────────────────────

/** Hinweis 28 Tage vor Ablauf des Schlüssels (einmal) und „Schlüssel ungültig“ täglich, solange pausiert. */
export async function auslesenTaeglich(now = new Date()): Promise<{ ablaufHinweis: boolean; pausiert: boolean }> {
  const tage = tageBisAblauf(now);
  let ablaufHinweis = false;
  if (tage <= ABLAUF_HINWEIS_TAGE) {
    // Einmal je Schlüssel: schon gemeldet, wenn die letzte Meldung im Hinweisfenster dieses Ablaufs liegt
    const fensterAb = Date.parse(`${schluesselAblauf()}T00:00:00Z`) - (ABLAUF_HINWEIS_TAGE + 1) * 86_400_000;
    const e = await einstellung();
    if (!e?.ablaufGemeldetAt || e.ablaufGemeldetAt.getTime() < fensterAb) {
      await prisma.policenAuslesenEinstellung.upsert({ where: { id: "global" }, create: { id: "global", ablaufGemeldetAt: now }, update: { ablaufGemeldetAt: now } });
      const [y, m, d] = schluesselAblauf().split("-");
      const { sendToAdmins } = await import("@/lib/push");
      await sendToAdmins({
        title: "Policen auslesen: Schlüssel läuft ab",
        body: `Der Schlüssel für Policen-Auslesen läuft am ${d}.${m}.${y} ab. Bitte rechtzeitig einen neuen in Railway hinterlegen (POLICEN_OPENAI_API_KEY, POLICEN_OPENAI_KEY_ABLAUF).`,
        tag: `policen-auslesen-ablauf:${schluesselAblauf()}`,
        url: "/admin/neu/einstellungen/anbindungen",
      }).catch(() => null);
      ablaufHinweis = true;
    }
  }
  const p = await pausiert();
  if (p) await meldeSchluesselUngueltig(now);
  return { ablaufHinweis, pausiert: p };
}

/** /api/ops/diagnose?q=policen-auslesen: Schalter, Schlüssel gesetzt (ja/nein), Endpunkt, Modell, heutige Anzahl. */
export async function auslesenStatus(now = new Date()) {
  const [e, heute] = await Promise.all([einstellung(), prisma.policenAuslesenTag.findUnique({ where: { tag: berlinTag(now) } })]);
  return {
    ...auslesenKonfigStatus({ zdr: !!e?.zdrNachweisAm, now }),
    zdrNachweisAm: e?.zdrNachweisAm?.toISOString().slice(0, 10) ?? null,
    ablage: (await import("@/lib/policen/ablage")).ablageBereit(),
    ablageGrund: (await import("@/lib/policen/ablage")).ablageGrund(),
    pausiert: await pausiert(),
    pausiertSeit: e?.schluesselUngueltigAt?.toISOString() ?? null,
    heute: { tag: berlinTag(now), anzahl: heute?.anzahl ?? 0, limitGemeldet: !!heute?.gemeldetAt },
  };
}

/** Admin: Nachweis „keine Speicherung“ hinterlegen bzw. entfernen; Pause aufheben. */
export async function setzeZdrNachweis(o: { am: Date | null; referenz: string | null; userId: string | null }) {
  const data = { zdrNachweisAm: o.am, zdrReferenz: o.am ? (o.referenz ?? "").trim().slice(0, 200) || null : null, zdrVonId: o.am ? o.userId : null };
  await prisma.policenAuslesenEinstellung.upsert({ where: { id: "global" }, create: { id: "global", ...data }, update: data });
  await audit("policen.auslesen_zdr", { entity: "PolicenAuslesenEinstellung", entityId: "global", details: { gesetzt: !!o.am }, actor: { id: o.userId, role: "ADMIN" } });
}

export async function hebePauseAuf(userId: string | null) {
  await prisma.policenAuslesenEinstellung.updateMany({ where: { id: "global" }, data: { schluesselUngueltigAt: null, schluesselFinger: null } });
  await audit("policen.auslesen_pause_aufgehoben", { entity: "PolicenAuslesenEinstellung", entityId: "global", details: {}, actor: { id: userId, role: "ADMIN" } });
}
