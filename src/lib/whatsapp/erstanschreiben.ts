// Erstanschreiben je Produkt (Ole, 15.11.2026): keine Erlaubnisfrage, kein „Später“, sondern direkt eine erste,
// leichte Frage mit Knöpfen. Welche Vorlage ein Lead bekommt, ergibt sich aus dem Produkt im Leadformular
// (Lead.source). Der Assistent (bot.ts) nimmt die Antwort per Knopf als Antwort auf Frage 1 und stellt dann Frage 2,
// danach bietet er Termine an. Rein, ohne Datenbank.
//
// Neu aufgebaut (Ole, 16.11.2026, conversion-optimiert): genau EINE Begrüßung, Dank mit Produkt, ein Satz Nutzen mit
// der KI-Kennzeichnung („digitaler KI-Assistent“, KI-VO Art. 50), dann die erste Frage als letzte Zeile (ab v7 nicht fett).
// Kein „Mensch“-Angebot und kein „berate nicht zu Tarifen“ in der ersten Nachricht: beides regelt der Assistent im
// Gespräch (bot.ts). Vermittler ab v6 als Person (lib/vermittler-nennung.ts: Sie „Herrn Kannapinn“, Du Vorname).
// Die Erstinformation folgt direkt danach als PDF-Dokument (lib/whatsapp/erstinfo-pdf.ts).
//
// v6 (Ole, 17.11.2026, ERSTANSCHREIBEN_V6): eine Fassung für alle Produkte, die erste Frage ist ein Platzhalter, damit
// nichts gefragt wird, was das Formular schon beantwortet; beantwortet es alles, die Frage nach dem Videotermin. Der
// Vermittler steht als Person im Dativ („von Herrn Kannapinn“). Das „?“ und das Fett-Sternchen stehen fest hinter dem
// Platzhalter (Meta: kein Platzhalter am Ende), die Frage geht ohne „?“ in den Platzhalter (frageOhneFragezeichen).
//
// v7 (Ole, 17.11.2026): gleicher Text, die erste Frage aber NICHT mehr fett (ohne Sternchen), in Vorlage und Freitext.
// v6 bleibt bei Meta freigegeben und wird gesendet, bis v7 freigegeben ist (templates.ts rankOutreach).
//
// v8 (Ole, 17.11.2026, Testchat: v7 klappt in WhatsApp Desktop ein): kurz, das Thema fest je Produkt, die erste Frage
// wieder fett. „Hallo {{1}}, danke für Ihre Anfrage zum Privatschutz! Hier schreibt der digitale Assistent von {{2}}.
// \n\n*{{3}}?*“, Fußzeile fest „KI-Assistent · Oben: Erstinformation (gesetzlich)“ (templates.ts ERSTINFO_FOOTER_V8),
// Kopf weiter das PDF der Erstinformation. {{1}} Anrede („Frau Mustermann“, Anrede unsicher: Vor- und Nachname),
// {{2}} Vermittler im Dativ („Herrn Kannapinn“, Du: Vorname), {{3}} erste offene Frage ohne „?“. Privatschutz fragt
// zuerst nach bestehenden Verträgen, danach stellt die App genau eine Zwischenfrage (lib/whatsapp/zwischenfrage.ts).
// v7 bleibt Rückfall, bis v8 bei Meta freigegeben ist.
//
// v9 (Ole, 18.11.2026): noch kürzer, eine Zeile, ohne Vermittler: „Hallo {{1}}, danke für Ihre Anfrage zum Privatschutz!
// *{{2}}?*“; Tierkrankenversicherung emotional mit dem Tiernamen: „Hallo {{1}}, schön, dass Sie {{2}} gut absichern
// möchten 🐾 *{{3}}?*“. KI-Kennzeichnung in der Fußzeile (ERSTINFO_FOOTER_V9). v8 bleibt Rückfall (PLATZHALTER_AB).
//
// v10 (Ole, 19.11.2026, sofort Standard, kein A/B-Test für v10): Antwort per Tipp statt Tippen. Je Zweck eine FESTE,
// fette Frage mit bis zu drei Antwortknöpfen in der Vorlage, höchstens ca. 90 Zeichen nach „Hallo {{1}}, “, keine
// Leerzeile, kein „Mehr lesen“. PDF der Erstinformation bleibt im Kopf (Pflicht), Fußzeile nur „KI-Assistent“ (Recht
// 19.11.2026: der Hinweis auf die Erstinformation in der Fußzeile entfällt, die KI-Kennzeichnung bleibt). Platzhalter:
// nur {{1}} Anrede, TKV zusätzlich {{2}} Tier (tierFuerErstanschreiben). Ist genau diese Frage laut Formular schon
// beantwortet (v10Moeglich), bekommt der Lead weiter v9 mit der Platzhalter-Frage. Bis v10 beim Kunden von Meta
// freigegeben ist, sendet die App die neueste freigegebene Fassung (v9, v8 …) mit deren Platzhaltern (outreach.ts).
// v11 = Fassung b für den A/B-Test gegen v10 (TEMPLATE_BODY_B, Name pg_<zweck>_v10_b_…): „Frage zuerst“, die Frage
// steht direkt hinter der Anrede, damit sie in Benachrichtigung und Chatliste sichtbar ist; gleiche Platzhalter und Knöpfe.

import { displayProduct } from "@/lib/products";
import { a, anredeName, type AnredeKontakt, type Ansprache } from "@/lib/ansprache";
import type { NoticePurpose } from "@/lib/whatsapp/templates";

/**
 * Erstanschreiben v6 (Ole, 17.11.2026), zentral zum Feilen: Text nach „Hallo {{1}}, “ (ohne Namen „Hallo, “, dann
 * rücken die Platzhalter auf). {{2}} Thema, {{3}} Vermittler im Dativ, {{4}} erste offene Frage ohne „?“.
 * Gleicher Aufbau im Freitext (erstanschreibenText). Neuer Text = neue Version (PURPOSE_VERSION in templates.ts).
 */
export const ERSTANSCHREIBEN_V6 = {
  sie: "danke für Ihre Anfrage zum Thema {{2}}! Ich bin der digitale KI-Assistent von {{3}}.\n\n*{{4}}?*",
  du: "danke für deine Anfrage zum Thema {{2}}! Ich bin der digitale KI-Assistent von {{3}}.\n\n*{{4}}?*",
} as const;

/** Erstanschreiben v7 (Ole, 17.11.2026): wie v6, die erste Frage ohne Sternchen (nicht fett). Aktueller Text. */
export const ERSTANSCHREIBEN_V7 = {
  sie: "danke für Ihre Anfrage zum Thema {{2}}! Ich bin der digitale KI-Assistent von {{3}}.\n\n{{4}}?",
  du: "danke für deine Anfrage zum Thema {{2}}! Ich bin der digitale KI-Assistent von {{3}}.\n\n{{4}}?",
} as const;

/**
 * Thema je Erstanschreiben ab v8, fest im Vorlagentext (Ole, 17.11.2026): „danke für Ihre Anfrage zum Privatschutz!“.
 * Allgemeine Fassung ohne Thema („danke für Ihre Anfrage!“). Reine Hausrat-Leads (Ole, 18.11.2026): „zu Ihrer
 * Hausratversicherung“ bzw. „zu deiner Hausratversicherung“ (eigener Zweck outreach_hausrat, ERSTANSCHREIBEN_HAUSRAT).
 */
export const V8_THEMA: Record<"outreach" | "outreach_tkv" | "outreach_zahn" | "outreach_pkv" | "outreach_privatschutz", string> = {
  outreach: "",
  outreach_tkv: " zur Tierkrankenversicherung",
  outreach_zahn: " zur Zahnzusatzversicherung",
  outreach_pkv: " zur privaten Krankenversicherung",
  outreach_privatschutz: " zum Privatschutz",
};

/** Zwecke des Erstanschreibens ab v8 (je Produkt und für reine Hausrat-Leads). */
export type ErstanschreibenZweck = keyof typeof V8_THEMA | "outreach_hausrat";

/** Thema für reine Hausrat-Leads (Ole, 18.11.2026), je Ansprache. */
export const HAUSRAT_THEMA = { sie: " zu Ihrer Hausratversicherung", du: " zu deiner Hausratversicherung" } as const;

/** Thema des Erstanschreibens ab v8 je Zweck und Ansprache („ zum Privatschutz“, „ zu Ihrer Hausratversicherung“). */
export function v8Thema(purpose: ErstanschreibenZweck, an: Ansprache): string {
  return purpose === "outreach_hausrat" ? HAUSRAT_THEMA[an] : V8_THEMA[purpose];
}

/**
 * Erstanschreiben v8 (Ole, 17.11.2026), Text nach „Hallo {{1}}, “ (ohne Namen „Hallo, “, die Platzhalter rücken auf):
 * {{2}} Vermittler im Dativ, {{3}} erste offene Frage ohne „?“ (fett). Neuer Text = neue Version (PURPOSE_VERSION).
 */
export function erstanschreibenV8(purpose: ErstanschreibenZweck): { sie: string; du: string } {
  return {
    sie: `danke für Ihre Anfrage${v8Thema(purpose, "sie")}! Hier schreibt der digitale Assistent von {{2}}.\n\n*{{3}}?*`,
    du: `danke für deine Anfrage${v8Thema(purpose, "du")}! Hier schreibt der digitale Assistent von {{2}}.\n\n*{{3}}?*`,
  };
}

/**
 * Erstanschreiben v9 (Ole, 18.11.2026): noch kürzer, damit WhatsApp die Frage nicht hinter „Mehr lesen“ versteckt.
 * Ohne Vermittler, ohne den Satz „Hier schreibt der digitale Assistent …“ und ohne Leerzeile; die KI-Kennzeichnung steht
 * in der Fußzeile (ERSTINFO_FOOTER_V9). Platzhalter nach dem Namen: {{2}} erste offene Frage ohne „?“ (fett).
 *   „Hallo Herr Pan, danke für Ihre Anfrage zum Privatschutz! *Sind Haftpflicht und Hausrat schon versichert, oder wäre
 *   beides neu?*“
 * Tierkrankenversicherung (Ole, 18.11.2026) emotional: {{2}} Tiername(n) bzw. „Ihre Katze“, {{3}} erste offene Frage.
 *   „Hallo Herr Pan, schön, dass Sie Minka gut absichern möchten 🐾 *Ist Minka eine Wohnungskatze oder ein Freigänger?*“
 */
export function erstanschreibenV9(purpose: ErstanschreibenZweck): { sie: string; du: string } {
  if (purpose === "outreach_tkv") {
    return { sie: "schön, dass Sie {{2}} gut absichern möchten 🐾 *{{3}}?*", du: "schön, dass du {{2}} gut absichern möchtest 🐾 *{{3}}?*" };
  }
  return {
    sie: `danke für Ihre Anfrage${v8Thema(purpose, "sie")}! *{{2}}?*`,
    du: `danke für deine Anfrage${v8Thema(purpose, "du")}! *{{2}}?*`,
  };
}

/** Feste erste Frage des Erstanschreibens ab v10 je Zweck (Ole, 19.11.2026). */
export type V10Frage = {
  /** Text nach „Hallo {{1}}, “: Fassung a (v10) und b (v11, „Frage zuerst“), je Sie und Du; {{2}} = Tier (nur TKV) */
  a: { sie: string; du: string };
  b: { sie: string; du: string };
  /** Antwortknöpfe (höchstens 3, je höchstens 20 Zeichen), in Vorlage und Freitext gleich */
  knoepfe: string[];
  /** Feld in record_qualification für die Antwort */
  feld: string;
  /** Frage im Frageplan, die diese Frage ersetzt (null = allgemeine Fassung, Telefonat) */
  planKey: "frage1" | "frage2" | "vorhanden" | null;
  /** Gespeicherter Wert je Knopf (Standard: der Knopftext) */
  werte?: Record<string, string>;
};

/**
 * Erstanschreiben v10 und v11 (Ole, 19.11.2026). TKV: „Was soll abgesichert sein?“ ersetzt die bisherige Frage 2
 * (Tarifwunsch), danach fragt der Assistent noch das Alter (Frage 1), falls nicht im Formular. Zahn neutral nach dem
 * Tarifbaustein (Art. 9 DSGVO, neutralZahnAngaben). Allgemein: Telefonat wie OUTREACH_ALLGEMEIN (angaben.wunsch).
 */
export const ERSTANSCHREIBEN_V10: Record<ErstanschreibenZweck, V10Frage> = {
  outreach_tkv: {
    a: { sie: "schön, dass Sie {{2}} gut absichern möchten 🐾 *Was soll abgesichert sein?*", du: "schön, dass du {{2}} gut absichern möchtest 🐾 *Was soll abgesichert sein?*" },
    b: { sie: "*was soll für {{2}} abgesichert sein?* 🐾", du: "*was soll für {{2}} abgesichert sein?* 🐾" },
    knoepfe: ["Nur Operationen", "Auch Behandlungen", "Noch unsicher"],
    feld: "tarifwunsch",
    planKey: "frage2",
    // gleiche Werte wie die Tierfrage nach der Buchung (tier-fragen.ts tierAntwortAuswerten)
    werte: { "Nur Operationen": "nur OP-Schutz", "Auch Behandlungen": "volle Krankenversicherung (auch Tierarztbehandlung)", "Noch unsicher": "offen" },
  },
  outreach_privatschutz: {
    a: { sie: "danke für Ihre Anfrage zum Privatschutz! *Ist davon schon etwas versichert?*", du: "danke für deine Anfrage zum Privatschutz! *Ist davon schon etwas versichert?*" },
    b: { sie: "*ist beim Privatschutz schon etwas versichert?* Danke für Ihre Anfrage!", du: "*ist beim Privatschutz schon etwas versichert?* Danke für deine Anfrage!" },
    knoepfe: ["Alles neu", "Schon versichert", "Teils, teils"],
    feld: "vorhanden",
    planKey: "vorhanden",
    werte: { "Alles neu": "noch nichts versichert, alles neu", "Schon versichert": "schon versichert", "Teils, teils": "teilweise schon versichert" },
  },
  outreach_hausrat: {
    a: { sie: "danke für Ihre Anfrage zu Ihrer Hausratversicherung! *Haben Sie schon eine Hausrat?*", du: "danke für deine Anfrage zu deiner Hausratversicherung! *Hast du schon eine Hausrat?*" },
    b: { sie: "*haben Sie schon eine Hausratversicherung?* Danke für Ihre Anfrage!", du: "*hast du schon eine Hausratversicherung?* Danke für deine Anfrage!" },
    knoepfe: ["Nein, wäre neu", "Ja, habe ich"],
    feld: "vorhanden",
    planKey: "vorhanden",
    werte: { "Nein, wäre neu": "keine Hausratversicherung, wäre neu", "Ja, habe ich": "Hausratversicherung vorhanden" },
  },
  outreach_zahn: {
    a: { sie: "danke für Ihre Anfrage zur Zahnzusatzversicherung! *Was ist Ihnen am wichtigsten?*", du: "danke für deine Anfrage zur Zahnzusatzversicherung! *Was ist dir am wichtigsten?*" },
    b: {
      sie: "*was ist Ihnen bei der Zahnzusatzversicherung am wichtigsten?* Danke für Ihre Anfrage!",
      du: "*was ist dir bei der Zahnzusatzversicherung am wichtigsten?* Danke für deine Anfrage!",
    },
    knoepfe: ["Starker Zahnersatz", "Mit Zahnreinigung", "Beides vergleichen"],
    feld: "tarifwunsch",
    planKey: "frage1",
    // neutral als Produktinteresse (Art. 9 DSGVO), wie neutralZahnAngaben
    werte: { "Starker Zahnersatz": "Tarif mit starkem Zahnersatz-Baustein", "Mit Zahnreinigung": "Tarif mit Zahnreinigung", "Beides vergleichen": "Beides vergleichen" },
  },
  outreach_pkv: {
    a: {
      sie: "danke für Ihre Anfrage zur privaten Krankenversicherung! *Wie sind Sie beruflich aufgestellt?*",
      du: "danke für deine Anfrage zur privaten Krankenversicherung! *Wie bist du beruflich aufgestellt?*",
    },
    b: { sie: "*wie sind Sie beruflich aufgestellt?* Danke für Ihre Anfrage zur PKV!", du: "*wie bist du beruflich aufgestellt?* Danke für deine Anfrage zur PKV!" },
    knoepfe: ["Angestellt", "Selbstständig", "Beamter"],
    feld: "beruf",
    planKey: "frage1",
  },
  outreach: {
    a: { sie: "danke für Ihre Anfrage! *Wann passt Ihnen ein kurzes Telefonat?*", du: "danke für deine Anfrage! *Wann passt dir ein kurzes Telefonat?*" },
    b: { sie: "*wann passt Ihnen ein kurzes Telefonat?* Danke für Ihre Anfrage!", du: "*wann passt dir ein kurzes Telefonat?* Danke für deine Anfrage!" },
    knoepfe: ["Heute", "Morgen", "Lieber schriftlich"],
    feld: "wunsch",
    planKey: null,
    werte: { Heute: "Telefonat heute", Morgen: "Telefonat morgen", "Lieber schriftlich": "lieber schriftlich im Chat" },
  },
};

/** Vorlagentext v10 (Fassung a) nach „Hallo {{1}}, “ je Ansprache. */
export function erstanschreibenV10(purpose: ErstanschreibenZweck): { sie: string; du: string } {
  return { ...ERSTANSCHREIBEN_V10[purpose].a };
}

/** Vorlagentext v11 (Fassung b des A/B-Tests gegen v10, „Frage zuerst“) nach „Hallo {{1}}, “ je Ansprache. */
export function erstanschreibenV11(purpose: ErstanschreibenZweck): { sie: string; du: string } {
  return { ...ERSTANSCHREIBEN_V10[purpose].b };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Erkennungsmuster der festen Frage (fetter Teil, Platzhalter beliebig) je Zweck, Fassung und Ansprache. */
const V10_MUSTER: { zweck: ErstanschreibenZweck; variant: "a" | "b"; re: RegExp }[] = (Object.keys(ERSTANSCHREIBEN_V10) as ErstanschreibenZweck[]).flatMap((zweck) =>
  (["a", "b"] as const).flatMap((variant) =>
    (["sie", "du"] as const).map((an) => {
      const fett = /\*([^*]+)\*/.exec(ERSTANSCHREIBEN_V10[zweck][variant][an])?.[1] ?? "";
      return { zweck, variant, re: new RegExp(escapeRe(fett).replace(/\\\{\\\{\d+\\\}\\\}/g, ".{1,80}?"), "i") };
    }),
  ),
);

/**
 * Steht die feste Frage von v10 bzw. v11 in diesem gesendeten Text (Vorlage oder Freitext)? Liefert Zweck, Fassung und
 * die Frage so, wie sie gesendet wurde (erster Buchstabe groß, ohne Sternchen). null = keine v10/v11.
 *   bevorzugt: Zweck des Leads zuerst prüfen (Privatschutz und Hausrat ähneln sich nicht, aber sicher ist sicher)
 */
export function v10FrageIn(gesendet: string | null | undefined, bevorzugt?: string | null): { zweck: ErstanschreibenZweck; variant: "a" | "b"; frage: string; def: V10Frage } | null {
  const t = gesendet ?? "";
  if (!t) return null;
  const reihe = [...V10_MUSTER].sort((x, y) => Number(y.zweck === bevorzugt) - Number(x.zweck === bevorzugt));
  for (const m of reihe) {
    const hit = m.re.exec(t);
    if (hit) {
      const frage = hit[0].charAt(0).toUpperCase() + hit[0].slice(1);
      return { zweck: m.zweck, variant: m.variant, frage, def: ERSTANSCHREIBEN_V10[m.zweck] };
    }
  }
  return null;
}

/**
 * Antwort per Knopf auf die feste Frage von v10/v11 (rein, testbar): Feld und zu speichernder Wert, z. B. TKV
 * „Nur Operationen“ → tarifwunsch „nur OP-Schutz“. null = kein Knopf dieser Frage bzw. keine v10/v11 gesendet.
 */
export function erstfrageKnopfWert(gesendet: string | null | undefined, knopf: string | null | undefined, bevorzugt?: string | null): { feld: string; wert: string; frage: string; knopf: string } | null {
  const v = v10FrageIn(gesendet, bevorzugt);
  const k = (knopf ?? "").trim().toLowerCase().replace(/[.!]+$/, "");
  if (!v || !k) return null;
  const titel = v.def.knoepfe.find((x) => x.toLowerCase() === k);
  if (!titel) return null;
  return { feld: v.def.feld, wert: v.def.werte?.[titel] ?? titel, frage: v.frage, knopf: titel };
}

/** Tier im Akkusativ, wenn der Name fehlt („Ihre Katze“, „Ihren Hund“, Du „deinen Hund“). */
const TIER_AKK: Record<Tier, { sie: string; du: string }> = {
  katze: { sie: "Ihre Katze", du: "deine Katze" },
  hund: { sie: "Ihren Hund", du: "deinen Hund" },
  pferd: { sie: "Ihr Pferd", du: "dein Pferd" },
  tier: { sie: "Ihr Tier", du: "dein Tier" },
};

/**
 * Tier für das Erstanschreiben v9 der Tierkrankenversicherung: Name(n) aus dem Formular („Minka, Felix“, „Minka/Felix“
 * → „Minka und Felix“, ab drei „A, B und C“), sonst „Ihre Katze“ bzw. „deinen Hund“ (Akkusativ).
 */
export function tierFuerErstanschreiben(source: string | null | undefined, an: Ansprache, formular?: FormAntwort[] | null): string {
  const roh = (formular ?? []).find((x) => /tiername|name des tieres/i.test(x.label))?.value?.trim() ?? "";
  const namen = roh
    .split(/\s*(?:,|;|\/|&|\+|\bund\b)\s*/i)
    .map((n) => n.trim())
    .filter(Boolean);
  if (namen.length === 1) return namen[0];
  if (namen.length > 1) return `${namen.slice(0, -1).join(", ")} und ${namen.at(-1)}`;
  return TIER_AKK[outreachProdukt(source)?.tier ?? "tier"][an];
}

/** Frage für den Platzhalter {{4}} (v6): ohne abschließendes „?“ (steht fest in der Vorlage). */
export function frageOhneFragezeichen(frage: string): string {
  return frage.trim().replace(/[?？]+\s*$/, "").trim();
}

export type OutreachProdukt = {
  purpose: NoticePurpose;
  /** Thema im Nominativ für v6 („zum Thema private Krankenversicherung“). */
  thema: string;
  /** Wert für {{Produkt}}, passend zum Text („zur Tierkrankenversicherung“, „zum Thema Privatschutz“). */
  produkt: string;
  /** „zur“ bzw. „zum Thema“ vor dem Produkt. */
  praep: "zur" | "zum Thema";
  /** Frage 1 (steht in der Vorlage) und ihre Knöpfe. */
  frage1: string;
  /** Frage 1 in der Du-Fassung. */
  frage1Du: string;
  knoepfe: string[];
  /** Frage 2, die der Assistent nach der Antwort stellt (neutral, ohne Gesundheitsfragen, ohne Tarife). */
  frage2: string;
  /** Frage 2 als reine Frage (Sie bzw. Du), z. B. als erste Frage, wenn Frage 1 schon im Formular steht. */
  frage2Sie: string;
  frage2Du: string;
  /** Feld in record_qualification für die Antwort auf Frage 1 bzw. 2. */
  feld1: string;
  feld2: string;
  /** Emoji hinter dem Dank (nur Freitext; die Vorlage bleibt je Zweck gleich). */
  emoji?: string;
  /** Tier der Tierkrankenversicherung (für „Wie alt ist Ihre Katze?“). */
  tier?: Tier;
};

/** Tier bei der Tierkrankenversicherung; „tier“ = nicht bekannt. */
export type Tier = "katze" | "hund" | "pferd" | "tier";
const TIER_WORT: Record<Tier, { sie: string; du: string }> = {
  katze: { sie: "Ihre Katze", du: "deine Katze" },
  hund: { sie: "Ihr Hund", du: "dein Hund" },
  pferd: { sie: "Ihr Pferd", du: "dein Pferd" },
  tier: { sie: "Ihr Tier", du: "dein Tier" },
};
const TIER_EMOJI: Record<Tier, string> = { katze: "🐱", hund: "🐶", pferd: "🐴", tier: "🐾" };

/** „Ihre Katze“, „dein Hund“ … (Platzhalter {{3}} der Vorlage outreach_tkv ab v5). */
export function tierWort(tier: Tier | undefined, an: Ansprache): string {
  return TIER_WORT[tier ?? "tier"][an];
}

const TIER = /\btkv\b|tierkranken|tier-?op|katze|hund|pferd/i;
const ZAHN = /zahn/i;
const PKV = /\bpkv\b|private?n? kranken|krankenvoll|wechsel|tarifoptim|neugesch/i;
const PRIVATSCHUTZ = /privatschutz|haftpflicht|hausrat|rechtsschutz|wohngeb(ä|a)ude/i;

/** Welches Erstanschreiben passt zum Produkt? null = allgemeine Fassung „outreach“ (Telefonat: Heute/Morgen/schriftlich). */
export function outreachProdukt(source: string | null | undefined): OutreachProdukt | null {
  const s = (source ?? "").trim();
  if (!s) return null;
  // Tierhalter-Haftpflicht und Futter sind keine Tierkrankenversicherung
  if (TIER.test(s) && !/privatschutz|halter|futter/i.test(s)) {
    const tier: Tier = /katze/i.test(s) ? "katze" : /hund/i.test(s) ? "hund" : /pferd/i.test(s) ? "pferd" : "tier";
    const produkt = { katze: "Katzenversicherung", hund: "Hundekrankenversicherung", pferd: "Pferdeversicherung", tier: "Tierkrankenversicherung" }[tier];
    // Frage 1 ab v5 (Ole, 16.11.2026): das Alter des Tieres, frei beantwortet (Tierart steht im Formular)
    return {
      purpose: "outreach_tkv",
      thema: produkt,
      produkt,
      praep: "zur",
      frage1: `Wie alt ist ${tierWort(tier, "sie")}?`,
      frage1Du: `Wie alt ist ${tierWort(tier, "du")}?`,
      knoepfe: [],
      frage2: "Soll vor allem eine Operation abgesichert sein, oder auch die normale Tierarztbehandlung? (angaben.tarifwunsch, neutral fragen, nichts empfehlen)",
      frage2Sie: "Soll vor allem eine Operation abgesichert sein, oder auch die normale Tierarztbehandlung?",
      frage2Du: "Soll vor allem eine Operation abgesichert sein, oder auch die normale Tierarztbehandlung?",
      feld1: "tier",
      feld2: "tarifwunsch",
      emoji: TIER_EMOJI[tier],
      tier,
    };
  }
  if (ZAHN.test(s)) {
    // Art. 9 DSGVO (Rechtsprüfung Nachtrag 16.11.2026): gefragt wird nach dem gewünschten Tarifbaustein, nie nach dem
    // eigenen Bedarf. Die bei Meta freigegebene v4 trägt noch „Zahnersatz/Prophylaxe/Beides“; beide Fassungen werden
    // mit neutralZahnAngaben auf dieselben neutralen Werte gebracht.
    return {
      purpose: "outreach_zahn",
      thema: "Zahnzusatzversicherung",
      produkt: "Zahnzusatzversicherung",
      praep: "zur",
      frage1: "Welcher Tarifbaustein ist Ihnen am wichtigsten?",
      frage1Du: "Welcher Tarifbaustein ist dir am wichtigsten?",
      knoepfe: ["Starker Zahnersatz", "Mit Zahnreinigung", "Beides vergleichen"],
      frage2:
        "Sind Sie gesetzlich krankenversichert? (angaben.vorhanden; keine Fragen zu Befunden, Behandlungen, Beschwerden oder dem Gebiss, auch nicht, ob jemand Zahnersatz braucht)",
      frage2Sie: "Sind Sie gesetzlich krankenversichert?",
      frage2Du: "Bist du gesetzlich krankenversichert?",
      feld1: "tarifwunsch",
      feld2: "vorhanden",
    };
  }
  if (PKV.test(s) && !/kinderwunsch/i.test(s)) {
    return {
      purpose: "outreach_pkv",
      thema: "private Krankenversicherung",
      produkt: "privaten Krankenversicherung",
      praep: "zur",
      frage1: "Wie sind Sie aktuell beruflich aufgestellt?",
      frage1Du: "Wie bist du aktuell beruflich aufgestellt?",
      knoepfe: ["Angestellt", "Selbstständig", "Beamter"],
      frage2: "Sind Sie aktuell gesetzlich oder schon privat krankenversichert? (angaben.vorhanden)",
      frage2Sie: "Sind Sie aktuell gesetzlich oder schon privat krankenversichert?",
      frage2Du: "Bist du aktuell gesetzlich oder schon privat krankenversichert?",
      feld1: "beruf",
      feld2: "vorhanden",
    };
  }
  if (PRIVATSCHUTZ.test(s) && !/tier|hund|katze|pferd/i.test(s)) {
    const produkt = /privatschutz/i.test(s) ? "Privatschutz" : displayProduct(s);
    return {
      purpose: "outreach_privatschutz",
      thema: produkt,
      produkt,
      praep: "zum Thema",
      frage1: "Worum geht es Ihnen vor allem?",
      frage1Du: "Worum geht es dir vor allem?",
      knoepfe: ["Haftpflicht", "Hausrat", "Mehreres"],
      frage2: "Wer soll versichert werden: nur Sie, mit Partner oder die ganze Familie? (angaben.versichern; bei „Mehreres“ vorher kurz, welche Bereiche)",
      frage2Sie: "Wer soll versichert werden: nur Sie, mit Partner oder die ganze Familie?",
      frage2Du: "Wer soll versichert werden: nur du, mit Partner oder die ganze Familie?",
      feld1: "interesse",
      feld2: "versichern",
      emoji: "🏠",
    };
  }
  return null;
}

export type FormAntwort = { label: string; value: string };

/** Welche Formularfelder beantworten Frage 1 bzw. 2 schon (Feldnamen wie lib/ppl/perspective.ts und Meta-Formulare)? */
const BEKANNT: Partial<Record<NoticePurpose, { frage1?: RegExp; frage2?: RegExp }>> = {
  // Gewünschter Schutz (Ole, 19.11.2026: feste Frage in v10) aus Formularfeldern wie „Gewünschter Schutz: OP-Schutz“
  outreach_tkv: { frage1: /geburtsjahr|^alter\b|alter \(tier\)|alter des tieres/i, frage2: /tarifwunsch|gewünschter schutz|^schutz\b|op-schutz|absicherungswunsch|^tarifart\b/i },
  outreach_pkv: { frage1: /^situation\b|berufliche situation|^beruf\b/i, frage2: /gesetzlich oder privat|wie lange in pkv|aktuelle versicherung/i },
  outreach_privatschutz: { frage1: /versicherungsinteresse/i, frage2: /lebenssituation|familienstand|zu versichernde/i },
};

/** Formularfelder, die schon sagen, ob es bestehende Verträge gibt (Privatschutz: Frage „schon versichert?“). */
const BEKANNT_VORHANDEN = /vorversicherung|bereits versichert|schon versichert|bestehende versicherung|aktuelle versicherung|vorhandene versicherung/i;

/**
 * Antworten auf Frage 1 und 2 aus dem Leadformular (Ole, 17.11.2026: nichts erneut fragen, was bekannt ist), z. B.
 * PKV-Funnel „Situation: Angestellt“ beantwortet Frage 1. null = noch offen. Rein.
 */
export function bekannteAntworten(p: OutreachProdukt | null, formular: FormAntwort[] | null | undefined): { frage1: string | null; frage2: string | null } {
  const re = p ? BEKANNT[p.purpose] : undefined;
  const find = (r?: RegExp) => {
    const hit = r ? (formular ?? []).find((f) => r.test(f.label.trim()) && f.value?.trim()) : undefined;
    return hit ? `${hit.label}: ${hit.value.trim()}` : null;
  };
  return { frage1: find(re?.frage1), frage2: find(re?.frage2) };
}

/** Thema für v6 {{2}}: Produkt im Nominativ, ohne Produkt der Produktname laut Katalog bzw. „Versicherung“. */
export function erstanschreibenThema(source: string | null | undefined): string {
  const p = outreachProdukt(source);
  if (p) return p.thema;
  const s = (source ?? "").trim();
  return s ? displayProduct(s) : "Versicherung";
}

/** Frage nach dem Termin, wenn das Formular alle Fragen vor dem Termin schon beantwortet (nur Video, Ole 17.11.2026). */
export function terminFrage(an: Ansprache, name: string): string {
  return a(an, `Passt dir ein kurzer Videotermin mit ${name} in den nächsten Tagen?`, `Passt Ihnen ein kurzer Videotermin mit ${name} in den nächsten Tagen?`);
}

/** Allgemeines Erstanschreiben: Frage 1 und Knöpfe (siehe TEMPLATE_BODY.outreach). */
export const OUTREACH_ALLGEMEIN = {
  frage1: "Wann erreicht der Berater Sie am besten für ein kurzes Telefonat?",
  knoepfe: ["Heute", "Morgen", "Lieber schriftlich"],
} as const;

/** Frage 1 der bei Meta noch freigegebenen v4 (Tierkrankenversicherung), bis v5 freigegeben ist. */
export const TKV_V4 = { frage1: "Für welches Tier suchen Sie den Schutz?", knoepfe: ["Hund", "Katze"] } as const;

/** Höchstens so viele Fragen vor dem Terminvorschlag, die Frage im Erstanschreiben mitgezählt (Ole, 17.11.2026). */
export const MAX_FRAGEN_VOR_TERMIN = 2;

/** Eine Frage vor dem Termin, verknüpft mit dem Formularfeld, das sie beantwortet. */
export type PlanFrage = {
  key: "frage1" | "frage2" | "vorhanden";
  /** Feld in record_qualification */
  feld: string;
  sie: string;
  du: string;
  /** Hinweis für den Assistenten (z. B. Art. 9 DSGVO beim Zahn) */
  hinweis?: string;
  /** Antwort aus dem Formular („Versicherungsinteresse: Haftpflicht, Hausrat“), null = offen */
  bekannt: string | null;
};

/**
 * Frage im Erstanschreiben, die nicht im Plan steht: ältere TKV-Frage, Frage nach dem Videotermin bzw. (v10 allgemein,
 * Ole 19.11.2026) die feste Frage nach dem Telefonat.
 */
type SonstigeFrage = { key: "tier_v4" | "termin" | "telefonat"; sie: string; du: string; feld: string; bekannt: null; knoepfe?: readonly string[] };

export type Frageplan = {
  produkt: OutreachProdukt | null;
  /** Alle Fragen des Produkts vor dem Termin, mit bekannter Antwort aus dem Formular */
  fragen: PlanFrage[];
  /**
   * Die Frage, die unser Erstanschreiben gestellt hat (auch wenn das Formular sie schon beantwortet), sonst null. Ab v10
   * (Ole, 19.11.2026) mit dem Wortlaut der festen Frage, wie gesendet, und ihren Knöpfen.
   */
  gestellt: (PlanFrage & { knoepfe?: readonly string[] }) | SonstigeFrage | null;
  /** Noch zu stellen, in dieser Reihenfolge (höchstens MAX_FRAGEN_VOR_TERMIN, die gestellte mitgezählt) */
  offen: PlanFrage[];
};

/** Sparten aus „Haftpflicht, Hausrat“ als Wörter für die Frage nach bestehenden Verträgen. */
function spartenWoerter(interesse: string | null): string[] {
  const t = interesse ?? "";
  const out: string[] = [];
  if (/haftpflicht/i.test(t.replace(/tierhalter-?\s*haftpflicht/gi, ""))) out.push("Haftpflicht");
  if (/hausrat/i.test(t)) out.push("Hausrat");
  if (/rechtsschutz/i.test(t)) out.push("Rechtsschutz");
  if (/wohngeb(ä|a)ude/i.test(t)) out.push("Wohngebäude");
  if (/unfall/i.test(t)) out.push("Unfall");
  return out;
}

/**
 * Hat der Lead nur Hausrat angefragt (Ole, 18.11.2026)? Privatschutz-Produkt, und das Versicherungsinteresse im Formular
 * (sonst das Produkt selbst, außer „Privatschutz“) nennt genau eine Sparte: Hausrat. Rein.
 */
export function nurHausrat(source: string | null | undefined, formular?: FormAntwort[] | null): boolean {
  if (outreachProdukt(source)?.purpose !== "outreach_privatschutz") return false;
  const ausForm = (formular ?? []).find((x) => /versicherungsinteresse/i.test(x.label) && x.value?.trim())?.value ?? null;
  const interesse = ausForm ?? (/privatschutz/i.test(source ?? "") ? null : (source ?? null));
  const w = spartenWoerter(interesse);
  return w.length === 1 && w[0] === "Hausrat";
}

/**
 * Zweck der Vorlage fürs Erstanschreiben: je Produkt, bei reinen Hausrat-Leads outreach_hausrat, ohne Produkt die
 * allgemeine Fassung. Frageplan, Zwischenfrage und Gespräch bleiben beim Produkt (outreachProdukt).
 */
export function erstanschreibenZweck(source: string | null | undefined, formular?: FormAntwort[] | null): NoticePurpose {
  const p = outreachProdukt(source);
  if (!p) return "outreach";
  return nurHausrat(source, formular) ? "outreach_hausrat" : p.purpose;
}

/** „Sind Haftpflicht und Hausrat schon versichert, oder wäre beides neu?“ (Ole, 17.11.2026, v8 ohne „irgendwo“). */
export function vorhandenFrage(interesse: string | null): { sie: string; du: string } {
  const w = spartenWoerter(interesse);
  if (w.length >= 2) {
    const liste = `${w.slice(0, -1).join(", ")} und ${w.at(-1)}`;
    const t = `Sind ${liste} schon versichert, oder wäre ${w.length === 2 ? "beides" : "alles"} neu?`;
    return { sie: t, du: t };
  }
  if (w.length === 1) return { sie: `Sind Sie bei ${w[0]} schon versichert, oder wäre es neu?`, du: `Bist du bei ${w[0]} schon versichert, oder wäre es neu?` };
  return { sie: "Sind Sie dafür schon versichert, oder wäre es neu?", du: "Bist du dafür schon versichert, oder wäre es neu?" };
}

const TERMIN_RE = /Videotermin mit .+ in den nächsten Tagen\?/;

/**
 * Frageplan vor dem Termin (Ole, 17.11.2026, rein): Jede Frage ist mit dem Formularfeld verknüpft, das sie beantwortet;
 * Bekanntes (auch Mehrfachauswahl wie „Haftpflicht, Hausrat“) gilt als beantwortet und wird übersprungen. Höchstens
 * MAX_FRAGEN_VOR_TERMIN Fragen samt der im Erstanschreiben, danach sofort der Terminvorschlag.
 */
export function frageplan(source: string | null | undefined, formular: FormAntwort[] | null | undefined, opts: { gesendet?: string | null } = {}): Frageplan {
  const p = outreachProdukt(source);
  const gesendet = opts.gesendet ?? "";
  const termin: SonstigeFrage | null = TERMIN_RE.test(gesendet) ? { key: "termin", sie: "", du: "", feld: "wunsch", bekannt: null } : null;
  // Feste Frage aus v10/v11 (Ole, 19.11.2026), Vorlage oder Freitext, Fassung a oder b
  const v10 = v10FrageIn(gesendet, erstanschreibenZweck(source, formular));
  const telefonat: SonstigeFrage | null =
    v10 && !v10.def.planKey ? { key: "telefonat", sie: v10.frage, du: v10.frage, feld: v10.def.feld, bekannt: null, knoepfe: v10.def.knoepfe } : null;
  if (!p) return { produkt: null, fragen: [], gestellt: telefonat ?? termin, offen: [] };
  const bekannt = bekannteAntworten(p, formular);
  const find = (re: RegExp) => {
    const hit = (formular ?? []).find((x) => re.test(x.label.trim()) && x.value?.trim());
    return hit ? `${hit.label}: ${hit.value.trim()}` : null;
  };
  const fragen: PlanFrage[] = [
    { key: "frage1", feld: p.feld1, sie: p.frage1, du: p.frage1Du, bekannt: bekannt.frage1 },
    { key: "frage2", feld: p.feld2, sie: p.frage2Sie, du: p.frage2Du, hinweis: p.frage2, bekannt: bekannt.frage2 },
  ];
  if (p.purpose === "outreach_privatschutz") {
    // v8 (Ole, 17.11.2026): zuerst „Sind Haftpflicht und Hausrat schon versichert, oder wäre beides neu?“, dann die
    // Zwischenfrage „Wer soll mitversichert sein?“ (stellt die App, zwischenfrage.ts); ohne Interesse im Formular gilt
    // Privatschutz als Haftpflicht und Hausrat
    const ausForm = (formular ?? []).find((x) => /versicherungsinteresse/i.test(x.label))?.value ?? null;
    const ausProdukt = /privatschutz/i.test(source ?? "") ? "Haftpflicht, Hausrat" : spartenWoerter(source ?? null).length ? (source ?? null) : null;
    const v = vorhandenFrage(ausForm ?? ausProdukt);
    fragen.unshift({ key: "vorhanden", feld: "vorhanden", sie: v.sie, du: v.du, bekannt: find(BEKANNT_VORHANDEN) });
    if (!fragen[1].bekannt && ausProdukt) fragen[1] = { ...fragen[1], bekannt: `Produkt: ${spartenWoerter(ausProdukt).join(", ")}` };
  }
  // Ältere Fassung der Frage nach bestehenden Verträgen („schon irgendwo versichert“) gilt als dieselbe
  const istIn = (f: PlanFrage) =>
    !!gesendet && (gesendet.includes(f.sie) || gesendet.includes(f.du) || (f.key === "vorhanden" && /schon (irgendwo )?versichert, oder wäre/.test(gesendet)));
  // v10/v11: die feste Frage ersetzt die Frage des Plans mit demselben Feld (TKV Tarifwunsch, Privatschutz und Hausrat
  // bestehende Verträge, Zahn Tarifbaustein, PKV Beruf); Wortlaut und Knöpfe wie gesendet
  const v10Plan = v10?.def.planKey ? fragen.find((f) => f.key === v10.def.planKey) : undefined;
  const gestellt: Frageplan["gestellt"] = v10Plan
    ? { ...v10Plan, feld: v10!.def.feld, sie: v10!.frage, du: v10!.frage, knoepfe: v10!.def.knoepfe }
    : telefonat
      ? telefonat
      : p.purpose === "outreach_tkv" && gesendet.includes(TKV_V4.frage1)
        ? { key: "tier_v4", sie: TKV_V4.frage1, du: TKV_V4.frage1, feld: "tier", bekannt: null }
        : (fragen.find(istIn) ?? termin);
  const rest = Math.max(0, MAX_FRAGEN_VOR_TERMIN - (gestellt ? 1 : 0));
  const offen = gestellt?.key === "termin" || gestellt?.key === "telefonat" ? [] : fragen.filter((f) => !f.bekannt && f.key !== gestellt?.key).slice(0, rest);
  return { produkt: p, fragen, gestellt, offen };
}

/** Prompt-Regel: Formularangaben gelten als beantwortet, kurz bestätigen statt abfragen (Ole, 17.11.2026). */
export function formularRegel(an: Ansprache): string {
  return [
    "Angaben aus dem Leadformular gelten als beantwortet, auch Mehrfachauswahl (z. B. „Haftpflicht, Hausrat“ heißt: beides).",
    `- Greif sie höchstens einmal kurz und natürlich auf (z. B. ${a(an, "„Haftpflicht und Hausrat, alles klar.“", "„Haftpflicht und Hausrat, alles klar.“")}) und frag sie nicht erneut ab, auch nicht umformuliert. Sprich nur dann von Familie, Partner oder Kindern, wenn der Lead es gesagt hat.`,
    "- Keine Rückfragen zum Schwerpunkt oder zur Bestätigung von Bekanntem, z. B. nie „Worum geht es Ihnen dabei vor allem?“, „Was ist Ihnen davon am wichtigsten?“ oder „Habe ich richtig verstanden, dass …?“.",
  ].join("\n");
}

/**
 * Prompt-Block für den Assistenten vor dem Termin (Frageplan): was das Erstanschreiben gefragt hat, was das Formular
 * schon beantwortet und welche Fragen (höchstens eine bis zwei) noch offen sind; danach sofort der Terminvorschlag.
 *   opts.gesendet: Text des tatsächlich gesendeten Erstanschreibens
 *   opts.jetzt: Der Lead hat zuerst geschrieben, es wurde noch nichts gefragt: die erste offene Frage jetzt stellen (fett)
 */
export function ersteFrageRegel(
  source: string | null | undefined,
  advisorName: string,
  opts: {
    gesendet?: string | null;
    jetzt?: boolean;
    an?: Ansprache;
    formular?: FormAntwort[] | null;
    /** Vermittler im Nominativ („Herr Kannapinn“, Du: Vorname) für die Telefonatsfrage; ohne: advisorName */
    personNom?: string | null;
    /** Die App stellt nach der Öffnungsfrage selbst genau eine Zwischenfrage (lib/whatsapp/zwischenfrage.ts) */
    zwischenApp?: boolean;
  } = {},
): string {
  const an = opts.an ?? "sie";
  const plan = frageplan(source, opts.formular, { gesendet: opts.jetzt ? null : opts.gesendet });
  const p = plan.produkt;
  const termine = "setze qualifiziert=true und mach sofort den Terminvorschlag (siehe „Terminvorschlag“).";
  if (!p) {
    if (opts.jetzt) return "";
    if (plan.gestellt?.key === "termin") return `Erste Frage (stand schon in unserer ersten WhatsApp): „${terminFrage(an, advisorName)}“.\n- Sagt der Lead ja oder nennt er einen Tag: ${termine}`;
    // v10/v11 (Ole, 19.11.2026): feste Frage „Wann passt Ihnen ein kurzes Telefonat?“, Wortlaut wie gesendet
    const frage = plan.gestellt?.key === "telefonat" ? plan.gestellt.sie : `Wann erreicht ${opts.personNom || advisorName} ${a(an, "dich", "Sie")} am besten für ein kurzes Telefonat?`;
    return [
      `Erste Frage (stand schon in unserer ersten WhatsApp): „${frage}“ mit den Knöpfen ${OUTREACH_ALLGEMEIN.knoepfe.map((k) => `„${k}“`).join(", ")}.`,
      "- Antwortet der Lead „Heute“ oder „Morgen“ (Knopf oder frei): halte das als Wunsch fest (angaben.wunsch) und mach den Terminvorschlag mit zwei freien Zeiten an diesem Tag (gibt es keine, die nächsten).",
      "- „Lieber schriftlich“: kein Problem, mach im Chat weiter: frag in einem Satz, worum es genau geht, dann der Terminvorschlag.",
    ].join("\n");
  }
  const zahn =
    p.purpose === "outreach_zahn"
      ? [
          `- Ältere Fassung derselben Frage hatte die Knöpfe ${ZAHN_KNOEPFE_V4.map((k) => `„${k}“`).join(", ")}: das ist die gleiche Antwort auf Frage 1 (gewünschter Tarifbaustein), kein Befund.`,
          "- Frag nie, ob der Lead selbst Zahnersatz, eine Behandlung oder eine Zahnreinigung braucht, und nie nach Befunden oder Beschwerden. Erzählt er von sich aus etwas zu seinen Zähnen, halte es nicht fest und sag: „Das klären wir am besten im Gespräch.“",
        ]
      : [];
  const text = (f: { sie: string; du: string }) => a(an, f.du, f.sie);
  const bekannt = plan.fragen.filter((f) => f.bekannt);
  const lines: string[] = ["Fragen vor dem Termin (Frageplan, hat Vorrang vor anderen Fragelisten):"];
  const g = opts.jetzt ? null : plan.gestellt;
  if (g) {
    const knoepfe: readonly string[] = g.knoepfe ?? (g.key === "tier_v4" ? TKV_V4.knoepfe : g.key === "frage1" ? p.knoepfe : []);
    const frage = g.key === "termin" ? terminFrage(an, advisorName) : text(g);
    lines.push(
      `- Unsere erste WhatsApp hat gefragt: „${frage}“${knoepfe.length ? ` (Knöpfe ${knoepfe.map((k) => `„${k}“`).join(", ")})` : ""}. Die nächste Nachricht des Leads (per Knopf oder frei) ist die Antwort darauf: mit record_qualification festhalten (angaben.${g.feld}), kurz bestätigen, nicht erneut fragen.`,
    );
    // v10/v11 (Ole, 19.11.2026): Knopfwerte einheitlich festhalten (TKV „Nur Operationen“ = „nur OP-Schutz“ …)
    const werte = v10FrageIn(opts.gesendet, erstanschreibenZweck(source, opts.formular))?.def.werte;
    if (g.knoepfe && werte) lines.push(`- Werte für angaben.${g.feld}: ${Object.entries(werte).map(([k, w]) => `„${k}“ = „${w}“`).join(", ")}.`);
    if (g.bekannt) lines.push(`- Diese Frage stand fest in der Vorlage, das Formular beantwortet sie aber schon (${g.bekannt}): sie gilt als beantwortet. Was der Lead darauf antwortet (Knopf, „ja“ oder Text), nimm es auf und verfolge die Frage nicht weiter, keine Rückfrage dazu.`);
  } else if (!opts.jetzt && opts.gesendet) {
    lines.push("- Unsere erste WhatsApp war eine ältere Fassung ohne diese Fragen. Antwortet der Lead nur „Ja“ o. Ä., ist das die Zustimmung: weiter mit dem Plan unten.");
  }
  if (bekannt.length) lines.push(`- Aus dem Leadformular schon beantwortet (nicht fragen): ${bekannt.map((f) => f.bekannt).join("; ")}.`);
  if (opts.jetzt) {
    if (!plan.offen.length) return [...lines, ...zahn, `- Keine Frage offen. Beantworte kurz, was der Lead geschrieben hat, dann ${termine}`].join("\n");
    const erste = text(plan.offen[0]);
    lines.push(`- Der Lead hat zuerst geschrieben. Beantworte kurz, was er geschrieben hat (falls nötig), und schließe deine Antwort mit genau dieser Frage als eigener letzter Zeile (ohne Sternchen, nicht fett): ${erste}`);
    lines.push(`- Die nächste Nachricht des Leads ist die Antwort darauf: mit record_qualification festhalten (angaben.${plan.offen[0].feld}) und kurz bestätigen.`);
    if (opts.zwischenApp) lines.push(ZWISCHEN_APP_REGEL);
    else if (plan.offen[1]) lines.push(`- Dann genau noch diese Frage: „${text(plan.offen[1])}“ (angaben.${plan.offen[1].feld}${plan.offen[1].hinweis ? `; ${plan.offen[1].hinweis}` : ""}).`);
  } else if (opts.zwischenApp) {
    lines.push(ZWISCHEN_APP_REGEL);
  } else if (plan.offen.length) {
    lines.push(`- Danach noch ${plan.offen.length === 1 ? "genau diese Frage" : "genau diese Fragen, je eine pro Nachricht"}: ${plan.offen.map((f) => `„${text(f)}“ (angaben.${f.feld}${f.hinweis ? `; ${f.hinweis}` : ""})`).join(", dann ")}. Sonst nichts fragen.`);
  } else {
    lines.push("- Weitere Fragen vor dem Termin gibt es nicht.");
  }
  lines.push(`- Danach ${termine}`);
  return [...lines, ...zahn].join("\n");
}

/** Regel, wenn die App die Zwischenfrage selbst stellt (Privatschutz, lib/whatsapp/zwischenfrage.ts). */
const ZWISCHEN_APP_REGEL =
  "- Die eine Frage danach (z. B. „Wer soll mitversichert sein?“ mit Knöpfen) stellt die App selbst. Du stellst vor dem Termin keine weitere Frage, auch nicht nach der Antwort darauf.";

/**
 * Enthält eine Nachricht von uns die erste Frage des Produkts (Frage 1, Frage 2 oder die Terminfrage)? Für Chats, in
 * denen der Lead zuerst geschrieben hat: Dort stellt der Assistent die Frage selbst, ohne Erstanschreiben-Vorlage.
 */
export function enthaeltErsteFrage(text: string | null | undefined, source: string | null | undefined): boolean {
  const p = outreachProdukt(source);
  if (!p || !text) return false;
  return (
    [p.frage1, p.frage1Du, p.frage2Sie, p.frage2Du].some((f) => text.includes(f)) ||
    /schon (irgendwo )?versichert, oder wäre/.test(text) ||
    /Videotermin mit .+ in den nächsten Tagen\?/.test(text) ||
    // feste Frage aus v10/v11 (Ole, 19.11.2026)
    !!v10FrageIn(text, p.purpose)
  );
}

/** Woher kommt der Kontakt? „anfrage“ = Leadformular (Meta, Funnel), „nachricht“ = hat uns zuerst per WhatsApp geschrieben. */
export type Herkunft = "anfrage" | "nachricht";

export type ErstanschreibenOpts = {
  an: Ansprache;
  /** Name und Anrede des Leads */
  kontakt?: AnredeKontakt | null;
  /** Vorname des Vermittlers laut Profil, sonst Agenturname (kurzNameFuerLeads) */
  name: string;
  /** Vermittler als Person im Dativ („Herrn Kannapinn“, Du: Vorname), v6; ohne: name */
  vermittler?: string | null;
  /** Vermittler im Nominativ („Herr Kannapinn“) für die Frage nach dem Telefonat; ohne: name */
  vermittlerNom?: string | null;
  /** Produkt aus dem Leadformular (Lead.source) */
  source?: string | null;
  herkunft?: Herkunft;
  /** Ohne Lead (neuer Kontakt, Bestandskunde): allgemeiner Nutzen-Satz statt Termin */
  ohneLead?: boolean;
  /** Angaben aus dem Leadformular: was schon bekannt ist, wird nicht gefragt (nur Freitext, die Vorlagen sind fest). */
  formular?: FormAntwort[] | null;
  /** Termin schon gebucht (z. B. Dankeseite des Meta-Formulars): nie nach einem Termin fragen */
  gebucht?: boolean;
  /** A/B-Fassung (ab v10: b = v11 „Frage zuerst“, lib/whatsapp/ab-test.ts) */
  variant?: "a" | "b";
};

/**
 * Genau eine Begrüßung: Sie mit bekanntem Nachnamen „Hallo Herr Müller,“ (ohne bekannte Anrede „Hallo Julia Müller,“),
 * sonst „Hallo,“; Du „Hallo Julia,“ bzw. „Hallo,“.
 */
export function erstGruss(an: Ansprache, kontakt?: AnredeKontakt | null): string {
  const n = anredeName(an, kontakt);
  return n ? `Hallo ${n},` : "Hallo,";
}

/**
 * Erste Zeilen (Begrüßung, Dank, KI-Assistent mit Nutzen), ohne Frage. Auch Kopf der ersten Antwort des Assistenten,
 * wenn der Lead zuerst geschrieben hat (bot.ts).
 */
export function erstanschreibenKopf(o: ErstanschreibenOpts): string {
  const an = o.an;
  const von = o.vermittler || o.name;
  const was = o.herkunft === "nachricht" ? a(an, "deine Nachricht", "Ihre Nachricht") : a(an, "deine Anfrage", "Ihre Anfrage");
  if (o.ohneLead) return `${erstGruss(an, o.kontakt)} danke für ${was}! Ich bin der digitale KI-Assistent von ${von} und helfe ${a(an, "dir", "Ihnen")} gern weiter.`;
  // v8 (Ole, 17.11.2026): „danke für Ihre Anfrage zum Privatschutz! Hier schreibt der digitale KI-Assistent von Herrn
  // Kannapinn.“ Das Thema wie in der Vorlage fest je Produkt; ohne Produkt mit dem Produktnamen, sonst ohne Thema. Im
  // Freitext mit „KI“ im Satz, weil die Fußzeile der Vorlage („KI-Assistent“) fehlt.
  // Reine Hausrat-Leads: „zu Ihrer Hausratversicherung“ (Ole, 18.11.2026, wie die Vorlage outreach_hausrat)
  const p = outreachProdukt(o.source);
  const s = (o.source ?? "").trim();
  const thema = p ? v8Thema(erstanschreibenZweck(o.source, o.formular) as ErstanschreibenZweck, an) : s ? ` zum Thema ${erstanschreibenThema(o.source)}` : "";
  return `${erstGruss(an, o.kontakt)} danke für ${was}${thema}! Hier schreibt der digitale KI-Assistent von ${von}.`;
}

/** Frage für schon gebuchte Leads, wenn das Formular alles beantwortet: „Gibt es vorab noch etwas, das Herr Kannapinn
 * für den Termin wissen sollte?“ */
export function vorabFrage(an: Ansprache, wer: string): string {
  return a(an, `Gibt es vorab noch etwas, das ${wer} für den Termin wissen sollte?`, `Gibt es vorab noch etwas, das ${wer} für den Termin wissen sollte?`);
}

/**
 * Erste Frage des Erstanschreibens (Produkt bzw. allgemein: Telefonat), ohne Sternchen. Mit Formularangaben: die erste
 * noch offene Frage; beantwortet das Formular beide, gleich die Frage nach einem Videotermin.
 */
export function ersteFrage(
  source: string | null | undefined,
  an: Ansprache,
  name: string,
  formular?: FormAntwort[] | null,
  person?: { nom: string; dat: string } | null,
  opts: { gebucht?: boolean } = {},
): string {
  const p = outreachProdukt(source);
  if (p) {
    const offen = frageplan(source, formular).offen[0];
    if (offen) return a(an, offen.du, offen.sie);
    // Schon gebucht (z. B. Dankeseite des Meta-Formulars): nie nach einem Termin fragen (Ole, 18.11.2026); nach der
    // Antwort folgt der Komplettcheck (bot.ts, Strecke nach der Buchung)
    if (opts.gebucht) return vorabFrage(an, person?.nom ?? name);
    return terminFrage(an, person?.dat ?? name);
  }
  const wer = person?.nom ?? name;
  if (opts.gebucht) return vorabFrage(an, wer);
  return a(an, `Wann erreicht ${wer} dich am besten für ein kurzes Telefonat?`, `Wann erreicht ${wer} Sie am besten für ein kurzes Telefonat?`);
}

/**
 * Parameter der v6-Vorlage nach dem Namen: [Thema, Vermittler im Dativ, erste offene Frage ohne „?“] (rein, testbar).
 * Die erste Frage folgt dem Frageplan mit den Formularangaben; ist alles beantwortet, die Frage nach dem Videotermin.
 */
export function erstanschreibenV6Params(o: { source: string | null | undefined; an: Ansprache; formular?: FormAntwort[] | null; person: { nom: string; dat: string }; kurz: string; gebucht?: boolean }): [string, string, string] {
  return [erstanschreibenThema(o.source), o.person.dat, frageOhneFragezeichen(ersteFrage(o.source, o.an, o.kurz, o.formular, o.person, { gebucht: o.gebucht }))];
}

/**
 * Parameter der v9-Vorlage nach dem Namen (rein, testbar): [erste offene Frage ohne „?“]; Tierkrankenversicherung
 * [Tier (Name bzw. „Ihre Katze“), erste offene Frage ohne „?“].
 */
export function erstanschreibenV9Params(o: {
  source: string | null | undefined;
  an: Ansprache;
  formular?: FormAntwort[] | null;
  person: { nom: string; dat: string };
  kurz: string;
  gebucht?: boolean;
  /** Zweck der gesendeten Vorlage (Rückfall auf die allgemeine Fassung hat kein Tier-Platzhalter); ohne: der des Leads */
  purpose?: NoticePurpose;
}): string[] {
  const frage = frageOhneFragezeichen(ersteFrage(o.source, o.an, o.kurz, o.formular, o.person, { gebucht: o.gebucht }));
  return (o.purpose ?? erstanschreibenZweck(o.source, o.formular)) === "outreach_tkv" ? [tierFuerErstanschreiben(o.source, o.an, o.formular), frage] : [frage];
}

/** Parameter der v8-Vorlage nach dem Namen: [Vermittler im Dativ, erste offene Frage ohne „?“] (rein, testbar). */
export function erstanschreibenV8Params(o: { source: string | null | undefined; an: Ansprache; formular?: FormAntwort[] | null; person: { nom: string; dat: string }; kurz: string; gebucht?: boolean }): [string, string] {
  return [o.person.dat, frageOhneFragezeichen(ersteFrage(o.source, o.an, o.kurz, o.formular, o.person, { gebucht: o.gebucht }))];
}

/**
 * Darf dieser Lead die feste Frage von v10/v11 bekommen (Ole, 19.11.2026, rein)? Nein, wenn das Formular genau diese
 * Frage schon beantwortet (dann v9 mit der ersten offenen Frage als Platzhalter), bei der allgemeinen Fassung auch nicht,
 * wenn schon ein Termin gebucht ist (v9 fragt dann, ob der Vermittler vorab etwas wissen sollte).
 */
export function v10Moeglich(source: string | null | undefined, formular?: FormAntwort[] | null, opts: { gebucht?: boolean } = {}): boolean {
  const zweck = erstanschreibenZweck(source, formular) as ErstanschreibenZweck;
  const def = ERSTANSCHREIBEN_V10[zweck];
  if (!def) return false;
  if (!def.planKey) return !opts.gebucht;
  const f = frageplan(source, formular).fragen.find((x) => x.key === def.planKey);
  return !!f && !f.bekannt;
}

/** Parameter der v10/v11-Vorlage nach dem Namen (rein, testbar): TKV [Tier], sonst keine. */
export function erstanschreibenV10Params(o: { source: string | null | undefined; an: Ansprache; formular?: FormAntwort[] | null; purpose: NoticePurpose }): string[] {
  return o.purpose === "outreach_tkv" ? [tierFuerErstanschreiben(o.source, o.an, o.formular)] : [];
}

/**
 * Knöpfe zur ersten Frage im Freitext: ab v10 die Knöpfe der festen Frage (Ole, 19.11.2026), sonst nur bei Frage 1 des
 * Produkts bzw. der Telefonatsfrage, sonst keine.
 */
export function ersteFrageKnoepfe(source: string | null | undefined, formular?: FormAntwort[] | null, opts: { gebucht?: boolean; herkunft?: Herkunft } = {}): string[] {
  // Lead hat zuerst geschrieben: Kopf mit der Frage des Plans wie bisher (erstanschreibenText), dazu die bisherigen Knöpfe
  if (opts.herkunft !== "nachricht" && v10Moeglich(source, formular, opts)) return [...ERSTANSCHREIBEN_V10[erstanschreibenZweck(source, formular) as ErstanschreibenZweck].knoepfe];
  const p = outreachProdukt(source);
  if (!p) return opts.gebucht ? [] : [...OUTREACH_ALLGEMEIN.knoepfe];
  return frageplan(source, formular).offen[0]?.key === "frage1" ? [...p.knoepfe] : [];
}

/**
 * Nachricht 1 des Erstanschreibens (Freitext im offenen Fenster), z. B.
 *   Hallo Herr Müller, danke für Ihre Anfrage zum Privatschutz! Hier schreibt der digitale KI-Assistent von Herrn Kannapinn.
 *
 *   *Sind Haftpflicht und Hausrat schon versichert, oder wäre beides neu?*
 * (Aufbau wie v8, erstanschreibenV8.)
 * Nachricht 2 ist das PDF der Erstinformation (lib/whatsapp/erstinfo-pdf.ts).
 */
export function erstanschreibenText(o: ErstanschreibenOpts, opts: { ohneFuss?: boolean } = {}): string {
  const person = o.vermittler ? { nom: o.vermittlerNom || o.vermittler, dat: o.vermittler } : null;
  const frage = frageOhneFragezeichen(ersteFrage(o.source, o.an, o.name, o.formular, person, { gebucht: o.gebucht }));
  // Lead hat zuerst geschrieben bzw. kein Lead: wie bisher mit Kopf und Frage darunter (v8)
  if (o.ohneLead || o.herkunft === "nachricht") return `${erstanschreibenKopf(o)}\n\n*${frage}?*`;
  const an = o.an;
  const zweck = erstanschreibenZweck(o.source, o.formular);
  // v10/v11 (Ole, 19.11.2026): derselbe Text wie die Vorlage der zugeteilten Fassung, mit denselben Knöpfen
  // (ersteFrageKnoepfe); darunter kursiv nur „KI-Assistent“, das PDF folgt als eigene Nachricht
  if (v10Moeglich(o.source, o.formular, { gebucht: o.gebucht })) {
    const body = ERSTANSCHREIBEN_V10[zweck as ErstanschreibenZweck][o.variant === "b" ? "b" : "a"][an];
    const text = `${erstGruss(an, o.kontakt)} ${body.replace("{{2}}", erstanschreibenV10Params({ source: o.source, an, formular: o.formular, purpose: zweck })[0] ?? "")}`;
    return opts.ohneFuss ? text : `${text}\n\n_${ERSTANSCHREIBEN_V10_FREITEXT_FUSS}_`;
  }
  // v9 (Ole, 18.11.2026): wie die Vorlage, eine Zeile ohne Vermittler; die KI-Kennzeichnung der Fußzeile steht im
  // Freitext kursiv darunter. Tierkrankenversicherung: „schön, dass Sie Minka gut absichern möchten 🐾“
  const p = outreachProdukt(o.source);
  const s = (o.source ?? "").trim();
  const thema = p ? v8Thema(zweck as ErstanschreibenZweck, an) : s ? ` zum Thema ${erstanschreibenThema(o.source)}` : "";
  const text =
    zweck === "outreach_tkv"
      ? `${erstGruss(an, o.kontakt)} schön, dass ${a(an, "du", "Sie")} ${tierFuerErstanschreiben(o.source, an, o.formular)} gut absichern ${a(an, "möchtest", "möchten")} 🐾 *${frage}?*`
      : `${erstGruss(an, o.kontakt)} danke für ${a(an, "deine Anfrage", "Ihre Anfrage")}${thema}! *${frage}?*`;
  return opts.ohneFuss ? text : `${text}\n\n_${ERSTANSCHREIBEN_FREITEXT_FUSS}_`;
}

/** Fußzeile der Vorlage ab Erstanschreiben v9 (Ole, 18.11.2026): KI-Kennzeichnung und PDF-Hinweis, höchstens 60 Zeichen. */
export const ERSTINFO_FOOTER_V9 = "KI-Assistent · Erstinformation im PDF oben";

/** KI-Kennzeichnung unter dem Erstanschreiben im Freitext (ohne Vorlagen-Fußzeile; das PDF folgt als eigene Nachricht). */
export const ERSTANSCHREIBEN_FREITEXT_FUSS = "KI-Assistent · Erstinformation folgt als PDF";

/**
 * Fußzeile der Vorlage ab Erstanschreiben v10 (Ole, 19.11.2026; Recht: der Hinweis auf die Erstinformation entfällt,
 * die KI-Kennzeichnung bleibt). Das PDF steht weiter im Kopf.
 */
export const ERSTINFO_FOOTER_V10 = "KI-Assistent";

/** KI-Kennzeichnung unter dem Erstanschreiben v10/v11 im Freitext (wie die Fußzeile der Vorlage). */
export const ERSTANSCHREIBEN_V10_FREITEXT_FUSS = ERSTINFO_FOOTER_V10;

/** Fußzeile, die zum Erstanschreiben dieses Leads gehört (Vorschau): v10 „KI-Assistent“, sonst die der v9. */
export function erstanschreibenFusszeile(source: string | null | undefined, formular?: FormAntwort[] | null, opts: { gebucht?: boolean } = {}): string {
  return v10Moeglich(source, formular, opts) ? ERSTINFO_FOOTER_V10 : ERSTINFO_FOOTER_V9;
}

/** Knöpfe der bei Meta noch freigegebenen v4 (Zahnzusatz), Antworten darauf gelten als dieselbe Frage 1. */
export const ZAHN_KNOEPFE_V4 = ["Zahnersatz", "Prophylaxe", "Beides"] as const;

const ZAHN_NEUTRAL: Record<string, string> = {
  zahnersatz: "Tarif mit starkem Zahnersatz-Baustein",
  "starker zahnersatz": "Tarif mit starkem Zahnersatz-Baustein",
  prophylaxe: "Tarif mit Zahnreinigung",
  "mit zahnreinigung": "Tarif mit Zahnreinigung",
  beides: "Beides vergleichen",
  "beides vergleichen": "Beides vergleichen",
};

/**
 * Antwort auf Frage 1 bei Zahnzusatz neutral als Produktinteresse speichern (Art. 9 DSGVO): „Zahnersatz“ wird zu
 * „Tarif mit starkem Zahnersatz-Baustein“ usw. Gilt für alle Felder, in denen die KI die Knopfantwort ablegt.
 * Andere Angaben bleiben unverändert (rein, testbar).
 */
export function neutralZahnAngaben(angaben: unknown): unknown {
  if (!angaben || typeof angaben !== "object" || Array.isArray(angaben)) return angaben;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(angaben as Record<string, unknown>)) {
    const n = typeof v === "string" ? ZAHN_NEUTRAL[v.trim().toLowerCase().replace(/[.!]+$/, "")] : undefined;
    out[n && (k === "interesse" || k === "bedarf") ? "tarifwunsch" : k] = n ?? v;
  }
  return out;
}

/** Ist der Lead ein Zahnzusatz-Lead (Erstanschreiben outreach_zahn)? */
export function istZahnLead(source: string | null | undefined): boolean {
  return outreachProdukt(source)?.purpose === "outreach_zahn";
}
