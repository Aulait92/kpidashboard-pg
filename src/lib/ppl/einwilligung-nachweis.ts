// Einwilligungsnachweis je Pay-per-Lead (Auflage L3, docs/recht/pkv-funnel.md; § 7a UWG, Art. 7 Abs. 1 DSGVO):
// Wortlaut so wie angezeigt (mit eingesetzter Adresse), Fassung, Zeitpunkt, Kanäle, Knopftext und Funnel. Gespeichert am
// PoolLead (consentData), bei der Lieferung an den Lead (Lead.consentData) übernommen und an den Abnehmer mit
// ausgeliefert (Lead-PDF, Mails, Webhook) statt des Texts am Bezug (LeadSubscription.consentText).
// Aufbewahrung des Nachweises 5 Jahre ab jeder Verwendung (§ 7a Abs. 2 UWG). Rein, ohne Datenbank.

import type { ConsentNachweis } from "@/lib/einwilligung-leadformular";

export type PoolEinwilligung = {
  /** Zeitpunkt des Absendens (ISO) */
  at: string;
  /** Funnel-Schlüssel, z. B. „pkv-beitrag“ */
  funnel: string;
  /** Fassung des Texts (z. B. EINWILLIGUNG_VERSION) */
  version: string;
  /** Wortlaut wie angezeigt */
  text: string;
  /** Kanäle laut Text, z. B. ["Telefon", "E-Mail", "WhatsApp"] */
  kanaele: string[];
  /** Beschriftung des Knopfs, mit dem eingewilligt wurde */
  knopf: string;
};

const s = (v: unknown, max = 4000) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Gespeicherten Nachweis lesen (PoolLead.consentData); unvollständig = null. */
export function poolEinwilligung(raw: unknown): PoolEinwilligung | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const at = s(r.at, 40);
  const text = s(r.text);
  if (!at || !text || Number.isNaN(Date.parse(at))) return null;
  const kanaele = Array.isArray(r.kanaele) ? r.kanaele.filter((k): k is string => typeof k === "string" && !!k.trim()).slice(0, 10) : [];
  return { at, funnel: s(r.funnel, 60) ?? "", version: s(r.version, 60) ?? "", text, kanaele, knopf: s(r.knopf, 120) ?? "" };
}

/** Nachweis am Lead (Lead.consentData, gleiche Form wie aus dem Meta-Leadformular plus Funnel-Angaben). */
export function leadNachweisAus(e: PoolEinwilligung): ConsentNachweis & { funnel: string; kanaele: string[]; knopf: string } {
  return { at: e.at, formId: null, textVersion: e.version || null, text: e.text, responses: [], funnel: e.funnel, kanaele: e.kanaele, knopf: e.knopf };
}

/** Eine Zeile für Mails, Webhook-Nachricht und Slack: Fassung, Kanäle, Knopf. */
export function einwilligungKurz(e: PoolEinwilligung): string {
  return [e.version && `Fassung ${e.version}`, e.kanaele.length && `Kanäle: ${e.kanaele.join(", ")}`, e.knopf && `Knopf „${e.knopf}“`, e.funnel && `Funnel ${e.funnel}`].filter(Boolean).join(" · ");
}
