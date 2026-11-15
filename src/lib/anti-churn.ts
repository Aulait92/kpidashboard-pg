// Anti-Churn beim Kündigen (Ole, 15.11.2026): Bevor die Kündigung bestätigt wird, fragt die App nach dem
// Hauptgrund und bietet dazu passende Alternativen an. „Trotzdem kündigen“ ist auf jedem Schritt mit einem Klick
// erreichbar und die Abfrage ist freiwillig (Vorbild § 312k BGB: keine Hürde vor der Kündigung).
// Seit 15.11.2026 (Ole freigegeben) mit echten Halteangeboten je Grund (lib/halteangebote.ts): Rabatt mit Mindestlaufzeit,
// Kampagnen-Neustart mit Betreuungsmonat, Neuausrichtung mit Gutschrift-Prüfung, Spartenwechsel, Pause ohne Kosten,
// Einrichtung per Bildschirmfreigabe, Paket „Nur Bestand“. Rabatte höchstens einmal in 12 Monaten und erst ab
// 3 Monaten Kundendauer; jedes Angebot ist im Admin abschaltbar.
// Reine Logik (auch im Client nutzbar); Speichern und Benachrichtigen in lib/anti-churn-server.ts und
// lib/halteangebote-server.ts.

export type ChurnReason =
  | "zu_wenig_leads"
  | "leads_passen_nicht"
  | "zu_wenig_abschluesse"
  | "zu_teuer"
  | "keine_zeit"
  | "app_passt_nicht"
  | "aufhoeren"
  | "anderes";

/** Halteangebote mit Wirkung (Aufgabe, Stripe, Pause), angenommen über lib/halteangebote-server.ts */
export const HALTE_KINDS = ["rabatt", "neustart", "neuausrichtung", "produktwechsel", "pause_gratis", "einrichtung", "nur_bestand"] as const;
export type HalteKind = (typeof HALTE_KINDS)[number];
export const isHalteKind = (v: unknown): v is HalteKind => typeof v === "string" && (HALTE_KINDS as readonly string[]).includes(v);

export type ChurnOffer = "pause" | "budget" | "module" | "termin" | "check" | "rueckruf" | HalteKind;

/** Feste Texte. Halteangebote haben Texte mit Prozenten, Monaten und Preisen aus den Einstellungen (lib/halteangebote.ts). */
export const CHURN_OFFERS: Record<ChurnOffer, { title: string; text: string; cta: string; anchor?: string }> = {
  pause: {
    title: "Pausieren statt kündigen",
    text: "Anzeigen und Abrechnung ruhen für den gewählten Zeitraum, Ihre Kampagnen, Leads und Einstellungen bleiben erhalten. Danach geht es ohne neue Einrichtung weiter.",
    cta: "Pause planen",
    anchor: "pause",
  },
  budget: {
    title: "Kleineres Paket wählen",
    text: "Mit weniger Werbebudget gilt eine niedrigere Preisstufe. Sie passen es selbst an, die Änderung gilt ab dem nächsten möglichen Termin.",
    cta: "Paket anpassen",
    anchor: "budget",
  },
  module: {
    title: "Zusatzmodule beenden",
    text: "Sie behalten die Leadgenerierung und beenden nur Module, die Sie gerade nicht brauchen.",
    cta: "Zusatzmodule ansehen",
    anchor: "zusatzmodule",
  },
  termin: {
    title: "15 Minuten mit uns",
    text: "Kostenloser Video-Termin: Wir schauen gemeinsam auf Ihre Zahlen, Leads und das Nachfassen und zeigen, was sich schnell verbessern lässt.",
    cta: "Termin wählen",
  },
  check: {
    title: "Kampagnen-Check durch uns",
    text: "Wir prüfen Zielgruppe, Anzeigen und Formular Ihrer Kampagne und melden uns innerhalb von zwei Werktagen mit konkreten Änderungen.",
    cta: "Check anfordern",
  },
  rueckruf: {
    title: "Rückruf von uns",
    text: "Wir rufen Sie innerhalb eines Werktags an und suchen gemeinsam eine Lösung.",
    cta: "Rückruf anfordern",
  },
  rabatt: { title: "Nachlass auf die Monatsgebühr", text: "Nachlass auf die nächsten Monatsrechnungen, danach eine kurze Mindestlaufzeit.", cta: "Angebot annehmen" },
  neustart: { title: "Neustart Ihrer Kampagne", text: "Wir bauen Ihre Kampagne mit neuen Anzeigen und Zielgruppen neu auf.", cta: "Neustart anfordern" },
  neuausrichtung: { title: "Kostenlose Neuausrichtung", text: "Wir richten Ihre Kampagne neu aus: andere Sparte, andere Region oder angepasste Fragen im Formular.", cta: "Neuausrichtung anfordern" },
  produktwechsel: { title: "Kostenloser Wechsel der Sparte", text: "Wir stellen Ihre Kampagne kostenlos auf eine Sparte mit besserer Abschlussquote um.", cta: "Wechsel anfordern" },
  pause_gratis: { title: "Kostenlos pausieren", text: "Anzeigen und die gesamte Abrechnung ruhen, Ihre Daten bleiben erhalten.", cta: "Pause starten" },
  einrichtung: { title: "Wir richten die App für Sie ein", text: "Per Video mit Bildschirmfreigabe stellen wir die App gemeinsam so ein, wie Sie arbeiten.", cta: "Termin wählen" },
  nur_bestand: { title: "Paket „Nur Bestand“", text: "Daten und Bestandskunden-Modul behalten, ohne neue Leads und ohne Betreuung. Empfehlungen optional dazu.", cta: "Paket wählen" },
};

/** Was für den Kunden gerade möglich ist (Einstellungen, Rabatt-Regeln, Vertrag). Ohne Angabe: alles an, keine Rabatte. */
export type OffersContext = {
  hasModules?: boolean;
  canPause?: boolean;
  /** Rabatt-Angebote erlaubt (Kundendauer, höchstens einmal in 12 Monaten, keine Jahreszahlung) */
  discountOk?: boolean;
  /** Je Halteangebot an/aus (Admin → Einstellungen → Halteangebote); fehlt = aus */
  enabled?: Partial<Record<HalteKind | "budget", boolean>>;
  /** Paket „Nur Betreuung“: kein Paket „Nur Bestand“ (ohne Software) */
  service?: boolean;
  /** Bestandskunden-Modul für den Kunden sichtbar (lib/bestand/sichtbar.ts); false = kein Paket „Nur Bestand“ */
  bestandVisible?: boolean;
};

/** Passende Alternativen je Grund (Reihenfolge = Anzeige). Ohne Grund nur der Rückruf. */
export function offersFor(reason: ChurnReason | null, opts: OffersContext = {}): ChurnOffer[] {
  const on = (k: HalteKind | "budget") => (k === "budget" ? opts.enabled?.budget !== false : opts.enabled?.[k] === true);
  const pick = (...xs: (ChurnOffer | false | null | undefined)[]) => xs.filter((x): x is ChurnOffer => !!x);
  const canPause = opts.canPause !== false;
  let list: ChurnOffer[];
  switch (reason) {
    case "zu_teuer":
      list = pick(on("rabatt") && opts.discountOk && "rabatt", on("budget") && "budget", opts.hasModules !== false && "module", canPause && "pause");
      break;
    case "zu_wenig_leads":
      list = pick(on("neustart") ? "neustart" : "check", "termin");
      break;
    case "leads_passen_nicht":
      list = pick(on("neuausrichtung") ? "neuausrichtung" : "check", "termin");
      break;
    // Kein Coaching (Ole, 15.11.2026): stattdessen Wechsel auf eine Sparte mit besserer Abschlussquote
    case "zu_wenig_abschluesse":
      list = pick(on("produktwechsel") && "produktwechsel", "rueckruf");
      break;
    case "keine_zeit":
      list = pick(canPause && (on("pause_gratis") && opts.discountOk ? "pause_gratis" : "pause"), "rueckruf");
      break;
    case "app_passt_nicht":
      list = pick(on("einrichtung") ? "einrichtung" : "termin", "rueckruf");
      break;
    case "aufhoeren":
      list = pick(on("nur_bestand") && !opts.service && opts.bestandVisible !== false && "nur_bestand", "rueckruf");
      break;
    default:
      list = ["rueckruf"];
  }
  return list.length ? list : ["rueckruf"];
}

export const isChurnReason = (v: unknown): v is ChurnReason => CHURN_REASONS.some((r) => r.key === v);
export const isChurnOffer = (v: unknown): v is ChurnOffer => typeof v === "string" && v in CHURN_OFFERS;
export const churnReasonLabel = (v: string | null | undefined) => CHURN_REASONS.find((r) => r.key === v)?.label ?? "ohne Angabe";

export const CHURN_REASONS: { key: ChurnReason; label: string }[] = [
  { key: "zu_wenig_leads", label: "Zu wenige Leads" },
  { key: "leads_passen_nicht", label: "Die Leads passen nicht zu mir" },
  { key: "zu_wenig_abschluesse", label: "Zu wenige Abschlüsse aus den Leads" },
  { key: "zu_teuer", label: "Es ist mir zu teuer" },
  { key: "keine_zeit", label: "Gerade keine Zeit (Urlaub, Krankheit, volle Auftragslage)" },
  { key: "app_passt_nicht", label: "Die App passt nicht zu meiner Arbeitsweise" },
  { key: "aufhoeren", label: "Ich höre auf oder wechsle den Anbieter" },
  { key: "anderes", label: "Anderer Grund" },
];
