// Anti-Churn beim Kündigen (Ole, 15.11.2026): Bevor die Kündigung bestätigt wird, fragt die App nach dem
// Hauptgrund und bietet dazu passende Alternativen an (Pause, Budget, Zusatzmodule, 15-Minuten-Termin,
// Kampagnen-Check). „Trotzdem kündigen“ ist auf jedem Schritt mit einem Klick erreichbar und die Abfrage
// ist freiwillig (Vorbild § 312k BGB: keine Hürde vor der Kündigung). Keine Rabatte ohne Oles Freigabe.
// Reine Logik (auch im Client nutzbar); Speichern und Benachrichtigen in lib/anti-churn-server.ts.

export type ChurnReason =
  | "zu_wenig_leads"
  | "leads_passen_nicht"
  | "zu_wenig_abschluesse"
  | "zu_teuer"
  | "keine_zeit"
  | "app_passt_nicht"
  | "aufhoeren"
  | "anderes";

export type ChurnOffer = "pause" | "budget" | "module" | "termin" | "check" | "rueckruf";

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

export const CHURN_OFFERS: Record<ChurnOffer, { title: string; text: string; cta: string; anchor?: string }> = {
  pause: {
    title: "Pausieren statt kündigen",
    text: "Anzeigen und Abrechnung ruhen für den gewählten Zeitraum, Ihre Kampagnen, Leads und Einstellungen bleiben erhalten. Danach geht es ohne neue Einrichtung weiter.",
    cta: "Pause planen",
    anchor: "pause",
  },
  budget: {
    title: "Werbebudget senken",
    text: "Weniger Budget heißt weniger Kosten. Sie passen es selbst an, die Änderung gilt ab dem nächsten möglichen Termin.",
    cta: "Budget anpassen",
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
};

/** Passende Alternativen je Grund (Reihenfolge = Anzeige). Ohne Grund nur der Rückruf. */
export function offersFor(reason: ChurnReason | null, opts: { hasModules?: boolean; canPause?: boolean } = {}): ChurnOffer[] {
  const map: Record<ChurnReason, ChurnOffer[]> = {
    zu_wenig_leads: ["check", "termin"],
    leads_passen_nicht: ["check", "termin"],
    zu_wenig_abschluesse: ["termin", "rueckruf"],
    zu_teuer: ["budget", "module", "pause"],
    keine_zeit: ["pause", "rueckruf"],
    app_passt_nicht: ["termin", "rueckruf"],
    aufhoeren: ["rueckruf"],
    anderes: ["rueckruf"],
  };
  return (reason ? map[reason] : (["rueckruf"] as ChurnOffer[])).filter((o) => (o !== "module" || opts.hasModules !== false) && (o !== "pause" || opts.canPause !== false));
}

export const isChurnReason = (v: unknown): v is ChurnReason => CHURN_REASONS.some((r) => r.key === v);
export const isChurnOffer = (v: unknown): v is ChurnOffer => typeof v === "string" && v in CHURN_OFFERS;
export const churnReasonLabel = (v: string | null | undefined) => CHURN_REASONS.find((r) => r.key === v)?.label ?? "ohne Angabe";
