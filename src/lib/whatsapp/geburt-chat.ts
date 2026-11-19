// Geburtsdatum, das der Assistent festhält (record_qualification, angaben.geburt), auf Plausibilität prüfen (Ole,
// 19.11.2026; Live-Test: das Geburtsdatum der Katze wurde als das des Leads übernommen). Rein, ohne Datenbank.
//   - 18 bis 100 Jahre: übernehmen (als TT.MM.JJJJ)
//   - unter 18 bei einem Tier-Lead: als Datum des Tieres notieren, einmal nach dem eigenen fragen
//   - unter 18 ohne Tier: nicht speichern, einmal fragen, ob es das eigene ist; erst wenn der Lead das bestätigt (der
//     Assistent hält dasselbe Datum noch einmal fest), gilt der Lead als minderjährig (lib/policen/regeln.ts
//     minderjaehrigLautChat: dann der bestehende Ablauf für Minderjährige)
//   - Zukunft oder über 100: nicht speichern, einmal neu fragen
//   - kein Datum erkennbar (z. B. „36272“): nicht speichern, einmal mit Beispiel neu fragen
//   - zweite unpassende Antwort: „offen (Angabe: …)“, nicht weiter nachfragen; „weiß nicht“ wie bisher
// Die Fragen formuliert der Assistent wörtlich nach dem Hinweis im Werkzeug-Ergebnis.

import { a, type Ansprache } from "@/lib/ansprache";
import { geburtsdatumPruefen } from "@/lib/datum-antwort";
import { tierErgaenzen } from "@/lib/whatsapp/tier-fragen";

/** Kennung der internen Merker (Message.kind) für bereits gestellte Nachfragen. */
export const GEBURT_MERKER = "geburt_pruefung";

export type GeburtMerker = { art: "unplausibel" | "unlesbar" | "minderjaehrig" | "tier"; datum: string };

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
  const p = geburtsdatumPruefen(o.wert, o.jetzt ?? new Date());
  if (p.art === "unbekannt") return { geburt: o.wert, hinweis: null, merker: null };
  if (p.art === "ok") return { geburt: p.datum, hinweis: null, merker: null };
  const gefragt = (art: GeburtMerker["art"]) => o.schon.some((m) => m.art === art);
  // Kein Datum erkennbar, z. B. „36272“ (Ole, 19.11.2026: wurde als Geburtsdatum notiert): nicht speichern, einmal mit
  // Beispiel neu fragen; passt die zweite Antwort wieder nicht, als offen notieren und weitermachen
  if (p.art === "unlesbar") {
    const angabe = o.wert.replace(/\s+/g, " ").trim().slice(0, 40);
    if (gefragt("unlesbar") || gefragt("unplausibel")) {
      return { geburt: `offen (Angabe: ${angabe})`, hinweis: "Notiert als offen. Frag nicht weiter nach dem Geburtsdatum, das klärt der Berater im Termin.", merker: null };
    }
    const frage = a(o.an, "Das habe ich nicht als Datum erkannt. Wie lautet dein Geburtsdatum, zum Beispiel 14.05.1985?", "Das habe ich nicht als Datum erkannt. Wie lautet Ihr Geburtsdatum, zum Beispiel 14.05.1985?");
    return {
      geburt: null,
      hinweis: `Nicht gespeichert: „${angabe}“ ist kein erkennbares Datum. Frag genau einmal freundlich neu, wörtlich: „${frage}“ Passt die nächste Antwort wieder nicht oder weiß der Lead es nicht, halte sie fest und mach weiter.`,
      merker: { art: "unlesbar", datum: angabe },
    };
  }
  const offen = { geburt: `offen (Angabe: ${p.datum})`, hinweis: "Notiert als offen. Frag nicht weiter nach dem Geburtsdatum, das klärt der Berater im Termin.", merker: null };

  if (p.art === "unplausibel") {
    if (gefragt("unplausibel")) return offen;
    const frage = a(o.an, "Das Datum scheint nicht zu passen. Wie lautet dein Geburtsdatum, zum Beispiel 14.05.1985?", "Das Datum scheint nicht zu passen. Wie lautet Ihr Geburtsdatum, zum Beispiel 14.05.1985?");
    return {
      geburt: null,
      hinweis: `Nicht gespeichert: Das Geburtsdatum ${p.datum} liegt in der Zukunft oder ergibt über 100 Jahre. Frag genau einmal freundlich neu, wörtlich: „${frage}“ Passt die nächste Antwort wieder nicht oder weiß der Lead es nicht, halte sie fest und mach weiter.`,
      merker: { art: "unplausibel", datum: p.datum },
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
  };
}
