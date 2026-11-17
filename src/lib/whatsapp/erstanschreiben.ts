// Erstanschreiben je Produkt (Ole, 15.11.2026): keine Erlaubnisfrage, kein „Später“, sondern direkt eine erste,
// leichte Frage mit Knöpfen. Welche Vorlage ein Lead bekommt, ergibt sich aus dem Produkt im Leadformular
// (Lead.source). Der Assistent (bot.ts) nimmt die Antwort per Knopf als Antwort auf Frage 1 und stellt dann Frage 2,
// danach bietet er Termine an. Rein, ohne Datenbank.
//
// Neu aufgebaut (Ole, 16.11.2026, conversion-optimiert): genau EINE Begrüßung, Dank mit Produkt, ein Satz Nutzen mit
// der KI-Kennzeichnung („digitaler KI-Assistent“, KI-VO Art. 50), dann die erste Frage als letzte Zeile (ab v7 nicht fett).
// Kein „Mensch“-Angebot und kein „berate nicht zu Tarifen“ in der ersten Nachricht: beides regelt der Assistent im
// Gespräch (bot.ts). Name: Vorname des Vermittlers laut Profil, sonst der Agenturname, höchstens zweimal.
// Die Erstinformation folgt direkt danach als PDF-Dokument (lib/whatsapp/erstinfo-pdf.ts).
//
// v6 (Ole, 17.11.2026, ERSTANSCHREIBEN_V6): eine Fassung für alle Produkte, die erste Frage ist ein Platzhalter, damit
// nichts gefragt wird, was das Formular schon beantwortet; beantwortet es alles, die Frage nach dem Videotermin. Der
// Vermittler steht als Person im Dativ („von Herrn Kannapinn“). Das „?“ und das Fett-Sternchen stehen fest hinter dem
// Platzhalter (Meta: kein Platzhalter am Ende), die Frage geht ohne „?“ in den Platzhalter (frageOhneFragezeichen).
//
// v7 (Ole, 17.11.2026): gleicher Text, die erste Frage aber NICHT mehr fett (ohne Sternchen), in Vorlage und Freitext.
// v6 bleibt bei Meta freigegeben und wird gesendet, bis v7 freigegeben ist (templates.ts rankOutreach).

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
  outreach_tkv: { frage1: /geburtsjahr|^alter\b|alter \(tier\)|alter des tieres/i },
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

/** Frage im Erstanschreiben, die nicht im Plan steht: ältere TKV-Frage bzw. Frage nach dem Videotermin. */
type SonstigeFrage = { key: "tier_v4" | "termin"; sie: string; du: string; feld: string; bekannt: null };

export type Frageplan = {
  produkt: OutreachProdukt | null;
  /** Alle Fragen des Produkts vor dem Termin, mit bekannter Antwort aus dem Formular */
  fragen: PlanFrage[];
  /** Die Frage, die unser Erstanschreiben gestellt hat (auch wenn das Formular sie schon beantwortet), sonst null */
  gestellt: PlanFrage | SonstigeFrage | null;
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

/** „Sind Haftpflicht und Hausrat schon irgendwo versichert, oder wäre beides neu?“ (Ole, 17.11.2026). */
export function vorhandenFrage(interesse: string | null): { sie: string; du: string } {
  const w = spartenWoerter(interesse);
  if (w.length >= 2) {
    const liste = `${w.slice(0, -1).join(", ")} und ${w.at(-1)}`;
    const t = `Sind ${liste} schon irgendwo versichert, oder wäre ${w.length === 2 ? "beides" : "alles"} neu?`;
    return { sie: t, du: t };
  }
  if (w.length === 1) return { sie: `Sind Sie bei ${w[0]} schon irgendwo versichert, oder wäre es neu?`, du: `Bist du bei ${w[0]} schon irgendwo versichert, oder wäre es neu?` };
  return { sie: "Sind Sie dafür schon irgendwo versichert, oder wäre es neu?", du: "Bist du dafür schon irgendwo versichert, oder wäre es neu?" };
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
  if (!p) return { produkt: null, fragen: [], gestellt: termin, offen: [] };
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
    const v = vorhandenFrage((formular ?? []).find((x) => /versicherungsinteresse/i.test(x.label))?.value ?? null);
    fragen.push({ key: "vorhanden", feld: "vorhanden", sie: v.sie, du: v.du, bekannt: find(BEKANNT_VORHANDEN) });
  }
  const istIn = (f: { sie: string; du: string }) => !!gesendet && (gesendet.includes(f.sie) || gesendet.includes(f.du));
  const gestellt: PlanFrage | SonstigeFrage | null =
    p.purpose === "outreach_tkv" && gesendet.includes(TKV_V4.frage1)
      ? { key: "tier_v4", sie: TKV_V4.frage1, du: TKV_V4.frage1, feld: "tier", bekannt: null }
      : (fragen.find(istIn) ?? termin);
  const rest = Math.max(0, MAX_FRAGEN_VOR_TERMIN - (gestellt ? 1 : 0));
  const offen = gestellt?.key === "termin" ? [] : fragen.filter((f) => !f.bekannt && f !== gestellt).slice(0, rest);
  return { produkt: p, fragen, gestellt, offen };
}

/** Prompt-Regel: Formularangaben gelten als beantwortet, kurz bestätigen statt abfragen (Ole, 17.11.2026). */
export function formularRegel(an: Ansprache): string {
  return [
    "Angaben aus dem Leadformular gelten als beantwortet, auch Mehrfachauswahl (z. B. „Haftpflicht, Hausrat“ heißt: beides).",
    `- Greif sie höchstens einmal kurz und natürlich auf (z. B. ${a(an, "„Haftpflicht und Hausrat für deine Familie, alles klar.“", "„Haftpflicht und Hausrat für Ihre Familie, alles klar.“")}) und frag sie nicht erneut ab, auch nicht umformuliert.`,
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
  opts: { gesendet?: string | null; jetzt?: boolean; an?: Ansprache; formular?: FormAntwort[] | null } = {},
): string {
  const an = opts.an ?? "sie";
  const plan = frageplan(source, opts.formular, { gesendet: opts.jetzt ? null : opts.gesendet });
  const p = plan.produkt;
  const termine = "setze qualifiziert=true und mach sofort den Terminvorschlag (siehe „Terminvorschlag“).";
  if (!p) {
    if (opts.jetzt) return "";
    if (plan.gestellt?.key === "termin") return `Erste Frage (stand schon in unserer ersten WhatsApp): „${terminFrage(an, advisorName)}“.\n- Sagt der Lead ja oder nennt er einen Tag: ${termine}`;
    return [
      `Erste Frage (stand schon in unserer ersten WhatsApp): „Wann erreicht ${advisorName} Sie am besten für ein kurzes Telefonat?“ mit den Knöpfen ${OUTREACH_ALLGEMEIN.knoepfe.map((k) => `„${k}“`).join(", ")}.`,
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
    const knoepfe: readonly string[] = g.key === "tier_v4" ? TKV_V4.knoepfe : g.key === "frage1" ? p.knoepfe : [];
    const frage = g.key === "termin" ? terminFrage(an, advisorName) : text(g);
    lines.push(
      `- Unsere erste WhatsApp hat gefragt: „${frage}“${knoepfe.length ? ` (Knöpfe ${knoepfe.map((k) => `„${k}“`).join(", ")})` : ""}. Die nächste Nachricht des Leads (per Knopf oder frei) ist die Antwort darauf: mit record_qualification festhalten (angaben.${g.feld}), kurz bestätigen, nicht erneut fragen.`,
    );
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
    if (plan.offen[1]) lines.push(`- Dann genau noch diese Frage: „${text(plan.offen[1])}“ (angaben.${plan.offen[1].feld}${plan.offen[1].hinweis ? `; ${plan.offen[1].hinweis}` : ""}).`);
  } else if (plan.offen.length) {
    lines.push(`- Danach noch ${plan.offen.length === 1 ? "genau diese Frage" : "genau diese Fragen, je eine pro Nachricht"}: ${plan.offen.map((f) => `„${text(f)}“ (angaben.${f.feld}${f.hinweis ? `; ${f.hinweis}` : ""})`).join(", dann ")}. Sonst nichts fragen.`);
  } else {
    lines.push("- Weitere Fragen vor dem Termin gibt es nicht.");
  }
  lines.push(`- Danach ${termine}`);
  return [...lines, ...zahn].join("\n");
}

/**
 * Enthält eine Nachricht von uns die erste Frage des Produkts (Frage 1, Frage 2 oder die Terminfrage)? Für Chats, in
 * denen der Lead zuerst geschrieben hat: Dort stellt der Assistent die Frage selbst, ohne Erstanschreiben-Vorlage.
 */
export function enthaeltErsteFrage(text: string | null | undefined, source: string | null | undefined): boolean {
  const p = outreachProdukt(source);
  if (!p || !text) return false;
  return [p.frage1, p.frage1Du, p.frage2Sie, p.frage2Du].some((f) => text.includes(f)) || /schon irgendwo versichert, oder wäre/.test(text) || /Videotermin mit .+ in den nächsten Tagen\?/.test(text);
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
export function erstanschreibenKopf(o: ErstanschreibenOpts, opts: { themaImmer?: boolean } = {}): string {
  const an = o.an;
  const von = o.vermittler || o.name;
  const was = o.herkunft === "nachricht" ? a(an, "deine Nachricht", "Ihre Nachricht") : a(an, "deine Anfrage", "Ihre Anfrage");
  // v6: „danke für Ihre Anfrage zum Thema Privatschutz! Ich bin der digitale KI-Assistent von Herrn Kannapinn.“
  if (o.ohneLead) return `${erstGruss(an, o.kontakt)} danke für ${was}! Ich bin der digitale KI-Assistent von ${von} und helfe ${a(an, "dir", "Ihnen")} gern weiter.`;
  // Ohne Produkt nur im Erstanschreiben „zum Thema Versicherung“ (gleich der Vorlage), in der ersten Antwort ohne Thema
  const thema = opts.themaImmer || (o.source ?? "").trim() ? ` zum Thema ${erstanschreibenThema(o.source)}` : "";
  return `${erstGruss(an, o.kontakt)} danke für ${was}${thema}! Ich bin der digitale KI-Assistent von ${von}.`;
}

/**
 * Erste Frage des Erstanschreibens (Produkt bzw. allgemein: Telefonat), ohne Sternchen. Mit Formularangaben: die erste
 * noch offene Frage; beantwortet das Formular beide, gleich die Frage nach einem Videotermin.
 */
export function ersteFrage(source: string | null | undefined, an: Ansprache, name: string, formular?: FormAntwort[] | null, person?: { nom: string; dat: string } | null): string {
  const p = outreachProdukt(source);
  if (p) {
    const offen = frageplan(source, formular).offen[0];
    return offen ? a(an, offen.du, offen.sie) : terminFrage(an, person?.dat ?? name);
  }
  const wer = person?.nom ?? name;
  return a(an, `Wann erreicht ${wer} dich am besten für ein kurzes Telefonat?`, `Wann erreicht ${wer} Sie am besten für ein kurzes Telefonat?`);
}

/**
 * Parameter der v6-Vorlage nach dem Namen: [Thema, Vermittler im Dativ, erste offene Frage ohne „?“] (rein, testbar).
 * Die erste Frage folgt dem Frageplan mit den Formularangaben; ist alles beantwortet, die Frage nach dem Videotermin.
 */
export function erstanschreibenV6Params(o: { source: string | null | undefined; an: Ansprache; formular?: FormAntwort[] | null; person: { nom: string; dat: string }; kurz: string }): [string, string, string] {
  return [erstanschreibenThema(o.source), o.person.dat, frageOhneFragezeichen(ersteFrage(o.source, o.an, o.kurz, o.formular, o.person))];
}

/** Knöpfe zur ersten Frage im Freitext: nur bei Frage 1 des Produkts bzw. der Telefonatsfrage, sonst keine. */
export function ersteFrageKnoepfe(source: string | null | undefined, formular?: FormAntwort[] | null): string[] {
  const p = outreachProdukt(source);
  if (!p) return [...OUTREACH_ALLGEMEIN.knoepfe];
  return frageplan(source, formular).offen[0]?.key === "frage1" ? [...p.knoepfe] : [];
}

/**
 * Nachricht 1 des Erstanschreibens (Freitext im offenen Fenster), z. B.
 *   Hallo Herr Müller, danke für Ihre Anfrage zum Thema Katzenversicherung! Ich bin der digitale KI-Assistent von Herrn Kannapinn.
 *
 *   Wie alt ist Ihre Katze?
 * (Aufbau wie ERSTANSCHREIBEN_V7.)
 * Nachricht 2 ist das PDF der Erstinformation (lib/whatsapp/erstinfo-pdf.ts).
 */
export function erstanschreibenText(o: ErstanschreibenOpts): string {
  const person = o.vermittler ? { nom: o.vermittlerNom || o.vermittler, dat: o.vermittler } : null;
  const frage = frageOhneFragezeichen(ersteFrage(o.source, o.an, o.name, o.formular, person));
  // v7 (Ole, 17.11.2026): die erste Frage nicht fett
  return `${erstanschreibenKopf(o, { themaImmer: true })}\n\n${frage}?`;
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
