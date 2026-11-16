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
  where: "app" | "mail" | "360dialog" | "meta" | "whatsapp";
  /** Bildschirmfoto aus einem echten Durchlauf (public/anleitung/whatsapp, Ole 15.11.2026). */
  image?: { src: string; alt: string };
  /** Passiert vor der Anmeldung bei 360dialog; in der Einladungsansicht schon erledigt. */
  beforeLogin?: boolean;
};

const IMG = "/anleitung/whatsapp";

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
/** Verifizierung des Portfolios (Ole, 15.11.2026, aus dem Durchlauf): fürs Verbinden nicht nötig. */
const VERIFIED =
  "Wissen, ob Ihr Portfolio verifiziert ist: business.facebook.com → Einstellungen → Sicherheitscenter → „Unternehmensverifizierung“. Zum Verbinden ist das nicht nötig. Ohne Verifizierung gelten bei Meta aber engere Grenzen, zum Beispiel beim Anzeigenamen und bei der Zahl der Nachrichten an neue Kontakte. Starten Sie die Verifizierung am besten parallel (Handelsregisterauszug oder Gewerbeanmeldung, Adresse, Telefon, Website mit Impressum), sie dauert meist einige Tage.";
const MAILBOX = "Zugang zu Ihrem E-Mail-Postfach. Von 360dialog kommen eine Einladung und später ein Anmeldecode.";
const DESKTOP = "Einen Computer statt des Handys. Erlauben Sie Pop-up-Fenster im Browser.";

// Ablauf wie im echten Durchlauf (Ole, 15.11.2026): Software → Einladung per E-Mail → Anmeldung bei 360dialog
// mit Code → Nummer und Frage „already on WhatsApp?“ → SMS-Code (bzw. später QR-Code) → „Meta Business Signup“
// → Fenster von Meta → zurück in die Software.

/** Start in der Software und Einladung von 360dialog (vor der Anmeldung). */
const INVITE: GuideStep[] = [
  {
    where: "app",
    beforeLogin: true,
    title: "In der Software starten",
    text: "In der Einrichtung beim Schritt „WhatsApp verbinden“ wählen Sie, welche Nummer Ihr Assistent nutzen soll, und tippen auf „Jetzt WhatsApp verbinden“. Wir legen dann Ihr Konto bei 360dialog, unserem WhatsApp-Anbieter, für Sie an. Das ist kostenlos, die Nummer bleibt Ihre.",
  },
  {
    where: "mail",
    beforeLogin: true,
    title: "E-Mail von 360dialog öffnen und Passwort festlegen",
    image: { src: `${IMG}/01-einladung.webp`, alt: "E-Mail von 360dialog mit dem Knopf „Join 360Dialog Hub“" },
    text: "360dialog schickt Ihnen eine E-Mail auf Englisch: Absender „360Dialog“ (no-reply@360dialog.com), Betreff „Join [Ihr Firmenname] on the 360Dialog Hub“. Klicken Sie dort auf „Join 360Dialog Hub“ und legen Sie ein Passwort fest. Zurück in der Software setzen Sie das Häkchen „Erledigt, ich habe mein Passwort festgelegt“.",
    pitfall:
      "Keine E-Mail da? Sehen Sie im Spam-Ordner nach. Bitte kein eigenes Konto über „Sign up“ registrieren, Ihr Konto ist schon angelegt. Hatten Sie mit dieser E-Mail schon ein Konto bei 360dialog, kommt keine Einladung: Dann melden Sie sich im nächsten Schritt mit Ihrem bisherigen Passwort an.",
  },
];

/** Anmeldung bei 360dialog mit Bestätigungscode per E-Mail, dann die Nummer. */
const LOGIN: GuideStep[] = [
  {
    where: "360dialog",
    title: "Bei 360dialog anmelden („Log in“)",
    text: "In der Software tippen Sie auf „Weiter: WhatsApp verbinden“. Die Anmeldeseite von 360dialog öffnet sich: E-Mail und Ihr neues Passwort eintragen und auf „Log in“ klicken.",
    pitfall:
      "Nicht mit Facebook oder Google anmelden und nicht „Sign up“ wählen: Das kann in einem alten oder fremden Konto landen (z. B. bei einem anderen Anbieter wie Superchat). Sehen Sie fremde Firmen oder Nummern oder werden Sie nach einem Tarif gefragt, brechen Sie ab und melden Sie sich bei uns. Starten Sie immer über den Knopf in der Software.",
  },
  {
    where: "360dialog",
    title: "Anmeldung mit Code bestätigen („Verify it's you“)",
    text: "Zur Sicherheit schickt 360dialog eine zweite E-Mail mit einem Code. Tragen Sie den Code ein, setzen Sie auf Wunsch das Häkchen „Remember this device for 30 days“ und klicken Sie auf „Continue“.",
    pitfall: "Kein Code da? Sehen Sie im Spam-Ordner nach und warten Sie kurz, bevor Sie einen neuen Code anfordern.",
  },
  {
    where: "360dialog",
    title: "Nummer eingeben („Onboard new number“)",
    text: "Unter „Enter phone number“ ist als Land USA (+1) vorbelegt. Stellen Sie es auf Deutschland (+49) um und geben Sie die Nummer ohne führende 0 ein, zum Beispiel 151 23456789. Dann klicken Sie auf „Next“.",
    pitfall: "Klicken Sie nicht auf „Use Meta-provided number“. Ihr Assistent soll Ihre eigene Nummer nutzen.",
  },
];

/** 360dialog fragt „Is … already on WhatsApp?“. */
const numberQuestion = (answer: string, why: string): GuideStep => ({
  where: "360dialog",
  title: "Frage „Is … already on WhatsApp?“ beantworten",
  image: { src: `${IMG}/04-schon-bei-whatsapp.webp`, alt: "360dialog fragt, ob die Nummer schon bei WhatsApp ist" },
  text: `360dialog fragt, ob die Nummer schon bei WhatsApp ist. Zur Wahl stehen „No, It's not connected“ (neue Nummer oder Festnetz), „Yes, Personal app“ (normale WhatsApp-App), „Yes, Business app“ (WhatsApp Business App) und „Yes, Business API“ (bei einem anderen Anbieter). Sie wählen: „${answer}“.`,
  pitfall: why,
});

/** Code-Bestätigung bei 360dialog („Verify your phone number“), nur ohne WhatsApp Business App. */
const verifyStep = (extra: string): GuideStep => ({
  where: "360dialog",
  title: "Nummer mit Code bestätigen („Verify your phone number“)",
  text: "Wählen Sie „Text message (SMS)“ oder „Voice call“ (Anruf) und tippen Sie den 6-stelligen Code ein. Klicken Sie nicht auf „Skip verification and continue“.",
  pitfall: `Der Code kommt an die Nummer selbst (bei einer virtuellen Nummer im Nachrichten- bzw. Anrufprotokoll Ihres Anbieters). Festnetz oder keine SMS nach 2 Minuten? Wählen Sie „Voice call“, eine Ansage liest den Code vor. Fordern Sie den Code nicht mehrmals kurz hintereinander an, sonst sperrt Meta die Nummer für einige Stunden. ${extra}`,
});

/** „Meta Business Signup“ bei 360dialog und Anmeldung im Fenster von Meta. */
const META_START: GuideStep[] = [
  {
    where: "360dialog",
    title: "„Meta Business Signup“: auf „Embedded Signup“ klicken",
    image: { src: `${IMG}/06-meta-signup.webp`, alt: "360dialog: Meta Business Signup mit dem Knopf „Embedded Signup“" },
    text: "360dialog zeigt die Seite „Meta Business Signup“ mit vier Schritten: Konto verbinden, WhatsApp-Nummer hinzufügen, Unternehmen auswählen, Freigabe prüfen. Beim zweiten Schritt steht der Hinweis, nicht „Display Name only“ zu wählen. Klicken Sie unten rechts auf „Embedded Signup“, dann öffnet sich ein Fenster von Meta.",
    pitfall: "Kein Fenster zu sehen? Der Browser hat das Pop-up blockiert. Erlauben Sie Pop-ups für die Seite und klicken Sie noch einmal.",
  },
  {
    where: "meta",
    title: "Mit Meta verbinden („Continue“)",
    text: "Im Fenster steht „Facebook Login for Business“ und „Seamlessly connect your account to 360Dialog“. Melden Sie sich falls nötig mit Ihrem Facebook-Login an und klicken Sie auf „Continue“.",
  },
];

/** „Add your WhatsApp phone number“ im Fenster von Meta. */
const metaNumber = (pitfall: string): GuideStep => ({
  where: "meta",
  title: "Nummer bestätigen („Add your WhatsApp phone number“)",
  text: "Ihre Nummer ist schon ausgewählt. Prüfen Sie sie kurz und klicken Sie auf „Next“.",
  pitfall,
});

/** Portfolio, neues WhatsApp-Konto, Angaben, Freigabe und die zwei Häkchen. */
const META_END: GuideStep[] = [
  {
    where: "meta",
    title: "Portfolio wählen und WhatsApp-Konto anlegen",
    text: "Unter „Select the business assets to share with 360dialog“ wählen Sie bei „Business portfolio“ Ihr eigenes Unternehmensportfolio, meist dasselbe wie für Ihr Werbekonto. Bei „WhatsApp account“ wählen Sie „Create a WhatsApp account“. Dann klicken Sie auf „Next“.",
    pitfall:
      "Ihr Portfolio fehlt in der Liste? Dann sind Sie dort kein Admin. Lassen Sie sich Admin-Rechte geben. Meta schlägt manchmal ein anderes Portfolio vor, in dem Sie nur mitarbeiten: bitte genau prüfen, die Auswahl lässt sich später nicht mehr ändern.",
  },
  {
    where: "meta",
    title: "Angaben zum Unternehmen („Enter business information“)",
    text: "Name wie in Ihrem Impressum, Kategorie zum Beispiel „Professional Services“ oder „Finance“, Land „Germany“, die Website ist freiwillig. Bei der Zeitzone schlägt Meta oft eine andere vor (z. B. Europe/Vienna): Wählen Sie „Europe/Berlin“. Dann klicken Sie auf „Next“.",
  },
  {
    where: "meta",
    title: "Freigabe prüfen („Confirm“)",
    text: "Unter „Review what you'll share with 360dialog“ stehen Ihr Unternehmen, das WhatsApp-Konto und das Nachrichtenkonto. Prüfen Sie, dass überall Ihr eigener Firmenname steht. „Access your Facebook ads and related stats“ steht immer dabei und ändert nichts an Ihren Anzeigen. Dann klicken Sie auf „Confirm“.",
    pitfall: "Meldung „This phone number belongs to another business“? Die Nummer hängt schon in einem anderen Meta-Portfolio. Entfernen Sie sie dort oder nehmen Sie eine andere Nummer.",
  },
  {
    where: "meta",
    title: "Zum Schluss: zwei Häkchen entfernen („Finish“)",
    text: "Meta zeigt „Your account is connected to 360Dialog“. Unter „Improve your experience“ entfernen Sie beide Häkchen: „Instruct Meta to automatically identify order and lead events“ und „Share Cloud API events“. So geben Sie keine Daten aus Ihren Gesprächen für Werbezwecke an Meta weiter. Dann klicken Sie auf „Finish“.",
  },
];

const BACK: GuideStep = {
  where: "app",
  title: "Zurück in der Software: „Fast geschafft“",
  text: "Das Fenster schließt sich und Sie kommen automatisch zurück. Dort steht „Fast geschafft: Ihre Nummer wird bei WhatsApp noch eingerichtet“. Nach wenigen Minuten wechselt die Anzeige von selbst auf „Verbunden“. Meta prüft Ihr Konto zusätzlich, meist innerhalb von 24 Stunden. Sie müssen dafür nichts tun.",
  pitfall:
    "Steht nach etwa 10 Minuten noch nicht „Verbunden“ da? Tippen Sie auf „Verbindung prüfen“. Zeigt 360dialog „Choose a plan“ oder „Pending Activation“, kaufen Sie nichts: Schließen Sie das Fenster und schreiben Sie uns kurz, wir schalten die Nummer frei.",
};

const NOT_DISPLAY_NAME = "Wählen Sie nicht „Display Name only“, sonst wird die Nummer nicht verbunden.";

export const GUIDES: Record<ConnectPath, PathGuide> = {
  neu: {
    intro: "Die neue Nummer gehört ab jetzt Ihrem Assistenten. Ihre bisherige Nummer bleibt unverändert.",
    tone: "ok",
    canStart: true,
    minutes: 10,
    checklist: [FB_LOGIN, VERIFIED, MAILBOX, "Das Telefon zur Nummer, für den Bestätigungscode. Bei Festnetz kommt der Code per Anruf.", DESKTOP, "Etwa 10 Minuten Zeit."],
    steps: [
      ...INVITE,
      ...LOGIN,
      numberQuestion("No, It's not connected", "Die Nummer läuft doch schon in einer WhatsApp-App? Dann wählen Sie in der Software den passenden Weg."),
      verifyStep("Meldung „Nummer wird bereits verwendet“? Dann läuft die Nummer doch schon in WhatsApp. Wählen Sie in der Software den passenden Weg."),
      ...META_START,
      metaNumber(NOT_DISPLAY_NAME),
      ...META_END,
      BACK,
    ],
  },
  business: {
    intro:
      "Sie behalten Ihre WhatsApp Business App und schreiben dort weiter. Ihre bestehenden Chats bleiben privat. Der Assistent schreibt nur Leads an, die über performancegrowth kommen. Schreiben Sie einem Lead selbst in der App, hält sich der Assistent in diesem Gespräch zurück.",
    tone: "info",
    canStart: true,
    minutes: 10,
    checklist: [
      FB_LOGIN,
      VERIFIED,
      MAILBOX,
      "Ihr Handy mit der aktuellen WhatsApp Business App. Sie scannen damit einen QR-Code.",
      "Die Nummer sollte schon mindestens etwa 7 Tage in der WhatsApp Business App genutzt werden.",
      DESKTOP,
      "Etwa 10 Minuten Zeit.",
    ],
    steps: [
      ...INVITE,
      ...LOGIN,
      numberQuestion(
        "Yes, Business app",
        "Wählen Sie nicht „No, It's not connected“, sonst schlägt die Bestätigung fehl. Läuft die Nummer nicht in der App, sondern bei einem anderen Anbieter (z. B. Superchat), wählen Sie „Yes, Business API“.",
      ),
      ...META_START,
      metaNumber(`${NOT_DISPLAY_NAME} Tippen Sie die Nummer nicht neu ein und wählen Sie keine neue Nummer, sonst klappt die Verbindung mit der WhatsApp Business App nicht.`),
      {
        where: "whatsapp",
        title: "QR-Code mit der WhatsApp Business App scannen",
        text: "Statt eines Codes per SMS verbinden Sie die Nummer mit einem QR-Code: Sie bekommen in der WhatsApp Business App auf Ihrem Handy eine Nachricht. Tippen Sie darauf und scannen Sie den QR-Code auf dem Bildschirm. Den bisherigen Chatverlauf müssen Sie dabei nicht teilen, wir übernehmen ihn ohnehin nicht.",
        pitfall: "Keine Nachricht bekommen? App aktualisieren und öffnen, dann den Schritt im Fenster von Meta wiederholen.",
      },
      ...META_END,
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
      MAILBOX,
      "Das Telefon zur Nummer, für den Bestätigungscode.",
      DESKTOP,
    ],
    steps: [
      {
        where: "whatsapp",
        beforeLogin: true,
        title: "WhatsApp-Konto auf der Nummer löschen",
        text: "In WhatsApp unter Einstellungen → Konto → „Konto löschen“. Danach einige Minuten warten.",
        pitfall: "Das lässt sich nicht rückgängig machen. Wenn Sie die Chats behalten wollen, nehmen Sie lieber den Weg über WhatsApp Business.",
      },
      ...INVITE,
      ...LOGIN,
      numberQuestion("No, It's not connected", "Das WhatsApp-Konto auf der Nummer muss vorher gelöscht sein, sonst schlägt die Bestätigung fehl."),
      verifyStep("Meldung „Nummer wird bereits verwendet“? Das WhatsApp-Konto ist noch nicht gelöscht. Etwas warten und erneut versuchen."),
      ...META_START,
      metaNumber(NOT_DISPLAY_NAME),
      ...META_END,
      BACK,
    ],
  },
};

/** Schritte ab der Anmeldung bei 360dialog (Ansicht nach der Einladung, Passwort ist schon festgelegt). */
export function stepsAfterInvite(path: ConnectPath): GuideStep[] {
  return GUIDES[path].steps.filter((s) => !s.beforeLogin);
}

/** Text zum Fehlerfall nach der Rückkehr: was tun. */
export const ERROR_HELP = [
  "Pop-up blockiert: im Browser für diese Seite erlauben und noch einmal verbinden.",
  "Portfolio nicht sichtbar: Sie brauchen Admin-Rechte im Meta-Unternehmensportfolio (prüfen unter business.facebook.com → Einstellungen → Personen).",
  "Keine E-Mail von 360dialog: im Spam-Ordner nachsehen (Absender „360Dialog“, Betreff „Join … on the 360Dialog Hub“).",
  "Bei 360dialog erscheinen fremde Firmen oder Nummern: Sie sind in einem alten Konto gelandet (z. B. über „Continue with Facebook“). Bitte nicht weitermachen und kurz bei uns melden.",
  "Meldung „This phone number belongs to another business“: Die Nummer hängt schon in einem anderen Meta-Portfolio. Dort entfernen oder eine andere Nummer nehmen.",
  "„Nummer wird bereits verwendet“: Die Nummer läuft noch in einer WhatsApp-App. Wählen Sie oben den passenden Weg.",
  "360dialog zeigt „Choose a plan“ oder „Pending Activation“: nichts kaufen, Fenster schließen und uns schreiben. Wir schalten die Nummer frei.",
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
