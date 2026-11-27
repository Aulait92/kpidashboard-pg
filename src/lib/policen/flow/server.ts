// Policen-Strecke v2 mit WhatsApp Flow (Ole, 18.11.2026 freigegeben, hinter Schalter, NICHT live):
//   Schalter   POLICEN_FLOW=1 (Railway) und je Kunde nur, wenn der Flow bei dessen WABA veröffentlicht ist
//              (PolicenFlow.status = veroeffentlicht). Optional POLICEN_FLOW_KUNDEN = Kunden-IDs (Pilot), leer = alle.
//              Ohne Schalter: nichts wird angelegt, gesendet oder anders beantwortet (heutige Strecke unverändert).
//   Anlegen    syncPolicenFlows im WhatsApp-Cron (wie die Vorlagen, lib/whatsapp/template-submit.ts): Flow anlegen und
//              veröffentlichen (360dialog Flows API), dann die Vorlagen mit Flow-Knopf einreichen und ihren Status
//              nachziehen. Nie für Pay-per-Lead-Kunden, ruhende Kunden oder die Support-Nummer.
//   Senden     Chat-Nachricht, Bestätigung „Weitere senden“, Erinnerungen 1 und 2 (sendeFlowNachricht): freigegebene
//              Vorlage der Kategorie UTILITY (zeigt [Policen senden] und den Antwort-Knopf in EINER Nachricht und ist im
//              offenen 24-Stunden-Fenster kostenlos); sonst im Fenster die interaktive Flow-Nachricht (nur ein Knopf
//              möglich, siehe unten); außerhalb des Fensters ohne freigegebene Vorlage nichts.
//              Ausnahme Kfz-Bitte und Kfz-Erinnerung 1 (Ole, 22.11.2026): im Fenster immer die Flow-Nachricht mit
//              eigenem Text und Knopf [Unterlagen senden] (also ohne Antwort-Knopf). Außerhalb des Fensters die
//              Kfz-Vorlage (VORLAGEN_ARTEN_KFZ, Knopf [Unterlagen senden]), solange Meta sie nicht freigegeben hat die
//              allgemeine Vorlage mit deren Text.
//   Antwort    lib/policen/server.ts handleFlowAntwort (Einwilligung mit Textversion, Hash, Zeit, ki; Dateien laden,
//              prüfen, Virenprüfung, Ablage), „Später“ und „Nein, danke“ (handleSpaeter hier, Nein in server.ts).
//
// Warum nicht beides in einer interaktiven Nachricht: Meta erlaubt in einer interaktiven Flow-Nachricht genau einen
// Knopf (action name „flow“), keine zusätzlichen Antwort-Knöpfe. Nur Vorlagen mischen einen FLOW-Knopf mit Quick
// Replies (Gruppenregel: erst der Flow-Knopf, dann die Quick Replies). Darum: Vorlage zuerst, auch im Fenster. Ist sie
// (noch) nicht freigegeben, geht im Fenster die Flow-Nachricht ohne „Später“: wer nichts tut, wird behandelt wie
// „Später“ (Schluss der Strecke nach 1 Std., höchstens 2 Erinnerungen mit Opt-in); eine zweite Nachricht nur für den
// Knopf wäre mehr Lärm im Chat (UX-Regel) als Nutzen. Die Erinnerungen nennen „Nein, danke“ ohnehin in der Fußzeile,
// getippt wird es erkannt (texte.ts istNeinDanke).
//
// Kategorie der Vorlagen: UTILITY. Begründung: ausgelöst durch die Buchung des Leads, bezieht sich auf genau diesen
// Termin und bittet um Unterlagen für dessen Vorbereitung; keine Angebote, Preise oder Rabatte. Risiko: Meta kann die
// Bitte trotzdem als MARKETING einstufen (seit 2025 stuft Meta selbst um). Dann gilt hier: im
// Fenster die (kostenlose) Flow-Nachricht statt der Vorlage, außerhalb die Vorlage (Marketing-Preis). Die Kategorie laut
// Meta steht in PolicenFlow.vorlagen.

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/encryption";
import { reportError } from "@/lib/monitoring";
import { NUR_PPL_WHERE } from "@/lib/customer-package";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";
import { createTemplate, isNameInUseError, listTemplates } from "@/lib/whatsapp/dialog360";
import { mapRemoteStatus, TEMPLATE_LANGUAGE } from "@/lib/whatsapp/template-plan";
import type { Ansprache } from "@/lib/ansprache";
import { gesundheitInText } from "@/lib/policen/regeln";
import { createFlow, getFlow, listFlows, publishFlow, uploadFlowJson } from "@/lib/policen/flow/dialog360-flows";
import { istIntegritaetsSperre, META_SPERRE_ABSTAND_MS, sperreVorbei, sperrGrund, STATUS_META_GESPERRT } from "@/lib/policen/flow/meta-sperre";
import { einstiegsBildschirme, flowJsonHash, flowJsonText, MAX_DATEIEN_JE_SENDEN, pruefeFlowJson, policenFlowJson, SCREEN_FOTOS } from "@/lib/policen/flow/flow-json";
import { entschluesseleFlowMedium, FlowMediaFehler, pruefeSha256, type EncryptionMetadata } from "@/lib/policen/flow/krypto";
import {
  bestaetigung,
  chatNachricht,
  erinnerung1,
  erinnerung2,
  flowTextVersion,
  formularDaten,
  formularWortlaut,
  flowKnopf,
  kfzVorlagenArt,
  KNOPF_POLICEN_SENDEN,
  KNOPF_WEITERE_SENDEN,
  NEIN_DANKE_KNOEPFE,
  PAYLOAD_NEIN_DANKE,
  PAYLOAD_SPAETER,
  pronomenAus,
  spaeterAntwort,
  tagText,
  textHash,
  uhrzeitText,
  vorlageGerendert,
  vorlagenParameter,
  vorlagenText,
  VORLAGEN_ARTEN_KFZ,
  type FlowTextKontext,
  type Nachricht,
  type VorlagenArt,
  type VorlagenBasis,
} from "@/lib/policen/flow/texte";

type Env = Record<string, string | undefined>;
const HOUR = 60 * 60 * 1000;

// ─── Schalter ───────────────────────────────────────────────────────────────

/** POLICEN_FLOW=1 (bzw. true/an/on). */
export const flowSchalterAn = (env: Env = process.env) => /^(1|true|ja|an|on)$/i.test((env.POLICEN_FLOW ?? "").trim());
/** POLICEN_FLOW_KUNDEN leer = alle, sonst nur diese Kunden-IDs. */
export function flowKundeErlaubt(customerId: string, env: Env = process.env): boolean {
  const roh = (env.POLICEN_FLOW_KUNDEN ?? "").trim();
  return !roh || roh.split(/[\s,;]+/).includes(customerId);
}

export type VorlagenStand = Record<string, { status: string; category: string | null; grund: string | null }>;
export type AktiverFlow = { flowId: string; jsonHash: string; vorlagen: VorlagenStand };

/**
 * Status „gestört“ (Ole, 19.11.2026): Senden scheiterte bei 360dialog/Meta. Der Flow bleibt für diesen Kunden aus, bis
 * sich das Flow JSON ändert (neuer Flow) oder jemand den Status zurücksetzt; die Strecke nimmt solange die bisherige
 * Bitte mit Einwilligung (lib/policen/bitte.ts).
 */
export const STATUS_GESTOERT = "gestoert";

let einstiegOk: boolean | null = null;
/** Einstieg des aktuellen Flow JSON ist genau SCREEN_FOTOS (das senden Nachricht und Vorlage als screen). */
function einstiegPasst(): boolean {
  if (einstiegOk === null) {
    const e = einstiegsBildschirme();
    einstiegOk = e.length === 1 && e[0] === SCREEN_FOTOS;
  }
  return einstiegOk;
}

/**
 * Flow für diesen Kunden nutzbar? Schalter an, Kunde erlaubt, kein Pay-per-Lead, Flow bei Meta veröffentlicht (Status
 * PUBLISHED laut letzter Prüfung im Cron, nicht gestört) UND aus dem aktuellen Flow JSON (gleicher Hash), dessen
 * einziger Einstieg der gesendete Bildschirm SCREEN_FOTOS ist. Ein älterer Flow (anderer Hash) wird nie benutzt,
 * auch wenn er als veröffentlicht geführt wird: Der Cron legt dann zuerst den neuen an.
 */
export async function aktiverFlow(customerId: string, env: Env = process.env): Promise<AktiverFlow | null> {
  if (!flowSchalterAn(env) || !flowKundeErlaubt(customerId, env)) return null;
  if (!einstiegPasst()) return null;
  const [rec, ppl] = await Promise.all([
    prisma.policenFlow.findUnique({ where: { customerId } }),
    prisma.customer.count({ where: { id: customerId, ...NUR_PPL_WHERE } }),
  ]);
  if (ppl || !rec?.flowId || rec.status !== "veroeffentlicht" || !rec.jsonHash || rec.jsonHash !== flowJsonHash()) return null;
  return { flowId: rec.flowId, jsonHash: rec.jsonHash, vorlagen: (rec.vorlagen as VorlagenStand | null) ?? {} };
}

// ─── Kontext (Texte für diesen Chat) ────────────────────────────────────────

/** Sparten des Leads, für die das Auslesen gilt (lib/policen/auslesen/felder.ts AUSLESEN_SPARTEN). */
function auslesenSpartenDesLeads(source: string | null, formular: { label: string; value: string }[], rechner: string[]): string[] {
  const s = `${source ?? ""} ${formular.map((x) => x.value).join(" ")}`.toLowerCase();
  const out = new Set(rechner.filter((x) => ["haftpflicht", "hausrat", "rechtsschutz", "wohngebaeude"].includes(x)));
  if (/privatschutz/.test(s) && !/tier/.test(source ?? "")) ["haftpflicht", "hausrat"].forEach((x) => out.add(x));
  if (/\bkfz\b|autoversicherung|kraftfahrt/.test(s)) out.add("kfz");
  if (/\bpkv\b|krankenversicherung|krankenzusatz/.test(s)) out.add("pkv");
  if (/berufsunf|\bbu\b/.test(s)) out.add("bu");
  if (/lebensversicherung|risikoleben|\bleben\b/.test(s)) out.add("leben");
  return [...out];
}

/**
 * KI-Satz „damit Ihr Vergleich zum Termin schon fertig ist“ (texte-v2.md, Regel 8): nur wenn das Auslesen läuft
 * (Schlüssel, kein Notschalter, keine Pause), für diesen Kunden freigeschaltet ist (und er Amazon Web Services nicht
 * widersprochen hat) und für mindestens eine Sparte des
 * Leads gilt (Sach sofort, Kranken/BU/Leben nur mit Nachweis „keine Speicherung“, K2). Die Terminvorbereitung zeigt
 * das Vergleichsblatt vor dem Termin (components/policen-vergleich-kurz.tsx, /buyer/termine/[id]/vorbereitung/vertraege),
 * ausgelesen wird direkt nach dem Eingang (gateway.ts → auslesen/server.ts nachEingang).
 */
export async function kiSatzAktiv(o: { customerId: string; source: string | null; formular: { label: string; value: string }[]; angaben: unknown }, env: Env = process.env): Promise<boolean> {
  const konfig = await import("@/lib/policen/auslesen/konfig");
  if (!konfig.auslesenAn(env) || !konfig.kundeFreigeschaltet(o.customerId, env)) return false;
  // Widerspruch des Vermittlers gegen Amazon Web Services (lib/datennutzung-sperre.ts): für sein Konto wird nichts
  // ausgelesen, also auch kein „damit Ihr Vergleich schon fertig ist“ an den Lead
  const { awsWiderspruchAm } = await import("@/lib/datennutzung-sperre");
  if (await awsWiderspruchAm(o.customerId)) return false;
  const srv = await import("@/lib/policen/auslesen/server");
  if (await srv.pausiert().catch(() => true)) return false;
  const frei = konfig.freigegebeneSparten({ zdr: await srv.zdrHinterlegt().catch(() => false) }, env) as string[];
  const { spartenDesLeads } = await import("@/lib/preise/rechner-angaben");
  const rechner = (() => {
    try {
      return spartenDesLeads(o.source, { formular: o.formular, angaben: o.angaben }) as string[];
    } catch {
      return [];
    }
  })();
  return auslesenSpartenDesLeads(o.source, o.formular, rechner).some((s) => frei.includes(s));
}

export type FlowChat = {
  conversationId: string;
  customerId: string;
  leadId: string;
  phone: string;
  an: Ansprache;
  fensterOffen: boolean;
  botActive: boolean;
  datenschutzUrl: string | null;
  minderjaehrig: boolean;
  gesundheitAn: boolean;
  source: string | null;
  termin: { id: string; startsAt: Date; mode: string | null } | null;
  text: FlowTextKontext;
};

function formAnswers(raw: unknown): { label: string; value: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) => (x && typeof x === "object" && typeof x.label === "string" && typeof x.value === "string" ? [{ label: x.label, value: x.value }] : []));
}

/** Alles für die Texte dieses Chats (Vermittler, Firma, Termin, KI-Satz, Gesundheitssatz). null = kein Lead-Chat. */
export async function flowChat(conversationId: string, now = new Date()): Promise<FlowChat | null> {
  const { policenSprecherFuerChat } = await import("@/lib/policen/server");
  const s = await policenSprecherFuerChat(conversationId);
  if (!s) return null;
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { windowExpiresAt: true, botActive: true, qualificationData: true, lead: { select: { source: true, formData: true, vorvertraege: true } } },
  });
  const termin = await prisma.appointment.findFirst({
    where: { leadId: s.chat.leadId, status: "booked", startsAt: { gt: now } },
    orderBy: { startsAt: "asc" },
    select: { id: true, startsAt: true, mode: true, komplettcheck: true },
  });
  const source = conv?.lead?.source ?? null;
  const kfz = await import("@/lib/whatsapp/produkt-fragen").then((m) => m.istKfzProdukt(source));
  // Kfz: genannte andere Verträge ohne das angefragte Produkt (Ole, 22.11.2026, lib/policen/andere-policen.ts)
  // Übrige Produkte (Ole, 22.11.2026): genannte Verträge mit dem angefragten Produkt (Bitte um alle Policen)
  const { andereVertraege: vertraegeFuerText } = await import("@/lib/policen/andere-policen");
  const vv = conv?.lead?.vorvertraege ?? null;
  const andereVertraege = kfz ? vertraegeFuerText(vv, { source, kfz, gesundheitAn: s.sp.gesundheitAn }) : [];
  const genannteVertraege = kfz ? [] : vertraegeFuerText(vv, { source, gesundheitAn: s.sp.gesundheitAn, mitAngefragt: true });
  const formular = formAnswers(conv?.lead?.formData);
  const { istTierStrecke } = await import("@/lib/whatsapp/tier-fragen");
  const tier = istTierStrecke(source);
  const kiFertig = await kiSatzAktiv({ customerId: s.chat.customerId, source, formular, angaben: conv?.qualificationData ?? null }).catch(() => false);
  return {
    conversationId,
    customerId: s.chat.customerId,
    leadId: s.chat.leadId,
    phone: s.chat.contactPhone,
    an: s.sp.an,
    fensterOffen: !!conv?.windowExpiresAt && conv.windowExpiresAt.getTime() > now.getTime(),
    botActive: !!conv?.botActive,
    datenschutzUrl: s.sp.datenschutzUrl,
    minderjaehrig: s.chat.minderjaehrig,
    gesundheitAn: s.sp.gesundheitAn,
    source,
    termin: termin ? { id: termin.id, startsAt: termin.startsAt, mode: termin.mode } : null,
    text: {
      an: s.sp.an,
      name: s.sp.person.nom,
      pronomen: pronomenAus(s.sp.vermittler.anrede ?? null, s.sp.person.nom),
      firma: s.sp.firma,
      tag: termin ? tagText(termin.startsAt, now) : null,
      uhrzeit: termin ? uhrzeitText(termin.startsAt) : null,
      video: termin ? termin.mode === "video" : undefined,
      kiFertig,
      // Tierkranken: ohne Gesundheitssatz (Tierdaten sind keine Gesundheitsdaten nach Art. 9 DSGVO)
      gesundheit: s.sp.gesundheitAn && !tier,
      kfz,
      andereVertraege,
      komplettcheck: termin?.komplettcheck ?? null,
      genannteVertraege,
    },
  };
}

/**
 * Darf die Strecke für diesen Chat die Bitte als Flow schicken? Flow aktiv, Policen-Funktion an, Lead volljährig,
 * Datenschutzhinweis vorhanden (Link im Formular). Reines Gesundheitsprodukt ohne Freigabe Kranken/BU/Leben: nein
 * (dann wie bisher, lib/policen/assistent.ts).
 */
export async function policenFlowMoeglich(conversationId: string, now = new Date()): Promise<boolean> {
  if (!flowSchalterAn()) return false;
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { customerId: true } });
  if (!conv || !(await aktiverFlow(conv.customerId))) return false;
  const { policenAn } = await import("@/lib/policen/server");
  if (!policenAn()) return false;
  const c = await flowChat(conversationId, now);
  if (!c || c.minderjaehrig || !c.datenschutzUrl) return false;
  if (!c.gesundheitAn && gesundheitInText(c.source)) return false;
  return true;
}

// ─── Senden ─────────────────────────────────────────────────────────────────

export const MERKER_FLOW = "policen_flow";
export type FlowArt = VorlagenBasis | "weitere";
/** Merker je gesendeter Flow-Nachricht (interne Nachricht): Token, Wortlaut, Hash, Textversion für den Nachweis. */
export type FlowMerker = {
  token: string;
  art: FlowArt;
  wortlaut: string;
  hash: string;
  textVersion: string;
  datenschutzUrl: string;
  waMessageId: string | null;
  kiFertig: boolean;
  gesundheit: boolean;
  appointmentId: string | null;
};

const neuesToken = () => `pf1_${randomBytes(18).toString("base64url")}`;

/**
 * Name einer Vorlage (Meta: Kleinbuchstaben, Ziffern, Unterstrich), an den Flow (Hash des Flow JSON) und an den eigenen
 * Text gebunden (Hash von Text und Fußzeile). Neuer Text = neuer Name = neue Freigabe bei Meta; sonst würde Meta unter
 * dem alten Namen weiter den alten, freigegebenen Text zustellen, während der Verlauf den neuen zeigt.
 */
export const vorlagenName = (art: VorlagenArt, an: Ansprache, jsonHash: string) => {
  const t = vorlagenText(art, an);
  return `pg_policen_${art.replace("erinnerung", "erinn")}_${jsonHash.slice(0, 6)}_${textHash(`${t.text}\n${t.fusszeile ?? ""}`).slice(0, 4)}_${an}`;
};

function nachrichtFuer(art: FlowArt, c: FlowChat, extra?: Nachricht): Nachricht {
  if (art === "bitte") return chatNachricht(c.text);
  if (art === "erinnerung1") return erinnerung1(c.text);
  if (art === "erinnerung2") return erinnerung2(c.text);
  return extra ?? bestaetigung(c.text, 1, true);
}
const PAYLOAD_KNOPF2: Record<VorlagenBasis, string> = { bitte: PAYLOAD_SPAETER, erinnerung1: PAYLOAD_NEIN_DANKE, erinnerung2: PAYLOAD_NEIN_DANKE };

export type VorlagenWahl = { weg: "vorlage"; art: VorlagenArt; name: string } | { weg: "flow" } | null;

/**
 * Welche Nachricht geht raus? Rein (Test). Kfz-Bitte und Kfz-Erinnerung 1 (Ole, 22.11.2026): im Fenster immer die
 * Flow-Nachricht mit Kfz-Text; außerhalb die freigegebene Kfz-Vorlage, sonst (noch nicht freigegeben) die allgemeine
 * Vorlage. Alle anderen: freigegebene Vorlage (im Fenster nur UTILITY, dort kostenlos), sonst im Fenster die
 * Flow-Nachricht, außerhalb nichts (null).
 */
export function waehleVorlage(art: FlowArt, k: FlowTextKontext, o: { an: Ansprache; fensterOffen: boolean; jsonHash: string; vorlagen: VorlagenStand }): VorlagenWahl {
  if (art === "weitere") return o.fensterOffen ? { weg: "flow" } : null;
  const kfzArt = kfzVorlagenArt(art, k);
  const freigegeben = (a: VorlagenArt) => {
    const name = vorlagenName(a, o.an, o.jsonHash);
    const v = o.vorlagen[name];
    return v && v.status === "approved" && (!o.fensterOffen || (v.category ?? "").toLowerCase() === "utility") ? name : null;
  };
  // Kfz im 24-h-Fenster (Ole, 22.11.2026): freigegebene Kfz-Vorlage mit beiden Knöpfen ([Unterlagen senden] plus
  // [Später] bzw. [Nein, danke]); sonst die Flow-Nachricht mit Kfz-Text, nie die allgemeine Vorlage (falscher Text)
  if (kfzArt && o.fensterOffen) {
    const name = freigegeben(kfzArt);
    return name ? { weg: "vorlage", art: kfzArt, name } : { weg: "flow" };
  }
  // Übrige Produkte mit genannten Verträgen im 24-h-Fenster (Ole, 22.11.2026): die freie Flow-Nachricht nennt die
  // Verträge, die freigegebene Vorlage nicht (ihr Text bleibt unverändert, sonst neue Freigabe). Kostet im Fenster
  // ebenfalls nichts; es fehlt nur der zweite Knopf ([Später] bzw. [Nein, danke]), wie bei Kfz ohne Kfz-Vorlage.
  if (!k.kfz && o.fensterOffen && art !== "erinnerung2" && k.genannteVertraege?.length) return { weg: "flow" };
  for (const a of kfzArt ? [kfzArt, art] : [art]) {
    const name = freigegeben(a);
    if (name) return { weg: "vorlage", art: a, name };
  }
  return o.fensterOffen ? { weg: "flow" } : null;
}

/**
 * Flow-Nachricht senden (Vorlage bzw. interaktiv, siehe oben) und den Merker setzen. vorweg: Text davor (z. B.
 * KI-Hinweis des Assistenten). null = nicht gesendet (Flow nicht aktiv, Fenster zu ohne freigegebene Vorlage, kein
 * Datenschutzhinweis).
 */
export async function sendeFlowNachricht(conversationId: string, art: FlowArt, o: { now?: Date; nachricht?: Nachricht; vorweg?: string | null } = {}): Promise<{ messageId: string | null; weg: "vorlage" | "flow" } | null> {
  const st = { vorwegGesendet: false };
  try {
    return await sendeFlowNachrichtRoh(conversationId, art, o, st);
  } catch (e) {
    throw new FlowSendeFehler(e, st.vorwegGesendet);
  }
}

/** Senden scheiterte (360dialog/Meta); vorwegGesendet: der Text davor ist schon beim Lead. */
export class FlowSendeFehler extends Error {
  constructor(
    readonly ursache: unknown,
    readonly vorwegGesendet: boolean,
  ) {
    super(ursache instanceof Error ? ursache.message : String(ursache));
    this.name = "FlowSendeFehler";
  }
}

/** Flow dieses Kunden als gestört markieren (nur ein veröffentlichter) und den Fehler melden (Sentry). */
export async function flowGestoert(customerId: string, err: unknown, wo: string): Promise<void> {
  const ursache = err instanceof FlowSendeFehler ? err.ursache : err;
  reportError(ursache, "policen-flow-senden", { customer: customerId, wo });
  const msg = ursache instanceof Error ? ursache.message.slice(0, 400) : "Fehler";
  await prisma.policenFlow
    .updateMany({ where: { customerId, status: "veroeffentlicht" }, data: { status: STATUS_GESTOERT, fehler: `Senden (${wo}): ${msg}` } })
    .catch((e) => console.error("[policen flow gestört]", e instanceof Error ? e.name : "Fehler"));
}

export type FlowSendeErgebnis = { gesendet: { messageId: string | null; weg: "vorlage" | "flow" } } | { gesendet: null; fehler: boolean; vorwegGesendet: boolean };

/**
 * Wie sendeFlowNachricht, wirft aber nie (Produktionsfehler 19.11.2026: ein 400 von 360dialog brach den Bot-Turn ab, der
 * Lead bekam keine Antwort). Bei einem Fehler: Sentry, Flow für den Kunden „gestört“ (aktiverFlow liefert null), und
 * der Aufrufer sendet die bisherige Bitte mit Einwilligung.
 */
export async function sendeFlowNachrichtSicher(conversationId: string, art: FlowArt, o: { now?: Date; nachricht?: Nachricht; vorweg?: string | null } = {}): Promise<FlowSendeErgebnis> {
  try {
    const r = await sendeFlowNachricht(conversationId, art, o);
    return r ? { gesendet: r } : { gesendet: null, fehler: false, vorwegGesendet: false };
  } catch (e) {
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { customerId: true } }).catch(() => null);
    if (conv) await flowGestoert(conv.customerId, e, art);
    else reportError(e, "policen-flow-senden", { conversation: conversationId });
    return { gesendet: null, fehler: true, vorwegGesendet: e instanceof FlowSendeFehler && e.vorwegGesendet };
  }
}

async function sendeFlowNachrichtRoh(
  conversationId: string,
  art: FlowArt,
  o: { now?: Date; nachricht?: Nachricht; vorweg?: string | null },
  st: { vorwegGesendet: boolean },
): Promise<{ messageId: string | null; weg: "vorlage" | "flow" } | null> {
  const now = o.now ?? new Date();
  const c = await flowChat(conversationId, now);
  if (!c || !c.datenschutzUrl) return null;
  const flow = await aktiverFlow(c.customerId);
  if (!flow) return null;
  let n = nachrichtFuer(art, c, o.nachricht);
  const daten = formularDaten(c.text, c.datenschutzUrl);
  const wortlaut = formularWortlaut(daten);
  const token = neuesToken();
  const wahl = waehleVorlage(art, c.text, { an: c.an, fensterOffen: c.fensterOffen, jsonHash: flow.jsonHash, vorlagen: flow.vorlagen });
  if (!wahl) return null;
  const vorlage = wahl.weg === "vorlage" && art !== "weitere" ? { ...wahl, basis: art } : null;
  // Kfz mit Vorlage: der Verlauf zeigt, was Meta zustellt, also den Text der Kfz-Vorlage bzw. (Kfz-Vorlage noch nicht
  // freigegeben) den allgemeinen Text
  if (vorlage && c.text.kfz) n = vorlage.art === art ? nachrichtFuer(art, { ...c, text: { ...c.text, kfz: false } }) : vorlageGerendert(vorlage.art, c.text);
  // Übrige Produkte mit Vorlage (Fenster zu): die Vorlage nennt keine Verträge, der Verlauf also auch nicht
  else if (vorlage && c.text.genannteVertraege?.length) n = nachrichtFuer(art, { ...c, text: { ...c.text, genannteVertraege: null } });
  const { sendWhatsAppMessage } = await import("@/lib/whatsapp/gateway");
  if (o.vorweg?.trim() && c.fensterOffen) {
    await sendWhatsAppMessage({ customerId: c.customerId, to: c.phone, body: o.vorweg, sentBy: "bot" });
    st.vorwegGesendet = true;
  }
  const datenText = daten as unknown as Record<string, string>;
  const res = vorlage
    ? await sendWhatsAppMessage({
        customerId: c.customerId,
        to: c.phone,
        body: n.text,
        footer: n.fusszeile,
        sentBy: "bot",
        vorlage: {
          name: vorlage.name,
          language: TEMPLATE_LANGUAGE,
          components: [
            { type: "body", parameters: vorlagenParameter(vorlage.art, c.text).map((text) => ({ type: "text", text })) },
            { type: "button", sub_type: "flow", index: "0", parameters: [{ type: "action", action: { flow_token: token, flow_action_data: datenText } }] },
            { type: "button", sub_type: "quick_reply", index: "1", parameters: [{ type: "payload", payload: PAYLOAD_KNOPF2[vorlage.basis] }] },
          ],
        },
      })
    : await sendWhatsAppMessage({
        customerId: c.customerId,
        to: c.phone,
        body: n.text,
        footer: n.fusszeile,
        sentBy: "bot",
        flow: { flowId: flow.flowId, token, cta: art === "weitere" ? KNOPF_WEITERE_SENDEN : art === "erinnerung2" ? KNOPF_POLICEN_SENDEN : flowKnopf(c.text), screen: SCREEN_FOTOS, data: datenText },
      });
  const merker: FlowMerker = {
    token,
    art,
    wortlaut,
    hash: textHash(wortlaut),
    textVersion: flowTextVersion(c.text.gesundheit),
    datenschutzUrl: c.datenschutzUrl,
    waMessageId: res.messageId,
    kiFertig: c.text.kiFertig,
    gesundheit: c.text.gesundheit,
    appointmentId: c.termin?.id ?? null,
  };
  await prisma.message.create({ data: { conversationId, direction: "internal", kind: MERKER_FLOW, body: JSON.stringify(merker), sentBy: "bot" } });
  return { messageId: res.messageId, weg: vorlage ? "vorlage" : "flow" };
}

/** Bestätigung nach dem Absenden mit Knopf „Weitere senden“; ohne aktiven Flow als Text mit Fußzeile. */
export async function sendeBestaetigung(conversationId: string, n: Nachricht, now = new Date()): Promise<void> {
  const r = (await sendeFlowNachrichtSicher(conversationId, "weitere", { now, nachricht: n })).gesendet;
  if (r) return;
  const c = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { customerId: true, contactPhone: true } });
  if (!c) return;
  const { sendWhatsAppMessage } = await import("@/lib/whatsapp/gateway");
  await sendWhatsAppMessage({ customerId: c.customerId, to: c.contactPhone, body: n.fusszeile ? `${n.text}\n\n${n.fusszeile}` : n.text, sentBy: "bot" });
}

/** Merker zu einem Token (nur in den Chats dieses Leads). */
export async function flowMerker(leadId: string, token: string): Promise<FlowMerker | null> {
  if (!/^pf1_[A-Za-z0-9_-]{10,60}$/.test(token)) return null;
  const rows = await prisma.message.findMany({
    where: { conversation: { leadId }, direction: "internal", kind: MERKER_FLOW, body: { contains: token } },
    select: { body: true },
    take: 3,
  });
  for (const r of rows) {
    try {
      const m = JSON.parse(r.body ?? "{}") as FlowMerker;
      if (m.token === token) return m;
    } catch {
      /* kaputter Merker */
    }
  }
  return null;
}

// ─── Antwort des Formulars lesen und Dateien laden ──────────────────────────

export type FlowDatei = {
  id: string | null;
  name: string | null;
  mime: string | null;
  sha256: string | null;
  cdnUrl: string | null;
  encryption: EncryptionMetadata | null;
  /** Aufbau des Eintrags ohne Werte (nur Feldnamen) fürs Protokoll, wenn die Datei nicht geladen werden kann */
  felder: string;
};
export type FlowAntwort = { token: string; ohneKi: boolean; dateien: FlowDatei[] };

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** response_json aus nfm_reply (JSON-Text oder Objekt). null = unlesbar bzw. ohne Token. */
/** JSON-Text oder Objekt; Meta liefert verschachtelte Werte teils als Text (z. B. `${form.fotos}` im complete-Payload). */
const alsJson = (v: unknown): unknown => {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return v;
  try {
    return JSON.parse(t);
  } catch {
    return v;
  }
};
/** Media-ID als Text (Meta schickt sie als Text, sicherheitshalber auch Zahlen annehmen). */
const idText = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? String(v) : str(v));
/** Feldnamen eines Eintrags ohne Werte, z. B. „file_name,cdn_url,encryption_metadata[iv,…]“. */
const feldnamen = (d: unknown): string => {
  if (typeof d === "string") return "text";
  if (!d || typeof d !== "object") return typeof d;
  return Object.entries(d as Record<string, unknown>)
    .map(([k, v]) => {
      const o = alsJson(v);
      return o && typeof o === "object" && !Array.isArray(o) ? `${k}[${Object.keys(o).join(",")}]` : k;
    })
    .join(",");
};

/**
 * Antwort des Formulars lesen. Je Datei: Media-ID (`id` bzw. `media_id`) zum Laden wie normale WhatsApp-Bilder, oder
 * `cdn_url` mit `encryption_metadata` (verschlüsselt, krypto.ts). Tolerant gegenüber Text statt JSON und Zahlen-IDs
 * (Ole, 19.11.2026: Foto aus dem Formular kam ohne Quelle an, direkt im Chat gesendet klappte es).
 */
export function leseFlowAntwort(raw: unknown): FlowAntwort | null {
  const j0 = alsJson(raw);
  const j = j0 && typeof j0 === "object" && !Array.isArray(j0) ? (j0 as Record<string, unknown>) : null;
  const token = str(j?.flow_token);
  if (!j || !token) return null;
  const liste = (v: unknown): unknown[] => {
    const x = alsJson(v);
    return Array.isArray(x) ? x : x && typeof x === "object" ? [x] : typeof x === "string" && x.trim() ? [x] : [];
  };
  const dateien = [...liste(j.fotos), ...liste(j.pdfs)].slice(0, MAX_DATEIEN_JE_SENDEN).map((roh): FlowDatei => {
    const d0 = alsJson(roh);
    // Nur die Media-ID als Text
    if (typeof d0 === "string") return { id: str(d0), name: null, mime: null, sha256: null, cdnUrl: null, encryption: null, felder: "text" };
    const d = (d0 && typeof d0 === "object" ? d0 : {}) as Record<string, unknown>;
    const em = alsJson(d.encryption_metadata) as Record<string, unknown> | undefined;
    const encryption =
      em && typeof em === "object" && ["encrypted_hash", "iv", "encryption_key", "hmac_key", "plaintext_hash"].every((k) => typeof em[k] === "string")
        ? (em as unknown as EncryptionMetadata)
        : null;
    return {
      id: idText(d.id) ?? idText(d.media_id),
      name: str(d.file_name) ?? str(d.filename),
      mime: str(d.mime_type),
      sha256: str(d.sha256),
      cdnUrl: str(d.cdn_url),
      encryption,
      felder: feldnamen(d0),
    };
  });
  const ohne = j.ohne_ki;
  return { token, ohneKi: ohne === true || ohne === "true", dateien };
}

export type FlowLadeErgebnis = { ok: true; data: Buffer } | { ok: false; grund: "zu_gross" | "fehler"; detail?: string };

/**
 * Datei aus dem Formular laden: mit encryption_metadata von der CDN-Adresse und entschlüsseln (krypto.ts), sonst über
 * die Media-ID wie normale Bilder (lib/policen/media.ts, 360dialog) und den sha256 der Antwort prüfen.
 */
export async function ladeFlowDatei(apiKey: string, f: FlowDatei, maxBytes: number): Promise<FlowLadeErgebnis> {
  if (f.cdnUrl && f.encryption) {
    try {
      if (!/^https:\/\//i.test(f.cdnUrl)) return { ok: false, grund: "fehler", detail: "url" };
      const res = await fetch(f.cdnUrl);
      if (!res.ok) return { ok: false, grund: "fehler", detail: `cdn ${res.status}` };
      const enc = Buffer.from(await res.arrayBuffer());
      if (enc.length > maxBytes + 64) return { ok: false, grund: "zu_gross" };
      const data = entschluesseleFlowMedium(enc, f.encryption);
      return data.length > maxBytes ? { ok: false, grund: "zu_gross" } : { ok: true, data };
    } catch (e) {
      return { ok: false, grund: "fehler", detail: e instanceof FlowMediaFehler ? e.grund : "laden" };
    }
  }
  if (!f.id) return { ok: false, grund: "fehler", detail: "ohne id" };
  const { ladeMedia } = await import("@/lib/policen/media");
  const r = await ladeMedia(apiKey, f.id, maxBytes);
  if (!r.ok) return r;
  // Hash aus der Antwort (Base64 von SHA-256 der Datei); fehlt er, bleibt nur TLS als Schutz
  if (f.sha256 && !pruefeSha256(r.data, f.sha256)) return { ok: false, grund: "fehler", detail: "hash" };
  return { ok: true, data: r.data };
}

// ─── „Später“ ───────────────────────────────────────────────────────────────

/**
 * „Später“ (Quick Reply der Vorlage): weder Einwilligung noch Ablehnung (kein Nachweis). Antwort mit Knopf
 * „Nein, danke“, wenn erinnert werden darf (Opt-in aus der Buchung, A8), sonst ohne Satz und Knopf. Danach geht die
 * Strecke weiter (gateway.ts nachPolicenAntwort mit art „spaeter“).
 */
export async function handleSpaeter(conversationId: string, now = new Date()): Promise<{ handled: boolean; art?: string }> {
  const c = await flowChat(conversationId, now);
  if (!c) return { handled: false };
  const { darfPolicenErinnern } = await import("@/lib/policen/server");
  const erinnern = await darfPolicenErinnern(c.leadId, now).catch(() => false);
  const { sendWhatsAppMessage } = await import("@/lib/whatsapp/gateway");
  await sendWhatsAppMessage({ customerId: c.customerId, to: c.phone, body: spaeterAntwort(c.an, erinnern), sentBy: "bot", buttons: erinnern ? NEIN_DANKE_KNOEPFE : null });
  const { audit } = await import("@/lib/audit");
  await audit("policen.spaeter", { entity: "Lead", entityId: c.leadId, customerId: c.customerId, details: { erinnern }, actor: { role: "lead" } });
  return { handled: true, art: "spaeter" };
}

// ─── Erinnerungen (höchstens 2, nur mit Opt-in aus der Buchung) ─────────────

const berlinTag = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(d);
const berlinStunde = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(d));

/**
 * Welche Erinnerung ist jetzt fällig? Rein. Erinnerung 1: 24 Std. nach der Bitte, nur wenn der Termin dann noch
 * mindestens 2 Tage entfernt ist. Erinnerung 2: am Vortag ab 18 Uhr Berlin. Jede höchstens einmal, zusammen höchstens 2.
 */
export function faelligeErinnerung(o: { bitteAt: Date; terminAt: Date; gesendet: ("tag" | "vortag")[]; now: Date }): "erinnerung1" | "erinnerung2" | null {
  if (o.gesendet.length >= 2 || o.terminAt.getTime() <= o.now.getTime()) return null;
  const vortag = berlinTag(new Date(o.terminAt.getTime() - 24 * HOUR)) === berlinTag(o.now) && berlinStunde(o.now) >= 18;
  if (vortag) return o.gesendet.includes("vortag") ? null : "erinnerung2";
  if (o.gesendet.includes("tag")) return null;
  const e1At = o.bitteAt.getTime() + 24 * HOUR;
  if (o.now.getTime() < e1At || o.terminAt.getTime() - e1At < 2 * 24 * HOUR) return null;
  // Spätestens bis zum Vortag (danach gilt nur noch Erinnerung 2)
  if (berlinTag(o.now) >= berlinTag(new Date(o.terminAt.getTime() - 24 * HOUR))) return null;
  return "erinnerung1";
}

/** Im WhatsApp-Cron (über termin-strecke.ts runPolicenErinnerung, Mo bis Sa 8 bis 20 Uhr): Erinnerungen der v2-Strecke. */
export async function runPolicenFlowErinnerungen(now = new Date()): Promise<{ gesendet: number }> {
  if (!flowSchalterAn()) return { gesendet: 0 };
  const strecke = await import("@/lib/whatsapp/termin-strecke");
  const bitten = await prisma.message.findMany({
    where: { direction: "internal", kind: strecke.STRECKE.policenBitte, createdAt: { gte: new Date(now.getTime() - 30 * 24 * HOUR) }, body: { contains: '"flow":true' } },
    select: { conversationId: true, body: true },
    take: 300,
  });
  let gesendet = 0;
  for (const b of bitten) {
    try {
      const appointmentId = String((JSON.parse(b.body ?? "{}") as { appointmentId?: string }).appointmentId ?? "");
      const t = appointmentId ? await prisma.appointment.findUnique({ where: { id: appointmentId }, select: { status: true, startsAt: true, leadId: true } }) : null;
      if (!t || t.status !== "booked" || t.startsAt.getTime() <= now.getTime()) continue;
      const stand = await strecke.streckenStand(b.conversationId, appointmentId);
      if (!stand.policenBitteAt) continue;
      const arten = await prisma.message.findMany({ where: { conversationId: b.conversationId, direction: "internal", kind: strecke.STRECKE.policenErinnerung, body: { contains: appointmentId } }, select: { body: true } });
      const schon = arten.map((x) => (JSON.parse(x.body ?? "{}") as { art?: string }).art).filter((x): x is "tag" | "vortag" => x === "tag" || x === "vortag");
      const welche = faelligeErinnerung({ bitteAt: stand.policenBitteAt, terminAt: t.startsAt, gesendet: schon, now });
      // Erinnerung 2 (Vortag 18 Uhr) entfällt: dafür steht ein Satz in der Vortags-Terminerinnerung (A8 a, 19.11.2026)
      if (!welche || welche === "erinnerung2") continue;
      if (!(await strecke.policenErinnernErlaubt(b.conversationId, t.leadId, stand))) continue;
      const conv = await prisma.conversation.findUnique({ where: { id: b.conversationId }, select: { botActive: true, optedOutAt: true } });
      if (!conv?.botActive || conv.optedOutAt) continue;
      const r = (await sendeFlowNachrichtSicher(b.conversationId, welche, { now })).gesendet;
      if (!r) continue;
      await strecke.merke(b.conversationId, strecke.STRECKE.policenErinnerung, { appointmentId, art: welche === "erinnerung1" ? "tag" : "vortag", flow: true });
      gesendet++;
    } catch (err) {
      console.error("[policen flow erinnerung]", err instanceof Error ? err.message.slice(0, 160) : err);
    }
  }
  return { gesendet };
}

// ─── Flow und Vorlagen bei 360dialog anlegen (WhatsApp-Cron) ────────────────

const CHECK_OFFEN_MS = 30 * 60 * 1000;
const CHECK_RUHIG_MS = 6 * HOUR;
// Erinnerung 2 (Vortag) entfällt seit 19.11.2026 (Satz in der Vortags-Terminerinnerung), daher keine Vorlage mehr dafür.
// Kfz-Vorlagen (Ole, 22.11.2026) hinten angehängt: neue Namen, die bestehenden bleiben, nichts wird neu eingereicht.
export const VORLAGEN_ARTEN: readonly VorlagenArt[] = ["bitte", "erinnerung1", ...VORLAGEN_ARTEN_KFZ];
const FORMEN: Ansprache[] = ["sie", "du"];
/** Die Vorlagennamen (Bitte und Erinnerung 1, allgemein und Kfz, je Ansprache) zum Flow JSON und zum aktuellen Textstand. */
export const aktuelleVorlagenNamen = (jsonHash: string) => VORLAGEN_ARTEN.flatMap((art) => FORMEN.map((an) => vorlagenName(art, an, jsonHash)));

/** Vorlage mit Flow-Knopf und Quick Reply (Meta: erst die Nicht-Quick-Reply-Gruppe, dann die Quick Replies). */
export function vorlagenAntrag(art: VorlagenArt, an: Ansprache, o: { flowId: string; jsonHash: string }) {
  const t = vorlagenText(art, an);
  return {
    name: vorlagenName(art, an, o.jsonHash),
    category: "UTILITY" as const,
    language: TEMPLATE_LANGUAGE,
    components: [
      { type: "BODY", text: t.text, example: { body_text: [t.beispiele] } },
      ...(t.fusszeile ? [{ type: "FOOTER", text: t.fusszeile }] : []),
      {
        type: "BUTTONS",
        buttons: [
          { type: "FLOW", text: t.knopf1, flow_id: o.flowId, flow_action: "navigate", navigate_screen: SCREEN_FOTOS },
          { type: "QUICK_REPLY", text: t.knopf2 },
        ],
      },
    ],
  };
}

export type FlowSyncErgebnis = { customerId: string; status: string; vorlagen: VorlagenStand; fehler?: string };

/** Flow anlegen bzw. veröffentlichen und die Vorlagen einreichen bzw. ihren Status holen (ein Kunde). */
export async function syncPolicenFlowFuerKunde(customerId: string, now = new Date()): Promise<FlowSyncErgebnis> {
  const acc = await prisma.whatsAppAccount.findUnique({ where: { customerId }, select: { status: true, apiKeyEnc: true, metaBusinessStatus: true } });
  if (acc?.status !== "connected" || !acc.apiKeyEnc) return { customerId, status: "nicht_verbunden", vorlagen: {} };
  const apiKey = decryptSecret(acc.apiKeyEnc);
  const json = policenFlowJson();
  const eigene = pruefeFlowJson(json);
  if (eigene.length) throw new Error(`Flow JSON ungültig: ${eigene.join("; ")}`);
  const hash = flowJsonHash(json);
  const name = `policen_senden_${hash.slice(0, 8)}`;
  let rec = await prisma.policenFlow.upsert({ where: { customerId }, create: { customerId }, update: {} });
  const setze = (data: Parameters<typeof prisma.policenFlow.update>[0]["data"]) => prisma.policenFlow.update({ where: { customerId }, data });
  // Gestört (Senden scheiterte): nicht wieder einschalten, solange es derselbe Flow ist; neues Flow JSON = neuer Flow
  if (rec.status === STATUS_GESTOERT && rec.jsonHash === hash) {
    await setze({ checkedAt: now });
    return { customerId, status: STATUS_GESTOERT, vorlagen: {}, fehler: rec.fehler ?? undefined };
  }
  // Integritätssperre bei Meta (meta-sperre.ts): erst nach der Wartezeit (einmal täglich) oder sofort nach bestätigter
  // Unternehmensverifizierung wieder versuchen
  if (rec.status === STATUS_META_GESPERRT && !sperreVorbei(rec, acc.metaBusinessStatus, now)) {
    return { customerId, status: STATUS_META_GESPERRT, vorlagen: {}, fehler: rec.fehler ?? undefined };
  }
  // Veröffentlicht geführt: Status bei Meta nachprüfen (DEPRECATED, BLOCKED, THROTTLED … → nicht mehr senden).
  // Netzfehler ändern nichts.
  if (rec.status === "veroeffentlicht" && rec.jsonHash === hash && rec.flowId) {
    const r = await getFlow(apiKey, rec.flowId).catch(() => null);
    if (r?.status && r.status !== "PUBLISHED") {
      await setze({ status: "fehler", fehler: `Status bei Meta: ${r.status}`, checkedAt: now });
      reportError(new Error(`Policen-Flow nicht mehr veröffentlicht: ${r.status}`), "policen-flow-status", { customer: customerId });
      return { customerId, status: "fehler", vorlagen: {}, fehler: `Status bei Meta: ${r.status}` };
    }
  }

  if (rec.jsonHash !== hash || !rec.flowId || rec.status !== "veroeffentlicht") {
    try {
      let flowId = rec.jsonHash === hash ? rec.flowId : null;
      if (!flowId) flowId = (await listFlows(apiKey).catch(() => [])).find((f) => f.name === name)?.id ?? null;
      if (!flowId) {
        const neu = await createFlow(apiKey, { name, flowJson: flowJsonText(json), publish: true });
        flowId = neu.id;
        if (neu.validationErrors.length) throw new Error(`validation_errors: ${JSON.stringify(neu.validationErrors).slice(0, 300)}`);
      }
      let remote = await getFlow(apiKey, flowId);
      if (remote.status === "DRAFT") {
        const fehler = await uploadFlowJson(apiKey, flowId, flowJsonText(json));
        if (fehler.length) throw new Error(`validation_errors: ${JSON.stringify(fehler).slice(0, 300)}`);
        await publishFlow(apiKey, flowId);
        remote = await getFlow(apiKey, flowId);
      }
      const ok = remote.status === "PUBLISHED";
      rec = await setze({
        flowId,
        name,
        jsonHash: hash,
        status: ok ? "veroeffentlicht" : "entwurf",
        fehler: ok ? null : `Status bei Meta: ${remote.status || "unbekannt"}`,
        publishedAt: ok ? now : null,
        naechsterVersuchAt: null,
        // Neuer Flow: neue Vorlagen (der Name enthält den Hash)
        ...(rec.jsonHash !== hash ? { vorlagen: {} } : {}),
        checkedAt: now,
      });
    } catch (e) {
      // „Blocked by Integrity“ (Unternehmensverifizierung fehlt): einmal täglich neu, Sentry nur beim ersten Mal
      if (istIntegritaetsSperre(e)) {
        const grund = sperrGrund(acc.metaBusinessStatus);
        if (rec.status !== STATUS_META_GESPERRT) reportError(e, "policen-flow-meta-gesperrt", { customer: customerId, meta: acc.metaBusinessStatus ?? "unbekannt" });
        await setze({ status: STATUS_META_GESPERRT, fehler: grund, naechsterVersuchAt: new Date(now.getTime() + META_SPERRE_ABSTAND_MS), checkedAt: now });
        return { customerId, status: STATUS_META_GESPERRT, vorlagen: {}, fehler: grund };
      }
      const msg = e instanceof Error ? e.message.slice(0, 400) : "Fehler";
      await setze({ status: "fehler", fehler: msg, checkedAt: now, naechsterVersuchAt: null });
      reportError(e, "policen-flow-anlegen", { customer: customerId });
      return { customerId, status: "fehler", vorlagen: {}, fehler: msg };
    }
  }
  if (rec.status !== "veroeffentlicht" || !rec.flowId) return { customerId, status: rec.status, vorlagen: {} };

  // Vorlagen einreichen bzw. Status holen
  // Nur die Vorlagen des aktuellen Flow JSON und Textstands (alte Namen nach einer Textänderung fallen heraus, damit
  // syncPolicenFlows „fertig“ wieder an genau die aktuellen Vorlagen erkennt).
  const aktuelleNamen = new Set(aktuelleVorlagenNamen(hash));
  const stand: VorlagenStand = Object.fromEntries(Object.entries((rec.vorlagen as VorlagenStand | null) ?? {}).filter(([n]) => aktuelleNamen.has(n)));
  let remote: Awaited<ReturnType<typeof listTemplates>> = [];
  try {
    remote = await listTemplates(apiKey);
  } catch (e) {
    reportError(e, "policen-flow-vorlagen-liste", { customer: customerId });
  }
  for (const art of VORLAGEN_ARTEN) {
    for (const an of FORMEN) {
      const req = vorlagenAntrag(art, an, { flowId: rec.flowId, jsonHash: hash });
      const hit = remote.find((t) => t.name === req.name);
      if (hit) {
        stand[req.name] = { status: mapRemoteStatus(hit.status), category: hit.category?.toLowerCase() ?? null, grund: hit.rejectedReason };
        continue;
      }
      if (stand[req.name]) continue; // eingereicht, noch nicht in der Liste: nicht doppelt einreichen
      try {
        const t = await createTemplate(apiKey, req);
        stand[req.name] = { status: mapRemoteStatus(t.status), category: t.category?.toLowerCase() ?? "utility", grund: t.rejectedReason };
      } catch (e) {
        if (isNameInUseError(e)) stand[req.name] = { status: "pending", category: null, grund: null };
        else {
          stand[req.name] = { status: "fehler", category: null, grund: e instanceof Error ? e.message.slice(0, 200) : "Fehler" };
          reportError(e, "policen-flow-vorlage", { customer: customerId, name: req.name });
        }
      }
    }
  }
  await setze({ vorlagen: stand, checkedAt: now });
  return { customerId, status: "veroeffentlicht", vorlagen: stand };
}

/**
 * Im WhatsApp-Cron: nur mit POLICEN_FLOW=1. Verbundene Konten (ohne Support-Nummer, ruhende und Pay-per-Lead-Kunden,
 * nur POLICEN_FLOW_KUNDEN, falls gesetzt), höchstens `limit` je Lauf; offene Prüfungen alle 30 Min., sonst alle 6 Std.
 */
export async function syncPolicenFlows(now = new Date(), opts: { limit?: number } = {}): Promise<{ geprueft: number; fehler: number }> {
  if (!flowSchalterAn()) return { geprueft: 0, fehler: 0 };
  const accounts = await prisma.whatsAppAccount.findMany({
    where: { customerId: { not: SUPPORT_CUSTOMER_ID }, status: "connected", apiKeyEnc: { not: null }, customer: { dormantSince: null, NOT: NUR_PPL_WHERE } },
    select: { customerId: true, metaBusinessStatus: true },
    take: 500,
  });
  const recs = new Map((await prisma.policenFlow.findMany({ where: { customerId: { in: accounts.map((a) => a.customerId) } } })).map((r) => [r.customerId, r]));
  let geprueft = 0;
  let fehler = 0;
  const jsonHash = flowJsonHash();
  for (const { customerId, metaBusinessStatus } of accounts) {
    if (geprueft >= (opts.limit ?? 5)) break;
    if (!flowKundeErlaubt(customerId)) continue;
    const r = recs.get(customerId);
    // Fertig nur mit allen Vorlagen des aktuellen Textstands (nach einer Textänderung sofort neu einreichen, nicht erst
    // nach 6 Std.).
    const stand = (r?.vorlagen as VorlagenStand | null) ?? {};
    const fertig = r?.status === "veroeffentlicht" && r.jsonHash === jsonHash && aktuelleVorlagenNamen(jsonHash).every((n) => stand[n]?.status === "approved" || stand[n]?.status === "rejected");
    const abstand = fertig ? CHECK_RUHIG_MS : CHECK_OFFEN_MS;
    // Meta-Sperre: nur nach der Wartezeit bzw. sofort nach bestätigter Verifizierung (nicht alle 30 Min.)
    if (r?.status === STATUS_META_GESPERRT) {
      if (!sperreVorbei(r, metaBusinessStatus, now)) continue;
    } else if (r?.checkedAt && now.getTime() - r.checkedAt.getTime() < abstand) continue;
    geprueft++;
    const e = await syncPolicenFlowFuerKunde(customerId, now).catch((err) => {
      reportError(err, "policen-flow-sync", { customer: customerId });
      return null;
    });
    if (!e || e.status === "fehler") fehler++;
  }
  return { geprueft, fehler };
}

/**
 * Diagnose (q=policen-flow): Schalter, Einstieg des aktuellen Flow JSON, je Kunde Status, ob der Hash aktuell ist, Fehler
 * und Vorlagen je Status; meta = true fragt den Status bei Meta live ab (nur lesend, GET).
 */
export async function policenFlowDiagnose(o: { meta: boolean }) {
  const hash = flowJsonHash();
  const rows = await prisma.policenFlow.findMany({ orderBy: { updatedAt: "desc" }, take: 100 });
  const kunden = await Promise.all(
    rows.map(async (r) => {
      const vorlagen: Record<string, number> = {};
      for (const v of Object.values((r.vorlagen as VorlagenStand | null) ?? {})) vorlagen[v.status] = (vorlagen[v.status] ?? 0) + 1;
      let meta: unknown = undefined;
      if (o.meta && r.flowId) {
        const acc = await prisma.whatsAppAccount.findUnique({ where: { customerId: r.customerId }, select: { apiKeyEnc: true } });
        meta = acc?.apiKeyEnc
          ? await getFlow(decryptSecret(acc.apiKeyEnc), r.flowId)
              .then((f) => ({ status: f.status, fehler: f.validationErrors.length }))
              .catch((e: unknown) => ({ fehler: e instanceof Error ? e.message.slice(0, 200) : "Fehler" }))
          : { fehler: "kein Schlüssel" };
      }
      const acc = await prisma.whatsAppAccount.findUnique({ where: { customerId: r.customerId }, select: { metaBusinessStatus: true, metaBusinessCheckedAt: true } });
      return {
        kundeId: r.customerId,
        status: r.status,
        flowId: r.flowId,
        hashAktuell: r.jsonHash === hash,
        fehler: r.fehler,
        naechsterVersuchAt: r.naechsterVersuchAt,
        fbAccountStatus: acc?.metaBusinessStatus ?? null,
        fbAccountStatusAm: acc?.metaBusinessCheckedAt ?? null,
        vorlagen,
        checkedAt: r.checkedAt,
        publishedAt: r.publishedAt,
        ...(o.meta ? { meta } : {}),
      };
    }),
  );
  return { schalter: flowSchalterAn(), pilotKunden: (process.env.POLICEN_FLOW_KUNDEN ?? "").trim() || null, einstieg: einstiegsBildschirme(), gesendeterScreen: SCREEN_FOTOS, hash: hash.slice(0, 12), kunden };
}
