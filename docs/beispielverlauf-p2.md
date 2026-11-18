# Beispielverlauf P2: Strecke nach der Buchung

Stand 17.11.2026 (spät), aus den echten Textfunktionen (`erstanschreibenText`, `terminVorschlagText`, `buchungsText`,
`komplettcheckFrage`, `langAngebotNachricht`, `folgefrageText`, `vertragsFrage`, `policenBitte`, `abschlussText`,
`einladungUnterwegs`); die Schlusstexte sind in `tests/integration/assistent-strecke.test.ts` wörtlich geprüft.
Frau Becker, Privatschutz mit Haftpflicht und Hausrat, Familie mit Kindern, Ansprache Sie, Vermittler Herr Kannapinn,
E-Mail aus dem Formular bekannt. Was der Assistent frei formuliert (KI), ist als „Assistent (sinngemäß)“ markiert,
alles andere ist fester Text der App. Grundlage für die Beispielchats im Onboarding (P8).

## Gemeinsamer Anfang

**App (Erstanschreiben v8, Oles kurze Fassung vom 17.11.2026; als Vorlage mit PDF der Erstinformation im Kopf und
Fußzeile „KI-Assistent · Oben: Erstinformation (gesetzlich)“, im 24-h-Fenster als Freitext mit „KI-Assistent“ im Satz):**

> Hallo Frau Becker, danke für Ihre Anfrage zum Privatschutz! Hier schreibt der digitale Assistent von Herrn Kannapinn.
>
> *Sind Haftpflicht und Hausrat schon versichert, oder wäre beides neu?*

**Frau Becker:** Beides wäre neu.

**App (Zwischenfrage, nur wenn das Formular die Lebenssituation nicht kennt; hier steht „Familie mit Kindern“ im
Formular, deshalb entfällt sie):**

> Danke! Damit Herr Kannapinn Ihnen im Termin gleich passende Beiträge zeigen kann: Wer soll mitversichert sein?
>
> _Knöpfe: [Nur ich] [Zu zweit] [Familie mit Kindern]_

**App:**

> Danke! In einem kurzen Videotermin zeigt Ihnen Herr Kannapinn, was Haftpflicht und Hausrat für Ihre Familie kosten und worauf Sie achten sollten. Passt Ihnen heute um 16 Uhr oder Donnerstag, 19.11. um 10 Uhr?
>
> _Knöpfe: [Heute 16 Uhr] [Do. 19.11. 10 Uhr] [Andere Zeit]_

**Frau Becker:** [Do. 19.11. 10 Uhr]

**App (sofort gebucht, Zeit fest im Kalender von Herrn Kannapinn, noch keine Einladung an Frau Becker):**

> Ihr Videotermin ist gebucht: *Donnerstag, 19.11. um 10 Uhr*. Herr Kannapinn hält sich die Zeit nur für Sie frei und bereitet Ihre Beiträge vor.
> Ihr Link: https://meet.google.com/abc-defg-hij

**App:**

> Danke! Soll Herr Kannapinn im Termin auch kurz schauen, ob Sie und Ihre Familie insgesamt gut abgesichert sind und wo Sie vielleicht etwas sparen können? Das dauert nur ein paar Minuten länger.
>
> _Knöpfe: [Ja, gern] [Nein, danke]_

## Pfad A: Komplettcheck „Ja, gern“

**Frau Becker:** [Ja, gern]

_Die App prüft, ob 45 Minuten frei sind. Frei: Der Termin wird verlängert (nur im Kalender von Herrn Kannapinn, die
Einladung kommt später mit 45 Min.)._

**App:**

> Super! Damit Herr Kannapinn Ihnen gleich passende Beiträge zeigen kann: Wie lautet Ihr Geburtsdatum?

**Frau Becker:** 14.05.1985

**Assistent (sinngemäß):** Wie groß ist Ihre Wohnung ungefähr?

**Frau Becker:** Etwa 95 m²

**Assistent (sinngemäß):** Sind Sie im öffentlichen Dienst tätig? _[Ja] [Nein]_

**Frau Becker:** [Nein]

**App:**

> Danke! Welche Versicherungen haben Sie und Ihre Familie heute schon? Zum Beispiel Haftpflicht, Hausrat, Unfall, Berufsunfähigkeit, Rechtsschutz, Kfz, Kranken- oder Lebensversicherung und Altersvorsorge. Gern auch mit Gesellschaft.

**Frau Becker:** Kfz bei der Allianz, Unfall bei der HUK und eine Riester-Rente.

**App (Policen-Bitte, Text aus dem Policen-Modul `src/lib/policen/bitte.ts`):**

> Danke! Damit Herr Kannapinn Ihren Termin gut vorbereiten kann: Schicken Sie bitte vorab Fotos oder PDFs Ihrer aktuellen Policen hier in den Chat, egal ob Haftpflicht, Hausrat oder Kfz. Dann sieht er vorher, wo Sie doppelt zahlen oder Lücken haben, und der Termin geht deutlich schneller.

**App (Einwilligung als eigene Nachricht, Policen-Modul):** „Kurz zum Datenschutz: Ich bin einverstanden, dass …“
_Fußzeile „Ihr Termin findet auch ohne Unterlagen statt.“, Knöpfe: [Einverstanden] [Lieber nicht]_

**Frau Becker:** [Lieber nicht]

**App (Policen-Modul):** Kein Problem, Ihr Termin findet trotzdem statt. Bringen Sie Ihre Unterlagen dann einfach zum Termin mit.

**App (Schluss):**

> Damit ist alles Wichtige für Herrn Kannapinn notiert. Legen Sie zum Termin gern bereit: Ihre übrigen Policen, die Geburtsdaten der Mitversicherten und Ihre IBAN für einen direkten Abschluss.
>
> Zum Schluss: Die Einladung mit Kalendereintrag geht an anna.becker@example.com. Stimmt die Adresse?
>
> _Knöpfe: [Ja, stimmt] [Andere Adresse]_

**Frau Becker:** [Ja, stimmt]

**App:**

> Super, die Einladung ist unterwegs. Tragen Sie sich den Termin am besten gleich ein. Falls etwas dazwischenkommt, schreiben Sie mir einfach hier.

_Jetzt geht die Einladung genau einmal raus, mit 45 Minuten._

Variante, die längere Zeit ist im Kalender belegt (an den Lead nie eine Dauer in Minuten, nur „etwas mehr Zeit“):

> Super! Für den Komplettcheck nimmt sich Herr Kannapinn gern etwas mehr Zeit, direkt nach Ihrem Termin ist aber schon etwas anderes geplant. Passt Ihnen auch Freitag, 20.11. um 9 Uhr oder Montag, 23.11. um 10 Uhr?
>
> _Knöpfe: [Fr. 20.11. 9 Uhr] [Mo. 23.11. 10 Uhr] [Zeit behalten]_

Gewählte Zeit: „Super, Ihr Termin ist jetzt am *Freitag, 20.11. um 9 Uhr*.“ (derselbe Termin wird
verlegt), danach die erste Angebotsfrage. „Zeit behalten“: „Alles klar, es bleibt bei *Donnerstag, 19.11. um 10 Uhr*.
Herr Kannapinn plant etwas mehr Zeit ein.“ (Hinweis an den Vermittler).

## Pfad B: Komplettcheck „Nein, danke“

**Frau Becker:** [Nein, danke]

**App:**

> Alles klar. Damit Herr Kannapinn Ihnen gleich passende Beiträge zeigen kann: Wie lautet Ihr Geburtsdatum?

_Weitere Angebotsfragen wie in Pfad A, keine Vertragsfrage. Nach der letzten Antwort:_

**App (Policen-Bitte wie in Pfad A, danach die Einwilligung mit [Einverstanden] [Lieber nicht]).**

**Frau Becker:** Mache ich später.

**Assistent (sinngemäß):** Gern, ganz in Ruhe.

**App (Schluss):**

> Danke, damit sind alle wichtigen Angaben für Herrn Kannapinn notiert. Legen Sie zum Termin gern bereit: die Geburtsdaten der Mitversicherten und Ihre IBAN für einen direkten Abschluss.
>
> Zum Schluss: Die Einladung mit Kalendereintrag geht an anna.becker@example.com. Stimmt die Adresse?
>
> _Knöpfe: [Ja, stimmt] [Andere Adresse]_

**Frau Becker:** [Andere Adresse]

**App:** Gern! An welche E-Mail-Adresse soll die Einladung gehen?

**Frau Becker:** anna.becker@example

**App:** Die Adresse scheint nicht vollständig zu sein. Schreiben Sie sie mir bitte noch einmal, z. B. name@beispiel.de.

**Frau Becker:** anna.becker@example.com

**App:**

> Danke, die Einladung ist an anna.becker@example.com unterwegs. Tragen Sie sich den Termin am besten gleich ein. Falls etwas dazwischenkommt, schreiben Sie mir einfach hier.

## Pfad C: keine Antwort auf den Komplettcheck

_Nach einer Stunde (Mo bis Sa 8 bis 20 Uhr, nur im 24-h-Fenster) geht es ohne Komplettcheck weiter:_

**App:**

> Damit Herr Kannapinn Ihnen gleich passende Beiträge zeigen kann: Wie lautet Ihr Geburtsdatum?

_Antwortet Frau Becker nicht, bleibt die Frage stehen: kein Schluss, solange Angebotsfragen offen sind. Sind alle
Angaben bekannt, folgt nach einer Stunde die Policen-Bitte mit Einwilligung (ohne „Danke!“), ohne Reaktion nach einer
weiteren Stunde der Schluss:_

> Damit ist alles Wichtige für Herrn Kannapinn notiert. Legen Sie zum Termin gern bereit: die Geburtsdaten der Mitversicherten und Ihre IBAN für einen direkten Abschluss.
>
> Zum Schluss: Die Einladung mit Kalendereintrag geht an anna.becker@example.com. Stimmt die Adresse?

_Die Einladung geht in jedem Fall raus: 15 Minuten nach der letzten Nachricht von Frau Becker an die bekannte Adresse
(kurzfristig nach 5 Minuten, spätestens 60 Minuten vor Beginn)._

## Ohne bekannte E-Mail-Adresse

Der Termin ist trotzdem sofort gebucht. Der Schluss fragt freiwillig:

> Zum Schluss: Möchten Sie die Einladung mit Kalendereintrag per E-Mail? Dann schreiben Sie mir einfach Ihre Adresse.

## Policen-Bitte und Erinnerungen

- Jeder Lead bekommt die Bitte genau einmal (Text und Einwilligung aus dem Policen-Modul, in allen Pfaden gleich; der
  Vorschlag einer engen Sparten-Fassung für Nein/keine Antwort ist damit hinfällig). Keine Bitte, wenn der Lead
  „keine Versicherungen“ sagt oder das Policen-Modul aus ist (Notschalter `POLICEN_WHATSAPP_AUS`, Ablage nicht
  eingerichtet, Minderjährige). Antwortet der Lead auf die Einwilligung, folgt sofort der Schluss, sonst nach 1 Std.
- Erinnerung 24 Std. nach der Buchung (nur wenn bis zum Termin mehr als 2 Tage liegen):
  > Kurze Erinnerung: Haben Sie Ihre Policen für Haftpflicht, Hausrat oder Kfz schon zur Hand? Einfach abfotografieren und hier schicken, dann kann Herr Kannapinn alles vorbereiten.
  >
  > Keine Nachrichten mehr? Antworten Sie einfach STOP.
- Am Vortag im Nutzensatz der Erinnerung: „Falls noch nicht geschehen: Schicken Sie gern noch kurz Ihre Policen hier in den Chat.“
- Höchstens 2 Erinnerungen, nur mit `darfPolicenErinnern` (Policen-Modul: Opt-in aus der Buchung, kein „Lieber
  nicht“, kein Widerruf, kein STOPP, kein Dokument, Termin steht); Schluss auch bei „habe keine“.

## Vorbereitete Meta-Vorlagen (nicht eingereicht)

- Erstanschreiben v8 (docs/vorlagen-erstanschreiben-v8.md).
- Policen-Erinnerung (außerhalb des 24-h-Fensters), Vorschlag:
  - Sie: `Guten Tag {{1}}, kurze Erinnerung: Haben Sie {{2}} schon zur Hand? Einfach abfotografieren und hier schicken, dann kann {{3}} alles vorbereiten. Keine Nachrichten mehr? Antworten Sie einfach STOP.`
  - Du: `Hallo {{1}}, kurze Erinnerung: Hast du {{2}} schon zur Hand? Einfach abfotografieren und hier schicken, dann kann {{3}} alles vorbereiten. Keine Nachrichten mehr? Antworte einfach STOP.`
  - Platzhalter: Name, „Ihre Policen für Haftpflicht, Hausrat oder Kfz“ bzw. „Ihre Hausrat-Police“, Vermittler.
  - Nicht in `VORBEREITETE_FASSUNG`, weil diese nur bestehende Zwecke kennt; ein neuer Zweck stünde sofort im
    Einreichungsplan. Bis dahin geht die Erinnerung nur im offenen 24-h-Fenster.
