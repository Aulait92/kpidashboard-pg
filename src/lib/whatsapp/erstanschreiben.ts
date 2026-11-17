// Erstanschreiben je Produkt (Ole, 15.11.2026): keine Erlaubnisfrage, kein „Später“, sondern direkt eine erste,
// leichte Frage mit Knöpfen. Welche Vorlage ein Lead bekommt, ergibt sich aus dem Produkt im Leadformular
// (Lead.source). Der Assistent (bot.ts) nimmt die Antwort per Knopf als Antwort auf Frage 1 und stellt dann Frage 2,
// danach bietet er Termine an. Rein, ohne Datenbank.
//
// Neu aufgebaut (Ole, 16.11.2026, conversion-optimiert): genau EINE Begrüßung, Dank mit Produkt, ein Satz Nutzen mit
// der KI-Kennzeichnung („digitaler KI-Assistent“, KI-VO Art. 50), dann die erste Frage fett als letzte Zeile.
// Kein „Mensch“-Angebot und kein „berate nicht zu Tarifen“ in der ersten Nachricht: beides regelt der Assistent im
// Gespräch (bot.ts). Name: Vorname des Vermittlers laut Profil, sonst der Agenturname, höchstens zweimal.
// Die Erstinformation folgt direkt danach als PDF-Dokument (lib/whatsapp/erstinfo-pdf.ts).

import { displayProduct } from "@/lib/products";
import { a, anredeName, type AnredeKontakt, type Ansprache } from "@/lib/ansprache";
import type { NoticePurpose } from "@/lib/whatsapp/templates";

export type OutreachProdukt = {
  purpose: NoticePurpose;
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
  /** Feld in record_qualification für die Antwort auf Frage 1. */
  feld1: string;
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
      produkt,
      praep: "zur",
      frage1: `Wie alt ist ${tierWort(tier, "sie")}?`,
      frage1Du: `Wie alt ist ${tierWort(tier, "du")}?`,
      knoepfe: [],
      frage2: "Soll vor allem eine Operation abgesichert sein, oder auch die normale Tierarztbehandlung? (angaben.tarifwunsch, neutral fragen, nichts empfehlen)",
      frage2Sie: "Soll vor allem eine Operation abgesichert sein, oder auch die normale Tierarztbehandlung?",
      frage2Du: "Soll vor allem eine Operation abgesichert sein, oder auch die normale Tierarztbehandlung?",
      feld1: "tier",
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
    };
  }
  if (PKV.test(s) && !/kinderwunsch/i.test(s)) {
    return {
      purpose: "outreach_pkv",
      produkt: "privaten Krankenversicherung",
      praep: "zur",
      frage1: "Wie sind Sie aktuell beruflich aufgestellt?",
      frage1Du: "Wie bist du aktuell beruflich aufgestellt?",
      knoepfe: ["Angestellt", "Selbstständig", "Beamter"],
      frage2: "Sind Sie aktuell gesetzlich oder schon privat krankenversichert? (angaben.vorhanden)",
      frage2Sie: "Sind Sie aktuell gesetzlich oder schon privat krankenversichert?",
      frage2Du: "Bist du aktuell gesetzlich oder schon privat krankenversichert?",
      feld1: "beruf",
    };
  }
  if (PRIVATSCHUTZ.test(s) && !/tier|hund|katze|pferd/i.test(s)) {
    return {
      purpose: "outreach_privatschutz",
      produkt: /privatschutz/i.test(s) ? "Privatschutz" : displayProduct(s),
      praep: "zum Thema",
      frage1: "Worum geht es Ihnen vor allem?",
      frage1Du: "Worum geht es dir vor allem?",
      knoepfe: ["Haftpflicht", "Hausrat", "Mehreres"],
      frage2: "Wer soll versichert werden: nur Sie, mit Partner oder die ganze Familie? (angaben.versichern; bei „Mehreres“ vorher kurz, welche Bereiche)",
      frage2Sie: "Wer soll versichert werden: nur Sie, mit Partner oder die ganze Familie?",
      frage2Du: "Wer soll versichert werden: nur du, mit Partner oder die ganze Familie?",
      feld1: "interesse",
      emoji: "🏠",
    };
  }
  return null;
}

export type FormAntwort = { label: string; value: string };

/** Welche Formularfelder beantworten Frage 1 bzw. 2 schon (Feldnamen wie lib/ppl/perspective.ts und Meta-Formulare)? */
const BEKANNT: Partial<Record<NoticePurpose, { frage1?: RegExp; frage2?: RegExp }>> = {
  outreach_tkv: { frage1: /geburtsjahr|^alter\b|alter \(tier\)|alter des tieres/i },
  outreach_pkv: { frage1: /^situation\b|berufliche situation|^beruf\b/i, frage2: /gesetzlich oder privat|wie lange in pkv|aktuelle versicherung/i },
  outreach_privatschutz: { frage1: /versicherungsinteresse/i, frage2: /lebenssituation/i },
};

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

/** Frage nach dem Termin, wenn das Formular Frage 1 und 2 schon beantwortet (Video zuerst, Ole 16.11.2026). */
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

/**
 * Prompt-Block für den Assistenten: Die erste Frage stand schon im Erstanschreiben, eine Antwort per Knopf (oder
 * frei) ist die Antwort auf Frage 1. Danach Frage 2, dann Termine.
 *   opts.gesendet: Text des tatsächlich gesendeten Erstanschreibens (ältere Vorlage v4 hatte bei Tieren eine andere Frage)
 *   opts.jetzt: Der Lead hat zuerst geschrieben, Frage 1 wurde noch nicht gestellt: jetzt am Ende stellen (fett)
 */
export function ersteFrageRegel(
  source: string | null | undefined,
  advisorName: string,
  opts: { gesendet?: string | null; jetzt?: boolean; an?: Ansprache; formular?: FormAntwort[] | null } = {},
): string {
  const an = opts.an ?? "sie";
  const p = outreachProdukt(source);
  if (!p) {
    if (opts.jetzt) return "";
    return [
      `Erste Frage (stand schon in unserer ersten WhatsApp): „Wann erreicht ${advisorName} Sie am besten für ein kurzes Telefonat?“ mit den Knöpfen ${OUTREACH_ALLGEMEIN.knoepfe.map((k) => `„${k}“`).join(", ")}.`,
      "- Antwortet der Lead „Heute“ oder „Morgen“ (Knopf oder frei): halte das als Wunsch fest (angaben.wunsch), hole mit get_available_slots freie Zeiten und biete zwei Zeiten an diesem Tag an (gibt es keine, die nächsten). Frag vor der Buchung, ob Telefon oder Video.",
      "- „Lieber schriftlich“: kein Problem, mach im Chat weiter: frag in einem Satz, worum es genau geht, und biete erst danach einen Termin an.",
    ].join("\n");
  }
  const bekannt = bekannteAntworten(p, opts.formular);
  const termine = "setze qualifiziert=true und biete direkt zwei konkrete Termine an (get_available_slots). Weitere Angaben fürs Angebot fragst du erst nach der Buchung ab.";
  const v4Tier = p.purpose === "outreach_tkv" && !!opts.gesendet && opts.gesendet.includes("Für welches Tier");
  const frage1 = v4Tier ? TKV_V4.frage1 : a(an, p.frage1Du, p.frage1);
  const frage2 = a(an, p.frage2Du, p.frage2Sie);
  const knoepfe: readonly string[] = v4Tier ? TKV_V4.knoepfe : p.knoepfe;
  const mitKnoepfen = knoepfe.length ? ` mit den Knöpfen ${knoepfe.map((k) => `„${k}“`).join(", ")}` : "";
  const zahn =
    p.purpose === "outreach_zahn"
      ? [
          `- Ältere Fassung derselben Frage hatte die Knöpfe ${ZAHN_KNOEPFE_V4.map((k) => `„${k}“`).join(", ")}: das ist die gleiche Antwort auf Frage 1 (gewünschter Tarifbaustein), kein Befund.`,
          "- Frag nie, ob der Lead selbst Zahnersatz, eine Behandlung oder eine Zahnreinigung braucht, und nie nach Befunden oder Beschwerden. Erzählt er von sich aus etwas zu seinen Zähnen, halte es nicht fest und sag: „Das klären wir am besten im Gespräch.“",
        ]
      : [];
  const ausFormular = [bekannt.frage1, bekannt.frage2].filter(Boolean).join("; ");
  const formHinweis = ausFormular ? [`- Aus dem Leadformular schon bekannt (nicht erneut fragen, höchstens kurz aufgreifen): ${ausFormular}.`] : [];
  // Welche Frage stand im Erstanschreiben? Der Freitext fragt, was das Formular noch offenlässt (erstanschreibenText).
  const gesendet = opts.gesendet ?? "";
  const stand2 = !!gesendet && !gesendet.includes(frage1) && gesendet.includes(frage2);
  const standTermin = !!gesendet && gesendet.includes("Videotermin") && !gesendet.includes(frage1) && !gesendet.includes(frage2);
  if (!opts.jetzt && (stand2 || standTermin)) {
    return [
      `Erste Frage (stand schon in unserer ersten WhatsApp): „${stand2 ? frage2 : terminFrage(an, advisorName)}“.`,
      ...formHinweis,
      ...zahn,
      stand2
        ? `- Die nächste Nachricht des Leads ist die Antwort darauf: mit record_qualification festhalten, kurz bestätigen und dann ${termine}`
        : `- Die nächste Nachricht des Leads ist die Antwort darauf. Sagt er ja oder nennt er eine Zeit: ${termine} Möchte er lieber telefonieren, ist das genauso gut.`,
    ].join("\n");
  }
  if (opts.jetzt) {
    // Der Lead hat zuerst geschrieben: die erste noch offene Frage stellen, sonst direkt Termine
    const offen = !bekannt.frage1 ? frage1 : !bekannt.frage2 ? frage2 : null;
    if (!offen) return [...formHinweis, ...zahn, `- Frage 1 und 2 beantwortet das Formular schon. Beantworte kurz, was der Lead geschrieben hat, dann ${termine}`].join("\n");
    return [
      `Erste Frage: „${offen}“. Der Lead hat zuerst geschrieben, die Frage wurde noch nicht gestellt. Beantworte kurz, was er geschrieben hat (falls nötig), und schließe deine Antwort mit genau dieser Frage als eigener letzter Zeile, fett mit Sternchen: *${offen}*`,
      ...formHinweis,
      `- Die nächste Nachricht des Leads ist dann die Antwort darauf: mit record_qualification festhalten${offen === frage1 ? ` (angaben.${p.feld1})` : ""} und kurz bestätigen.`,
      ...zahn,
      offen === frage1 && !bekannt.frage2 ? `- Dann Frage 2: ${p.frage2}` : "",
      `- Danach ${termine}`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    `Erste Frage (stand schon in unserer ersten WhatsApp): „${frage1}“${mitKnoepfen}.`,
    `- Die nächste Nachricht des Leads (${knoepfe.length ? `per Knopf oder frei, z. B. „${knoepfe[0]}“` : "frei, z. B. „3 Jahre“"}) ist die Antwort auf diese Frage 1: nicht erneut fragen, sondern mit record_qualification festhalten (angaben.${p.feld1}) und kurz bestätigen.`,
    ...formHinweis,
    ...zahn,
    bekannt.frage2
      ? `- Frage 2 („${frage2}“) beantwortet das Formular schon (${bekannt.frage2}): nicht fragen. Nach der Antwort auf Frage 1 ${termine}`
      : `- Dann Frage 2: ${p.frage2}\n- Nach Frage 2 ${termine}`,
  ].join("\n");
}

/**
 * Enthält eine Nachricht von uns die erste Frage des Produkts (Frage 1, Frage 2 oder die Terminfrage)? Für Chats, in
 * denen der Lead zuerst geschrieben hat: Dort stellt der Assistent die Frage selbst, ohne Erstanschreiben-Vorlage.
 */
export function enthaeltErsteFrage(text: string | null | undefined, source: string | null | undefined): boolean {
  const p = outreachProdukt(source);
  if (!p || !text) return false;
  return [p.frage1, p.frage1Du, p.frage2Sie, p.frage2Du].some((f) => text.includes(f)) || /Videotermin mit .+ in den nächsten Tagen\?/.test(text);
}

/** Woher kommt der Kontakt? „anfrage“ = Leadformular (Meta, Funnel), „nachricht“ = hat uns zuerst per WhatsApp geschrieben. */
export type Herkunft = "anfrage" | "nachricht";

export type ErstanschreibenOpts = {
  an: Ansprache;
  /** Name und Anrede des Leads */
  kontakt?: AnredeKontakt | null;
  /** Vorname des Vermittlers laut Profil, sonst Agenturname (kurzNameFuerLeads) */
  name: string;
  /** Produkt aus dem Leadformular (Lead.source) */
  source?: string | null;
  herkunft?: Herkunft;
  /** Ohne Lead (neuer Kontakt, Bestandskunde): allgemeiner Nutzen-Satz statt Termin */
  ohneLead?: boolean;
  /** Angaben aus dem Leadformular: was schon bekannt ist, wird nicht gefragt (nur Freitext, die Vorlagen sind fest). */
  formular?: FormAntwort[] | null;
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
  const p = outreachProdukt(o.source);
  const an = o.an;
  const was = o.herkunft === "nachricht" ? a(an, "deine Nachricht", "Ihre Nachricht") : a(an, "deine Anfrage", "Ihre Anfrage");
  const dank = p ? `danke für ${was} ${p.praep} ${p.produkt}!${p.emoji ? ` ${p.emoji}` : ""}` : `danke für ${was}!`;
  const nutzen = p
    ? `Ich bin der digitale KI-Assistent von ${o.name} und kläre kurz zwei, drei Fragen, damit ${o.name} ${a(an, "dir", "Ihnen")} ein passendes Angebot machen kann.`
    : o.ohneLead
      ? `Ich bin der digitale KI-Assistent von ${o.name} und helfe ${a(an, "dir", "Ihnen")} gern weiter.`
      : `Ich bin der digitale KI-Assistent von ${o.name} und helfe ${a(an, "dir", "Ihnen")}, schnell einen passenden Gesprächstermin zu finden.`;
  return `${erstGruss(an, o.kontakt)} ${dank}\n${nutzen}`;
}

/**
 * Erste Frage des Erstanschreibens (Produkt bzw. allgemein: Telefonat), ohne Sternchen. Mit Formularangaben: die erste
 * noch offene Frage; beantwortet das Formular beide, gleich die Frage nach einem Videotermin.
 */
export function ersteFrage(source: string | null | undefined, an: Ansprache, name: string, formular?: FormAntwort[] | null): string {
  const p = outreachProdukt(source);
  if (p) {
    const bekannt = bekannteAntworten(p, formular);
    if (!bekannt.frage1) return a(an, p.frage1Du, p.frage1);
    if (!bekannt.frage2) return a(an, p.frage2Du, p.frage2Sie);
    return terminFrage(an, name);
  }
  return a(an, `Wann erreicht ${name} dich am besten für ein kurzes Telefonat?`, `Wann erreicht ${name} Sie am besten für ein kurzes Telefonat?`);
}

/**
 * Nachricht 1 des Erstanschreibens (Freitext im offenen Fenster), z. B.
 *   Hallo Herr Müller, danke für Ihre Anfrage zur Katzenversicherung! 🐱
 *   Ich bin der digitale KI-Assistent von Ole und kläre kurz zwei, drei Fragen, damit Ole Ihnen ein passendes Angebot machen kann.
 *
 *   *Wie alt ist Ihre Katze?*
 * Nachricht 2 ist das PDF der Erstinformation (lib/whatsapp/erstinfo-pdf.ts).
 */
export function erstanschreibenText(o: ErstanschreibenOpts): string {
  return `${erstanschreibenKopf(o)}\n\n*${ersteFrage(o.source, o.an, o.name, o.formular)}*`;
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
