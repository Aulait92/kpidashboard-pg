// Verlustgründe in den Zahlen (Ole, 15.11.2026): Warum gehen Leads verloren? Verteilung nach Grund (Lead.lostReason,
// lib/lead-lost.ts), Vergleich mit dem Vorzeitraum und dem anonymen Schnitt aller Kunden, Tipps je auffälligem Grund.
// Für /buyer/zahlen, den Monatsbericht und den Admin. Rein (getestet); Daten lädt lib/verlustgruende-server.ts.
// Vermittler-Oberfläche: Sie-Form, keine Gedankenstriche, keine Versprechen.

import { CALL_ATTEMPTS_TARGET, LOST_REASONS, lostReasonOf, type LostReasonKey } from "@/lib/lead-lost";

export type VerlustZeile = {
  status: string | null;
  lostReason?: string | null;
  disqualifyReason?: string | null;
  reached: boolean;
  callAttempts: number;
  lostEarly?: boolean;
};

/** Grund oder „ohne“ (alte Leads ohne erfassten Grund). */
export type VerlustKey = LostReasonKey | "ohne";

export const VERLUST_LABEL: Record<VerlustKey, string> = {
  ...(Object.fromEntries(LOST_REASONS.map((r) => [r.key, r.label])) as Record<LostReasonKey, string>),
  nicht_erreichbar: "Nicht erreicht",
  ohne: "Ohne Grund",
};

export type VerlustGrund = { key: VerlustKey; label: string; count: number; share: number };

export type VerlustVerteilung = {
  total: number;
  /** Nach Anzahl absteigend, nur Gründe mit Leads. */
  gruende: VerlustGrund[];
  /** Nie erreicht und mit weniger als 6 Anrufversuchen aufgegeben (ohne falsche Daten und „nichts angefragt“). */
  unterVersuchen: number;
};

const NIE_ERREICHT_OHNE_WARNUNG = new Set<string>(["falsche_daten", "nicht_angefragt", "nicht_erreichbar"]);

export function verlustKey(r: VerlustZeile): VerlustKey {
  return lostReasonOf(r) ?? "ohne";
}

/** Verteilung der Verlustgründe. */
export function verlustVerteilung(rows: VerlustZeile[]): VerlustVerteilung {
  const counts = new Map<VerlustKey, number>();
  let unterVersuchen = 0;
  for (const r of rows) {
    const k = verlustKey(r);
    counts.set(k, (counts.get(k) ?? 0) + 1);
    if (r.lostEarly || (!r.reached && r.callAttempts < CALL_ATTEMPTS_TARGET && !NIE_ERREICHT_OHNE_WARNUNG.has(k))) unterVersuchen++;
  }
  const total = rows.length;
  const gruende = [...counts.entries()]
    .map(([key, count]) => ({ key, label: VERLUST_LABEL[key], count, share: total ? count / total : 0 }))
    .sort((a, b) => b.count - a.count || (a.key === "ohne" ? 1 : b.key === "ohne" ? -1 : 0));
  return { total, gruende, unterVersuchen };
}

/** Mindestens so viele Kunden mit genug Verlusten, sonst kein Schnitt (Anonymität, Aussagekraft). */
export const SCHNITT_MIN_KUNDEN = 5;
/** Kunde zählt für den Schnitt erst ab so vielen verlorenen Leads. */
export const SCHNITT_MIN_VERLUSTE = 5;

/**
 * Anonymer Schnitt aller Kunden: je Grund der mittlere Anteil (jeder Kunde zählt gleich), nur Gründe mit erfasstem
 * Grund. null bei zu wenigen Kunden.
 */
export function schnittAllerKunden(byCustomer: Map<string, VerlustZeile[]>): Partial<Record<VerlustKey, number>> | null {
  const verteilungen = [...byCustomer.values()].filter((rows) => rows.length >= SCHNITT_MIN_VERLUSTE).map(verlustVerteilung);
  if (verteilungen.length < SCHNITT_MIN_KUNDEN) return null;
  const out: Partial<Record<VerlustKey, number>> = {};
  for (const key of Object.keys(VERLUST_LABEL) as VerlustKey[]) {
    const sum = verteilungen.reduce((s, v) => s + (v.gruende.find((g) => g.key === key)?.share ?? 0), 0);
    out[key] = sum / verteilungen.length;
  }
  return out;
}

export type VerlustVergleichZeile = VerlustGrund & {
  /** Anteil im Vorzeitraum (null ohne Verluste dort). */
  prevShare: number | null;
  /** Anteil im Schnitt aller Kunden (null ohne genug Daten). */
  avgShare: number | null;
};

export function verlustVergleich(cur: VerlustVerteilung, prev: VerlustVerteilung | null, avg: Partial<Record<VerlustKey, number>> | null): VerlustVergleichZeile[] {
  return cur.gruende.map((g) => ({
    ...g,
    prevShare: prev && prev.total > 0 ? (prev.gruende.find((p) => p.key === g.key)?.share ?? 0) : null,
    avgShare: avg && g.key !== "ohne" ? (avg[g.key] ?? 0) : null,
  }));
}

export type VerlustTipp = { key: string; title: string; text: string; href: string; cta: string };

/** Tipps je Grund (nur Gründe, an denen der Vermittler etwas ändern kann). */
const TIPPS: Partial<Record<VerlustKey, Omit<VerlustTipp, "key">>> = {
  nicht_erreichbar: {
    title: "Früher und öfter anrufen",
    text: "Rufen Sie neue Leads in den ersten Minuten an und versuchen Sie es bis zu 6 Mal zu verschiedenen Tageszeiten. Dazwischen hilft eine kurze WhatsApp.",
    href: "/buyer",
    cta: "Zur Anrufliste",
  },
  schon_versichert: {
    title: "Schneller reagieren",
    text: "Viele Leads haben schon woanders abgeschlossen. Wer in den ersten 5 Minuten anruft, ist oft der Erste. Neue Leads stehen sofort oben auf „Heute“.",
    href: "/buyer",
    cta: "Zu Heute",
  },
  passt_nicht: {
    title: "Tarifstufen und Bausteine zeigen",
    text: "Zeigen Sie im Termin mehrere Tarifstufen und lassen Sie Bausteine weg, die der Kunde nicht braucht. So findet er einen Beitrag, der zu ihm passt.",
    href: "/buyer/kalender",
    cta: "Zu den Terminen",
  },
};

/** Zusatz-Tipp: zu früh aufgegeben (nie erreicht, unter 6 Anrufversuchen). */
const TIPP_ZU_FRUEH: Omit<VerlustTipp, "key"> = {
  title: "Nicht zu früh aufgeben",
  text: "Viele Leads erreicht man erst beim 4. bis 6. Anruf. Der Anrufplan auf „Heute“ sagt Ihnen, wann der nächste Versuch dran ist.",
  href: "/buyer",
  cta: "Zur Anrufliste",
};

/** Anteil, ab dem ein Grund auffällt, und Mindestanzahl. */
const AUFFAELLIG_AB = 0.2;
const AUFFAELLIG_MIN = 3;
/** Abstand zum Schnitt bzw. Vorzeitraum (Prozentpunkte), ab dem ein Grund auffällt. */
const ABSTAND = 0.05;

/** Fällt der Grund auf (häufig und über Schnitt bzw. gestiegen)? */
export function auffaellig(z: VerlustVergleichZeile): boolean {
  if (z.key === "ohne" || z.count < AUFFAELLIG_MIN || z.share < AUFFAELLIG_AB) return false;
  if (z.avgShare != null) return z.share >= z.avgShare + ABSTAND || (z.prevShare != null && z.share >= z.prevShare + 2 * ABSTAND);
  return true;
}

/** Höchstens `max` Tipps für auffällige Gründe (häufigste zuerst), plus „nicht zu früh aufgeben“, wenn es oft passiert. */
export function verlustTipps(zeilen: VerlustVergleichZeile[], v: Pick<VerlustVerteilung, "total" | "unterVersuchen">, max = 2): VerlustTipp[] {
  const out: VerlustTipp[] = [];
  for (const z of zeilen) {
    const t = TIPPS[z.key];
    if (t && auffaellig(z)) out.push({ key: `verlust_${z.key}`, ...t });
  }
  if (v.unterVersuchen >= AUFFAELLIG_MIN && v.total > 0 && v.unterVersuchen / v.total >= AUFFAELLIG_AB) out.push({ key: "verlust_zu_frueh", ...TIPP_ZU_FRUEH });
  return out.slice(0, max);
}

/** Tipp zu einem Grund (für den Monatsbericht: die zwei häufigsten Gründe mit Tipp), null ohne passenden Tipp. */
export function tippFuer(key: VerlustKey): VerlustTipp | null {
  const t = TIPPS[key];
  return t ? { key: `verlust_${key}`, ...t } : null;
}

/**
 * Hinweis für den Admin (Anzeigen bzw. Lead-Qualität): viele Leads ohne Bedarf, mit falschen Daten oder ohne Anfrage.
 * Diese Gründe liegen eher an der Kampagne als am Vermittler.
 */
export const KAMPAGNEN_GRUENDE: VerlustKey[] = ["kein_interesse", "falsche_daten", "nicht_angefragt"];
export function kampagnenHinweis(v: VerlustVerteilung): { anteil: number; anzahl: number } | null {
  const anzahl = v.gruende.filter((g) => KAMPAGNEN_GRUENDE.includes(g.key)).reduce((s, g) => s + g.count, 0);
  const anteil = v.total ? anzahl / v.total : 0;
  return v.total >= 10 && anteil >= 0.4 ? { anteil, anzahl } : null;
}

/** „40 %“ */
export const prozent = (n: number) => `${Math.round(n * 100)} %`;

/** Abweichung in Prozentpunkten als Text, z. B. „+8 Punkte“; null ohne Vergleich. */
export function punkte(cur: number, ref: number | null): string | null {
  if (ref == null) return null;
  const d = Math.round((cur - ref) * 100);
  if (d === 0) return "gleich";
  return `${d > 0 ? "+" : "−"}${Math.abs(d)} ${Math.abs(d) === 1 ? "Punkt" : "Punkte"}`;
}
