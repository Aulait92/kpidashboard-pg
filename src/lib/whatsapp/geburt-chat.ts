// Geburtsdatum, das der Assistent festhält (record_qualification, angaben.geburt), auf Plausibilität prüfen (Ole,
// 19.11.2026; Live-Test: das Geburtsdatum der Katze wurde als das des Leads übernommen). Rein, ohne Datenbank.
//   - 18 bis 100 Jahre: übernehmen (als TT.MM.JJJJ)
//   - unter 18 bei einem Tier-Lead: als Datum des Tieres notieren, einmal nach dem eigenen fragen
//   - unter 18 ohne Tier: nicht speichern, einmal fragen, ob es das eigene ist; erst wenn der Lead das bestätigt (der
//     Assistent hält dasselbe Datum noch einmal fest), gilt der Lead als minderjährig (lib/policen/regeln.ts
//     minderjaehrigLautChat: dann der bestehende Ablauf für Minderjährige)
//   - Zukunft oder über 110: nicht speichern, einmal neu fragen
//   - kein Datum erkennbar (z. B. „36272“): nicht speichern, einmal mit Beispiel neu fragen; bei eindeutigem Tippfehler
//     („220.8.92“) mit Vorschlag und Knöpfen (Ole, 21.11.2026, lib/whatsapp/datum-nachfrage.ts)
//   - zweite unpassende Antwort: wörtlich mit „(bitte im Termin prüfen)“, nicht weiter nachfragen; „weiß nicht“ wie bisher
// Die Fragen formuliert der Assistent wörtlich nach dem Hinweis im Werkzeug-Ergebnis.

import { a, type Ansprache } from "@/lib/ansprache";
import { datumVorschlaege, GEBURT_MAX_ALTER, geburtsdatumPruefen } from "@/lib/datum-antwort";
import { DATUM_VERMERK, nachfrageText, vorschlagKnoepfe, vorschlagText } from "@/lib/whatsapp/datum-nachfrage";
import type { Knopf } from "@/lib/whatsapp/gespraech";
import { tierErgaenzen } from "@/lib/whatsapp/tier-fragen";

/** Kennung der internen Merker (Message.kind) für bereits gestellte Nachfragen. */
export const GEBURT_MERKER = "geburt_pruefung";

/** vorschlaege: bei einem Tippfehler vorgeschlagene Daten (TT.MM.JJJJ), Ole 21.11.2026 */
export type GeburtMerker = { art: "unplausibel" | "unlesbar" | "minderjaehrig" | "tier"; datum: string; vorschlaege?: string[] };

/** Zusatz am gespeicherten Datum, wenn der Lead bestätigt hat, dass es sein eigenes ist (unter 18). */
export const BESTAETIGT = "eigenes, bestätigt";

export type GeburtErgebnis = {
  /** neuer Wert für angaben.geburt; null = nicht speichern (Feld aus der Meldung entfernen) */
  geburt: string | null;
  /** neuer Wert für angaben.tier (Datum unter 18 bei Tier-Leads) */
  tier?: string;
  /** Hinweis an den Assistenten (Werkzeug-Ergebnis); null = nichts zu tun */
  hinweis: string | null;
  /** zu merkende Nachfrage */
  merker: GeburtMerker | null;
  /**
   * Rückfrage, die die App wörtlich sendet (statt freier Worte des Assistenten; Ole, 19.11.2026: nach einer
   * Quatsch-Eingabe kam „Vielen Dank, das notiere ich …“ und dann doch die Frage)
   */
  frage?: string;
  /** Knöpfe zur Rückfrage (Vorschlag bei Tippfehler: [Ja, genau] [Anderes Datum] bzw. beide Daten) */
  buttons?: Knopf[];
  /** als offen notiert: im Chat nicht weiter nach dem Geburtsdatum fragen */
  offen?: true;
};

export function geburtImChat(o: {
  wert: string;
  tierLead: boolean;
  tierBisher?: string | null;
  tierName?: string | null;
  an: Ansprache;
  person: string;
  /** frühere Merker dieses Chats */
  schon: readonly GeburtMerker[];
  jetzt?: Date;
}): GeburtErgebnis {
  const jetzt = o.jetzt ?? new Date();
  const angabe = o.wert.replace(/\s+/g, " ").trim().slice(0, 40);
  // „Ja, genau“ auf unseren Vorschlag nach einem Tippfehler (Ole, 21.11.2026): der vorgeschlagene Tag gilt
  const vorschlag = o.schon.filter((m) => m.vorschlaege?.length === 1).at(-1)?.vorschlaege?.[0];
  if (vorschlag && !/\d/.test(angabe) && /^(ja|jap|jo|yes|genau|richtig|stimmt|korrekt)\b/i.test(angabe)) return { geburt: vorschlag, hinweis: null, merker: null };
  const p = geburtsdatumPruefen(o.wert, jetzt);
  if (p.art === "unbekannt") return { geburt: o.wert, hinweis: null, merker: null };
  if (p.art === "ok") return { geburt: p.datum, hinweis: null, merker: null };
  const gefragt = (art: GeburtMerker["art"]) => o.schon.some((m) => m.art === art);
  // Zweite unklare Antwort (Ole, 21.11.2026): wörtlich mit Vermerk übernehmen und weitermachen
  const vermerk: GeburtErgebnis = {
    geburt: `${angabe} ${DATUM_VERMERK}`,
    hinweis: "Notiert mit Vermerk zur Prüfung. Frag nicht weiter nach dem Geburtsdatum, das klärt der Berater im Termin.",
    merker: null,
    offen: true,
  };
  // Kein Datum erkennbar, z. B. „36272“ (Ole, 19.11.2026: wurde als Geburtsdatum notiert) bzw. Tippfehler wie
  // „220.8.92“ (Ole, 21.11.2026): nicht speichern, einmal nachfragen, bei eindeutigem Tippfehler mit Vorschlag und Knöpfen
  if (p.art === "unlesbar") {
    if (gefragt("unlesbar") || gefragt("unplausibel")) return vermerk;
    const v = datumVorschlaege(o.wert, "geburt", jetzt);
    const frage = v.length ? vorschlagText(o.an, v) : nachfrageText("geburt", "unlesbar", jetzt);
    return {
      geburt: null,
      hinweis: `Nicht gespeichert: „${angabe}“ ist kein gültiges Datum. Frag genau einmal freundlich neu, wörtlich: „${frage}“ Bestätigt der Lead einen Vorschlag, halte dieses Datum fest. Passt die nächste Antwort wieder nicht oder weiß der Lead es nicht, halte sie fest und mach weiter.`,
      merker: { art: "unlesbar", datum: angabe, ...(v.length ? { vorschlaege: v } : {}) },
      frage,
      ...(v.length ? { buttons: vorschlagKnoepfe("geburt", v) } : {}),
    };
  }
  const offen: GeburtErgebnis = { geburt: `offen (Angabe: ${p.datum})`, hinweis: "Notiert als offen. Frag nicht weiter nach dem Geburtsdatum, das klärt der Berater im Termin.", merker: null, offen: true };

  if (p.art === "unplausibel") {
    if (gefragt("unplausibel") || gefragt("unlesbar")) return vermerk;
    const frage = nachfrageText("geburt", "unplausibel", jetzt);
    return {
      geburt: null,
      hinweis: `Nicht gespeichert: Das Geburtsdatum ${p.datum} liegt in der Zukunft oder ergibt über ${GEBURT_MAX_ALTER} Jahre. Frag genau einmal freundlich neu, wörtlich: „${frage}“ Passt die nächste Antwort wieder nicht oder weiß der Lead es nicht, halte sie fest und mach weiter.`,
      merker: { art: "unplausibel", datum: p.datum },
      frage,
    };
  }

  // unter 18
  if (o.tierLead) {
    if (gefragt("tier")) return offen;
    const von = o.tierName ? `von ${o.tierName}` : a(o.an, "deines Tieres", "Ihres Tieres");
    const frage = a(
      o.an,
      `Danke, das ist sicher das Geburtsdatum ${von}, das habe ich notiert. Für den Vertrag braucht ${o.person} noch dein eigenes Geburtsdatum.`,
      `Danke, das ist sicher das Geburtsdatum ${von}, das habe ich notiert. Für den Vertrag braucht ${o.person} noch Ihr eigenes Geburtsdatum.`,
    );
    return {
      geburt: null,
      tier: tierErgaenzen(o.tierBisher, "Geboren", p.datum),
      hinweis: `Nicht als Geburtsdatum des Leads gespeichert: ${p.datum} ergibt unter 18 Jahre, das ist sicher das Datum des Tieres (unter angaben.tier notiert). Schreib wörtlich: „${frage}“`,
      merker: { art: "tier", datum: p.datum },
      frage,
    };
  }
  if (o.schon.some((m) => m.art === "minderjaehrig" && m.datum === p.datum)) {
    return { geburt: `${p.datum} (${BESTAETIGT})`, hinweis: "Notiert: Der Lead hat bestätigt, dass es sein eigenes Geburtsdatum ist. Mach ohne weitere Fragen dazu weiter.", merker: null };
  }
  if (gefragt("minderjaehrig")) return offen;
  const frage = a(
    o.an,
    "Ist das dein eigenes Geburtsdatum? Dann bräuchten wir für das Angebot einen Erziehungsberechtigten.",
    "Ist das Ihr eigenes Geburtsdatum? Dann bräuchten wir für das Angebot einen Erziehungsberechtigten.",
  );
  return {
    geburt: null,
    hinweis: `Nicht gespeichert: ${p.datum} ergibt unter 18 Jahre. Frag genau einmal, wörtlich: „${frage}“ Bestätigt der Lead, halte dasselbe Datum noch einmal mit record_qualification fest (angaben.geburt). Nennt er ein anderes Datum, halte das fest.`,
    merker: { art: "minderjaehrig", datum: p.datum },
      frage,
  };
}

/**
 * Geburtsdatum als offen notiert: Sätze, die erneut nach dem Geburtsdatum fragen, aus der Antwort des Assistenten
 * entfernen. Bleibt nichts übrig, eine kurze Bestätigung.
 */
export function ohneGeburtsFrage(text: string, an: Ansprache): string {
  // Satzende: . ! ? vor Leerzeichen (nicht in „01.01.1980“ oder „TT.MM.JJJJ“)
  const saetze = text.split(/(?<=[.!?])\s+/).map((x) => `${x} `);
  const rest = saetze
    .filter((x) => !(/geburtsdatum|geboren/i.test(x) && /\?\s*$/.test(x)))
    .join("")
    .trim();
  return rest || a(an, "Danke, das klären wir dann im Termin.", "Danke, das klären wir dann im Termin.");
}
