// Anleitung „WhatsApp verbinden“ für den Kundenbereich (Einrichtung + Hilfeseite).
// Drei Wege je nach Nummer: neue Nummer/Festnetz (empfohlen), Nummer aus der
// WhatsApp Business App (Coexistence) oder private WhatsApp-Nummer (abgeraten).
// Reine Daten, damit Einrichtung, Hilfeseite und Tests dieselben Texte nutzen.

export type ConnectPath = "neu" | "business" | "privat";

export const CONNECT_PATHS: ConnectPath[] = ["neu", "business", "privat"];

/** ?weg=… aus der URL (auch a/b/c) in einen Weg übersetzen; unbekannt → null. */
export function parseConnectPath(v: string | null | undefined): ConnectPath | null {
  const s = (v ?? "").trim().toLowerCase();
  if (s === "neu" || s === "a") return "neu";
  if (s === "business" || s === "b") return "business";
  if (s === "privat" || s === "c") return "privat";
  return null;
}

export type PathOption = {
  path: ConnectPath;
  label: string;
  hint: string;
};

export const PATH_OPTIONS: PathOption[] = [
  {
    path: "business",
    label: "Meine Nummer aus der WhatsApp Business App",
    hint: "Vorteil: Leads und Kunden kennen die Nummer schon, Sie schreiben weiter in der App. Bedingung: aktuelle App, Nummer schon einige Tage in Nutzung.",
  },
  {
    path: "neu",
    label: "Eine neue Nummer oder Festnetz",
    hint: "Vorteil: Ihre berufliche Nummer und die Nummer des Assistenten bleiben getrennt. Bei Festnetz kommt der Code per Anruf.",
  },
  {
    path: "privat",
    label: "Meine private WhatsApp-Nummer",
    hint: "Geht nur, wenn Sie das WhatsApp-Konto darauf vorher löschen. Ihre Chats dort sind dann weg.",
  },
];

export type GuideStep = {
  title: string;
  /** Was der Kunde sieht bzw. tut. */
  text: string;
  /** Typischer Stolperstein mit Lösung (optional). */
  pitfall?: string;
  /** Wo der Schritt passiert – für die Farbe/Beschriftung im Kasten. */
  where: "app" | "360dialog" | "meta" | "whatsapp";
};

export type PathGuide = {
  /** Kurzer Hinweis oben (Empfehlung oder Warnung). */
  intro: string;
  tone: "ok" | "info" | "warn";
  /** Darf der Kunde mit diesem Weg direkt starten? */
  canStart: boolean;
  checklist: string[];
  steps: GuideStep[];
  minutes: number;
};

const FB_LOGIN =
  "Ihren Facebook-Login mit Admin-Rechten im Meta-Unternehmensportfolio (Business Manager), also dort, wo auch Ihr Werbekonto liegt. So prüfen Sie es: business.facebook.com → Einstellungen → Personen → Ihr Name → Rolle „Vollzugriff“ (Admin). Kein Admin? Bitten Sie den Inhaber des Portfolios, Sie als Admin hinzuzufügen. Gibt es noch keins, legen Sie es unter business.facebook.com/overview an. Erst dann starten.";
/** Verifizierung des Portfolios (Ole, 15.11.2026, aus dem Durchlauf): fragt 360dialog ab, ist fürs Verbinden nicht nötig. */
const VERIFIED =
  "Wissen, ob Ihr Portfolio verifiziert ist: business.facebook.com → Einstellungen → Sicherheitscenter → „Unternehmensverifizierung“. Zum Verbinden ist das nicht nötig. Ohne Verifizierung gelten bei Meta aber engere Grenzen, zum Beispiel beim Anzeigenamen und bei der Zahl der Nachrichten an neue Kontakte. Starten Sie die Verifizierung am besten parallel (Handelsregisterauszug oder Gewerbeanmeldung, Adresse, Telefon, Website mit Impressum), sie dauert meist einige Tage.";
const DESKTOP = "Einen Computer statt des Handys. Erlauben Sie Pop-up-Fenster im Browser.";

const ACCOUNT_START: GuideStep[] = [
  {
    where: "360dialog",
    title: "Konto bei 360dialog anlegen",
    text: "Sie sehen eine Seite von 360dialog, unserem WhatsApp-Anbieter, mit unserem Logo. Sie legen ein Konto an, am besten mit „Sign up“ per E-Mail und Passwort. Das ist kostenlos, die Nummer bleibt Ihre.",
    pitfall:
      "Nehmen Sie lieber nicht „Continue with Facebook“: Das kann in einem alten Konto eines anderen Anbieters landen (z. B. Superchat). Sehen Sie dort fremde Firmen oder Nummern, machen Sie nicht weiter und melden Sie sich bei uns. Sie haben schon ein eigenes Konto bei 360dialog? Dann melden Sie sich einfach an.",
  },
  {
    where: "360dialog",
    title: "Kurz Angaben zu Ihnen („About you“)",
    text: "360dialog fragt nach Ihrem Namen bzw. Firmennamen, Ihrer persönlichen Handynummer und der Währung (EUR). Setzen Sie das Häkchen bei der Weitergabe der Kontaktdaten und bei den Nutzungsbedingungen (Client Terms of Service) und klicken Sie auf „Continue“. Danach öffnet sich das Fenster von Meta.",
    pitfall:
      "Bei „Personal WhatsApp Number“ gehört Ihre eigene Handynummer für Rückfragen hin, nicht die Nummer, die Sie verbinden. Stellen Sie links die Vorwahl auf +49 um.",
  },
  {
    where: "360dialog",
    title: "Zwei Fragen zu Ihrem Meta-Portfolio",
    text: "„Do you have admin access to the Meta Business Portfolio?“: Sie wählen „Yes“. „Is your Meta Business Portfolio verified?“: „Yes“, wenn die Unternehmensverifizierung abgeschlossen ist, sonst „No“. Das Verbinden klappt in beiden Fällen.",
    pitfall: "Sie sind kein Admin? Dann hier abbrechen und erst Admin-Rechte holen (siehe „Was Sie brauchen“), sonst fehlt Ihr Portfolio später in der Liste.",
  },
];

/** 360dialog fragt vor dem Meta-Fenster, ob die Nummer schon in WhatsApp läuft. */
const numberQuestion = (answer: string, why: string): GuideStep => ({
  where: "360dialog",
  title: "Nummer eingeben und Frage beantworten",
  text: `Sie geben die Nummer ein, die Ihr Assistent nutzen soll. 360dialog fragt dann „Is … already on WhatsApp?“. Sie wählen: „${answer}“.`,
  pitfall: why,
});

/** Code-Bestätigung bei 360dialog („Verify your phone number“), vor dem Meta-Fenster. */
const verifyStep = (extra: string): GuideStep => ({
  where: "360dialog",
  title: "Nummer mit Code bestätigen",
  text: "Unter „Verify your phone number“ wählen Sie „Text message (SMS)“ oder „Voice call“ (Anruf) und tippen den 6-stelligen Code ein. Klicken Sie nicht auf „Skip verification and continue“.",
  pitfall: `Festnetz oder keine SMS nach 2 Minuten? Wählen Sie „Voice call“, eine Ansage liest den Code vor. Fordern Sie den Code nicht mehrmals kurz hintereinander an, sonst sperrt Meta die Nummer für einige Stunden. ${extra}`,
});

const META_START: GuideStep[] = [
  {
    where: "meta",
    title: "Mit Facebook anmelden",
    text: "Es öffnet sich ein Fenster von Meta (Facebook). Sie melden sich an und klicken auf „Weiter“.",
    pitfall: "Kein Fenster zu sehen? Der Browser hat es blockiert. Pop-ups für die Seite erlauben und noch einmal klicken.",
  },
  {
    where: "meta",
    title: "Unternehmensportfolio auswählen",
    text: "Sie wählen Ihr Unternehmensportfolio aus, meist dasselbe wie für Ihr Werbekonto. Haben Sie keines, legen Sie hier eines an.",
    pitfall:
      "Ihr Portfolio fehlt in der Liste? Dann sind Sie dort kein Admin. Lassen Sie sich Admin-Rechte geben oder legen Sie ein neues an. Die Auswahl lässt sich später nicht mehr ändern.",
  },
  {
    where: "meta",
    title: "Freigabe nur für dieses Portfolio",
    text: "Fragt Meta, für welche Unternehmen 360dialog freigegeben werden soll, wählen Sie „Opt in to current Businesses only“ (nur aktuelle Unternehmen).",
  },
];

const PROFILE: GuideStep = {
  where: "meta",
  title: "WhatsApp-Profil anlegen",
  text: "Sie geben den Anzeigenamen und die Kategorie ein. Den Namen sehen Ihre Leads oben im Chat.",
  pitfall: "Der Name muss zu Ihrer Firma passen, zum Beispiel „Max Mustermann Versicherungsmakler“. Nur ein Vorname oder ein Werbespruch wird abgelehnt.",
};

const BACK: GuideStep = {
  where: "app",
  title: "Zurück bei uns",
  text: "Das Fenster schließt sich und Sie kommen automatisch hierher zurück. Hier steht dann „Verbunden: +49 …“. Fertig.",
  pitfall: "Steht dort „wird eingerichtet“? Das ist normal. Es dauert meist nur wenige Minuten, Sie müssen nichts weiter tun.",
};

export const GUIDES: Record<ConnectPath, PathGuide> = {
  neu: {
    intro: "Die neue Nummer gehört ab jetzt Ihrem Assistenten. Ihre bisherige Nummer bleibt unverändert.",
    tone: "ok",
    canStart: true,
    minutes: 10,
    checklist: [FB_LOGIN, VERIFIED, "Das Telefon zur Nummer, für den Bestätigungscode. Bei Festnetz kommt der Code per Anruf.", DESKTOP, "Etwa 10 Minuten Zeit."],
    steps: [
      ...ACCOUNT_START,
      numberQuestion("No, It's not connected", "Die Nummer läuft doch schon in einer WhatsApp-App? Dann wählen Sie oben in der Software den passenden Weg."),
      verifyStep("Meldung „Nummer wird bereits verwendet“? Dann läuft die Nummer doch schon in WhatsApp. Wählen Sie oben den passenden Weg."),
      ...META_START,
      PROFILE,
      BACK,
    ],
  },
  business: {
    intro:
      "Sie behalten Ihre WhatsApp Business App und schreiben dort weiter. Ihr Assistent übernimmt neue Leads über dieselbe Nummer. Was Sie in der App schreiben, erscheint auch bei uns unter „Chats“, und der Assistent hält sich in diesem Gespräch dann zurück.",
    tone: "info",
    canStart: true,
    minutes: 10,
    checklist: [
      FB_LOGIN,
      VERIFIED,
      "Ihr Handy mit der aktuellen WhatsApp Business App. Sie scannen damit einen QR-Code.",
      "Die Nummer sollte schon mindestens etwa 7 Tage in der WhatsApp Business App genutzt werden.",
      DESKTOP,
      "Etwa 10 Minuten Zeit.",
    ],
    steps: [
      ...ACCOUNT_START,
      numberQuestion("Yes, Business app", "Wählen Sie nicht „No, It's not connected“. Sonst schlägt die Bestätigung fehl."),
      ...META_START,
      {
        where: "meta",
        title: "„Mit der WhatsApp Business App verbunden“ wählen",
        text: "Fragt Meta noch einmal, ob die Nummer schon in WhatsApp läuft, wählen Sie: „Ja, diese Nummer ist mit der WhatsApp Business App verbunden“. Steht Ihre Nummer schon in einer Liste, wählen Sie sie dort aus, statt sie einzutippen.",
        pitfall: "Wählen Sie hier nicht „neue Nummer“ und tippen Sie eine vorhandene Nummer nicht neu ein. Sonst schlägt die Bestätigung fehl.",
      },
      {
        where: "whatsapp",
        title: "QR-Code in der App scannen",
        text: "Sie bekommen in der WhatsApp Business App eine Nachricht. Tippen Sie darauf und scannen Sie den QR-Code auf dem Bildschirm. Chatverlauf und Kontakte können Sie dabei übernehmen.",
        pitfall: "Keine Nachricht bekommen? App aktualisieren und öffnen, dann den Schritt im Meta-Fenster wiederholen.",
      },
      BACK,
    ],
  },
  privat: {
    intro:
      "Eine Nummer aus der normalen WhatsApp-App lässt sich nur verbinden, wenn Sie das WhatsApp-Konto darauf vorher löschen. Ihre Chats dort sind dann weg. Alternative: Stellen Sie die Nummer kostenlos auf WhatsApp Business um. Ihre Chats bleiben dabei erhalten. Danach wählen Sie oben „Meine Nummer aus der WhatsApp Business App“.",
    tone: "warn",
    canStart: true,
    minutes: 15,
    checklist: [
      "Wichtige Chats vorher sichern, falls Sie die Nummer wirklich löschen wollen.",
      FB_LOGIN,
      VERIFIED,
      "Das Telefon zur Nummer, für den Bestätigungscode.",
      DESKTOP,
    ],
    steps: [
      {
        where: "whatsapp",
        title: "WhatsApp-Konto auf der Nummer löschen",
        text: "In WhatsApp unter Einstellungen → Konto → „Konto löschen“. Danach einige Minuten warten.",
        pitfall: "Das lässt sich nicht rückgängig machen. Wenn Sie die Chats behalten wollen, nehmen Sie lieber den Weg über WhatsApp Business.",
      },
      ...ACCOUNT_START,
      numberQuestion("No, It's not connected", "Das WhatsApp-Konto auf der Nummer muss vorher gelöscht sein, sonst schlägt die Bestätigung fehl."),
      verifyStep("Meldung „Nummer wird bereits verwendet“? Das WhatsApp-Konto ist noch nicht gelöscht. Etwas warten und erneut versuchen."),
      ...META_START,
      PROFILE,
      BACK,
    ],
  },
};

/** Text zum Fehlerfall nach der Rückkehr: was tun. */
export const ERROR_HELP = [
  "Pop-up blockiert: im Browser für diese Seite erlauben und noch einmal verbinden.",
  "Portfolio nicht sichtbar: Sie brauchen Admin-Rechte im Meta-Unternehmensportfolio (prüfen unter business.facebook.com → Einstellungen → Personen).",
  "Bei 360dialog erscheinen fremde Firmen oder Nummern: Sie sind in einem alten Konto gelandet (z. B. über „Continue with Facebook“). Bitte nicht weitermachen und kurz bei uns melden.",
  "„Nummer wird bereits verwendet“: Die Nummer läuft noch in einer WhatsApp-App. Wählen Sie oben den passenden Weg.",
];

// Zusatzfrage beim Weg „WhatsApp Business App“: schon bei einem anderen Anbieter verbunden?

export type ProviderAnswer = "nein" | "ja" | "unklar";
export type CoexAnswer = "nein" | "ja";

export const PROVIDER_QUESTION = {
  question: "Ist die Nummer schon mit einem anderen Anbieter verbunden (z. B. Superchat, MessageBird, Charles, WATI)?",
  answers: [
    { value: "nein" as const, label: "Nein" },
    { value: "ja" as const, label: "Ja" },
    { value: "unklar" as const, label: "Weiß nicht" },
  ],
};

export const PROVIDER_YES =
  "Das geht. Sie wählen im Fenster von Meta Ihre bestehende Nummer aus. Beim bisherigen Anbieter müssen Sie vorher nichts kündigen oder löschen. Danach legen Sie in der Meta Business Suite fest, dass die Gespräche an uns gehen. Beide Anbieter gleichzeitig funktionieren nicht zuverlässig. Wenn Sie den bisherigen Anbieter weiter nutzen möchten, nehmen Sie für Ihren Assistenten besser eine zweite Nummer.";

export const COEX_QUESTION = "Läuft die Nummer beim bisherigen Anbieter zusätzlich in der WhatsApp Business App auf Ihrem Handy?";

export const COEX_WITH_PROVIDER =
  "Dann ist ein eigener Ablauf nötig: Die Verbindung beim bisherigen Anbieter wird getrennt, Ihre Chats werden gesichert und die Nummer wird neu verbunden. Bitte buchen Sie dafür den 15-Minuten-Hilfetermin. Wir machen das gemeinsam.";

export const PROVIDER_UNSURE = [
  "Sie bekommen eine Rechnung von einem WhatsApp-Tool oder haben dort einen Login.",
  "Ihre WhatsApp-Nachrichten kommen in einem Postfach im Browser an, nicht nur in der App auf dem Handy.",
  "Trifft beides nicht zu, ist die Nummer in der Regel nicht verbunden. Im Zweifel klären wir es im 15-Minuten-Hilfetermin.",
];

/** Darf der Kunde beim Business-Weg mit diesen Antworten selbst starten? */
export function businessCanStart(provider: ProviderAnswer | null, coex: CoexAnswer | null): boolean {
  if (provider === "nein") return true;
  if (provider === "ja") return coex === "nein";
  return false;
}
