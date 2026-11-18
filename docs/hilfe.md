# Hilfe zur App (Wissensbasis der KI-Hilfe)

Diese Datei ist die einzige Wissensquelle der KI-Hilfe im Kundenbereich
(`src/lib/hilfe.ts`). Sie beschreibt die App aus Sicht des Vertreters.
**Bei jeder Änderung an der Oberfläche hier mitpflegen.** Links nur auf die
Seiten aus der Liste „Seiten“ unten.

## Seiten

| Pfad | Name | Wofür |
|---|---|---|
| /buyer | Heute | Was jetzt zu tun ist, nach Dringlichkeit: Wartet auf Sie, Termine (mit Vorbereiten), Wie lief es?, Anrufen, Nächste Tage, Aufräumen |
| /buyer/leads | Leads | Alle Leads als Liste, mit Filtern und Suche |
| /buyer/kanban | Pipeline | Alle Leads nach Phase, Karten verschieben |
| /buyer/chats | Nachrichten | WhatsApp-Gespräche mit Kontakten |
| /buyer/wachstum | Wachstum | Zahlen (Kosten, Ertrag, Funnel, Hochrechnung, Monatsberichte), Werbebudget ändern, weiteres Produkt buchen, Pause/Urlaub (nur Inhaber; /buyer/zahlen zeigt dieselbe Seite) |
| /buyer/konto | Konto & Rechnungen | Vertrag, Benachrichtigungen, Zahlungsart, Rechnungen, Daten herunterladen (nur Inhaber) |
| /buyer/team | Team | Berater einladen, Leads verteilen (nur Inhaber) |
| /buyer/kalender | Mein Kalender | „Ihr Kalender“ verbinden (ein Kalender je Person), andere Quelle für freie Zeiten (ICS/Allianz), Team-Übersicht für Inhaber, Lead-Zeiten, Zeit blockieren |
| /buyer/einrichtung | Einrichtung | Fortschritt „Einrichtung x von y“, Fragebogen, Erstinformation (Pflichtangaben nach § 15 VersVermV prüfen und bestätigen oder eigenes PDF), Meta freigeben (prüfen/anfragen), Kalender, E-Mail-Postfach, WhatsApp, Kundenliste, Bewertungslink, Team, Einwilligung im Leadformular, App aufs Handy, Provisionen, Hilfetermin |
<!-- bestand-modul -->
| /buyer/bestand | Bestand | Bestandskunden und Kampagnen (Zusatzmodul; ohne Modul mit Knopf „Jetzt buchen“, sonst „Modul anfragen“) |
| /buyer/bestand/import | Kundenliste hochladen | Excel/CSV importieren |
<!-- /bestand-modul -->
| /buyer/bestellen | Bestellen | Leads für eine Woche bestellen (bei Pay-per-Lead) |
| /buyer/einstellungen/assistent | Assistent | E-Mails in Ihrem Namen (Absender, Kopie, automatisch / ein Tipp / aus je Mail) und der Weg zu den WhatsApp-Vorlagen |
| /buyer/vorlagen | WhatsApp-Vorlagen | Welche Nachrichten der Assistent schickt und ob Meta sie freigegeben hat (nur lesen) |
| /buyer/einstellungen/meta | Rückmeldung an Meta | Ergebnisse der Meta-Leads an Meta zurückmelden (an/aus nur Inhaber), Status, Anteile je Stufe, Empfehlung fürs Optimierungsziel |

## Einführungsvideos

- Am ersten Tag (noch ohne Leads) erscheint auf „Heute“ die Karte „Willkommen! Ihre Software in 1 Minute“
  mit einem kurzen Rundgang. Nach Ansehen oder Wegklicken (X) erscheint sie nicht mehr.
- Jederzeit wieder: **Profilmenü → „Einführung ansehen“** (/buyer/einfuehrung). Dort gibt es das Kurzvideo (ca. 1 Minute)
  und für Inhaber zusätzlich die ausführliche Einführung (ca. 3 Minuten: Kontakt öffnen, Anrufliste, selbst schreiben,
  Pipeline, Zahlen, Kalender, Team). Die Videos funktionieren auch ohne Ton (Einblendungen).

## Aufbau der App

- Links (am Rechner) bzw. auf dem Handy unten die Bereiche: **Heute**, **Kontakte** (Liste und Pipeline), **Nachrichten**
  und **Wachstum** (Zahlen, Werbebudget, Produkte, Pause; nur Inhaber). Je nach Stand zusätzlich Einrichtung.
  Der rote Zähler an „Kontakte“ zeigt neue Kontakte, mit denen noch niemand gesprochen hat (Ansicht „Neu“).
- Profilmenü: Einführung ansehen, Neuigkeiten, Einstellungen (Konto & Rechnungen, Team, Kalender, Provisionen,
  Postfach, Vorlagen, Erinnerungen, Logo, Kollegen empfehlen), Abmelden.
- Rollen: **Inhaber** sieht alles. **Berater** sehen nur ihre eigenen Leads, keine Zahlen, kein Konto, kein Team.
- Fast jede Aktion zeigt unten kurz eine Meldung mit „Rückgängig“.

## Schnellsuche (Kontakt suchen)

- Öffnen: am Rechner links oben in der Seitenleiste **„Kontakt suchen“** anklicken (in der bisherigen Oberfläche oben
  rechts) oder überall in der App **Strg K** drücken (Mac: **⌘K**). Auf dem Handy die **Lupe** oben in der Kopfzeile
  antippen, die Suche öffnet sich dann über den ganzen Bildschirm.
- Ab 2 Zeichen erscheinen sofort Treffer: Kontakte (Leads) nach Name, Telefonnummer oder E-Mail. Die Telefonnummer
  finden Sie in jeder Schreibweise, mit oder ohne Leerzeichen, mit 0 oder +49 (z. B. „0151 1234“ oder „+49151 1234“).
<!-- bestand-modul -->
- Inhaber mit dem Zusatzmodul Bestand finden dort auch Bestandskunden; mit WhatsApp erscheinen zusätzlich passende Chats.
<!-- /bestand-modul -->
- Bedienung mit der Tastatur: Pfeiltasten wählen, Enter öffnet, Esc schließt.
- Ist das Feld leer, zeigt die Suche die zuletzt darüber geöffneten Kontakte (nur auf diesem Gerät gespeichert).
- Berater finden nur ihre eigenen Kontakte und Chats, genau wie in der Kontaktliste.

## Heute

- „Heute“ ist nach Dringlichkeit sortiert (seit 16.11.2026), jede Zeile hat einen Hauptknopf; weitere Möglichkeiten
  öffnen sich beim Antippen der Zeile. Am Rechner erscheint rechts gleich die erste Aufgabe.
- **Wartet auf Sie:** Kontakte, die geantwortet haben und auf Sie warten. „Antworten“ oder „Erledigt“.
- **Termine:** Videocall starten, Anrufen, Chat öffnen, Lead öffnen, Verschieben oder absagen (öffnet ein Fenster direkt in der App, siehe „Termine“).
  Steht ein Termin in den nächsten 36 Stunden noch nicht als vorbereitet, zeigt die Zeile **Vorbereiten: Angebot rechnen** (auch unter „Nächste Tage“).
- **Wie lief es?:** Nach einem Termin tragen Sie das Ergebnis ein: Angebot gesendet, Abschluss (mit Beitrag, siehe unten „Abschluss und Provision“),
  Nicht erschienen (kommt auf die Anrufliste) oder Verloren (mit Grund). Den Rest (Phase, Wiedervorlage) erledigt die App.
- **Anrufliste:** Rückrufe und fällige Wiedervorlagen, „Überfällig“ markiert. Aktionen: Anrufen, Nicht erreicht,
  Erledigt, Später (Morgen / 3 Tage / 1 Woche / 2 Wochen), Termin buchen, Angebot gesendet, Abschluss,
  Lead öffnen, Verloren (mit Grund, siehe „Verloren und nicht erreicht“). Schieben um +1 Tag oder +1 Woche ebenfalls dort.
- **Aufräumen** (ganz unten, zugeklappt): Kontakte ohne nächsten Schritt (siehe „Nächster Schritt“). **Weiter** öffnet
  alle Möglichkeiten (Wiedervorlage, Termin anbieten, Nicht erreicht, Gewonnen, Verloren); „In Kontakte ansehen“ öffnet den Filter „Ohne nächsten Schritt“.
- Ist alles abgearbeitet, steht dort „Alles erledigt“. Neue Aufgaben erscheinen von selbst.
- Solange noch kein einziger Lead da ist, erklärt „Heute“, wie es losgeht.

## Leads

- Zeitraum oben (Heute, Gestern, 7/30 Tage, Woche, Monat, Jahr, Maximum, eigener Zeitraum).
- **Suche** nach Name, Telefon oder E-Mail – sucht immer über alle Zeiträume.
- Ansichten: Alle, Rückruf nötig, Wiedervorlage fällig, Ohne nächsten Schritt, Termin.
- **Ohne nächsten Schritt** zeigt alle offenen Leads ohne Schritt, egal aus welchem Zeitraum. Die Zahl steht auch
  an „Kontakte“ in der Navigation.
- Hinweis „Kein nächster Schritt“ bzw. „Ergebnis fehlt“ mit dem Knopf **Nächster Schritt** direkt in der Zeile.

## Nächster Schritt

- Jeder Lead in Bearbeitung hat einen nächsten Schritt oder ist **Gewonnen** bzw. **Verloren**.
- Als nächster Schritt zählt: ein Termin, der noch kommt, eine Wiedervorlage bzw. Aufgabe mit Datum oder ein
  laufendes Gespräch mit dem WhatsApp-Assistenten (Nachricht in den letzten 24 Stunden).
- Neue Leads zählen noch nicht: Ihr nächster Schritt ist der erste Anruf (Anrufliste auf „Heute“).
- **Ergebnis fehlt:** Der Termin ist vorbei, aber es ist noch kein Ergebnis eingetragen.
- Nach einem Anrufergebnis, einer Notiz, einer E-Mail, einem übernommenen Chat oder einem vorbeigegangenen
  Termin fragt die App **„Wie geht es weiter?“**, wenn der Lead danach keinen nächsten Schritt hat:
  - Wiedervorlage: heute später, morgen, in 3 Tagen oder an einem Datum
  - Termin anbieten: Ihr persönlicher Terminlink per E-Mail, per WhatsApp oder kopiert. Bucht der Lead nicht,
    erinnert die App Sie in 2 Werktagen.
  - Nicht erreicht, Gewonnen, Verloren (mit Grund)
  Schließen Sie das Fenster ohne Wahl, legt die App für morgen die Aufgabe „Nächsten Schritt festlegen“ an.
- **Tägliche Erinnerung:** Um 8 Uhr per Push und E-Mail, wenn Leads keinen nächsten Schritt haben oder ein
  Termin-Ergebnis fehlt. Berater bekommen sie für ihre Leads, Inhaber für eigene und nicht zugeteilte.
  Abschalten unter **Einstellungen → Erinnerungen & Aufgaben**.
- Unter **Zahlen** steht die Kennzahl **Leads mit nächstem Schritt** (Ziel 100 %), im Team je Berater.

## Verloren und nicht erreicht

- **Verloren** fragt immer nach dem Grund: Kein Interesse (im Gespräch abgelehnt), Schon versichert, Zu teuer
  oder passt nicht, Falsche oder ungültige Daten (Nummer existiert nicht, Fake-Angaben), Hat nichts angefragt,
  Nach 6 Versuchen nicht erreichbar, Sonstiges (mit kurzer Begründung). Das gilt überall: im Kontakt, in der
  Pipeline, auf „Heute“, in der Anrufliste und auf dem Handy.
- Ganz oben steht **Nicht erreicht?**: Die App trägt einen Anrufversuch ein, plant den nächsten Versuch und
  bietet die Nachricht „Nicht erreicht“ per WhatsApp bzw. E-Mail an. Der Lead bleibt offen.
- Viele Leads erreicht man erst beim 4. bis 6. Versuch. Wurde ein Lead nie erreicht und hat er weniger als
  6 Anrufversuche, warnt die App: **Weiter versuchen** plant den nächsten Versuch, **Trotzdem verloren** geht
  nur mit Begründung. Ohne Warnung: falsche Daten, „Hat nichts angefragt“ und „Kein Interesse“ im Gespräch.
- **Nach 6 Versuchen nicht erreichbar** ist erst nach 6 dokumentierten Versuchen wählbar.
- **Anrufplan** bei „nicht erreicht“: 6 Versuche über mindestens 3 Tage zu verschiedenen Tageszeiten
  (Tag 1: sofort, nach 2 Stunden und abends; Tag 2 vormittags; Tag 4 nachmittags; Tag 6 abends). Der nächste
  Versuch steht als Wiedervorlage „Anrufversuch X von 6“ auf „Heute“. Eine eigene, spätere Wiedervorlage bleibt.
- Ein Anrufversuch zählt, wenn Sie nach dem Anruf „Nicht erreicht“ wählen, höchstens einmal je 30 Minuten.
  Jeder Versuch steht im Verlauf des Kontakts.

## Lead öffnen (Lead-Detail)

- Oben die Phasen-Leiste: antippen, um die Phase zu ändern. Knöpfe **Gewonnen** und **Verloren**
  (bei Verloren fragt die App nach dem Grund, siehe „Verloren und nicht erreicht“).
- Hat der Lead keinen nächsten Schritt, steht oben ein Hinweis mit dem Knopf **Nächster Schritt**.
- Aktionen: **Anrufen**, **Chat** (WhatsApp), **Termin**, **Mehr**.
- **Termin:** Mit verbundenem Kalender öffnet sich ein Fenster direkt in der App (kein neuer Tab) mit Ihren freien
  Zeiten wie auf der Buchungsseite: Telefon oder Video wählen, Zeit antippen, **Termin buchen**. Der Lead bekommt die
  Einladung per E-Mail und eine Bestätigung per WhatsApp, die Phase wird „Termin vereinbart“. Dasselbe Fenster öffnet
  „Termin buchen“ auf „Heute“ und „Termin vereinbart“ nach einem Anruf.
  Darunter (auch ohne Kalender) **Termin von Hand eintragen**: Datum, Uhrzeit, Art (Telefon, Video, Vor Ort) und Notiz.
  Der Termin steht dann auf „Heute“ und im Kontakt, die Phase wird „Termin vereinbart“. Er wird nicht in den Kalender
  übertragen, und der Lead bekommt keine automatische Erinnerung.
- **Chat ohne bisherigen Verlauf:** Tippen öffnet „WhatsApp-Gespräch starten“. Die App sendet die freigegebene
  Erstnachricht (Du oder Sie, mit oder ohne Namen, je nach Einstellung). Das geht nur, wenn der Lead selbst über ein
  Formular angefragt hat, WhatsApp verbunden ist und eine Mobilnummer da ist. Fehlt etwas, steht dort, was zu tun ist.
- **Knöpfe, bei denen etwas fehlt** (zum Beispiel Anrufen ohne Nummer oder E-Mail ohne Adresse), sind blasser. Antippen
  erklärt, was fehlt, mit dem passenden Knopf (zum Beispiel **Angaben ändern**).
- Eigene Kacheln für **E-Mail** und **Wiedervorlage**. Unter „Mehr“ nur noch, was nicht als Kachel da ist:
  **Postfach verbinden** (ohne verbundenes Postfach), **Stornieren/Reklamieren** (bei gekauften Leads),
  **Daten löschen (DSGVO)** (nur Inhaber).
- Karte zum nächsten Termin (Videocall, Verschieben oder absagen im Fenster) und die Zusammenfassung des Assistenten.
- **Einwilligung** (bei Leads aus Meta-Formularen): ob der Lead das Häkchen gesetzt hat, mit Zeitpunkt, Formular, Textversion
  und Wortlaut. Fehlt es, steht dort rot, dass keine WhatsApp-Nachrichten rausgehen.
- **Gesundheitsangaben (vertraulich):** aufklappbar, nur für Sie; nicht beim Assistenten und nicht unter „Angaben zum Lead“.
- Inhaber können unter **Zuständig** den Lead einem Berater geben – der bekommt eine Push-Nachricht.
- „Angaben zum Lead“: alle Antworten aus dem Formular. Mit **Bearbeiten** (Stift) korrigieren Sie Anrede, Name,
  Telefon, E-Mail und Adresse, zum Beispiel Tippfehler. Die Änderung steht im Verlauf, WhatsApp läuft danach über die
  neue Nummer, die ursprünglichen Formularantworten bleiben erhalten. Darunter Notizen (speichern sich von selbst).

## Pipeline

- Spalten: Neuer Lead, Nicht erreicht, (Im Gespräch), Termin vereinbart, Angebot gesendet, Abschluss,
  Kein Interesse, Disqualifiziert.
- Am Rechner Karten mit der Maus in eine andere Spalte ziehen. Auf dem Handy die Karte antippen und die Phase wählen.
- In „Abschluss“ fragt die App nach dem Beitrag (siehe „Abschluss und Provision“). Die Spalte „Abschluss“ zeigt
  die geschätzte Provision über alle Verträge, jede Karte „Sparte · Beitrag … · Provision ≈ …“ bzw. „2 Verträge · …“.
- Karten zeigen, wie lange der Lead schon in der Phase ist, und warnen bei „Kein nächster Schritt“ bzw. „Ergebnis fehlt“.
- Ziehen auf „Kein Interesse“ oder „Disqualifiziert“ fragt nach dem Grund (siehe „Verloren und nicht erreicht“).

## Chats (WhatsApp)

- Liste mit Filter „Alle“ / „Wartet auf Sie“ und Suche.
- **Selbst schreiben:** Sobald Sie antworten, pausiert der Assistent in diesem Chat. Mit dem Schalter
  „Assistent“ schalten Sie ihn für diesen Chat wieder ein oder aus.
- **Anrufen:** Tippen Sie in der App auf „Anrufen“ (im Chat, im Kontakt, auf „Heute“ oder in der Anrufliste), pausiert
  der Assistent für diesen Kontakt, bis Sie unter „Wie lief es?“ das Ergebnis eintragen, höchstens 3 Stunden.
  „Wie lief es?“ öffnet sich, sobald Sie nach dem Anruf in die App zurückkommen.
- **24-Stunden-Regel von WhatsApp:** Hat der Kunde länger als 24 Stunden nicht geschrieben, dürfen nur
  freigegebene Vorlagen raus. Dann erscheint „Nachfassen senden“ statt des Textfelds. Antwortet der Kunde,
  können Sie wieder frei schreiben.
- „Erledigt“ entfernt den Chat aus „Wartet auf Sie“.
- **Neuer Kontakt:** Schreibt eine Nummer, die zu keinem Lead gehört (z. B. ein privater Kontakt, wenn Ihre Nummer aus der
  WhatsApp Business App verbunden ist), antwortet der Assistent nicht und es geht keine automatische Nachricht raus. Der
  Chat steht mit „Neuer Kontakt“ unter „Wartet auf Sie“. Mit **„Als Lead übernehmen“** im Chat wird daraus ein Lead
  (Herkunft „Eigener Kontakt“, zählt nicht als bezahlter Lead) und der Assistent übernimmt. Sonst antworten Sie selbst oder
  lassen den Chat liegen. Auf Wunsch schaltet performancegrowth den Assistenten auch für neue Kontakte ein
  (Kontakte aus der WhatsApp Business App bleiben trotzdem ausgenommen).
- **„STOPP“:** Schreibt ein Kontakt „STOPP“ (oder „Stop“, „Abmelden“, „Keine Nachrichten mehr“), bekommt er eine kurze
  Bestätigung und danach keine WhatsApp-Nachrichten mehr: kein Assistent, kein Nachfassen, keine Termin-Nachrichten, keine
  Kampagnen, auch nicht von Hand. Im Chat steht dann ein roter Hinweis. Schreibt der Kontakt später selbst wieder, können Sie
  antworten; der Assistent bleibt in diesem Chat aus.
- Im Verlauf stehen kleine Hinweise, z. B. „Möchte einen Menschen: an Sie übergeben“ oder „Antwort ersetzt: keine Tarif-,
  Preis- oder Versichereraussagen“. Der ganze Verlauf bleibt für Sie sichtbar.
- Bei Terminen im Chat: Video-Link, Verschieben, Termin absagen (beides im Fenster, Absagen mit Rückfrage).
- Rechts bzw. oben: Kontakt, Angaben aus dem Formular, „Lead öffnen“.

## Termine vorbereiten

- Auf **Heute** steht ab dem Vortag (bei kurzfristigen Buchungen sofort) die Aufgabe **Termine vorbereiten:
  Angebot rechnen** mit jedem anstehenden Termin. Ein Klick öffnet die **Terminvorbereitung**.
- Dort stehen die Angaben in der Reihenfolge des Allianz-Tarifrechners (je Sparte), die **offenen Punkte**, die Sie
  im Termin klären, alles aus dem Leadformular und die Unterlagen, um die der Kunde
  gebeten wurde. **Als PDF** gibt es das Ganze zum Drucken oder für den zweiten Bildschirm.
- Haben Sie das Angebot gerechnet, tippen Sie **Vorbereitet**; die Aufgabe verschwindet. Auch im Kontakt am Termin:
  **Vorbereiten**.
- **Angebote und Präsentation:** In der Terminvorbereitung tragen Sie Ihre Angebote ein (Sparte, Tarif, Beitrag pro
  Monat, wichtigste Leistungen, was nicht versichert ist) und markieren, was Sie empfehlen. Mit **Angebote hochladen** (direkt in der
  Terminvorbereitung, auch mehrere Dateien oder Screenshots aus dem Tarifrechner) liest die App sie aus (Sach-, Haftpflicht-, Rechtsschutz-, Unfall- und Tierversicherungen; bei Kranken, BU oder Leben nicht, wegen möglicher Gesundheitsangaben). Laden Sie nur das Angebot hoch, keine Antragsunterlagen mit Gesundheitsfragen. Nach **Prüfen und bestätigen** öffnet **Präsentation**
  eine bebilderte Beratungsstrecke mit den Angaben Ihres Kunden und Ihren Angeboten, in den Farben Ihrer
  Gesellschaft. Im Videocall den Bildschirm teilen, **Vollbild**, mit den Pfeiltasten weiter. **Als PDF** zum Nachschicken.
- **Bausteine im Termin:** Zu jedem Angebot tragen Sie Bausteine mit ihrem Beitrag aus dem Tarifrechner ein (z. B.
  Zahnbehandlung +4,10 € oder höhere Selbstbeteiligung −2,80 €; der Haken heißt „im Angebot enthalten“). In der
  Präsentation tippen Sie einen Baustein auf der Folie an oder ab: Der Beitrag rechnet sich sofort neu, abgewählte
  Bausteine stehen auf der Empfehlungsfolie unter „nicht versichert“. Die gewählte Fassung wird gespeichert und steht auch im PDF.
- **Tarif im Termin wählen:** Je Sparte zeigt die Terminvorbereitung eine Tabelle wie im Tarifrechner: Stufen als Spalten
  (z. B. Basis, Smart, Komfort, Premium), Beitrag, Ihre Empfehlung und Merkmale als Zeilen („75 Mio. €“, „ja“, „nein“). Die Präsentation zeigt dann eine
  Vergleichstabelle wie im Tarifrechner. Mit **Auswählen** wechseln Sie im Termin die Stufe; Ihre Empfehlung bleibt
  markiert, Beitrag und Leistungen richten sich nach der Wahl.
  Auf der Empfehlungsfolie (Leistungen und was nicht versichert ist, je Sparte) wechseln Sie die Stufe ebenfalls; der Stern zeigt Ihre Empfehlung. Auf der Beitragsfolie nimmt ein Klick auf ein Produkt es
  heraus, ein zweiter Klick holt es mit Ihrer Empfehlung zurück.
- **Kombi-Rabatt (z. B. Allianz PrivatSchutz):** Wählen Sie zwei oder mehr passende Sparten einer Gesellschaft mit
  Kombi-Rabatt, rechnet die Terminvorbereitung den Rabatt unter der Vorschau mit (**Empfehlung gesamt**: Endbeitrag,
  „statt … Kombi-Rabatt 5 %“). Tragen Sie die Beiträge ohne Kombi-Rabatt ein, den Rabatt rechnen wir. Darunter steht
  die nächste Stufe („Noch 1 Vertrag bis 10 %“, ein Klick nimmt die passende Sparte dazu) und ein Hinweis, wenn eine
  gewählte Stufe nicht zählt (bei der Allianz nur Komfort und Premium, Laufzeit 3 Jahre). Die Beitragsfolie zeigt
  Einzelsumme, Rabatt in Prozent und Euro, Endbeitrag und die Staffel; die Bedingung und der Satz „Die Versicherungen
  sind auch einzeln abschließbar“ stehen klein darunter. Nimmt Ihr Kunde im Termin eine Sparte heraus oder wählt eine
  andere Stufe, rechnet die Folie sofort neu.
- **Was hat Ihr Kunde schon?** In Schritt 1 steht unter den Versicherungen der Bereich **Was hat Frau Becker
  schon?**. Je Versicherung tippen Sie **Ja, bei mir**, **Ja, woanders**, **Weiß nicht** oder **Nein**; bei
  **Ja, woanders** wählen Sie Versicherer und Tarif aus der Liste und tragen Ablauf und ungefähren Beitrag ein.
  Beantwortete Zeilen klappen auf eine Zeile zu (z. B. „Hausrat · Ja, woanders · HUK Classic, 8 €“), Antippen öffnet
  sie wieder. Oben stehen mit Glühbirne die Tipps: höchstens zwei erkannte Lücken aus Formular, Chat und Ihren
  Verträgen (z. B. Hund ohne Hundehaftpflicht, mit Hinweis, wenn sie im Bundesland Pflicht ist) und höchstens ein
  Vorsorge-Thema, je mit einer Frage für das Gespräch. **+ Versicherung hinzufügen** sucht über alle Versicherungen,
  auch PKV, BU, Rente oder Kfz (Abkürzungen wie „PKV“ oder „BU“ funktionieren). Der Schalter **Ins Angebot** nimmt eine
  Versicherung „bei Bedarf“ dazu: Sie steht in der Präsentation erst auf der Folie **Ihr Schutz im Überblick** (Ampel:
  bei uns, woanders versichert, prüfen, Lücke) und kommt mit **Mit anschauen** in Vergleich und Beitrag; ab dem zweiten
  passenden Vertrag erscheint sofort der Kombi-Rabatt. **Gleich zeigen** nimmt sie direkt ins Angebot. Unter **So sieht
  es der Kunde** sehen Sie die Ampel der Folie. Alles wird automatisch gespeichert. Gesundheitsangaben werden hier nicht
  erfasst, nur ob und wo Ihr Kunde versichert ist.
- **Vorsorge-Thema:** Das Vorsorge-Thema (PKV-Check, Berufsunfähigkeit, Risikoleben und Altersvorsorge,
  Pflegevorsorge) wird nur aus Beruf, Lebenslage und Alter abgeleitet, nie aus Gesundheitsangaben. Dafür vereinbaren
  Sie meist einen eigenen Termin. Themen, die Sie nicht anbieten, schalten Sie unter **Einstellungen → Präsentation**
  ab.
- **Link für Ihren Kunden:** Unter der Präsentation erstellt **Link erstellen** einen persönlichen Link mit dem Stand aus
  dem Termin, ohne Schalter zum Umstellen, 14 Tage gültig. Kopieren, per WhatsApp oder E-Mail schicken, bei
  Bedarf **Link beenden**.
- **Logo auf der Präsentation:** Unter **Einstellungen → Logo für Präsentationen** holt die App das Logo von Ihrer
  Webseite (bei einer Agentur meist das Logo Ihrer Gesellschaft) oder Sie laden es hoch (PNG, JPG oder SVG, bis 1 MB).
  Erst nach Ihrer Bestätigung, dass Sie es verwenden dürfen, erscheint es auf der Titelfolie und im Fuß jeder Folie.
  Manche Webseiten lassen sich nicht automatisch abrufen; dann einfach hochladen.

## Der WhatsApp-Assistent

- Schreibt neue Leads in wenigen Minuten an, stellt ein paar Fragen und bucht einen Termin in freie Zeiten
  Ihres Kalenders. Die Bestätigung und eine Erinnerung etwa 24 Stunden vorher gehen per WhatsApp raus, etwa eine
  Stunde vorher fragt er noch kurz, ob alles passt (sonst wird verschoben statt verpasst).
- Verschieben läuft im Chat: In Bestätigung und Erinnerungen steht kein Link mehr, der Lead antwortet einfach
  und der Assistent schlägt neue Zeiten vor. (In der E-Mail-Bestätigung bleibt der Link.)
- **Knöpfe statt Tippen (seit 15.11.2026):** Wo eine Antwort erwartet wird, hat die Nachricht Schnellantwort-Knöpfe:
  - Erinnerung am Vortag und kurz vorher: **Ja, passt** (der Termin gilt als bestätigt, der Lead bekommt ein kurzes
    Danke) oder **Bitte verschieben** (der Assistent schlägt zwei neue Zeiten vor und verschiebt).
  - Terminbestätigung: **Termin verschieben** und ein kurzer Hinweis, Unterlagen zum Thema bereitzulegen.
  - Nicht erschienen: „Kein Problem, so etwas passiert. Sollen wir einen neuen Termin finden?“ mit **Ja, neuer Termin**
    oder **Kein Bedarf mehr**.
  - Letzte Nachricht einer Nachfass-Abfolge: **Ja, noch aktuell** oder **Nein, danke**.
  - Nachfassen nach einem Angebot: „Ist für Sie eher der Beitrag oder die Leistung entscheidend?“ mit Knöpfen; der
    Assistent bietet dann ein kurzes Gespräch mit Ihnen an, ohne Beträge zu nennen.
  - Tippt ein Lead **Kein Bedarf mehr** oder **Nein, danke**, steht er danach auf **Verloren: Kein Interesse** (Notiz
    „kein Bedarf“), das Nachfassen endet und er bekommt ein freundliches Danke. Im Verlauf des Kontakts steht das.
- **Nachfassen mit zwei Terminvorschlägen:** Ist Ihr Kalender verbunden, nennt die Nachfass-Nachricht zwei freie Zeiten
  (z. B. „Di., 17.11. um 10:00 Uhr oder Mi., 18.11. um 16:00 Uhr“) mit den Knöpfen **Erste Zeit passt**, **Zweite Zeit
  passt** und **Andere Zeit**. Der Assistent bucht dann genau diese Zeit (er fragt vorher nur, ob Telefon oder Video).
  Ohne Kalender kommt eine kurze Nachfrage.
- Bittet ein Lead, sich später zu melden („morgen nochmal“, „nächste Woche“), legt der Assistent sich selbst eine
  **Wiedervorlage** und meldet sich zur vereinbarten Zeit per WhatsApp. Sie sehen sie im Kontakt unter den
  Aktionen („Wiedervorlage vom Assistenten …“); der Lead zählt damit nicht als „ohne nächsten Schritt“.
- **Erste Nachricht (seit 15.11.2026):** keine Frage, ob der Lead Zeit hat, sondern gleich eine leichte erste Frage
  zum Produkt mit Knöpfen, z. B. Tierkrankenversicherung „Für welches Tier suchen Sie den Schutz?“ (Hund, Katze),
  Zahnzusatz „Was ist Ihnen am wichtigsten?“ (Zahnersatz, Prophylaxe, Beides), private Krankenversicherung „Wie sind
  Sie aktuell beruflich aufgestellt?“ (Angestellt, Selbstständig, Beamter), Privatschutz „Worum geht es Ihnen vor
  allem?“ (Haftpflicht, Hausrat, Mehreres). Ohne bekanntes Produkt: „Wann erreicht [Ihr Name] Sie am besten für ein
  kurzes Telefonat?“ (Heute, Morgen, Lieber schriftlich). Die Antwort per Knopf nimmt der Assistent als Antwort auf diese
  Frage, stellt eine zweite und bietet dann direkt zwei Termine an.
- Bei Privatschutz und Tierkrankenversicherung gilt: erst der Termin, dann die Fragen. Vor dem Termin klärt der
  Assistent bei Privatschutz nur, worum es genau geht (bei Tieren: welche, wie viele, Tierkranken oder
  Tierhalterhaftpflicht) und wer versichert werden soll, bei Tierkrankenversicherung gar nichts. Die Angaben fürs
  Angebot (z. B. Geburtsdatum, Vorschäden, bestehende Verträge, Wohnfläche, Gesundheit des Tieres) fragt er nach der
  Buchung ab, die erste Frage gleich in der Bestätigung. Zum Schluss nennt er die Unterlagen für den Termin. Hat der
  Lead direkt über das Leadformular bzw. die Buchungsseite gebucht, meldet sich der Assistent trotzdem, bestätigt
  den Termin und fragt die Angaben ab. Was er erfahren hat, steht im Kontakt.
- Braucht ein Lead Sie (Frage, die der Assistent nicht beantworten soll), landet der Chat unter „Wartet auf Sie“
  und Sie bekommen eine Push-Nachricht.
- **Leads ohne WhatsApp (seit 15.11.2026):** Der Assistent arbeitet nur über WhatsApp. Meldet WhatsApp, dass die
  Nummer nicht erreichbar ist (keine WhatsApp-Nummer, sehr alte App oder Nutzungsbedingungen nicht bestätigt), rufen
  Sie den Lead bitte direkt an. Die App macht dafür sofort Folgendes:
  - Push „Sofort anrufen: … hat kein WhatsApp“ mit der Nummer an den zuständigen Berater (ohne Zuteilung an alle).
  - Der Lead steht ganz oben auf **Heute → Anrufen** (und in der Anrufliste) mit „Kein WhatsApp: bitte direkt
    anrufen“, im Kontakt steht ein roter Hinweis mit Knopf zum Anrufen.
  - Der Assistent schreibt nicht mehr, auch kein Nachfassen und keine Termin-Nachrichten per WhatsApp. Schritte einer
    Nachfass-Abfolge werden zu Anruf-Aufgaben.
  - Hat der Lead eine E-Mail-Adresse angegeben, bekommt er einmal eine kurze E-Mail in Ihrem Namen zu seiner Anfrage
    mit Ihrem Terminlink (mit Kalender) bzw. der Bitte, einfach zu antworten. Sie geht über Ihr verbundenes Postfach
    (liegt dann in Ihrem Gesendet-Ordner), sonst über unseren neutralen Absender mit Ihrer Adresse als Antwortadresse.
    Keine E-Mail, wenn schon ein Termin steht, die E-Mail-Funktionen ausgeschaltet sind oder sich die Adresse abgemeldet
    hat. Sie steht im Verlauf des Kontakts.
  - Schreibt der Lead später doch per WhatsApp, gilt der Hinweis nicht mehr und Sie antworten selbst im Chat.
  - Den Anteil sehen Inhaber unter **Zahlen** („Leads ohne WhatsApp“).
<!-- bestand-modul -->
- Bestandskunden, deren Kampagnen-Nachricht mit „nicht per WhatsApp erreichbar“ zurückkommt, bekommen künftige
  Kampagnen nur noch per E-Mail, soweit E-Mail für den Anlass erlaubt ist (Einwilligung bzw. § 7 Abs. 3 UWG).
<!-- /bestand-modul -->
- **Ansprache (Sie oder Du)**: Standard ist „Sie“. Inhaber stellen das unter **Einstellungen → Assistent → WhatsApp-Vorlagen**,
  **Einstellungen → E-Mail-Postfach** oder im Einrichtungs-Fragebogen um. Es gilt für den Assistenten,
  WhatsApp-Vorlagen, Termin-Nachrichten, Termin-E-Mails, die Buchungsseite und die E-Mail-Vorlagen.
- **Anrede**: Bei „Sie“ beginnen Nachrichten mit „Guten Tag Frau Schneider,“ bzw. „Guten Tag Herr Schneider,“, wenn die
  Anrede bekannt ist (Feld Anrede oder Geschlecht im Leadformular, Anrede beim Bestandskunden) oder der Vorname eindeutig
  ist (Julia, Peter). Bei Vornamen, die beides sein können (Andrea, Kim, Sascha), mit vollem Namen („Guten Tag Andrea
  Schneider,“), ohne Nachnamen mit „Guten Tag,“. Die Anrede können Sie im Kontakt jederzeit ändern.
  Bei „Du“: „Hallo Julia,“. Das gilt auch für den Assistenten im weiteren Chat.
- **Namen in Nachrichten**: „Ihre Buchung bei …“ und „digitaler Assistent von …“ nennen Ihren Firmennamen; „Ihr
  Videocall mit …“ nennt die Person, bei Teams den zuständigen Berater (Anzeigename unter **Team**).
- Wie sich der Assistent vorstellt und was er fragt, stellen wir für Sie ein. Änderungswünsche gern über
  „Etwas unklar? Feedback“ im Profilmenü oder im Hilfetermin.
- **KI-Hinweis (seit 15.11.2026, gesetzliche Pflicht):** Die erste Nachricht an jeden neuen Kontakt sagt immer, dass hier
  der digitale KI-Assistent schreibt, kein Mensch. Im Erstanschreiben ist der Hinweis kurz („Ich bin der digitale
  KI-Assistent von [Ihr Name], kein Mensch, …“); schreibt der Lead zuerst, enthält die erste Antwort den ausführlichen
  Hinweis (berät nicht zu Tarifen, „Mensch“ schreiben). Das lässt sich nicht abschalten. Nach mehr als 30 Tagen Pause wiederholt der Assistent den Hinweis kurz.
  Fragt jemand „Bist du ein Bot?“ oder schreibt „Mensch“ bzw. „Mitarbeiter“, antwortet der Assistent ehrlich, dass er eine KI
  ist, pausiert in diesem Chat, und Sie bekommen den Chat unter „Wartet auf Sie“ mit einer Mitteilung.
- **Keine Beratung durch den Assistenten:** Er nennt keine Versicherer, Tarife, Preise oder Beiträge, vergleicht nicht und
  sagt nichts dazu, was für jemanden passt. Jede Antwort wird vor dem Senden geprüft; fragt ein Lead danach, antwortet er
  „Das klärt [Ihr Name] im Termin mit Ihnen.“ und bietet einen Termin an.
- **Erstinformation:** Die Erstinformation (§ 15 VersVermV) muss Ihr Lead beim ersten Kontakt als Dokument bekommen
  (§ 16 VersVermV), ein Link allein reicht nicht. Seit 15.11.2026 hängt das **PDF direkt an der ersten WhatsApp**
  (oben in der Nachricht, „Oben: Erstinformation nach § 15 VersVermV (PDF)“), sobald Meta die neue Vorlage freigegeben
  hat. Bis dahin, bei noch unvollständiger Erstinformation und wenn der Lead zuerst schreibt, schickt der Assistent das
  PDF wie bisher nach seiner ersten Antwort (WhatsApp erlaubt freie Dokumente erst, wenn der Lead geschrieben hat). Das
  PDF geht nie doppelt raus. Bucht ein Lead selbst über die Buchungsseite, hängt das PDF an der **Terminbestätigung per
  E-Mail**. Im PDF steht auch, dass der Lead sie auf Wunsch auf Papier bekommt.
  - Prüfen unter **Einrichtung → Erstinformation für Ihre Leads**. Vorausgefüllt aus Angebot und Impressum: Status
    (Makler, Mehrfachvertreter oder Ausschließlichkeitsvertreter), Name, Firma, Anschrift, Registernummer
    (D-XXXX-XXXXX-XX), zuständige IHK, Beratung (Standard: ja), Vergütung (Standard: Provision bei Vertretern, Courtage
    bei Maklern; Honorar und Kombinationen möglich), andere Zuwendungen (Standard: nein) und Beteiligungen über 10 %
    (Standard: keine). Einmal **Angaben bestätigen**, erst dann gilt die Erstinformation als vollständig.
  - **Ausschließlichkeitsvertreter** tragen genau einen Versicherer ein („Für welchen Versicherer sind Sie tätig?“), im
    Dokument steht dann z. B. „gebundener Versicherungsvertreter nach § 34d Abs. 7 Satz 1 Nr. 1 GewO, tätig
    ausschließlich für die Allianz Versicherungs-AG“. **Mehrfachvertreter** tragen alle Versicherer ein (einer je Zeile)
    und wählen, ob sie eine eigene Erlaubnis nach § 34d Abs. 1 GewO haben oder gebunden nach Abs. 7 sind (nur bei
    Produkten, die nicht in Konkurrenz stehen). **Makler**: „Versicherungsmakler mit Erlaubnis nach § 34d Abs. 1 GewO“.
  - Eigene Vorlage: Ausschließlichkeitsvertreter haben meist eine fertige Erstinformation ihrer Gesellschaft. Laden Sie
    das PDF hoch, dann schickt der Assistent genau dieses Dokument (die Angaben im Formular sind dann freiwillig, die
    Registernummer bleibt Pflicht).
  - Fehlt etwas, steht oben auf „Heute“ ein Hinweis, und der Assistent schickt bis dahin nur den Link, kein PDF.
    Tippgeber können den Dienst nicht nutzen, weil der Assistent Termine für einen erlaubten Vermittler vereinbart.
- **Gesundheitsangaben** aus dem Leadformular (z. B. Vorerkrankungen, Behandlungen, BMI) bekommt der Assistent nicht, und sie
  gehen nicht per WhatsApp raus. Sie sehen sie im Kontakt unter **Gesundheitsangaben (vertraulich)**.

## WhatsApp-Vorlagen

- WhatsApp erlaubt die erste Nachricht an einen Lead (und jede Nachricht nach mehr als 24 Stunden
  Funkstille) nur mit einem Text, den Meta vorher geprüft hat. Diese Vorlagen reichen wir für Ihre
  Nummer automatisch bei Meta ein, sobald WhatsApp verbunden ist. Sie müssen nichts tun.
- Ansehen: **Einstellungen → Assistent → WhatsApp-Vorlagen**. Jede Vorlage steht als WhatsApp-Blase mit Beispielwerten
  (z. B. „Frau Schneider“ bzw. „Julia“) da; beim Senden setzt die App die echte Anrede, den Namen und den Termin ein.
- Status: **In Prüfung bei Meta** (meist Minuten bis wenige Stunden), **Freigegeben** oder
  **Abgelehnt**: dann kümmern wir uns und reichen einen angepassten Text neu ein.
- Erst wenn „Erste Nachricht an neue Leads“ freigegeben ist, kann der Assistent neue Leads anschreiben.
- **Neue Fassung seit 15.11.2026:** eigene erste Nachricht je Produkt (Tierkrankenversicherung, Zahnzusatz, private
  Krankenversicherung, Privatschutz, ohne Produkt) mit der ersten Frage, Knöpfen und der Erstinformation als PDF oben
  in der Nachricht; Knöpfe auch bei Erinnerung, Bestätigung und Nachfassen (siehe Der WhatsApp-Assistent). Die neuen
  Fassungen reichen wir automatisch ein. Bis Meta sie freigibt, geht die bisherige Fassung raus, Sie müssen nichts tun.
<!-- bestand-modul -->
- Mit dem Bestandskunden-Modul kommen vier Kampagnen-Vorlagen dazu. Sie haben unten den Knopf
  „Keine Nachrichten mehr“: Wer ihn antippt, bekommt keine Kampagnen mehr (wie bei „STOPP“). „Lücke schließen“ nennt
  einen Grund („Viele meiner Kunden haben beim Thema Hausrat eine Lücke, die erst im Schadenfall auffällt. Soll ich in
  10 Minuten kurz prüfen, ob das bei Ihnen auch so ist?“) mit den Knöpfen **Ja, gern prüfen** und **Kein Bedarf**.
  „Kein Bedarf“ beantworten wir mit einem kurzen Danke, ohne Lead und ohne Abmeldung.
- **Wie Sie sich nennen:** In Kampagnen stellen Sie sich passend zu Ihrem Status aus der Erstinformation vor:
  Ausschließlichkeitsvertreter mit Ihrer Gesellschaft („hier ist Anna Beispiel von der Allianz“), Mehrfachvertreter als
  „Ihr Versicherungsvertreter“, Makler als „Ihr Versicherungsmakler“. „Versicherungsberater“ verwenden wir nicht, das ist
  ein eigener Beruf.
<!-- /bestand-modul -->
- **Empfehlung:** Die Bitte um Empfehlung nennt das Thema („für den das Thema Tierversicherung gerade auch wichtig
  ist“) und geht am besten direkt nach einem guten Moment raus, z. B. wenn ein Kunde zufrieden antwortet.
- **Zwei Fassungen im Test:** Für einzelne Nachrichten testen wir zwei Formulierungen. Jeder Lead bekommt fest eine
  davon; sobald genug Antworten da sind und eine Fassung klar besser ankommt, wird sie für alle Standard.
- **Sie- und Du-Fassungen**: Die Vorlagen des Assistenten gibt es als Du-Fassung („Hallo Julia,“) und als Sie-Fassung
  („Guten Tag Frau Schneider,“). Für Kontakte ohne bekannten Nachnamen gibt es eine eigene Sie-Fassung, die mit
  „Guten Tag,“ beginnt. Wir reichen alle Fassungen automatisch bei Meta ein, so greift ein Wechsel der Ansprache
  sofort. Bis eine neue Fassung freigegeben ist, steht „Neue Fassung in Prüfung bei Meta“ und die bisher
  freigegebene Fassung geht raus. Der Erstkontakt wird dadurch nie aufgehalten.
- Kampagnen an Bestandskunden und die Nachrichten rund um Empfehlungen sind immer gesiezt.
- Text anders formulieren? Schreiben Sie uns über „Etwas unklar? Feedback“, wir passen ihn an.

## Automatisches Nachfassen (Abfolgen)

- Standardmäßig an: Die App fasst nach einem Ergebnis selbst nach:
  - **Nicht erreicht:** sofort eine WhatsApp (mit verbundenem Kalender mit zwei konkreten Zeiten zur Auswahl), nach
    6 Tagen eine letzte, freundliche WhatsApp mit den Knöpfen „Ja, noch aktuell“ und „Nein, danke“. Die Anrufe dazwischen plant der Anrufplan (siehe „Verloren und nicht erreicht“), es kommt keine
    zweite Anruf-Aufgabe dazu. Danach ist Schluss.
  - **Angebot gesendet:** nach 3 Tagen eine WhatsApp („Konnten Sie sich das Angebot schon anschauen? Ist für Sie
    eher der Beitrag oder die Leistung entscheidend?“ mit Knöpfen), nach 7 Tagen eine Anruf-Aufgabe.
  - **Nicht erschienen:** sofort eine WhatsApp, ob ihr einen neuen Termin findet (im Chat, ohne Link), nach 2 Tagen eine Anruf-Aufgabe.
  - **Chat ruht:** Antwortet ein Lead dem Assistenten nicht (auf die erste Nachricht oder mitten im Gespräch),
    fasst der Assistent nach 2 Stunden nach, nach 8 Stunden noch einmal, am nächsten Tag ein drittes Mal (nur solange
    das 24-Stunden-Fenster offen ist) und nach 3 Tagen ein letztes Mal. Einen Termin macht der Lead direkt im Chat aus (kein Link). Jede neue Nachricht des Assistenten
    startet das von vorn; schreiben Sie selbst im Chat oder pausieren den Assistenten, hört es auf.
- WhatsApp geht nur Mo–Sa zwischen 9 und 19 Uhr raus. Geht keine WhatsApp (z. B. keine Handynummer),
  legt die App stattdessen eine Anruf-Aufgabe an. Eine eigene, spätere Wiedervorlage bleibt bestehen.
- Das Nachfassen hört sofort auf, wenn der Lead antwortet, einen Termin bucht, „Stopp“ schreibt, auf
  Abschluss / Kein Interesse / Disqualifiziert steht, reklamiert oder gelöscht wird.
- Im Lead sehen Sie unter „Automatisches Nachfassen“, was schon passiert ist und was als Nächstes kommt.
  Mit „Automatisches Nachfassen stoppen“ beenden Sie es für diesen Lead.
- Ein- oder ausschalten für Ihr ganzes Konto: bitte kurz bei uns melden.

## Termine

- Buchung über „Termin“ beim Lead (Fenster in der App) oder die Buchungsseite: Beide zeigen nur Ihre Lead-Zeiten (unter „Mein Kalender“),
  die in Ihrem Kalender noch frei sind, Telefon oder Video. Das gilt auch, wenn ein Lead selbst bucht
  oder verschiebt.
- **Ihr Buchungslink:** steht unter „Mein Kalender“ → „Ihre Buchungsseite“ (Kopieren oder Öffnen). Er lautet jetzt
  kurz `dein-beratungstermin.de/ihr-name` (neutrale Adresse ohne unseren Namen), z. B. für E-Mail-Signatur, WhatsApp
  und Ihre Website. Auch alle anderen Seiten für Ihre Kunden laufen dort: Termin verschieben oder absagen,
  Kalenderdatei, Empfehlung, Einwilligung, Abmelden und Erstinformation. Unten auf diesen Seiten stehen Ihr Impressum
  und Ihre Datenschutzerklärung (aus Ihrer Website, siehe Einrichtung). Alte Links mit `app.performancegrowth.de/book/…`
  funktionieren weiter und führen automatisch zur neuen Adresse; im Leadformular bei Meta muss nichts geändert werden.
  Zum Einbinden auf Ihrer Website per iframe nehmen Sie die lange Form `dein-beratungstermin.de/book/ihr-name`.
- **Verschieben oder absagen:** auf „Heute“ (Termin antippen → **Verschieben oder absagen**), beim Lead an der
  Termin-Karte (**Verschieben**) oder im Chat. Es öffnet sich ein Fenster direkt in der App (auf dem Handy von unten):
  - Oben steht der aktuelle Termin (Tag, Uhrzeit, Telefonat oder Videocall, Dauer).
  - Darunter die freien Zeiten: nur Ihre Lead-Zeiten, die im Kalender noch frei sind (wie bei der Buchung, mit
    Abwesenheiten und Team). Mit den Pfeilen blättern Sie durch die Tage, dann eine Uhrzeit antippen.
  - **Verschieben** gilt sofort, unten erscheint eine kurze Bestätigung. Der Termin behält seine Dauer, der
    Kalendereintrag wird aktualisiert, der Kontakt bekommt die neue Zeit per WhatsApp und E-Mail (soweit vorhanden).
  - **Termin absagen** fragt einmal nach. Danach wird der Kalendereintrag gelöscht und der Kontakt bekommt eine Absage per E-Mail.
  - Berater sehen und ändern nur Termine ihrer eigenen Leads.
- Leads können über ihren Link selbst verschieben oder absagen.
- **Ein Kalender je Person:** Unter „Mein Kalender“ → „Ihr Kalender“ verbinden Sie Google oder Outlook. Der
  Inhaber verbindet den Kalender der Agentur, jeder Berater im Team seinen eigenen. Die Agentur ist für Termine
  frei, wenn mindestens eine Person frei ist; Termine werden reihum verteilt (Leads mit Zuständigem landen bei
  ihm). Inhaber im Team sehen die Karte „Team“: wer verbunden ist, und „Erinnern“ (E-Mail, höchstens 1× am Tag).
  War beim Inhaber früher ein persönlicher Kalender verbunden, erscheint „Als Ihren Kalender übernehmen“.
- Damit Termine nur in freie Zeiten fallen, liest die App nur, wann Sie belegt bzw. frei sind:
  1. **Google- oder Microsoft-Kalender** verbinden („Ihr Kalender“). Termine werden dort eingetragen.
  Dürfen wir den Firmenkalender nicht direkt lesen, unter „Andere Quelle für freie Zeiten“ (zugeklappt):
  2. **Kalender-Link (ICS):** In Outlook im Browser unter Einstellungen → Kalender → Freigegebene Kalender →
     Kalender veröffentlichen, „Kann sehen, wann ich beschäftigt bin“ wählen und den ICS-Link einfügen.
  3. **Allianz-Online-Kalender:** Link Ihrer Vertreter-Seite (vertretung.allianz.de/…) oder Ihre
     Vertreternummer eingeben und zustimmen. Wir lesen dann die freien Termine Ihrer Online-Terminbuchung
     (höchstens alle 10 Minuten). Für Tage, die dort noch nicht buchbar sind (meist heute und morgen),
     gelten Ihre Lead-Zeiten.
- **Wann dürfen Leads Termine buchen?** Wochentage und Uhrzeiten antippen (Standard: Mo–Fr 10, 14 und 16 Uhr).
  Der Assistent schlägt nur diese Zeiten vor, und nur wenn Sie dann frei sind. Tipp: Halten Sie diese Zeiten
  in Ihrem Kalender frei. Wer sie markieren möchte (Serie „Leadtermine“), stellt „Anzeigen als: Frei“ ein; mit
  Allianz-Online-Kalender bitte gar nicht blocken. Belegte Zeiten können wir nicht anbieten.
  - **Termindauer:** 15, 30, 45 oder 60 Minuten (Standard 30). Gilt für Buchungsseite, Assistent und neue Termine; beim Verschieben behält ein Termin seine Dauer. Im Team kann jeder Berater eine eigene Dauer einstellen, sonst gilt die des Inhabers.
  - **Schnellauswahl:** „Von … bis …“ wählen und „Alle 30 / 45 / 60 Min.“ tippen – die Uhrzeiten werden im Raster gesetzt (z. B. 9:00, 9:45, 10:30 …), danach einzelne Zeiten an- oder abwählen. „Alle abwählen“ leert die Auswahl. Gewählte Halb- und Viertelstunden erscheinen als eigene Knöpfe.
- **Zeit blockieren:** unter „Mein Kalender“ Datum und von–bis eintragen. In dieser Zeit werden keine Termine
  angeboten. Löschen jederzeit in der Liste.
- Gebuchte Termine kommen weiter als Kalendereinladung an Ihre Adresse für Termineinladungen (z. B. Allianz-Mail).

## Einrichtung (neue Kunden)

- Oben steht **„Einrichtung: x von y erledigt“** mit allen Schritten: Login, Fragebogen, App aufs Handy und Mitteilungen, Kalender,
  E-Mail-Postfach, Provisionen, Erstinformation, Meta freigeben, WhatsApp verbinden, Einwilligung im Leadformular, Testlead (den macht performancegrowth).
  Nur mit gebuchtem Modul bzw. Team kommen dazu: <!-- bestand-modul -->**Kundenliste hochladen** (Bestandskunden-Modul), <!-- /bestand-modul -->**Google-Bewertungslink hinterlegen**
  (Empfehlungen & Bewertungen) und **Team einladen** (weitere Verkäufer gebucht).
  Offene Schritte sind anklickbar. Bei einigen Schritten gibt es ein kurzes Erklärvideo.
- **Meta freigeben:** Werbekonto-ID (Format act_…, steht im Werbeanzeigenmanager oben links bzw. in der Adresse nach „act=“; der ganze
  Link geht auch) und Facebook-Seite (Adresse facebook.com/… oder Seiten-ID) eintragen. Dann:
  - **„Anfrage von uns senden lassen“**: performancegrowth schickt die Partner-Anfrage, der Kunde bekommt in Meta eine Benachrichtigung
    und bestätigt sie nur noch. Klappt das nicht, die Schritte darunter selbst ausführen (Business-Einstellungen → Partner → Hinzufügen →
    unsere Business-ID → Werbekonto mit „Kampagnen verwalten“, Seite mit „Volle Kontrolle“, Datensatz (Pixel) mit voller Kontrolle
    bzw. „Verwalten“).
  - **„Zugriff prüfen“**: zeigt für Werbekonto, Seite und Leads einzeln, ob alles da ist und was noch fehlt. Ist alles grün, ist der
    Schritt erledigt. Die App prüft offene Freigaben außerdem täglich selbst nach.
  - **Datensatz (Pixel):** Darüber erfährt Meta, welche Leads zu Terminen und Verträgen werden (**Einstellungen → Rückmeldung an
    Meta**). Die Prüfung zeigt „Datensatz freigegeben“, „gefunden, aber noch nicht freigegeben“ (dann unter Partner nachreichen) oder
    „Kein Datensatz vorhanden“. Anlegen: **„Noch keinen Datensatz?“** in der Anleitung (Events Manager → Datenquellen verbinden → Web →
    Name → dem Werbekonto zuordnen, dann freigeben). Der Schritt ist auch ohne Datensatz erledigt; die App prüft den Datensatz in den
    ersten Wochen täglich nach und startet die Rückmeldung dann von selbst.
- **WhatsApp verbinden:** Vorher prüfen: eine Nummer, die nicht in der normalen WhatsApp-App genutzt wird (zweite SIM, Festnetz oder
  neue Nummer) bzw. die Nummer aus der WhatsApp Business App, SMS oder Anruf mit Code kann empfangen werden, Admin im Business Manager,
  Zugang zum E-Mail-Postfach, Computer mit erlaubten Pop-ups. Ausführliche Anleitung mit Bildern und Video: **Hilfe → WhatsApp verbinden**
  (`/buyer/hilfe/whatsapp`). Ablauf (Stand 15.11.2026, Texte bei 360dialog und Meta auf Englisch):
  1. Einrichtung → **„WhatsApp verbinden“** → Nummer wählen → **„Jetzt WhatsApp verbinden“**. Die App legt das Konto bei 360dialog
     (unserem WhatsApp-Anbieter) an, kostenlos.
  2. In der App steht dann **Schritt 1 „E-Mail von 360dialog öffnen“** (gelb markiert, mit Adresse, Absender, Betreff und Knopf zum
     Postfach) und **Schritt 2 „WhatsApp-Nummer verbinden“**. Darunter aufklappbar: „So geht es bei 360dialog und Meta weiter (mit Bildern)“.
  3. E-Mail von „360Dialog“ (no-reply@360dialog.com), Betreff „Join [Firmenname] on the 360Dialog Hub“ → **„Join 360Dialog Hub“** →
     Passwort festlegen. Keine E-Mail: Spam-Ordner. Nicht selbst über „Sign up“ registrieren.
  4. In der App Häkchen **„Erledigt, ich habe mein Passwort festgelegt“** → **„Weiter: WhatsApp verbinden“** → bei 360dialog **„Log in“**
     (nicht mit Facebook oder Google). „Verify it's you“: Code aus einer zweiten E-Mail eintragen, optional „Remember this device for
     30 days“, **„Continue“**.
  5. „Onboard new number“ → „Enter phone number“: Land ist auf USA (+1) vorbelegt, auf **Deutschland (+49)** umstellen, Nummer ohne
     führende 0, **„Next“**. Nicht „Use Meta-provided number“.
  6. „Is +49 … already on WhatsApp?“: **„No, It's not connected“** (neue Nummer, Festnetz, gelöschte private Nummer),
     **„Yes, Business app“** (WhatsApp Business App), „Yes, Personal app“ (normale WhatsApp-App, vorher Konto löschen oder auf
     WhatsApp Business umstellen), „Yes, Business API“ (Nummer bei einem anderen Anbieter).
  7. Neue Nummer: „Verify your phone number“, Code per **SMS** oder **Voice call** (Festnetz), nicht überspringen, nicht mehrfach
     kurz hintereinander anfordern (sonst sperrt Meta die Nummer für einige Stunden).
  8. „Meta Business Signup“ (vier Schritte, Hinweis „make sure not to select Display Name only“) → unten rechts **„Embedded Signup“**.
     Pop-ups müssen erlaubt sein.
  9. Fenster von Meta „Facebook Login for Business“, „Seamlessly connect your account to 360Dialog“ → **„Continue“**.
  10. „Add your WhatsApp phone number“: Nummer ist vorausgewählt → **„Next“**. Business App: hier statt des SMS-Codes per Nachricht in der
      WhatsApp Business App einen **QR-Code scannen** (den Chatverlauf müssen Sie nicht teilen, die App übernimmt ihn ohnehin nicht; bestehende Chats bleiben privat); die Nummer sollte etwa 7 Tage in
      der App genutzt worden sein.
  11. „Select the business assets to share with 360dialog“: eigenes **Business portfolio** (dasselbe wie für das Werbekonto),
      WhatsApp account **„Create a WhatsApp account“** → „Next“.
  12. „Enter business information for new assets“: Name wie im Impressum, Kategorie z. B. Professional Services oder Finance, Land
      Germany, Website freiwillig, Zeitzone **Europe/Berlin** (Meta schlägt oft z. B. Europe/Vienna vor) → „Next“.
  13. „Review what you'll share with 360dialog“: Unternehmen, WhatsApp-Konto, Nachrichtenkonto prüfen. „Access your Facebook ads and
      related stats“ steht immer dabei und ändert nichts an den Anzeigen → **„Confirm“**.
  14. „Your account is connected to 360Dialog“: unter „Improve your experience“ **beide Häkchen entfernen** („Instruct Meta to
      automatically identify order and lead events“, „Share Cloud API events“) → **„Finish“**.
  15. Zurück in der App: **„Fast geschafft: Ihre Nummer wird bei WhatsApp noch eingerichtet …“**. Die Seite lädt sich von selbst neu und
      zeigt nach wenigen Minuten **„Verbunden“**; sonst **„Verbindung prüfen“**. Meta prüft das Konto zusätzlich innerhalb von 24 Stunden.
  Private WhatsApp-Nummer: vorher das WhatsApp-Konto löschen (Chats weg) oder kostenlos auf WhatsApp Business umstellen und den
  Business-App-Weg nehmen. Zeigt 360dialog „Choose a plan“ oder „Pending Activation“: nichts kaufen, performancegrowth schaltet frei.
- **E-Mail-Postfach verbinden:** Google, Microsoft oder anderer Anbieter (SMTP), wie unter **Einstellungen → E-Mail-Postfach**.
  Manche Gesellschaften (z. B. für Ausschließlichkeitsvertreter) erlauben nicht, das dienstliche Postfach mit anderen Programmen zu
  verbinden. Dann **„Meine Gesellschaft erlaubt das nicht“** tippen: Die App sendet E-Mail-Vorlagen nicht selbst; im Kontakt öffnet
  **E-Mail** das Fenster nur mit **Im eigenen Mailprogramm öffnen** und **Text kopieren**. E-Mail-Vorschläge beim nächsten Schritt und
  der E-Mail-Kanal bei Bestandskampagnen (nur WhatsApp) entfallen, der Schritt gilt als erledigt.
  Wieder einschalten unter **Einstellungen → E-Mail-Postfach → „E-Mail-Funktionen nutzen“**. **„Später“** lässt den Schritt offen.
- **Überspringen mit Grund:** Beim Kalender und bei WhatsApp gibt es **„Meine Gesellschaft erlaubt das nicht“** (WhatsApp auch
  „Ohne WhatsApp arbeiten“). Der Schritt gilt dann als erledigt. Termine tragen Sie im Kontakt unter **Termin → von Hand eintragen**
  ein, Knöpfe ohne Kalender oder WhatsApp erklären beim Antippen, was fehlt.
- **Einwilligung im Leadformular:** Formulare, die performancegrowth anlegt, enthalten sie automatisch als Pflicht-Häkchen mit
  festem Text: „Ich willige ein, dass [Vermittler, Anschrift] mich zu meiner Anfrage per WhatsApp, E-Mail und Telefon kontaktiert.
  Dabei antwortet zunächst ein KI-gestützter Assistent und vereinbart Termine. Widerruf jederzeit, z. B. mit ‚STOPP‘ oder per
  E-Mail an [Adresse]. Datenschutzhinweise: [Link].“ Ausgefüllt mit Ihren Angaben zum Kopieren unter **Einrichtung →
  Erstinformation für Ihre Leads → Einwilligung im Leadformular**. Bei eigenen Formularen genau diesen Text als Pflicht-Häkchen
  (eigener Hinweis mit Kästchen) einfügen.
- **Ohne Häkchen:** Hat ein Lead den Hinweis im Formular nicht angehakt, schreibt der Assistent ihn nicht per WhatsApp an (auch
  kein Nachfassen und keine Termin-Nachrichten per WhatsApp). Er steht auf der Rückrufliste: bitte anrufen oder per E-Mail zu
  genau dieser Anfrage melden. Schreibt der Lead selbst per WhatsApp, antwortet der Assistent. Formulare ganz ohne Häkchen
  laufen wie bisher, im Kontakt steht dann „Einwilligung nicht nachgewiesen“.
- **App aufs Handy:** gilt als erledigt, sobald Mitteilungen auf einem Gerät erlaubt sind.
- **Erinnerungen:** Bleibt etwas offen, erinnert die App nach 1, 3 und 7 Tagen per E-Mail und Mitteilung. Danach meldet sich
  performancegrowth persönlich. Hilfe jederzeit: 15-Minuten-Hilfetermin in der Einrichtung buchen.

## Benachrichtigungen (Push)

- Einschalten: oben im Kundenbereich „Benachrichtigungen einschalten“ oder im Profilmenü
  „Benachrichtigungen“. Einmal pro Gerät. Im Profilmenü gibt es „Test senden“.
- **iPhone:** Nur möglich, wenn die App auf dem Home-Bildschirm liegt: in **Safari** öffnen (nicht aus
  WhatsApp heraus), unten auf die drei Punkte (…) und dann „Teilen“ (bei älteren iOS-Versionen ist „Teilen“
  direkt unten), dann „Zum Home-Bildschirm“, danach die App über das neue Symbol
  öffnen und Benachrichtigungen einschalten. Anleitung auch in der Einrichtung unter „App aufs Handy“.
- **Android:** In Chrome „App installieren“ bzw. „Zum Startbildschirm hinzufügen“, dann einschalten.
- Steht „im Browser gesperrt“: in den Browser-Einstellungen Benachrichtigungen für diese Seite erlauben.
- Sie bekommen Push bei: neuem Lead, neuem oder abgesagtem Termin, Chat braucht Sie, Lead an Sie übergeben.

## Reklamieren (Stornieren) gekaufter Leads

- Lead öffnen → „Mehr“ → **Stornieren**. Grund aus der Liste wählen (z. B. falsche Nummer, doppelt), bei Bedarf Bemerkung.
- Gelistete Gründe werden meist sofort anerkannt. Ist die Reklamationsquote hoch oder der Grund „Sonstiges“,
  prüfen wir von Hand (1–2 Werktage). Der Status steht dann beim Lead („in Prüfung“ / „abgelehnt“).
- Die Gutschrift wird bei der nächsten Bestellung abgezogen.
- Reklamieren geht nur innerhalb weniger Tage nach Lieferung (die Frist steht in Ihrem Vertrag).

## Leads bestellen (Pay-per-Lead)

- „Bestellen“: einmal Zahlungsart hinterlegen, dann Anzahl wählen, ab sofort oder für nächste Woche.
- „Jede Woche wiederholen“ verlängert die Bestellung freitags automatisch; beenden jederzeit möglich.
- Status: bezahlt, Lastschrift läuft, Zahlung offen, fehlgeschlagen, storniert. Geliefert wird nur bei bezahlter Bestellung.

## Neuigkeiten

- „Neuigkeiten“ im Profilmenü (Klick auf den eigenen Namen bzw. die Initialen) zeigt, was performancegrowth an der App
  verbessert hat – neueste zuerst, nach Monat gruppiert, mit dem Etikett Neu, Verbessert oder Behoben.
- Gibt es etwas Neues seit dem letzten Besuch, zeigt das Profil-Symbol einen blauen Punkt und im Menü steht die Anzahl.
  In „Heute“ erscheint einmal eine kleine Karte „Neu: …“, die man wegklicken kann.
- Beim Öffnen der Seite gilt alles als gelesen. Inhaber und Berater sehen dieselben Neuigkeiten; Kunden mit „Nur Betreuung“
  sehen keine Einträge, die nur die Software betreffen.

## Zahlen

- Zeitraum wählen. Funnel: Leads → Erreicht → Termin → Abschluss. Trichter, Quoten und Kosten pro Lead, Termin
  und Abschluss zählen **nur bezahlte Leads** (Werbung wie Meta oder Outbrain), damit die Quoten stimmen. Abschlüsse
  aus Empfehlungen und Bestandskampagnen stehen darunter extra, z. B. „+ 3 Abschlüsse aus Empfehlungen“.
- **Kosten & Ertrag:**
  - **Lead-Kosten:** was die bezahlten Leads gekostet haben (bei eigenem Werbekonto: Werbebudget plus Retainer).
  - **Abschlussprovision (geschätzt):** die einmalige Provision aus den Abschlüssen im Zeitraum („aus 4 Abschlüssen,
    einmalig“). Bei Maklern heißt die Karte **Courtage 1. Jahr** (Sach ohne Abschlussprovision, dafür die Courtage des
    1. Jahres). Darunter: „davon Cross-Selling“ (weitere Verträge bei Kunden mit Abschluss), „davon aus Empfehlungen“,
    „aus Bestandskampagnen“, „Verträge pro Kunde“, „davon Honorar (vom Kunden)“ (PKV-Tarifoptimierung) und
    „abzüglich Rückbelastung“ (gekündigte Verträge, gebucht im Monat der Kündigung). Empfehlungen und
    Bestandskampagnen zählen voll mit, weil sie aus Ihren Leads entstehen.
  - **Bestandsprovision** (Makler: **Bestandscourtage**): laufend pro Jahr aus allen Verträgen seit Start, z. B.
    „+ 140 € pro Jahr, aus 12 Verträgen, ab dem 2. Jahr“ (Vertreter bekommen Bestand ab dem 2. Vertragsjahr, Makler
    ab sofort; bei KFZ und Leben/BU ab dem 1. Jahr). Darunter „in 5 Jahren: …“: so viel bringen die laufenden Verträge
    in den nächsten 5 Jahren mit Ihrer **Stornoquote** (Standard 10 % pro Jahr, änderbar unter **Meine Provisionen**).
    Gekündigte bzw. stornierte Verträge zählen ab dem Kündigungsdatum nicht mehr. „+ … pro Jahr aus diesem Zeitraum“
    zeigt, was die Abschlüsse im gewählten Zeitraum dazulegen. Darunter die **tatsächliche Stornoquote** (gekündigte
    Verträge der letzten 12 Monate geteilt durch den Bestand im Jahresmittel), ab 20 Verträgen, vorher „zu wenig
    Daten“. „So rechnen wir“ antippen für Satz, Stornoquote (mit Link zum Ändern) und Annahmen.
  - **Gewinn:** Abschlussprovision (bzw. Courtage 1. Jahr) minus Rückbelastungen minus Lead-Kosten minus Betreuung.
    Mit dem Umschalter in der Karte wählen Sie:
    - **Inkl. Bestand** (Standard, Etikett „mit künftigem Bestand“): dazu die künftige Bestandsprovision der Verträge, die im
      **gewählten Zeitraum** abgeschlossen wurden (nicht Ihr ganzer Bestand), über ihre ersten 5 Jahre. Vertreter bei
      Sach ab dem 2. Jahr, Makler, KFZ und Leben/BU ab dem 1. Jahr (das 1. Jahr steckt dann schon in „Nur jetzt“).
      Gerechnet mit Ihrer Stornoquote, ohne Abzinsung, gekündigte Verträge nur bis zum Kündigungsdatum.
    - **Nur jetzt:** ehrlich ohne künftige Bestandsprovision, nur was im Zeitraum verdient ist. Darunter
      „davon künftige Bestandsprovision: … (5 Jahre)“. Das ist eine **Prognose**, kein schon verdientes Geld. Der
      Vergleich mit dem Vorzeitraum rechnet genauso.
    Die Wahl merkt sich die App je Login. „Aufschlüsselung“ antippen (am Rechner: mit der Maus darüber) zeigt Provision,
    Rückbelastung, Lead-Kosten, Betreuung & Software, weitere Posten und bei „Inkl. Bestand“ die künftige
    Bestandsprovision. Kosten pro Abschluss und die Tipps richten sich immer nach „Nur jetzt“.
<!-- bestand-modul -->
  - **Hochgeladene Bestandsverträge zählen nicht zum Gewinn, nur neue Abschlüsse.** Verträge aus Ihrer Kundenliste
    (Bestand → Kundenliste hochladen) zählen weder in Provision, Gewinn, „Inkl. Bestand“, Bestandsprovision noch in den
    Monatsbericht. Schließt ein Bestandskunde über eine Bestandskampagne neu ab, zählt dieser neue Vertrag voll mit.
<!-- /bestand-modul -->
  - **Kosten pro Abschluss** bzw. pro Termin: alle Kosten (Lead-Kosten plus Betreuung) geteilt durch die Abschlüsse
    bzw. Termine aus bezahlten Leads, passend zum Gewinn.
- **Betreuung in den Zahlen:** Betreuung & Software (Monatspreis laut Ihrem Vertrag), weitere Verkäufer bzw. Logins,
  Zusatzmodule (Bestand, Empfehlungen), WhatsApp-Gebühren, falls berechnet, und die Einrichtung. Monatsbeträge zählen
  tagesgenau im gewählten Zeitraum, die Einrichtung verteilen wir über die Mindestlaufzeit (12 bzw. 3 Monate, ohne
  Laufzeit über 12 Monate), damit der erste Monat nicht verzerrt. Alle Beträge **inklusive USt.**, weil
  Versicherungsvermittler meist umsatzsteuerbefreit sind und die Vorsteuer nicht ziehen. Mit eigenem Werbekonto steckt
  der Retainer schon in den Lead-Kosten und wird nicht doppelt abgezogen. Eine Prämie für Kollegen-Empfehlungen
  (Gutschrift auf der Rechnung) mindert die Kosten im Monat der Gutschrift („Gutschrift Empfehlung“).
- **So holen Sie mehr raus:** Ist der Gewinn im Zeitraum oder in der Hochrechnung im Minus, zeigt die App bis zu
  3 Tipps, sortiert nach Wirkung, z. B. Empfehlungen anschalten, Kunden ein weiteres Produkt anbieten, Abschlüsse
  vollständig eintragen oder Leads schneller anrufen (verglichen mit dem Schnitt aller Kunden, anonym). Jeder Tipp
  hat einen Knopf direkt zur Stelle. Mit dem Kreuz blenden Sie einen Tipp für 30 Tage aus; erledigte Tipps
  verschwinden von selbst. In den ersten Monaten ist ein Minus normal, die Bestandsprovision wächst mit.
- **Hochrechnung für diesen Monat** zum Aufklappen: Leads, Termine, Abschlüsse (bezahlte Leads), Abschlussprovision,
  Lead-Kosten, Betreuung & Software und Gewinn, hochgerechnet auf den Monat.
- **So wächst Ihr Bestand** zum Aufklappen: Bestandsprovision pro Jahr über 5 Jahre, wenn Sie im Tempo der letzten
  3 Monate weiter abschließen (mit Ihrer Stornoquote, Standard 10 % pro Jahr).
- Bei Teams eine Tabelle pro Person: bezahlte Leads, Erreicht, Termine, Abschlüsse, Quote, Abschlussprovision und
  Bestand pro Jahr (inklusive Empfehlungen und Cross-Selling); bei „Inkl. Bestand“ zusätzlich „mit künftigem
  Bestand“.

## Monatsberichte

- Anfang jedes Monats bekommen Sie von uns einen Rückblick auf den Vormonat per E-Mail. Im Betreff steht Ihr
  Ergebnis, z. B. „Ihr Oktober: 4 Abschlüsse und 490 € Gewinn“ (ohne Gewinn: Ihre Abschlüsse bzw. Termine).
- Der Bericht hat diese Abschnitte, Abschnitte ohne Daten lassen wir weg:
  - kurzer Einstieg mit dem Wichtigsten des Monats,
  - **Ihr Vertriebstrichter:** Leads, Erreicht, Termine und Abschlüsse mit Quote und Vormonat (nur bezahlte Leads,
    damit die Quoten stimmen),
  - **Ihr Ergebnis im Monat** als Rechnung: Abschlussprovision aus Leads (Makler: Courtage 1. Jahr), aus Empfehlungen
    und aus Bestandskampagnen, minus Rückbelastungen, minus Lead-Kosten, minus Betreuung & Software (inklusive USt.,
    Gutschriften abgezogen), ergibt den Gewinn. Immer mit beiden Zahlen, z. B. „Gewinn: 490 €, mit künftigem
    Bestand: 2.590 €“ (wie „Inkl. Bestand“ unter „Zahlen“, eine Prognose). Es sind dieselben Zahlen wie unter „Zahlen“
    für diesen Monat,
  - **Ihr Bestand wächst:** Bestandsprovision pro Jahr aus allen laufenden Verträgen und ein kleines Balkendiagramm
    für die nächsten 5 Jahre, wenn Sie im gleichen Tempo weitermachen (mit Ihrer Stornoquote), dazu Ihre tatsächliche
    Stornoquote (ab 20 Verträgen),
  - **Empfehlungen** (Kunden gefragt, Empfehlungen, Abschlüsse, Provision) und **Bestandskampagnen**, sobald es dort
    etwas gibt,
  - **Was wir für Sie getan haben:** die echten Maßnahmen des Monats in Ihrem Werbekonto bzw. Ihrer Kampagne, z. B.
    neue Motive, pausierte schwache Anzeigen oder ein angepasstes Budget,
  - **Unsere Tipps für den nächsten Monat:** 1 bis 2 Tipps wie auf der Karte „So holen Sie mehr raus“,
  - die Knöpfe „Alle Zahlen ansehen“ (öffnet „Zahlen“ für genau diesen Monat) und „Gespräch vereinbaren“.
- Alle bisherigen Berichte finden Sie unter „Zahlen“ ganz unten im Abschnitt „Monatsberichte“. Oben auf der Seite führt
  „Zu Ihren Monatsberichten“ direkt dorthin, ebenso der Link „Alle Berichte ansehen“ in jeder Bericht-E-Mail.
- Jeden Bericht können Sie mit „PDF“ herunterladen (Dateiname monatsbericht-JJJJ-MM.pdf), etwa zum Ablegen oder Weitergeben.
- Solange noch kein Bericht da ist, steht dort, wann der erste voraussichtlich kommt (Anfang des nächsten Monats).
- Je mehr Ergebnisse Sie bei Ihren Leads eintragen, desto genauer werden die Zahlen im Bericht.
- Wir prüfen jeden Bericht vor dem Versand. Manchmal melden wir uns statt eines Berichts lieber persönlich, dann
  besprechen wir den Monat im Gespräch.

## Rückmeldung an Meta (seit 15.11.2026)

- Zu finden unter **Einstellungen → Rückmeldung an Meta** (/buyer/einstellungen/meta). Standardmäßig an, nur der
  **Inhaber** kann sie aus- und einschalten; Berater sehen die Seite nur.
- Wofür: Meta erfährt, welche Leads aus Ihren Anzeigen erreicht wurden, einen Termin hatten oder abgeschlossen haben.
  So lernt Meta, welche Leads abschließen, und sucht gezielter nach ähnlichen Menschen.
- Was gesendet wird: nur für Leads aus Meta-Formularen die Lead-ID, die Meta selbst vergeben hat, die Stufe (Lead,
  Erreicht, Termin vereinbart, Abschluss), der Zeitpunkt und beim Abschluss der Jahresbeitrag, falls eingetragen.
  Nicht gesendet werden Name, Telefonnummer, E-Mail, Gesprächsinhalte und welches Produkt abgeschlossen wurde.
  Leads aus Empfehlungen, dem Bestand oder anderen Quellen bleiben außen vor.
- Wann: automatisch etwa alle 15 Minuten. Meta nimmt nur Ergebnisse der letzten 7 Tage an, ältere werden nicht gesendet.
  Ein Storno nimmt eine gesendete Rückmeldung nicht zurück.
- „Erreicht“ zählt, sobald der Lead per WhatsApp antwortet oder Sie ihn als erreicht markieren (z. B. über „Wie lief es?“
  oder die Phase), „Termin vereinbart“ beim ersten Termin, „Abschluss“, wenn Sie den Lead auf Abschluss setzen.
- Status auf der Seite: Aktiv, Wird eingerichtet (wir verbinden Ihr Werbekonto, Sie müssen nichts tun), Aus oder
  Testkonto. Darunter die zuletzt gesendeten Rückmeldungen und Probleme in verständlichen Worten.
- Zahlen für die letzten 30 und 90 Tage: Leads aus Meta-Formularen, Anteil je Stufe innerhalb von 28 Tagen und eine
  Empfehlung, welche Stufe sich als Optimierungsziel („Conversion Leads“) eignet. Meta braucht dafür etwa 200 Leads im
  Monat, eine Stufe, die 1 % bis 40 % der Leads innerhalb von 28 Tagen erreichen, und Rückmeldungen für mindestens 60 %
  der Leads. Ist „Erreicht“ zu häufig, eignet sich eher „Termin vereinbart“. Eine Umstellung der Kampagne stimmen wir
  vorher mit Ihnen ab, die App stellt nichts selbst um.
- Tipp: Je vollständiger Sie Abschlüsse mit Beitrag eintragen, desto besser lernt Meta, welche Leads abschließen, und
  desto bessere Leads bekommen Sie. Tragen Sie bei offenen Leads auch Gewonnen oder Verloren ein.

## Abschluss und Provision
- Beim Abschluss fragt die App je nach Produkt nach einem Beitrag, alles freiwillig:
  - Privatschutz und TKV (Katze, Hund, Pferd): „Jahresbeitrag netto“. Vertreter: Provision ≈ 55 % davon
    (Abschlussprovision), dazu ab dem 2. Jahr 10 % Bestandsprovision pro Jahr. Makler: keine Abschlussprovision,
    sondern Bestandscourtage ≈ 22,5 % pro Jahr. Ohne Angabe rechnet die App mit einem Beitrag von 600 € (Privatschutz)
    bzw. 350 € (TKV).
  - Weitere Sach-Sparten (Unfall, Hausrat, Wohngebäude, Rechtsschutz, Sonstiges) wie Privatschutz, mit typischem
    Jahresbeitrag je Sparte (Unfall 180 €, Hausrat 120 €, Wohngebäude 500 €, Rechtsschutz 300 €, Sonstiges 300 €).
  - KFZ: „Jahresbeitrag netto“. Keine Abschlussprovision, 5 % laufend pro Jahr ab dem 1. Jahr; ohne Angabe 600 €.
  - **Leben, Rente, BU und Kindersparplan:** „Monatsbeitrag“. Die App rechnet mit der **Beitragssumme** =
    Monatsbeitrag × 12 × Laufzeit: Abschlussprovision 25 ‰ davon (Makler 35 ‰), dazu 1,5 % des Jahresbeitrags als
    Bestands- bzw. Betreuungsprovision ab dem 1. Jahr. Beispiel: bei 80 € im Monat und 30 Jahren (28.800 €
    Beitragssumme) ≈ 720 € Abschlussprovision und ≈ 14 € Bestand pro Jahr. Laufzeit, Alter und Endalter oder die
    Beitragssumme direkt tragen Sie am Vertrag ein; ohne Angabe: BU bis Alter 67 (ohne Alter 30 Jahre) und 80 € im
    Monat, Kindersparplan 18 Jahre und 50 €, Leben bzw. Rente 30 Jahre und 100 €.
  - **PKV-Tarifoptimierung (§ 204 VVG, nur Makler):** „Monatliche Ersparnis des Kunden“. Statt Abschlussprovision ein **Honorar
    (vom Kunden)** = Ersparnis × 6 Monate (änderbar) oder ein fester Betrag; ohne Angabe 100 € Ersparnis. Keine
    Bestandsprovision. Das Honorar zählt im Gewinn als Ertrag. Bitte mit Ihrer Honorarvereinbarung abgleichen.
  - **Empfehlungen, Bestandskunden und unbekannte Produkte:** Die App fragt zuerst die **Sparte** (z. B. Katze,
    Privatschutz/Haftpflicht, Hausrat) und rechnet dann mit dem Satz dieser Sparte.
  - **Eigenes Produkt:** Unter **Meine Provisionen → Ihre eigenen Produkte → Produkt hinzufügen** legen Sie weitere
    Produkte mit Ihren Sätzen direkt an. Oder beim Abschluss: Wählen Sie „Anderes Produkt (neu anlegen)“, tragen Sie das **Produkt** ein
    (z. B. Hausrat Plus, Kfz Flotte, Rechtsschutz Gewerbe) und die Sätze: **Abschluss in %** und **Bestand in % pro
    Jahr** (ab dem 2. Jahr), jeweils vom Jahresbeitrag. Die Vorschau rechnet sofort mit („≈ … € Abschlussprovision,
    ≈ … € Bestand pro Jahr“). Das Produkt wird gespeichert und steht beim nächsten Abschluss unter „Ihre Produkte“
    zur Auswahl, mit den Sätzen vorbelegt. In Zahlen, Bestand, Stornoquote und Verlauf steht der Produktname statt
    „Sonstiges“. Ändern oder entfernen unter **Einstellungen → Meine Provisionen → Ihre eigenen Produkte**; das gilt
    für künftige Abschlüsse, eingetragene Verträge behalten ihre Sätze.
- Es ist eine Schätzung für die eigenen Zahlen, keine Abrechnung. Wer den Beitrag einträgt, bekommt genauere Werte.
- **Mehrere Verträge pro Kunde (Cross-Selling):** Im Kontakt mit Abschluss steht unter „Verträge“ der erste Abschluss.
  Mit **Weiteren Abschluss eintragen** kommen weitere Verträge dazu: Sparte (Katze, Hund, Pferd,
  Privatschutz/Haftpflicht, Unfall, Hausrat, Wohngebäude, Rechtsschutz, Kindersparplan, KFZ, Leben/Rente, BU,
  PKV-Tarifoptimierung, eigene Produkte), Beitrag, Datum, optional Versicherer, Vertragsnummer und die
  Police als Dokument; bei Leben/BU auch Laufzeit bzw. Alter und Endalter oder die Beitragssumme. Jeder Vertrag rechnet
  mit dem Satz seiner Sparte. **Bearbeiten** und **Löschen** (nur weitere Verträge) gehen direkt in der Liste; jeder
  Schritt steht im Verlauf. Abschlüsse und Abschlussquote zählen weiter Kunden, nicht Verträge.
- **Vertrag gekündigt bzw. storniert:** am Vertrag (im Kontakt und beim Lead) mit Datum, Grund (vom Kunden gekündigt,
  Widerruf, Nichtzahlung, vom Versicherer gekündigt, Sonstiges) und optional der **Rückbelastung** der
  Abschlussprovision. Die App schlägt sie vor: bei Widerruf die volle Abschlussprovision, bei Leben/BU innerhalb der
  Stornohaftungszeit (Standard 60 Monate) anteilig, also verbleibende Monate geteilt durch 60. Ab dem Datum zählt der
  Vertrag nicht mehr für die Bestandsprovision; die Abschlussprovision bleibt im Monat des Abschlusses, die
  Rückbelastung mindert Provision und Gewinn im Monat der Kündigung. Steht im Verlauf; **Kündigung zurücknehmen**
  macht alles rückgängig. (Nicht zu verwechseln mit der Reklamation eines Leads bei Pay-per-Lead.)
- **Aufgabe „Police da und erste Zahlung erfolgt?“:** 2 Wochen nach dem ersten Abschluss auf „Heute“, nur einmal je
  Kunde, nicht wenn die Police schon am Vertrag hängt oder noch eine andere Wiedervorlage offen ist (z. B. „Police
  fertig machen“). Abschalten unter **Einstellungen → Erinnerungen & Aufgaben**.
- **Erinnerung „Weiteres Produkt anbieten?“:** 3 Wochen nach dem ersten Abschluss erscheint die Aufgabe auf „Heute“,
  mit naheliegenden Sparten (z. B. zur Katze: Haftpflicht, Unfall). Nicht, wenn schon ein weiterer Vertrag eingetragen
  ist oder der Kontakt nicht mehr im Abschluss steht, und nur einmal je Kunde. Abschalten unter **Einstellungen → Erinnerungen & Aufgaben**.
<!-- bestand-modul -->
- **Bestand:** Kunden mit Abschluss kommen mit allen Verträgen automatisch in den Bestand, damit Bestandskampagnen
  wissen, was der Kunde schon hat. Importieren Sie den Kunden später selbst (gleiche Handynummer oder E-Mail), führt die
  App beide zusammen; Verträge mit gleicher Vertragsnummer gibt es nur einmal.
<!-- /bestand-modul -->
- Pro Kunde gibt es weiterhin nur eine Nachfrage nach Bewertung und Empfehlung, auch bei mehreren Verträgen.
- **Meine Provisionen** (Profilmenü, auch unter Konto und in der Einrichtung): „Ich arbeite als Vertreter / Makler“
  wählen und je Produkt die eigenen Sätze eintragen. Standardwerte sind Erfahrungswerte, bitte mit Ihrer
  Provisionsliste abgleichen. Je nach Rechenart:
  - Sach und KFZ: Abschlussprovision in %, Bestandsprovision in % pro Jahr, typischer Jahresbeitrag (über 0 €).
  - Leben/Rente, BU, Kindersparplan: Abschlussprovision in ‰ der Beitragssumme, Bestandsprovision in % vom
    Jahresbeitrag, typischer Monatsbeitrag, Laufzeit, Endalter (optional) und Stornohaftungszeit in Monaten.
  - PKV-Tarifoptimierung (nur Makler): Honorar als Monate Ersparnis oder fester Betrag, Ersparnis ohne Angabe.
  - **Stornoquote pro Jahr** (0 bis 50 %, Standard 10 %), optional je Sparte. Damit rechnen alle Prognosen: Bestand in
    5 Jahren, „So wächst Ihr Bestand“, Gewinn „Inkl. Bestand“ und der Monatsbericht. Sobald Sie 20 Verträge haben,
    steht darunter „Ihre tatsächliche Quote: … Übernehmen?“.
  Oben stehen die Produkte, die Sie bei uns gebucht haben bzw. in Verträgen nutzen, darunter aufklappbar **Weitere
  Sparten (Cross-Selling)**. Ohne eingetragenen Beitrag rechnet die App mit dem typischen Beitrag. „Auf Standard“ setzt
  zurück. Nur der Inhaber kann speichern, Berater sehen die Sätze. Alle Zahlen rechnen danach mit den eigenen Sätzen.

## Garantien (Katzenversicherung)
- **Lead-Garantie:** Bei mindestens 20 € Werbebudget pro Tag gibt es in den ersten 30 Tagen nach Kampagnenstart mindestens
  100 Leads, sonst sind Betreuung und Software im Folgemonat kostenlos.
- **Break-even-Garantie (nur Vertreter, nicht Makler), spätestens ab dem 5. Monat profitabel:** Liegt die Provision nach 4 Monaten
  (120 aktiven Tagen; bei Angeboten vor dem 13.11.2026, 19 Uhr: 90 Tage) unter den Kosten für Werbung und Betreuung, betreuen wir ohne
  Betreuungsgebühr weiter (auf Wunsch mit anderem Produkt), bis es sich rechnet, längstens 6 Monate. Voraussetzung:
  mindestens 20 €/Tag an den aktiven Tagen, mindestens 80 % der Termine wahrgenommen, Ergebnisse bei mindestens 80 % der Leads
  eingetragen („Wie lief es?“, Abschluss mit Beitrag) und Provisionssätze unter „Meine Provisionen“ hinterlegt.
- **Vertrags-Garantie (nur Makler, statt Break-even):** Sind nach 120 aktiven Tagen (bei Angeboten vor dem 15.11.2026, 23:45 Uhr: 90 Tage)
  weniger als 15 Verträge abgeschlossen,
  sind Betreuung und Software kostenlos (auf Wunsch mit anderem Produkt, ohne Setupgebühr), bis 15 erreicht sind,
  längstens 6 Monate. Voraussetzung: mindestens 20 €/Tag
  an den aktiven Tagen, mindestens 80 % der Termine wahrgenommen und Ergebnisse bei mindestens 80 % der Leads eingetragen.
  Als Vertrag zählt jeder Lead mit „Abschluss“. Wir können im Garantiefall eine Courtage-Abrechnung als Nachweis anfordern.
- **Garantie einfordern:** Einen eigenen Garantie-Stand zeigt die App nicht. Ist eine Garantie aus Ihrer Sicht eingetreten, melden Sie sich bei uns (KI-Hilfe → „Mit Mensch sprechen“ oder „Etwas unklar? Feedback“ im Profilmenü). Wir prüfen anhand Ihrer Zahlen in der App.
- Die Tage zählen ab der ersten Auslieferung der Anzeigen. **Pausen (Urlaub, Krankheit) verlängern den Zeitraum** um die
  Pausentage, die Garantie verfällt dadurch nicht. Eine offene Rechnung zum Prüfzeitpunkt verhindert die Gutschrift, bis
  sie bezahlt ist.
- Gutgeschrieben wird nach kurzer Prüfung durch uns auf der nächsten Rechnung.
- Genaue Bedingungen stehen in den AGB (Abschnitt „Garantien“). Fragen dazu: bei performancegrowth melden.

## Team (nur Inhaber)

- „Team“ im Profilmenü: Mitglieder mit Name und E-Mail einladen (Link per Mail), höchstens 10 Zugänge. Beim Einladen
  wählen Sie, ob die Person Leads bekommt („Bekommt Leads“, Standard an; aus z. B. für eine Assistenz).
- Im Paket mit Software sind **3 aktive Verkäufer inklusive**. Aktiv ist, wer Leads bekommt (Schalter „bekommt Leads“ an).
  Mitglieder ohne Leads (z. B. Inhaber, der nur steuert, oder Assistenz) sind kostenlos. Jeder weitere aktive Verkäufer
  kostet 49 € netto im Monat, tagesgenau ab dem Einschalten bis zum Ausschalten oder Entfernen.
- Wer an einem Tag Leads zugewiesen bekommt (auch von Hand über „Zuständig“), zählt für diesen Tag als aktiver Verkäufer,
  auch wenn „bekommt Leads“ aus ist.
- Entsteht durch Einladen, Einschalten oder Zuteilen ein Aufpreis, zeigt die App ihn vorher an. Auf der Team-Seite steht,
  wie viele aktive Verkäufer Sie gerade haben. Ab 10 Zugängen gibt es ein individuelles Angebot (bitte bei uns melden).
- Neue Leads werden reihum verteilt. Schalter „Bekommt neue Leads“ pro Person (dauerhaft aus). Für Urlaub
  oder Krankheit besser „Abwesenheit eintragen“ (Person antippen), dann geht alles danach von selbst wieder an.
- In der Liste steht bei abwesenden Personen „abwesend bis …“.
- Namen ändern, Einladung erneut senden, aus dem Team entfernen (offene Leads gehen an den Inhaber zurück).
- Einzelnen Lead weitergeben: Lead öffnen → „Zuständig“.

## Anmelde-Adresse ändern (seit 15.11.2026)

- Einstellungen → Anmeldung & Sicherheit → „E-Mail-Adresse für die Anmeldung“: neue Adresse eingeben und mit dem
  Passwort bestätigen (bei Anmeldung nur über Google oder Microsoft entfällt das Passwort).
- Wir schicken einen Link an die neue Adresse (24 Stunden gültig). Erst nach dem Klick gilt sie, alle Geräte werden
  abgemeldet, die alte Adresse bekommt einen Hinweis. Das Passwort bleibt gleich.
- Wir (Admin) können die Adresse unter Admin → Logins → „E-Mail-Adresse ändern“ auch direkt ändern.

## Abwesenheit (Urlaub, Krankheit)

- Profilmenü → „Ich bin abwesend“: von–bis (ganze Tage, auch ab heute), Grund (Urlaub, Krank, Sonstiges –
  nur die Kategorie, keine Details) und optional eine Vertretung aus dem Team. Gilt sofort.
- Der Inhaber kann das auch für jede Person im Team eintragen: Team → Person antippen → „Abwesenheit eintragen“.
- Während der Abwesenheit: keine neuen Leads an diese Person (die anderen bekommen sie, der Schalter „Bekommt
  neue Leads“ bleibt unverändert) und keine neuen Termine bei ihr, weder über den Assistenten noch über die
  Buchungsseite. Ohne Team (allein) sind die frühesten Termine am ersten Werktag nach der Rückkehr. Der
  Assistent sagt neuen Leads, ab wann Termine möglich sind, aber nie warum.
- Termine, die schon in der Zeit liegen, zeigt die App direkt nach dem Speichern:
  „Alle verschieben“ (neue Zeit nach der Rückkehr, möglichst gleiche Uhrzeit; der Kontakt bekommt sie per
  E-Mail und WhatsApp mit Link, um selbst eine andere Zeit zu wählen), „An <Vertretung> übergeben“ (nur wenn
  die Vertretung da und frei ist; der Termin bleibt zur selben Zeit, der Kontakt geht an die Vertretung) oder
  pro Termin einzeln, auch „Selbst klären“.
- Wiedervorlagen und zurückgestellte Rückrufe in der Zeit gehen an die Vertretung, sonst rücken sie auf den
  ersten Werktag nach der Rückkehr (8 Uhr). Der Hinweis dazu hat „Rückgängig“.
- Allein und mindestens 7 Tage weg: Die App bietet „Anzeigen in dieser Zeit pausieren“ an (die normale Pause
  unter Wachstum, Neustart am Rückkehrtag). Eine Pause verlängert auch den Garantie-Zeitraum.
- Während der Abwesenheit steht oben ein Hinweis „Du bist bis … abwesend“ mit „ändern“ und „beenden“. Früher
  zurück: „beenden“ (oder „Ich bin wieder da“). Eine geplante Abwesenheit lässt sich im Profilmenü ändern
  oder löschen.

## Konto & Rechnungen (nur Inhaber)

- Vertrag (Paket, Monatsbetrag, weitere Verkäufer, <!-- bestand-modul -->Bestandskunden-Modul, <!-- /bestand-modul -->Monatlich gesamt, Zahlweise, Laufzeit, Start),
  Rechnungen mit Status und „Jetzt bezahlen“ bei offenen Rechnungen.
- Laufzeit: ohne Laufzeit (Setup 2.490 €), 3 Monate (Setup 1.990 €) oder 12 Monate (Setup 990 €), jeweils netto;
  nach der Mindestlaufzeit monatlich kündbar.
- Laufzeit und Start wählen Sie in der Regel selbst bei der Annahme des Angebots (Angebotsseite, Abschnitt
  „Angebot annehmen“): Setup und Summen passen sich sofort an. Start frühestens 7 Tage, spätestens 90 Tage ab
  heute; ab diesem Tag läuft die Monatsgebühr, die Einrichtung dauert ca. 1–2 Wochen. Bei Sonderpreisen ist die
  Laufzeit fest vereinbart, das Startdatum bleibt wählbar.
- Bei der Annahme (seit 15.11.2026): Direkt am Knopf steht „Das vereinbaren Sie mit dem Klick“ mit Einrichtung,
  monatlichem Betrag ab Start, Mindestlaufzeit mit Enddatum und Kündigungsmöglichkeit. Pflicht: Firma, Häkchen
  „Ich schließe diesen Vertrag als Unternehmer (§ 14 BGB)“; USt-IdNr. freiwillig. Mit Startpreis zusätzlich das Häkchen,
  dass ab dem genannten Datum automatisch die reguläre Vergütung gilt. Danach kommt eine Auftragsbestätigung per E-Mail
  mit denselben Angaben (Daten und Beträge), getrennt von der E-Mail mit dem Zugang.
- Zahlweise: monatlich oder jährlich im Voraus (2 Monate geschenkt: Jahresbetrag = 10 × Monatspreis inkl.
  Zusätze, nur mit 12 Monaten Laufzeit). Umstellen: bitte bei uns melden.
- Zahlungsart, Rechnungsadresse, USt-IdNr.: über das Zahlungsportal (Stripe) auf dieser Seite.
- WhatsApp-Gebühren von Meta sind im Preis enthalten, es kommt nichts dazu. Für Leads (Erstkontakt, Erinnerungen,
  Nachfassen) ohne Begrenzung<!-- bestand-modul -->; für Bestandskunden-Kampagnen bis 500 Nachrichten im Monat, mehr mit Zusatzpaketen
  (+500 für 99 €, +2.000 für 349 €, netto, gültig 3 Monate, siehe „Bestand“). Pakete stehen als eigener Posten auf der Rechnung.<!-- /bestand-modul -->
<!-- bestand-modul -->
- Bestandskunden-Modul nicht gebucht: Karte „Bestandskunden-Modul“ mit Knopf „Jetzt buchen – 149 € netto im Monat“
  (Bestätigung mit Häkchen, danach sofort freigeschaltet). Gebucht: „Modul kündigen (zum Ende des
  Abrechnungszeitraums)“; bis dahin nutzbar, die Kündigung lässt sich bis dahin mit „Kündigung zurücknehmen“
  aufheben.
<!-- /bestand-modul -->
- **Werbebudget ändern** (Wachstum → Karte „Werbebudget“, seit 16.11.2026 nicht mehr im Konto; auch in der Einrichtung beim
  Schritt „Start“): Tagesbudget je Produkt mit Plus/Minus (5-€-Schritte) oder Regler. Die Vorschau zeigt sofort
  das Werbebudget pro Monat (Tagesbudget × 30), die erwarteten Leads pro Monat (mit dem eigenen Leadpreis der
  letzten 30 Tage, sonst mit einem üblichen Leadpreis) und die Betreuungsstufe. Unter 20 € pro Tag erscheint der
  Hinweis „Lead-Garantie gilt ab 20 €/Tag“.
  - Betreuungsstufen (Betreuung + Software, netto im Monat): bis 3.000 € Werbebudget 1.000 €, 3.000 – 6.000 €
    1.400 €, 6.000 – 10.000 € 1.800 €; jedes weitere Produkt 350 €. Wechselt die Stufe (nach oben oder unten),
    steht das deutlich da, z. B. „Mit 3.300 € Werbebudget pro Monat gilt die nächste Betreuungsstufe
    (3.000 – 6.000 €): 1.400 € statt 1.000 € netto im Monat, ab dem nächsten Abrechnungsmonat.“ Dann ist das
    Häkchen „Ich habe den neuen Monatspreis zur Kenntnis genommen“ Pflicht.
  - Ab wann: sofort oder ab einem Datum (bis 4 Monate im Voraus). Erhöhen und senken gilt immer sofort bzw. zum
    Datum, ohne Freigabe. Die neue Stufe gilt ab dem folgenden Abrechnungsmonat. Die Anzeigen bei Meta stellen
    wir in der Regel innerhalb eines Werktags um. Bestätigung kommt per E-Mail.
  - Individuelle Konditionen (abweichender Preis, jährliche Vorauszahlung): Das Budget gilt trotzdem sofort, den
    neuen Preis bestätigen wir gesondert.
  - Über 10.000 € Werbebudget pro Monat: keine Selbstbedienung, Knopf „Anfrage senden“; wir melden uns mit einem
    individuellen Angebot, bis dahin läuft das bisherige Budget.
  - Paket „Nur Betreuung“: Der Monatspreis hängt nicht vom Werbebudget ab.
- Schalter „Neue Leads per E-Mail“.
- **Pause/Urlaub** (Wachstum → Karte „Pause / Urlaub“) selbst eintragen (Start, Ende, Grund): Anzeigen stoppen, reduzierte Gebühr; Pause jederzeit beenden.
  Bei jährlicher Vorauszahlung pausieren nur die Anzeigen, eine Gutschrift gibt es nicht.
- Kündigung oder Vertragsfragen: bitte direkt bei uns melden.
- **Ihre Daten herunterladen** (unten auf der Seite, seit 15.11.2026): ein ZIP mit Excel-Dateien (CSV, Semikolon):
  Leads mit Formularangaben und Notizen, Abschlüsse, Termine, Chats, Bestandskunden mit Verträgen, Einwilligungen und
  Nachweis zum Widerspruchshinweis, dazu das Einwilligungsprotokoll. Gelöschte Leads sind nicht enthalten. Jeder
  Download wird protokolliert. Nach Vertragsende bewahren wir Ihre Daten 24 Monate auf (Ihr Konto ruht) und löschen
  sie danach endgültig; bis dahin können Sie den Export jederzeit herunterladen.
- **Vertrag kündigen (seit 15.11.2026):** Konto & Rechnungen → Karte „Ihr Vertrag“ → **Vertrag hier kündigen**. Es öffnet
  sich eine Bestätigungsseite mit Vertrag, Art (ordentliche Kündigung zum nächstmöglichen Termin), Ihrer E-Mail und
  dem Tag, an dem der Vertrag endet; Grund freiwillig. Mit **Jetzt kündigen** ist die Kündigung abgeschickt, auf der
  Seite steht dann „Gekündigt zum …“ und sofort kommt eine Bestätigung per E-Mail (Eingang mit Uhrzeit, Vertragsende).
  Termin: während der Mindestlaufzeit zu deren Ende; ohne bzw. nach der Mindestlaufzeit zum Ende des laufenden
  Abrechnungsmonats (Abrechnungsmonate laufen ab dem Starttag, z. B. 15. bis 14.); bei jährlicher Vorauszahlung zum
  Ende des Zahlungsjahres, wenn die Kündigung spätestens einen Monat vorher eingeht, sonst ein Jahr später. Bis zum
  Ende läuft alles weiter, Zusatzmodule enden mit dem Vertrag, danach wird nichts mehr abgebucht (die Online-Abrechnung
  endet automatisch zum Vertragsende). Ihre Daten können Sie jederzeit unter „Ihre Daten herunterladen“ exportieren.
  Nur Inhaber. Zurücknehmen oder anderer Termin (z. B. außerordentlich): bitte bei uns melden.
  **Ihre Daten nach Vertragsende** (auf der Bestätigungsseite der Kündigung): „Ihre Daten bewahren wir 24 Monate auf,
  damit Sie jederzeit zurückkommen können. Danach löschen wir sie endgültig. Sie können auch eine frühere Löschung
  wählen.“ Zur Wahl: 24 Monate (Standard), 3 Monate oder sofort nach Vertragsende (vorher den Export herunterladen).
  Die Wahl steht in der Bestätigungsmail und lässt sich bis zur Löschung im Konto ändern (Karte „Ihr Vertrag“), auch
  zurück auf 24 Monate. Die Sperrliste für Widersprüche bleibt pseudonymisiert, Verträge und Rechnungen bewahren wir
  nach den gesetzlichen Fristen auf.
  Vor der Bestätigung fragt die App freiwillig nach dem Hauptgrund und zeigt passende Möglichkeiten. „Direkt zur
  Kündigung“ bzw. „Trotzdem kündigen“ führt jederzeit mit einem Klick zur Bestätigung.
  **Angebote je Grund (seit 15.11.2026):**
  - *Zu teuer:* Nachlass auf die Monatsgebühr (Standard 50 % auf die nächsten 2 Monatsrechnungen). Bedingung: Der
    Vertrag läuft danach noch mindestens 3 Monate; den Tag sehen Sie vor der Annahme, Sie bestätigen ihn mit einem
    Häkchen. Danach steht er unter „Ihr Vertrag“ (Zeile „Nachlass“) und in der Bestätigungsmail; eine Kündigung wirkt
    frühestens zu diesem Tag. Alternativ ein kleineres Paket (Werbebudget senken, niedrigere Preisstufe).
  - *Zu wenige Leads:* Wir starten Ihre Kampagne neu (neue Anzeigen, neue Zielgruppen), dazu ein Monat Betreuung
    kostenlos (sichtbar auf der nächsten Rechnung).
  - *Leads passen nicht:* Kostenlose Neuausrichtung (andere Sparte, Region oder Formularfragen; Ihr Wunsch als Text)
    und wir prüfen Leads mit falschen Daten der letzten 30 Tage für eine Gutschrift.
  - *Zu wenige Abschlüsse:* Kostenloser Wechsel auf die Sparte mit der besten Abschlussquote über alle unsere Kunden
    (ohne neue Einrichtungsgebühr).
  - *Keine Zeit:* Pause ohne Kosten, bis zu 3 Monate: Anzeigen und die ganze Abrechnung ruhen, danach geht es
    automatisch weiter.
  - *App passt nicht:* Wir richten die App mit Ihnen ein, 30 Minuten per Video mit Bildschirmfreigabe (Termin direkt
    wählen).
<!-- bestand-modul -->
  - *Höre auf / wechsle:* Paket „Nur Bestand“ für 149 € netto im Monat: Ihre Daten und das Bestandskunden-Modul mit
    demselben Kontingent, ohne neue Leads und ohne Betreuung; „Empfehlungen & Bewertungen“ optional für 59 € netto im
    Monat dazu. Dazu der Hinweis „Kollegen empfehlen“ für Ihren Nachfolger.
<!-- /bestand-modul -->
  Rabatte (Nachlass, kostenloser Betreuungsmonat, Gutschrift, Pause ohne Kosten) gibt es erst ab 3 Monaten
  Vertragsdauer, höchstens einmal in 12 Monaten und nicht bei jährlicher Vorauszahlung; sonst sehen Sie die übrigen
  Möglichkeiten. 30 Tage nach Vertragsende kommt einmal ein Rückkehrangebot per E-Mail: Konto reaktivieren ohne neue
  Einrichtungsgebühr.
- Vertragsfragen: bitte direkt bei uns melden.

## Konto ruht nach Vertragsende (seit 15.11.2026)
- **Was heißt ruhend?** Ab dem Tag nach dem letzten Vertragstag sind Kampagnen, WhatsApp-Assistent, Erinnerungen und
  Nachfassen aus. Wir speichern Ihre Daten nur noch und verarbeiten sie nicht weiter.
- **Anmelden:** Nach der Anmeldung sehen Sie nur die Seite **Ihr Konto ruht** mit drei Möglichkeiten: **Daten
  exportieren** (ZIP wie im Konto), **Konto reaktivieren** und **Aufbewahrung Ihrer Daten** ändern. Berater sehen nur
  einen Hinweis; das alles kann nur der Inhaber.
- **Konto reaktivieren:** Ein Klick, und das Konto ist sofort wieder aktiv, alle Leads, Kunden und Einstellungen sind
  unverändert da. Wir melden uns, um Paket, Preis und den Start der Kampagnen abzustimmen; Kosten entstehen erst, wenn
  Sie zugestimmt haben.
- **Früher löschen:** Unter „Aufbewahrung Ihrer Daten“ 3 Monate oder „Sofort“ wählen. Ist die Frist schon vorbei,
  löschen wir nach Ihrer Bestätigung sofort endgültig, danach ist keine Wiederherstellung möglich.
- **Erinnerung:** 30 und 7 Tage vor der Löschung kommt eine E-Mail mit den Links „Daten exportieren“ und „Konto
  reaktivieren“. Nach der Löschung kommt eine Bestätigung per E-Mail.

## Weiteres Produkt buchen (nur Inhaber)
- **Wo:** Wachstum → Karte „Produkte“, Liste „Weitere Sparte dazubuchen“ zum Aufklappen. Dort stehen die gebuchten
  Produkte mit Tagesbudget und Status („Läuft“, „In Einrichtung“, „Anfrage offen“) und darunter die Sparten, die man dazubuchen kann
  (z. B. Katzenversicherung; weitere wie Hund, Privatschutz, Unfall, Zahnzusatz oder Krankenhauszusatz, sobald wir sie freigeben).
  „Bewährt“ heißt: mit Erfahrungswert, angezeigt als Spanne, z. B. „ca. 20–25 € pro Lead · bei 30 €/Tag ca. 36 bis 45 Leads
  im Monat“. „Neu“ heißt: Neues Produkt, wir sammeln gerade Erfahrungswerte. Den Leadpreis sehen Sie nach den ersten Wochen
  in Ihren Zahlen.
- **Buchen:** „Produkt buchen“ → Tagesbudget wählen (Plus/Minus oder Regler), Start „so bald wie möglich“ oder ab Datum, Häkchen
  setzen, „Jetzt kostenpflichtig buchen“. Die Vorschau zeigt: keine Einrichtungsgebühr, monatlich 350 € mehr (netto, ab Start), das
  neue Werbebudget gesamt pro Monat und – sehr deutlich – wenn dadurch eine andere Betreuungsstufe gilt (wie bei „Budget ändern“).
  Über 10.000 € Werbebudget pro Monat wird daraus eine Anfrage; wir melden uns mit einem individuellen Angebot.
- **Danach:** Status „In Einrichtung“. Wir richten Kampagne, Leadformular und die Fragen des WhatsApp-Assistenten ein (in der Regel
  wenige Werktage) und geben Bescheid, sobald es läuft. Die Einrichtung steht auf der nächsten Rechnung; der neue Monatspreis gilt ab
  dem Start (nächster Abrechnungsmonat). Erst ab dem Start zählen Budget und – nur bei der Katzenversicherung – die Garantien.
- **Individuelle Konditionen** (abweichender Preis, Jahreszahler, Paket „Nur Betreuung“): Das Produkt wird trotzdem gebucht, den Preis
  bestätigen wir gesondert.
- **Beenden:** Nicht selbst abschaltbar. „Produkt beenden anfragen“ → wir prüfen die Vertragslaufzeit und melden uns mit dem
  möglichen Enddatum; bis dahin läuft das Produkt weiter.
- Das Budget eines laufenden Produkts ändert man wie gewohnt unter „Werbebudget“.

## Kollegen empfehlen (nur Inhaber)

- Wo: Einstellungen → „Kollegen empfehlen“. Ganz oben stehen
  zwei Kacheln: was Ihr Kollege bekommt und was Sie bekommen. Die genauen Beträge kommen immer aus unseren aktuellen
  Konditionen (die KI-Hilfe bekommt sie mitgeliefert).
- Ihr persönlicher Link (`/empfehlen/…`) bleibt immer gleich. Teilen per „Teilen“ (Handy), WhatsApp oder E-Mail mit
  vorbefülltem Text, den Sie anpassen können; dazu ein QR-Code zum Herunterladen.
- Ihr Kollege sieht eine Seite „<Ihr Name> von <Agentur> empfiehlt Ihnen performancegrowth“ und fragt dort selbst ein
  unverbindliches Erstgespräch an (Name, Agentur, E-Mail, Telefon, Einwilligung). Sie tragen keine Daten Ihrer
  Kollegen ein. Ihr Kollege bekommt eine Bestätigung per E-Mail, Ole Kannapinn meldet sich dann persönlich.
- Vorteil für Ihren Kollegen: derzeit **300 € Rabatt auf die Einrichtung** (netto), bei jeder Laufzeit
  (2.490 € → 2.190 €, 1.990 € → 1.690 €, 990 € → 690 €). Der Rabatt steht als eigene Zeile „Empfehlungsrabatt“
  im Angebot und auf der Rechnung. Er gilt für neue Kontakte innerhalb von 12 Monaten nach der Empfehlung, nicht
  für Selbstempfehlungen, bestehende Kunden oder Kontakte, die schon vorher ein Angebot von uns hatten.
- Ihr Dankeschön: derzeit **300 € netto Gutschrift je Kollege, der Kunde wird**. Wir schreiben sie Ihnen auf Ihre
  nächste Rechnung gut. Ist die Rechnung kleiner, verrechnen wir den Rest automatisch mit den folgenden Rechnungen.
  Jede weitere Empfehlung zählt wieder, ohne Obergrenze: 3 Kollegen sind 900 €.
<!-- bestand-modul -->
- Haben Sie früher als Dankeschön das Bestandskunden-Modul gratis bekommen, läuft diese Gratiszeit wie zugesagt bis
  zum genannten Tag weiter. Wir erinnern Sie vorher; danach läuft das Modul zum normalen Preis weiter, abbestellen
  können Sie es jederzeit unter **Konto & Rechnungen**.
<!-- /bestand-modul -->
- Das Dankeschön gilt, sobald der Kollege sein Angebot angenommen und die erste Zahlung geleistet hat. Sie bekommen
  dazu eine Push-Nachricht und eine E-Mail. Eine Empfehlung an sich selbst oder die eigene Agentur zählt nicht; ist
  der Kollege schon Kunde, gibt es keine Prämie.
- Stand Ihrer Empfehlungen: Eingegangen → Termin → Kunde geworden → Prämie gutgeschrieben.
- Die Prämie ist eine Gutschrift zwischen uns und Ihnen als Geschäftskunde, keine Provision an
  Versicherungsnehmer (Provisionsabgabeverbot nicht berührt).

<!-- bestand-modul -->
## Bestand (Bestandskunden, Zusatzmodul)

- Zusatzmodul für 149 € netto im Monat, inklusive WhatsApp-Gebühren für bis zu 500 Kampagnen-Nachrichten im Monat.
  Gilt für Vertreter und Makler gleich.
  Ohne Modul zeigt „Bestand“ eine Beschreibung und den Knopf **„Jetzt buchen“** (nur Inhaber): kurze Bestätigung
  mit Preis netto und brutto, „anteilig ab heute, danach monatlich mit Ihrer Rechnung, monatlich kündbar“.
  Danach ist das Modul sofort freigeschaltet, es kommt eine Bestätigung per E-Mail.
  Selbst buchen geht nur mit laufendem Abo und hinterlegter Zahlungsart, im Paket mit Software und ohne offene
  Rechnung. Sonst erscheint der Grund und der Knopf „Modul anfragen“ (Anfrage geht an uns).
  Kündigen unter „Konto & Rechnungen“: zum Ende des laufenden Abrechnungszeitraums, bis dahin nutzbar;
  danach stoppen laufende Kampagnen, die hochgeladene Kundenliste bleibt gespeichert.
  Wer Bestand schon vor dem 11.11.2026 genutzt hat, behält den Zugang ohne Aufpreis.
- **Kontingent:** Oben auf „Bestand“ zeigt ein Balken die Kampagnen-Nachrichten dieses Monats: verbraucht,
  inklusive (500 im Monat) und gebuchte Zusatzpakete mit Ablaufdatum. Verbraucht wird zuerst das Monatskontingent,
  dann das älteste Paket. Bei weniger als 10 % Rest steht dort und beim Kampagnenstart „Noch X Nachrichten diesen
  Monat“ mit dem Knopf **„Paket dazubuchen“**. Ist alles aufgebraucht, startet keine neue Kampagne, und laufende
  Kampagnen **pausieren mit diesem Hinweis** (Push an den Inhaber). Sie laufen automatisch weiter, sobald ein Paket
  gebucht ist oder der neue Monat beginnt.
- **Zusatzpakete** (nur Inhaber, Bestand → „Paket dazubuchen“): **+500 Nachrichten für 99 € netto** oder
  **+2.000 Nachrichten für 349 € netto**, jeweils einmalig. Sofort freigeschaltet, gültig 3 Monate, WhatsApp-Gebühren
  enthalten. Abgerechnet als eigener Posten auf der nächsten Rechnung (bei jährlicher Vorauszahlung als eigene
  Rechnung). Online buchen geht mit laufendem Abo, hinterlegter Zahlungsart und ohne offene Rechnung; sonst
  erscheint der Grund, und das Paket lässt sich anfragen. **Ab 5.000 Nachrichten im Monat:** individuell, bitte über
  „Ab 5.000 Nachrichten im Monat: individuell, bitte anfragen“ melden, wir machen ein Angebot.
- **Viele Nachrichten brauchen mehrere Tage:** WhatsApp (Meta) begrenzt, wie viele Menschen eine Nummer innerhalb
  von 24 Stunden neu anschreiben darf. Kampagnen verteilen die Nachrichten deshalb über mehrere Tage
  (Höchstwert pro Tag in der Kampagne, Standard 150, Mo–Sa). 2.000 Nachrichten dauern so etwa 14 Versandtage.
- **Automatisch nachbuchen** (unten auf „Bestand“, Standard aus): Ist das Kontingent aufgebraucht, bucht die App ein
  500er-Paket (99 € netto) nach, bis höchstens zu dem Betrag, den Sie je Monat eintragen. Bei jeder Nachbuchung
  kommt eine E-Mail.

- Kundenliste aus dem Versicherer-System als Excel oder CSV hochladen, Spalten zuordnen, Nutzungsbefugnis bestätigen
  (Einwilligungen siehe „Einwilligung je Kanal“ unten).
  Gesundheitsdaten werden nie übernommen (Spalten wie Vorerkrankungen, Diagnosen, Gewicht werden ausgelassen).
- **Mehrere Verträge je Kunde:** Eine Zeile je Kunde oder je Vertrag geht beides. Zeilen desselben Kunden werden
  zusammengeführt (gleiche Kundennummer, sonst gleiches Telefon, sonst gleiche E-Mail, sonst Nachname + Geburtsdatum).
  Jede Zeile mit Sparte wird ein Vertrag; mehrere Sparten in einer Zelle („Haftpflicht, Unfall“) werden mehrere Verträge.
- **Spalten zuordnen** in zwei Gruppen:
  - **Kunde:** Vorname, Nachname bzw. Name komplett, Mobil/Telefon, E-Mail, Kundennummer, Anrede (Herr/Frau/Divers),
    Firma (Gewerbekunden), Geburtsdatum, Adresse. Ein Name ist **kein** Pflichtfeld: Es reicht ein Merkmal zum
    Wiedererkennen (Kundennummer, Telefon oder E-Mail). Ohne Namen zeigt die Liste die Firma bzw. die E-Mail, und
    Nachrichten beginnen neutral mit „Guten Tag,“. Die Vorschau zeigt „X Kunden ohne Namen, werden neutral angesprochen“.
    Mobil/Telefon und Sparte sind als „empfohlen“ markiert. Ohne Telefon-Spalte erscheint: „Ohne Telefonnummer können
    wir diese Kunden nicht per WhatsApp anschreiben. Import ist trotzdem möglich (für E-Mail bzw. Übersicht).“
    Felder, die nicht in der Datei stehen, bleiben auf „Nicht zuordnen“.
  - **Prüfung der Zuordnung:** Liegt dieselbe Spalte auf mehreren Feldern, steht eine Warnung direkt am Feld. Die App
    prüft außerdem Stichproben (die ersten 50 gefüllten Werte): Telefon muss nach Telefonnummer aussehen, E-Mail nach
    E-Mail, ein Name darf keine E-Mail sein, ein Datum muss ein Datum sein. Passt mehr als die Hälfte nicht, wird das
    Feld rot markiert, die Erklärung steht darunter, und der Import ist gesperrt, bis die Zuordnung stimmt.
  - **Vertrag:** Sparte/Produkt, Jahresbeitrag (z. B. „1.234,56 €“; Monatsbeiträge werden nicht als Jahresbeitrag
    erkannt), Vertragsnummer, Versicherer, Vertragsstatus, Ablauf/Hauptfälligkeit, Vertragsbeginn.
- **Vorschau vor dem Übernehmen:** „4.493 Zeilen → 1.870 Kunden mit 4.493 Verträgen“, live berechnet mit der gewählten
  Zuordnung, dazu Beitragsvolumen, stornierte Verträge und übersprungene Zeilen. Würde kein einziger Kunde übernommen
  (z. B. eine Liste ohne Namen), erscheint eine rote Warnung und der Knopf ist gesperrt. Wird mehr als die Hälfte
  übersprungen, kommt eine gelbe Warnung.
- **Vertragsstatus:** grob vereinheitlicht zu aktiv, storniert/gekündigt, ruhend (z. B. beitragsfrei) oder unbekannt.
  Stornierte und ruhende Verträge zählen nicht als Sparte (Lücke schließen), nicht für Ablauf/Wechsel und nicht
  fürs Beitragsvolumen. Ohne Status-Spalte gilt jeder Vertrag als aktiv.
- **Erneut hochladen** aktualisiert vorhandene Kunden; ihre Verträge werden durch die neue Liste ersetzt
  (die Vertragsnummer wird mitgespeichert).
- **Letzten Import rückgängig machen** (nur Inhaber, unten auf „Bestand“ und auf der Import-Seite): löscht die Kunden,
  die der letzte Import neu angelegt hat, mit ihren Verträgen. Kunden, die schon angeschrieben wurden oder „Stopp“
  geschrieben haben, bleiben. Kunden, die der Import nur aktualisiert hat, behalten den neuen Stand. Danach die Liste
  mit der richtigen Zuordnung neu hochladen.
- **Kundenliste:** je Kunde eine Zeile mit Name (bzw. Firma oder E-Mail), darunter die Firma; lange Namen werden
  abgeschnitten (ganzer Name beim Darüberfahren). Rechts kompakte Knöpfe: **Senden** (Empfehlungslink per WhatsApp)
  und **„…“** (Im Termin zeigen per QR-Code, Text und Link zum Kopieren). Ohne Mobilnummer ist „Senden“ ausgegraut
  („keine Mobilnummer“), Text und Link zum Kopieren gehen trotzdem.
- **Beitragsvolumen:** Auf „Bestand“ steht die Summe der Jahresbeiträge aktiver Verträge. Ist in „Meine Provisionen“
  eine Bestandsprovision hinterlegt, steht daneben „≈ Bestandsprovision pro Jahr“ – eine grobe Schätzung mit dem Satz
  für Privatschutz/Sach, für alle Sparten gleich angesetzt. Die Kundenliste lässt sich nach Jahresbeitrag sortieren.
  In Kampagnen werden die Kunden mit dem höchsten Jahresbeitrag zuerst angeschrieben; die Kampagnenseite zeigt
  das Beitragsvolumen der Empfänger und die fünf wertvollsten.
- Die App schlägt Chancen vor: Lücke schließen (z. B. KFZ ohne Hausrat), Jahresgespräch, Geburtstag in 30 Tagen,
  Ablauf/Wechsel in 60 Tagen.
- Kampagne: Kanal, Thema, Tageslimit, Vorschau, Start/Pause. WhatsApp Mo–Sa 9–19 Uhr, E-Mail werktags 8 bis 18 Uhr.
  Antworten werden zum Lead, wer „Stopp“ schreibt oder sich abmeldet, bekommt nichts mehr.

### Kampagnen per WhatsApp und E-Mail (seit 14.11.2026)

- **Zwei Kanäle:** In jeder Kampagne wählen Sie **„WhatsApp bevorzugt, sonst E-Mail“** (Standard), **„Nur WhatsApp“**
  oder **„Nur E-Mail“**. Die Vorschau zeigt, wie viele Kunden per WhatsApp und wie viele per E-Mail angeschrieben
  werden und warum andere nicht dabei sind (z. B. „keine WhatsApp-Einwilligung“, „E-Mail abgemeldet“). Ist Ihre
  WhatsApp-Nummer nicht verbunden, gehen bei „WhatsApp bevorzugt“ alle erreichbaren Kunden per E-Mail raus.
- **E-Mails gehen über Ihr eigenes Postfach** (Einstellungen → E-Mail-Postfach: Gmail, Outlook oder SMTP), als
  persönliche Einzelmail (kein Verteiler), Text plus schlichtes HTML ohne Tracking-Pixel. Ohne Postfach steht
  „Postfach verbinden“. Unter jeder Mail stehen automatisch ein **Abmeldelink** (ein Klick, ohne Login) und Ihre
  **Pflichtangaben** (Impressum), die Sie unter **Bestand → Einwilligungen & Versand** pflegen (vorbefüllt aus dem
  Impressum Ihrer Website). Betreff und Text sind je Kampagne änderbar, Platzhalter {anrede}, {thema}, {meinname}.
  Bestandskunden werden gesiezt („Guten Tag Frau Muster,“, ohne Namen „Guten Tag,“).
- **Langsam verteilt:** E-Mails werktags 8 bis 18 Uhr in zufälligen Abständen, mit Tageslimit je Postfach (Gmail
  privat 150, Google Workspace 1.000, Outlook privat 100, Microsoft 365 300, SMTP 200). Bei Fehlern oder vielen
  unzustellbaren Adressen drosselt die App automatisch (Tageslimit halbiert, kurze Pause) und schickt Ihnen und uns
  einen Hinweis.
- **Kontingent:** 2.000 Kampagnen-E-Mails im Monat sind im Modul enthalten, getrennt von den WhatsApp-Nachrichten.
- **Antworten auf E-Mails** landen in Ihrem Postfach (die App hat nur das Recht zu senden, nicht zu lesen). Tragen Sie
  sie in der Kampagne unter **„Antwort zuordnen“** ein (Adresse und Text einfügen): Interesse wird ein Lead in Ihrer
  Pipeline, „bitte abmelden“ sperrt den Kunden für E-Mails, Abwesenheitsnotizen werden ignoriert, Unzustellbares
  bremst den Versand.
- **WhatsApp-Vorlagen:** Die Vorlagen der Kampagnen reichen wir automatisch bei Meta ein, sobald das Modul gebucht und
  Ihre Nummer verbunden ist. Ist eine Vorlage noch in Prüfung, können Sie die Kampagne schon vorbereiten: WhatsApp
  startet nach der Freigabe von selbst, E-Mails gehen sofort los. Lehnt Meta eine Vorlage ab, kümmern wir uns darum.

### Einwilligung je Kanal

Die App prüft vor jedem Versand nach diesen Regeln. Das ist eine Hilfe und keine Rechtsberatung: **Die rechtliche
Bewertung im Einzelfall liegt bei Ihnen.**

- **WhatsApp nur mit Einwilligung.** Ohne Opt-in geht keine WhatsApp-Kampagne raus, egal zu welchem Anlass (auch
  Meta verlangt ein Opt-in vor geschäftlichen Nachrichten).
- **E-Mail mit Einwilligung:** alle Anlässe.
- **E-Mail ohne Einwilligung** nur als Bestandskundenwerbung nach § 7 Abs. 3 UWG: Sie bestätigen einmalig unter
  **Bestand → Einwilligungen & Versand**, dass die Adressen aus Vertragsabschlüssen stammen. **Zusätzlich braucht
  jeder Kunde einen Nachweis** (seit 15.11.2026), dass er schon **bei der Erhebung der E-Mail-Adresse** auf sein
  Widerspruchsrecht hingewiesen wurde (ja/nein, Datum, Wortlaut oder Quelle). Ohne diesen Nachweis greift § 7 Abs. 3
  nicht: E-Mails an diesen Kunden gehen **nur mit Einwilligung** raus. Den Nachweis tragen Sie ein: beim Import als
  Spalte „Hinweis auf Widerspruchsrecht“ (ja, nein oder Datum) oder als Bestätigung für die ganze Liste (nur mit
  Wortlaut bzw. Quelle des Hinweises und ausdrücklichem Häkchen, wird protokolliert), unter **Bestand → Einwilligungen
  & Versand → Hinweis auf das Widerspruchsrecht** für alle bisherigen Kunden, oder je Kunde (Schild-Knopf).
  Kampagnenvorschau, „Rechtlich erreichbar je Anlass“ und der Hinweis oben auf „Bestand“ zeigen „X ohne Nachweis, nur
  mit Einwilligung“. Mit Nachweis gehen ohne Einwilligung nur Anlässe zum **selben Bedarf bzw. Vertrag** raus:
  Ablauf oder Wechsel des eigenen Vertrags (die Nachricht nennt die Sparte des Vertrags, der bei diesem Kunden
  abläuft), Vertragscheck im Jahresgespräch. **Nicht:** Cross-Selling in andere Sparten (z. B. Zahnzusatz an
  Haftpflichtkunden, auch nicht zwischen Sachsparten wie Hausrat und Wohngebäude), Geburtstag mit Angebot, Empfehlungs-
  oder Bewertungsbitte. Ohne Bestätigung gehen ohne Einwilligung keine Mails raus.
- **Einwilligung im Import:** Die Spalten „E-Mail-Einwilligung“ und „WhatsApp-Einwilligung“ (ja, nein oder Datum)
  lassen sich zuordnen. Ohne Angabe bleibt die Einwilligung „unbekannt“. „Alle Kunden dieser Liste haben
  eingewilligt“ geht je Kanal nur mit ausdrücklicher Bestätigung (z. B. laut Versicherer); ein „nein“ wird dabei nie
  überschrieben. Im Kunden (Schild-Knopf in der Kundenliste) setzen Sie die Einwilligung je Kanal auf ja, nein oder
  unbekannt, optional mit Datum.
- **Altdaten:** Bis zum 14.11.2026 hat jeder Import pauschal bestätigt „Für diese Kunden liegt die Einwilligung zur
  Kontaktaufnahme per WhatsApp/E-Mail vor (laut Versicherer)“. Diese Bestätigung gilt als Einwilligung für WhatsApp und
  E-Mail. Bitte prüfen Sie das unter **Bestand → Einwilligungen & Versand**: „Passt so“ oder die Einwilligungen auf
  „unbekannt“ setzen (nur WhatsApp oder beide).
- **Einwilligung einholen:** In der Kundenliste (Schild-Knopf) erstellt „Link erstellen“ einen persönlichen Link mit
  Text, z. B. für nach dem Termin, dem Abschluss oder dem Jahresgespräch. Alle Links auf einmal: **Bestand →
  Einwilligungen & Versand → Einwilligung einholen → „Einwilligungslinks als Liste (CSV)“** (Kunden ohne Angabe mit
  Anschrift, Kontakt und persönlichem Link, z. B. für einen Serienbrief); derselbe Knopf steht in jeder
  Kampagnenvorschau, sobald Kunden fehlen. Sie geben die Links selbst weiter. Der Kunde wählt auf einer Seite in Ihrem
  Namen, ob Sie ihn per E-Mail und bzw. oder WhatsApp informieren dürfen; bei E-Mail bestätigt er per Link
  (Double-Opt-in). Protokolliert werden Zeitpunkt, Text, Kanal und IP. Die Bitte per E-Mail zu senden geht nur bei
  Kunden, die Sie per E-Mail anschreiben dürfen, denn sie ist selbst Werbung.
- **Abmeldung:** „Stopp“ per WhatsApp sperrt alle Kanäle. Der Abmeldelink in E-Mails meldet von E-Mails ab, optional
  auch von WhatsApp. Abmeldungen wirken sofort und dauerhaft, auch nach einem erneuten Import (die App merkt sich
  E-Mail und Nummer verschlüsselt als Sperrliste).
- **Vor dem ersten Import** (Vertreter mit Agenturvertrag, seit 15.11.2026) bzw. vor der ersten Kampagne (Makler)
  bestätigen Sie, dass Sie die Kundendaten nutzen dürfen. Vertreter bestätigen den Satz „Ich bestätige, dass Upload
  und Nutzung dieser Kundendaten nach meinem Agenturvertrag und dem Datenschutzrecht zulässig sind.“ (als
  Ausschließlichkeitsvertreter gehören die Daten oft dem Versicherer). Gespeichert werden Login, Zeitpunkt und
  Textversion; ändert sich der Text, fragt die App einmal neu.
- **Meine Sparten** (nur Ausschließlichkeitsvertreter, Bestand → Einwilligungen & Versand): Die App schlägt
  „Lücke schließen“ nur für Sparten vor, die Sie anbieten, also keine Produkte anderer Versicherer. Ohne Auswahl
  gelten die Sparten aus Ihrem Bestand. Starten Sie trotzdem eine Kampagne in eine andere Sparte, erscheint ein
  deutlicher Hinweis. Beim Import weist die App auf Personenversicherungen (Kranken, Leben, BU, Unfall,
  Pflege) hin: Hier ist schon die Tatsache des Vertrags besonders geschützt.

### Ergebnisse der Kampagnen

- Unter **Bestand** stehen Kacheln für die letzten 30 Tage, 90 Tage oder 12 Monate: angeschrieben, Antwortquote,
  Termine, Abschlüsse und Provision, jeweils getrennt nach WhatsApp und E-Mail. Darunter alle Kampagnen mit ihren
  Zahlen und ein Vergleich nach Anlass und nach Thema bzw. Sparte.
- **Detailseite je Kampagne:** Trichter je Kanal mit Quoten (angeschrieben, zugestellt, bei WhatsApp gelesen,
  geantwortet, Lead, Termin, Abschluss, abgemeldet, unzustellbar, nicht verschickt mit Gründen), Abschlüsse nach
  Sparte und der Ertrag: Abschluss- und Bestandsprovision mit Ihrem Satz der verkauften Sparte, WhatsApp-Gebühren
  (im Modul enthalten), Ergebnis und Euro pro angeschriebenem Kunden.
- **Zuordnung:** Ein Abschluss zählt für eine Kampagne, wenn er innerhalb von 60 Tagen nach dem Anschreiben kommt und
  der Lead aus der Kampagne stammt oder es derselbe Bestandskunde ist. Bei mehreren Kampagnen zählt die letzte.
  Empfehlungen zählen nicht doppelt. Die gleichen Abschlüsse stehen in **Zahlen** unter „Kosten & Ertrag“ als
  „aus Bestandskampagnen: X Abschlüsse, Y €“ und zählen in den Gewinn; die Quoten dort bleiben bei bezahlten Leads.
- **Potenzial:** „312 Kunden ohne Hausrat noch nicht angeschrieben“ mit Knopf „Kampagne starten“ (nur Kunden ohne
  Abmeldung und mit Einwilligung).

<!-- /bestand-modul -->

## Empfehlungen & Bewertungen (Zusatzmodul)

- **Was es macht:** Einige Tage nach jedem Abschluss (Standard 7) bekommt Ihr Kunde per WhatsApp in Ihrem Namen
  eine Nachricht: erst der direkte Draht zu Ihnen („Wenn etwas nicht passt, antworten Sie mir direkt hier“), dann die
  neutrale Bitte „Außerdem freue ich mich über Ihre ehrliche Bewertung bei Google“ mit Link. **Alle bekommen dieselbe
  Nachricht**, es gibt keine Vorab-Frage, die darüber entscheidet, wer den Google-Link bekommt (das verbieten die
  Google-Richtlinien), und nie die Bitte um fünf Sterne oder nur um gute Bewertungen. Mit Knopf „Keine Nachrichten
  mehr“ bzw. Hinweis auf STOPP. **Einmal je Person**, auch bei mehreren Verträgen.
- **Nur mit Einwilligung (seit 15.11.2026):** Die Bitte um eine Bewertung oder Empfehlung ist Werbung und geht per
  WhatsApp nur, wenn Ihr Kunde einverstanden ist. Fragen Sie im Abschlussgespräch, ob Sie nachfragen und um eine
  ehrliche Bewertung und eine Empfehlung bitten dürfen, und bestätigen Sie das im Kontakt unter „Empfehlungen &
  Bewertungen“ mit **„Kunde ist einverstanden“** (gespeichert mit Zeitpunkt und Wortlaut). Bis dahin wartet die
  Nachfrage („Wartet auf Ihre Bestätigung der Einwilligung“), und die geplante Bitte um Empfehlung entfällt ohne
  Einwilligung. Antwortet der Kunde „STOPP“ oder tippt „Keine Nachrichten mehr“, bekommt er keine Nachfrage und keine
  Bitte mehr. Eigene Texte für die Nachfrage brauchen den Hinweis auf STOPP und dürfen nicht um fünf Sterne bitten.
- **Bewertungen anzeigen:** Wo die App Google-Bewertungen zeigt, steht „Bewertungen stammen von Google, keine eigene
  Echtheitsprüfung.“ Zeigen Sie Bewertungen auf Ihrer eigenen Website, nennen Sie dort ebenfalls die Herkunft.
- **Antworten:** Die KI liest die Antwort. Kritik oder Beschwerde → sofort Push und die Aufgabe „Kunde unzufrieden –
  bitte heute anrufen“ mit Zitat in „Heute“; die Bitte um Empfehlung geht an diesen Kunden nicht raus. Lob → Dank
  mit dem persönlichen Empfehlungslink (abschaltbar unter „Der richtige Moment“; ohne zweiten Google-Link). Rückfragen landen als „Wartet auf Sie“ im Chat. Geklärte Kritik markieren Sie in
  „Empfehlungen & Bewertungen“ mit „Als geklärt markieren“.
- **Bitte um Empfehlung:** einige Wochen nach dem Abschluss (Standard 21 Tage), nicht bei Kritik und nicht bei offener
  Aufgabe „unzufrieden“. Der persönliche Link führt Ihren Kunden auf eine Seite zum Teilen (WhatsApp oder Teilen-Knopf).
  Die empfohlene Person trägt sich selbst ein (mit Einwilligung) und landet als Lead mit Quelle „Empfehlung“ bei Ihnen,
  inklusive der üblichen ersten Nachricht. Wird daraus ein Abschluss, bekommt der Empfehlende automatisch einen Dank –
  ohne Namen der empfohlenen Person.
- **Empfehlungsangebot:** In den Einstellungen wählen Sie, was die empfohlene Person bekommt: Versicherungs-Check,
  Kfz-Check, Absicherungs-Check oder ein eigenes Angebot. Es steht auf der Empfehlungsseite und im Text, den Ihr Kunde
  weiterleitet. Keine Prämien, Gutscheine, Geldbeträge oder Garantien im Angebot.
- **Anlass wählen:** Bei „Empfehlungslink senden“ können Sie einen Anlass wählen (Schaden geregelt, Beitrag gespart,
  nach dem Jahresgespräch). Der Text passt dann zum Moment.
- **Im Termin zeigen:** Im Kontakt öffnet „Im Termin zeigen“ einen QR-Code zum persönlichen Link. Ihr Kunde scannt ihn
  und teilt die Empfehlung gleich am Tisch.
- **E-Mail-Signatur:** In „Empfehlungen & Bewertungen“ → „Im Gespräch und per E-Mail“ finden Sie eine Zeile für Ihre
  E-Mail-Signatur. Sie nutzt einen allgemeinen Link.
- **Per WhatsApp anfragen:** Ist Ihr WhatsApp verbunden, kann die empfohlene Person mit einem Tipp schreiben statt
  das Formular auszufüllen. Die Nachricht ist vorgeschrieben und landet als Lead mit Quelle „Empfehlung“ in Ihrem Chat.
- **Persönlicher Link aus der Signatur:** Öffnet ein Kunde den Link aus Ihrer Signatur, kann er seine Handynummer
  angeben und bekommt seinen persönlichen Link. So wissen Sie, von wem die Empfehlung kommt.
- **Nach jedem Termin (optional):** Unter „Der richtige Moment“ einschaltbar. Markieren Sie einen Termin mit einem Kunden
  als stattgefunden, geht einige Stunden später der Empfehlungslink raus (höchstens alle 180 Tage je Kontakt).
- **Nachfassen:** Nach „Empfehlungslink senden“ oder „Im Termin zeigen“ legt die App eine Aufgabe in „Heute“ an
  (Standard nach 48 Stunden, einstellbar, 0 = aus), wenn am Kontakt keine andere Wiedervorlage steht.
- **Vom Empfehlungslink zum Neukunden** (Reiter Übersicht): Links ausgegeben, Kunde hat geöffnet, Bekannte haben
  geöffnet (je Person einmal gezählt), Empfehlungen, Neukunden – mit einem Tipp, wo gerade das meiste Potenzial steckt.
- **Empfehlende auf dem Laufenden halten:** Wenn die empfohlene Person auf der Empfehlungsseite zustimmt, bekommt Ihr
  Kunde eine kurze Nachricht, sobald sie sich gemeldet hat und sobald ein Termin steht. Abschaltbar.
- **Empfehlungen im Gespräch ansprechen (Leitfaden):** 1. Zu Beginn ankündigen, dass Sie am Ende kurz nach der
  Zufriedenheit fragen. 2. Den Moment nutzen, in dem Ihr Kunde merkt, dass sich der Blick auf seine Verträge gelohnt
  hat: „Gibt es in Ihrem Umfeld jemanden, bei dem das auch so sein könnte?“ 3. Am Ende erst nach der Zufriedenheit
  fragen, bei klar positiver Antwort „Im Termin zeigen“ öffnen und gemeinsam die Seite ansehen; bei Kritik zuhören und
  heute nicht um Empfehlung bitten. 4. Verbindlich machen: „Ich melde mich in zwei Tagen kurz und erzähle, ob sich
  schon jemand gemeldet hat.“ Die Aufgabe dafür legt die App an. Bei kurzen Kontakten (Schaden, Rückruf) reicht:
  guten Moment benennen, nach der Zufriedenheit fragen, Link senden.
- **Dankeschön für Empfehlende (optional, standardmäßig aus):** Gutschein oder Spende (kein Bargeld), vorher
  angekündigt auf der Seite Ihres Kunden. Fällig, sobald ein Gespräch mit der empfohlenen Person stattgefunden hat,
  **nicht an einen Abschluss gekoppelt** (seit 15.11.2026; die Einstellung „nach dem Abschluss“ gibt es nicht mehr).
  Die App erinnert Sie, Sie übergeben selbst und haken unter „Offene Dankeschöns“ ab. Es geht nie an die empfohlene
  Person und nicht bei Selbstempfehlung. **Höchstens 15 € je Empfehler und Kalenderjahr** (§ 48b VAG): Der Wert ist
  auf 15 € begrenzt, und die App zählt alle Dankeschöns eines Empfehlers im Jahr zusammen (auch über seinen Link als
  Bestandskunde). Würde die Grenze überschritten, merkt die App für diese Empfehlung kein Dankeschön vor. Die App gibt
  dazu keine Rechtsberatung; beachten Sie auch die Vorgaben Ihres Versicherers.
- **Keine Nachrichten an Bekannte über die App:** Ihr Kunde teilt seinen Link selbst (WhatsApp, Teilen-Menü), oder die
  empfohlene Person meldet sich über den Link bzw. per WhatsApp selbst. Die App schreibt Bekannte nie von sich aus an.
- **Empfehlungslink senden:** In jedem Kontakt mit Abschluss (und bei Bestandskunden) gibt es den Knopf
  „Empfehlungslink senden“ – jederzeit nutzbar, z. B. nach einem guten Gespräch. Ohne WhatsApp-Verbindung erscheint
  der Text zum Kopieren oder Teilen.<!-- bestand-modul --> In der Kundenliste unter „Bestand“ öffnet der Knopf ein kleines Fenster:
  „Warum melden Sie sich?“ mit den Anlässen als Karten (ohne besonderen Anlass, Schaden geregelt, Beitrag gespart,
  nach dem Jahresgespräch). Der Anlass bestimmt nur den Einstieg der Nachricht; darunter steht die Vorschau des Textes,
  dann „Senden“.<!-- /bestand-modul --><!-- bestand-modul --> Mit Bestandskunden-Modul gibt es zusätzlich die Kampagne „Jährliche
  Empfehlungsbitte“ (persönlicher Link je Kunde, höchstens einmal im Jahr).<!-- /bestand-modul -->
- **Nicht anfragen:** Im Kontakt können Sie die Nachfrage für einzelne Kunden abschalten (z. B. wer keine Nachrichten
  möchte). Das ist kein Zufriedenheitsfilter und passiert nie automatisch.
- **Einrichten:** Wachstum → „Empfehlungen & Bewertungen“ (bzw. Konto & Rechnungen → Zusatzmodule →
  „Einstellungen & Auswertung“): Google-Bewertungslink hinterlegen (Google-Unternehmensprofil → „Rezensionen erhalten“ →
  Link kopieren), Tage einstellen, Texte anpassen (Platzhalter {Anrede} für „Guten Tag Frau Schneider“, {Vorname}, {Link}, {Vertreter}; Empfehlung: erst der
  direkte Draht, dann der Link), „Test an mich senden“. Eigene Texte gelten im offenen WhatsApp-Chat; sonst sendet
  die App die von Meta freigegebene Standardvorlage (Freigabe dauert meist wenige Stunden bis zwei Tage).
- **Auswertung:** Empfehlungs-Leads, daraus Termine, Abschlüsse und geschätzte Provision (Ihre Provisionssätze),
  dazu Nachfragen, Klicks auf den Google-Link, positive und kritische Rückmeldungen und geklärte Fälle.
- **Buchen (nur Inhaber):** Konto & Rechnungen → Zusatzmodule → „30 Tage kostenlos testen“. Bestätigungsblatt mit
  Preis und Bedingungen, Häkchen setzen, fertig – das Modul ist sofort frei. Die Testphase ist kostenlos; 3 Tage vor
  dem Ende erinnern wir per Push und E-Mail. Danach läuft es automatisch für 59 € netto im Monat weiter (tagesgenau
  anteilig mit der nächsten Rechnung), außer Sie kündigen vorher. Kündigen ebenfalls dort: in der Testphase endet das
  Modul mit der Testphase ohne Kosten, sonst zum Ende des Abrechnungszeitraums. Die Testphase gibt es einmal je Konto.
  Im Paket „Nur Betreuung“ gibt es das Modul nicht.

## Bewertungs-Wächter (Teil von Empfehlungen & Bewertungen)

- **Stand 14.11.2026: noch nicht freigeschaltet.** Unter „Teilen & Google“ steht „Demnächst“. Wir schalten die
  Verbindung frei, sobald Google die Schnittstelle für Unternehmensprofile für uns freigegeben hat.
- Unter „Empfehlungen & Bewertungen“ → „Google-Unternehmensprofil verbinden“ (nur Inhaber): mit dem Google-Konto
  anmelden, das Ihr Profil verwaltet, Zugriff erlauben, Standort wählen.
- Jede neue Google-Bewertung kommt als Push. Bei 1–3 Sternen dringend, mit der Aufgabe „Schlechte Google-Bewertung –
  bitte antworten“ in „Heute“ (und am Kontakt, wenn der Name eindeutig zu einem Kunden mit Abschluss passt).
- Die KI schlägt eine sachliche Antwort vor (ohne Namen, Vertrags- oder Versicherungsdetails; bei Kritik mit dem
  Angebot, das offline zu klären). Sie passen sie an und veröffentlichen mit „Antwort auf Google veröffentlichen“.
  Nichts geht automatisch raus.
- Auswertung: Durchschnitt, Anzahl, neue Bewertungen pro Monat, Antwortquote, Entwicklung seit Start.
- Unberechtigte Bewertung: im Modul gibt es eine Kurzanleitung und den Link zur offiziellen Google-Hilfe
  „Unangemessene Rezensionen melden“. Gemeldet werden nur Verstöße gegen Googles Richtlinien, nicht bloße Kritik.
- Steht dort „Bewertungs-Wächter wird freigeschaltet“: Google muss den Zugang für uns noch freigeben. Sie müssen
  nichts tun, der Abgleich startet danach automatisch.
- „Verbindung trennen“ löscht die abgeglichenen Bewertungen in der App (nicht bei Google).

## Zusatzmodule buchen

- Konto & Rechnungen → **Zusatzmodule** (nur Inhaber): Empfehlungen & Bewertungen (59 €, 30 Tage kostenlos testen),
<!-- bestand-modul -->  Bestandskunden-Modul (149 €, siehe „Bestand“) und <!-- /bestand-modul -->weitere Verkäufer (3 aktive Verkäufer inklusive, jeder weitere 49 €,
  im Team anlegen; Mitglieder ohne Leads kostenlos).
  Buchen und Kündigen geht dort selbst; wir bekommen automatisch Bescheid.

## Einrichtung

- Schritte: kurzer Fragebogen, Zugriff auf Ihr Meta-Werbekonto (mit Anleitung), Kalender verbinden,
  App aufs Handy, Start.
- Meta-Zugriff: Hat Ihr Business-Konto einen zweiten Admin, muss er die Partner-Freigabe bestätigen.
  Lieber gemeinsam? 15-Minuten-Hilfetermin in der Einrichtung buchen.
- **WhatsApp verbinden** (nur Inhaber, Paket mit Software): Einrichtung → „WhatsApp verbinden“. Zuerst
  wählen, welche Nummer der Assistent nutzen soll; danach zeigt die App genau die passende Anleitung.
  Ausführlich mit Bildern unter „Ausführliche Anleitung“ (Seite /buyer/hilfe/whatsapp). Dauer etwa
  10 Minuten, am besten am Computer.

## WhatsApp verbinden: Schritt für Schritt

**Video:** Ein Video (ca. 3:20 Minuten) macht den ganzen Ablauf mit einer neuen Nummer einmal vor (und kurz den Weg mit der WhatsApp Business App). Es steht oben auf der Seite
„Ausführliche Anleitung“ (/buyer/hilfe/whatsapp), aufklappbar direkt über dem Knopf „Jetzt WhatsApp verbinden“
in der Einrichtung und für Inhaber unter Profilmenü → **Einführung ansehen**.

**Welche Nummer?** (drei Wege, keine Wertung)
- **Nummer aus der WhatsApp Business App** (häufigster Fall): Leads und Kunden kennen die Nummer schon.
  Der Vermittler schreibt weiter in der App, der Assistent übernimmt neue Leads über dieselbe Nummer.
  Ihre bestehenden Chats bleiben privat. Der Assistent schreibt nur Leads an, die über performancegrowth kommen.
  Den alten Chatverlauf speichert die App nicht. Schreibt der Vermittler einem Lead in der App, erscheint das
  auch unter „Chats“ und der Assistent pausiert in diesem Gespräch sofort. Bei 360dialog auf die Frage „Is … already on WhatsApp?“ „Yes, Business app“ wählen,
  später statt des SMS-Codes in der App den QR-Code scannen. Voraussetzungen: aktuelle WhatsApp Business App, die Nummer
  schon etwa 7 Tage in der App genutzt, die App mindestens alle 13 Tage öffnen (sonst trennt Meta die
  Verbindung). Mit der App verknüpfte Geräte (z. B. WhatsApp Web) werden getrennt und müssen neu
  verbunden werden.
- **Neue Nummer oder Festnetz:** Berufliche Nummer und Nummer des Assistenten bleiben getrennt. Bei
  Festnetz kommt der Bestätigungscode per Anruf (Ansage liest ihn vor).
- **Private Nummer aus der normalen WhatsApp-App:** Geht nur, wenn das WhatsApp-Konto auf der Nummer
  vorher gelöscht wird (die Chats dort sind dann weg). Alternative: die Nummer kostenlos auf WhatsApp
  Business umstellen (die Chats bleiben dabei erhalten) und dann den Weg „WhatsApp Business App“ nehmen.

**Nummer schon bei einem anderen Anbieter (z. B. Superchat, MessageBird, Charles, WATI)?** Die App fragt
das beim Weg „WhatsApp Business App“ nach.
- **Ja:** Das geht. Im Fenster von Meta die bestehende Nummer auswählen. Beim bisherigen Anbieter muss
  vorher nichts gekündigt oder gelöscht werden. Danach in der Meta Business Suite festlegen, dass die
  Gespräche an uns gehen. Beide Anbieter gleichzeitig funktionieren nicht zuverlässig. Wer den
  bisherigen Anbieter weiter nutzen möchte, nimmt für den Assistenten besser eine zweite Nummer.
- **Ja, und die Nummer läuft dort zusätzlich in der WhatsApp Business App:** Dann ist ein eigener Ablauf
  nötig (Verbindung beim bisherigen Anbieter trennen, Chats sichern, neu verbinden). Dafür den
  15-Minuten-Hilfetermin buchen, wir machen das gemeinsam.
- **Weiß nicht:** Erkennbar an einer Rechnung oder einem Login bei einem WhatsApp-Tool, oder daran, dass
  Nachrichten in einem Postfach im Browser ankommen statt nur in der App. Im Zweifel im
  15-Minuten-Hilfetermin klären.

**Bereithalten:** Facebook-Login mit Admin-Rechten im Meta-Unternehmensportfolio (dort, wo auch das
Werbekonto liegt), Zugang zum E-Mail-Postfach (Einladung und Anmeldecode von 360dialog), das Telefon zur Nummer (Code) bzw. das Handy mit der WhatsApp Business App (QR-Code),
einen Computer mit erlaubten Pop-up-Fenstern, etwa 10 Minuten.
- **Admin prüfen (vor dem Start):** business.facebook.com → Einstellungen → Personen → eigener Name → Rolle
  „Vollzugriff“ (Admin). Kein Admin: den Inhaber des Portfolios bitten, einen als Admin hinzuzufügen; gibt es
  kein Portfolio, unter business.facebook.com/overview eines anlegen. Erst dann starten.
- **Verifizierung (nicht nötig, aber gut zu wissen):** business.facebook.com → Einstellungen → Sicherheitscenter →
  „Unternehmensverifizierung“. Ohne Verifizierung klappt das Verbinden, Meta setzt aber engere Grenzen (z. B.
  Anzeigename, Zahl der Nachrichten an neue Kontakte). Verifizierung parallel starten (Handelsregisterauszug
  bzw. Gewerbeanmeldung, Adresse, Telefon, Website mit Impressum), dauert meist einige Tage. Aktuelle Grenzen
  stehen in der Doku von Meta.

**Ablauf** (Stand 15.11.2026, Texte bei 360dialog und Meta auf Englisch; Kurzfassung auch oben unter „Einrichtung (neue Kunden)“):
1. Einrichtung → „WhatsApp verbinden“ → Nummer wählen → „Jetzt WhatsApp verbinden“. Die App legt das Konto bei 360dialog
   (unserem WhatsApp-Anbieter) unter unserem Partnerkonto an. Kostenlos, die Nummer bleibt Eigentum des Kunden.
2. In der App steht jetzt **Schritt 1 „E-Mail von 360dialog öffnen“** (gelb, mit Adresse, Absender, Betreff, Knopf zum
   Postfach und Häkchen) und **Schritt 2 „WhatsApp-Nummer verbinden“**; darunter aufklappbar „So geht es bei 360dialog
   und Meta weiter (mit Bildern)“.
3. E-Mail von „360Dialog“ (no-reply@360dialog.com), Betreff „Join [Firmenname] on the 360Dialog Hub“ → „Join 360Dialog
   Hub“ → Passwort festlegen. Keine E-Mail: Spam-Ordner. Hatte die Adresse schon ein 360dialog-Konto, kommt keine
   Einladung: mit dem bisherigen Passwort anmelden.
4. In der App „Erledigt, ich habe mein Passwort festgelegt“ anhaken → „Weiter: WhatsApp verbinden“ → bei 360dialog
   „Log in“. Nicht mit Facebook oder Google anmelden und kein Konto über „Sign up“ anlegen (das kann in einem alten
   Konto eines anderen Anbieters wie Superchat landen; dann nicht weitermachen, sondern uns melden). „Verify it's you“:
   Code aus einer zweiten E-Mail eintragen, optional „Remember this device for 30 days“, „Continue“.
   Halb fertig oder falsche Adresse: „Abbrechen und neu beginnen“ (Inhaber) bzw. Admin „Verbindung zurücksetzen“.
5. „Onboard new number“ → „Enter phone number“: Land ist auf USA (+1) vorbelegt, auf Deutschland (+49) umstellen,
   Nummer ohne führende 0, „Next“. Nicht „Use Meta-provided number“.
6. „Is +49 … already on WhatsApp?“: neue Nummer/Festnetz → „No, It's not connected“; WhatsApp Business App →
   „Yes, Business app“; normale WhatsApp-App → „Yes, Personal app“ (vorher Konto löschen oder auf Business umstellen);
   Nummer bei einem anderen Anbieter → „Yes, Business API“.
7. Neue Nummer: „Verify your phone number“, Code per „Text message (SMS)“ oder „Voice call“, nicht „Skip verification“.
   Code nicht mehrmals kurz hintereinander anfordern (Meta sperrt die Nummer sonst für Stunden).
8. „Meta Business Signup“ (vier Schritte, Hinweis „make sure not to select Display Name only“) → unten rechts
   „Embedded Signup“. Pop-ups müssen erlaubt sein.
9. Fenster von Meta „Facebook Login for Business“: „Seamlessly connect your account to 360Dialog“ → „Continue“.
10. „Add your WhatsApp phone number“: Nummer ist vorausgewählt → „Next“ (nicht „Display Name only“). WhatsApp
    Business App: statt SMS-Code kommt eine Nachricht in der App, QR-Code scannen, Chatverlauf und Kontakte lassen
    sich übernehmen; die Nummer nicht neu eintippen.
11. „Select the business assets to share with 360dialog“: eigenes Business portfolio (wie fürs Werbekonto; Meta
    schlägt manchmal ein fremdes vor, die Auswahl lässt sich später nicht ändern), WhatsApp account „Create a
    WhatsApp account“ → „Next“.
12. „Enter business information for new assets“: Name wie im Impressum, Kategorie z. B. Professional Services oder
    Finance, Land Germany, Website freiwillig, Zeitzone Europe/Berlin (Meta schlägt oft z. B. Europe/Vienna vor) → „Next“.
13. „Review what you'll share with 360dialog“: Unternehmen, WhatsApp-Konto, Nachrichtenkonto prüfen (eigener
    Firmenname). „Access your Facebook ads and related stats“ steht immer dabei und ändert nichts an den Anzeigen
    → „Confirm“.
14. „Your account is connected to 360Dialog“: unter „Improve your experience“ beide Häkchen entfernen („Instruct Meta
    to automatically identify order and lead events“, „Share Cloud API events“) → „Finish“.
15. Automatisch zurück in die App: „Fast geschafft: Ihre Nummer wird bei WhatsApp noch eingerichtet …“. Die Seite lädt
    sich von selbst neu und zeigt nach wenigen Minuten „Verbunden: +49 …“. Meta prüft das Konto zusätzlich innerhalb
    von 24 Stunden. Nichts zu tun.

**Wenn es hakt:**
- Kein Fenster von Meta: Pop-up-Blocker. Pop-ups für die Seite erlauben und erneut verbinden.
- Unternehmensportfolio fehlt in der Liste: keine Admin-Rechte dort. Admin-Rechte geben lassen oder ein
  neues Portfolio anlegen.
- „Nummer wird bereits verwendet“: Die Nummer läuft noch in einer WhatsApp-App. Den passenden Weg
  wählen (Business App) oder eine andere Nummer nehmen.
- 360dialog zeigt „Choose a plan“ bzw. „Pending Activation“: nichts kaufen, Fenster schließen, uns schreiben. Der
  Tarif läuft über uns, wir schalten die Nummer frei und verbinden sie.
- Verbinden bei 360dialog fertig, in der App steht aber nicht „Verbunden“: in der Einrichtung beim Schritt
  WhatsApp auf **„Verbindung prüfen“** tippen. Die App sucht die Nummer bei 360dialog und verbindet sie. Wartet die
  Nummer noch auf Freischaltung, holt die App die Verbindung danach selbst nach. (Admin: Kundenakte → WhatsApp →
  „360dialog-Nummer zuordnen“ mit Liste freier Nummern.)
- „This phone number belongs to another business“: Die Nummer hängt in einem anderen Meta-Portfolio. Dort
  entfernen oder eine andere Nummer nehmen.
- Weitere Hinweise aus dem Ablauf: Land von +1 auf +49 stellen, Nummer ohne führende 0, nicht „Display Name only“;
  eigenes Portfolio wählen (Meta schlägt manchmal ein fremdes vor); Zeitzone Europe/Berlin; auf der letzten
  Meta-Seite beide Häkchen unter „Improve your experience“ entfernen.
- Fehler nach der Rückkehr: Wir bekommen automatisch Bescheid und melden uns. Lieber gemeinsam?
  15-Minuten-Hilfetermin in der Einrichtung buchen.

## Datenschutz

- Daten liegen auf Servern in der EU. Löschen eines Leads: Lead öffnen → „Mehr“ → „Daten löschen (DSGVO)“
  (nur Inhaber, unwiderruflich).
- Die KI-Hilfe kennt nur diese Anleitung, keine Kundendaten. Bitte keine Kundendaten in die Hilfe eingeben.
- Wie wir Daten schützen (Hosting in der EU, Verschlüsselung, Datensicherung, Dienstleister): Seite
  „Sicherheit & Datenschutz“ im Profilmenü bzw. unter /sicherheit.
- Ob gerade alles läuft: öffentliche Statusseite /status (Link „Status“ unten auf der Login-Seite).

## Support: Hilfe von unserem Team

- Erst die KI-Hilfe fragen: Sie kennt die App und antwortet sofort.
- Geht es um Rechnungen, Abbuchungen, den Vertrag oder eine Kündigung, um einen Fehler in der App, um
  fehlende Leads oder Daten, oder hilft die Antwort nicht weiter, bietet die KI-Hilfe den Kontakt zu
  unserem Team an. Jederzeit möglich: oben im Hilfe-Fenster „Mit Mensch sprechen“.
- „Per WhatsApp an unser Team“ öffnet WhatsApp mit einer fertigen Nachricht (Name, Anliegen, Referenz
  wie PG-AB12CD). Nur noch abschicken.
- Direkt in der App schreiben: Im Feld „Ihre Nachricht an unser Team“ steht schon Ihr Anliegen mit Referenz.
  Ergänzen Sie, was fehlt, und tippen Sie „Senden“. Ist Ihr E-Mail-Postfach verbunden, geht die Nachricht über
  Ihr Postfach, sonst über uns. Unsere Antwort kommt in beiden Fällen an Ihre E-Mail-Adresse. Klappt das Senden
  nicht, können Sie die Nachricht stattdessen im Mailprogramm öffnen.
- Wir antworten werktags in der Regel innerhalb weniger Stunden. Die Referenz hilft uns, Ihr Anliegen
  schnell zuzuordnen.
- Bitte keine Daten Ihrer Kunden (Namen, Telefonnummern) in die Nachricht schreiben.

## Kontakt zu uns

- In der KI-Hilfe „Mit Mensch sprechen“ (WhatsApp oder E-Mail an unser Team).
- „Etwas unklar? Feedback“ im Profilmenü – wir melden uns.
- 15-Minuten-Hilfetermin (Video) in der Einrichtung, solange sie offen ist.
- Telefon: +49 151 52418846.

## E-Mails aus der App (eigenes Postfach)

- **E-Mails in Ihrem Namen (seit 17.11.2026):** unter **Einstellungen → Assistent**. Ein kurzer Schritt erklärt, welche
  Service-Mails die App in Ihrem Namen schickt, zeigt eine echte Terminbestätigung als Beispiel (Absender „Ihr Name |
  Agentur“, darunter klein die technische Adresse, unten Ihre Signatur) und fragt fehlende Angaben für die Signatur ab.
  **Ja, Mails in meinem Namen senden** übernimmt die Voreinstellungen und schaltet die Kopie jeder Mail an Ihre Adresse
  an. **Selbst entscheiden je Mail** zeigt die Liste aller E-Mail-Vorlagen mit **Automatisch**, **Ein Tipp** oder **Aus**.
  Angebot, Gesprächszusammenfassung und Kündigung gehen nie automatisch. Automatische Mails, die noch nicht laufen,
  stehen dort mit „automatisch bald verfügbar“. Danach ändern Sie dort jederzeit Stufe, Kopie (andere Adresse möglich) und Signatur.
  Ist Ihr Postfach verbunden, gehen die Mails von Ihrer Adresse und liegen in „Gesendet“, dann ohne Kopie.

- **Alle E-Mails im Verlauf (seit 15.11.2026):** Jede E-Mail an einen Lead oder Bestandskunden steht im Verlauf des
  Kontakts (**Lead öffnen → Notizen & Verlauf**), auch die automatischen: Terminbestätigung, Terminverschiebung,
  Terminabsage, Terminerinnerung, „Kein WhatsApp“, Kampagnen-Mails und Einwilligungs-Mails im Bestand. Automatische
  Mails tragen das Kennzeichen „automatisch“ und die Art. Darunter Betreff und Empfänger, der Text ist eingeklappt
  (**Text anzeigen**). Status: versendet, zugestellt, nicht zustellbar, abgemeldet; ging eine Mail nicht raus, steht
  „nicht versendet“ mit Grund. „Zugestellt“ kennt die App nur bei Mails über den neutralen Absender (Termin-Mails);
  bei Mails aus Ihrem Postfach bleibt es bei „versendet“, bis eine Unzustellbar-Meldung oder Abmeldung zugeordnet ist.
<!-- bestand-modul -->
  Bestandskunden ohne Lead: in **Bestand → Kunden** der Knopf mit der Uhr neben dem Kunden (nur, wenn schon E-Mails
  rausgingen).
<!-- /bestand-modul -->
  Der WhatsApp-Assistent kennt die letzten automatischen Mails (14 Tage) und schickt nichts doppelt.

- **Einstellungen → E-Mail-Postfach**: Postfach verbinden – Microsoft (Outlook/365) per Anmeldung oder jeder andere
  Anbieter per SMTP (z. B. IONOS, Strato, T-Online, GMX; Gmail mit App-Passwort: smtp.gmail.com, Port 587).
  „Test senden“ schickt eine Probe-Mail an die eigene Adresse.
- **Signatur**: einmal hinterlegen (Name, Agentur, Telefon, Adresse). Sie steht automatisch unter jeder E-Mail an
  Leads – mit und ohne Vorlage. In einer Vorlage kann man die Stelle mit {signatur} selbst festlegen.
- **Vorlagen** mit Platzhaltern {anrede}, {vorname}, {nachname}, {name}, {produkt}, {terminlink}, {meinname}, {signatur}.
  Seit 15.11.2026 zusätzlich, automatisch gefüllt: {betreff_name} (vorn im Betreff: „Frau Schneider, “ bzw. „Julia, “,
  ohne bekannten Namen leer), {ihr_produkt} („Ihrer Zahnzusatzversicherung“, „Ihrem Privatschutz“), {rueckruf_1} und
  {rueckruf_2} (zwei Rückrufzeiten, z. B. „heute um 17 Uhr“ und „morgen um 10 Uhr“), {anruf_tag} (Wochentag in zwei
  Werktagen). Dazu Platzhalter, die das Fenster über eigene Felder füllt: {termin_datum}, {termin_art}, {videolink} (Satz
  entfällt ohne Link), {termin_unterlagen}, {fehlende_unterlagen}, {melde_datum}, {versicherer}, {vertragsnummer},
  {kuendigungstermin}, {musterkuendigung}, {wuensche}, {rat}, {vorteil_1}, {vorteil_2}, {vorteil_3}. Sie funktionieren
  auch in eigenen Vorlagen.
  {anrede} richtet sich nach der Ansprache: „Guten Tag Frau Beispiel“ (Sie mit bekannter Anrede; sonst „Guten Tag Anna
  Beispiel“, ohne Nachname „Guten Tag“) oder „Hallo Anna“ (Du).
  Die Standardvorlagen gibt es in beiden Fassungen; beim Wechsel der Ansprache ziehen unveränderte Standardvorlagen mit,
  eigene Texte bleiben.
- **{terminlink}**: persönlicher Buchungslink für genau diesen Kontakt (Zeiten aus Ihrem Kalender, Buchung landet
  am Kontakt). Steht schon ein Termin an oder ist kein Kalender verbunden, fällt der Satz mit dem Link weg.
  In „Nicht erreicht“ und „Nicht erschienen“ ist er schon drin.
- **Verkaufsstärkere Standardvorlagen (15.11.2026):** jede E-Mail hat ein Ziel und ist kurz, der Betreff nennt Namen und
  Produkt („Frau Schneider, kurz zu Ihrer Zahnzusatzversicherung“).
  - **Nicht erreicht**: zwei Rückrufzeiten zur Auswahl plus Terminlink.
  - **Angebot**: drei Vorteile als Liste, die Sie im Fenster eintragen (nur, was im Angebot steht), und ein fester
    nächster Schritt: „Ich rufe Sie am Donnerstag kurz an, passt das?“.
  - **Nachfassen Angebot**: eine konkrete Frage: „Ist für Sie eher der Beitrag oder die Leistung entscheidend?“.
  - Unveränderte Standardvorlagen bekommen die neue Fassung beim nächsten Öffnen automatisch, selbst geänderte bleiben.
- Beim Kontakt: Kachel **E-Mail**. Vorlage wählen, anpassen, Dokumente (z. B. das Angebot) anhängen und einen von drei
  Wegen wählen (seit 17.11.2026):
  - **Über die App senden**: aus Ihrem verbundenen Postfach, sonst über unsere Versandadresse mit „Ihr Name | Agentur“
    als Absender, Ihrer Signatur aus den Anbieterangaben und Antworten direkt an Sie. Auf Wunsch geht eine Kopie an Sie
    (Einstellungen → Assistent).
  - **Im Mailprogramm öffnen**: öffnet Ihr eigenes Mailprogramm mit Empfänger, Betreff und Text, ohne Signatur (Ihr
    Programm setzt seine eigene). Sehr lange Texte kommen in die Zwischenablage, dort einfügen. Anhänge fügen Sie selbst
    hinzu: auf dem Handy **PDF teilen**, am Rechner **PDF herunterladen**.
  - **Text kopieren**: z. B. für das System Ihrer Gesellschaft.
  Kommen Sie danach in die App zurück, fragt sie **„Haben Sie die E-Mail gesendet?“**. **Ja** trägt die Mail im Verlauf
  ein (Kennzeichen „eigenes Mailprogramm“) und legt dieselbe Wiedervorlage an wie beim Senden über die App, **Nein**
  ändert nichts. Hat sich ein Kontakt von E-Mails abgemeldet, sendet die App keine Nachfass-Vorlagen mehr an ihn.
- **Erinnern, falls kein Termin gebucht wird**: Steht der Terminlink in der Mail, legt die App nach dem Senden eine
  Wiedervorlage „Kein Termin gebucht: nachfassen“ an (morgen, in 2 Werktagen oder in 1 Woche). Bucht der Kontakt
  vorher, verschwindet sie. Gibt es schon eine Wiedervorlage oder läuft eine Nachfass-Abfolge, kommt keine zweite dazu.
- **Vorlagen nach Phase**: Im Fenster „E-Mail schreiben“ stehen oben die Vorlagen, die gerade zum Kontakt passen
  (hervorgehoben), alle übrigen unter **Weitere**. Regeln: Nicht erreicht → „Nicht erreicht“; Termin gebucht →
  „Termin: Vorbereitung“; letzter Termin nicht erschienen → „Nicht erschienen“; Termin vorbei ohne Ergebnis →
  „Gesprächszusammenfassung“, „Unterlagen fehlen noch“, „Angebot“; Angebot gesendet → „Nachfassen Angebot“; Abschluss →
  „Kündigung alte Versicherung“, „Nach dem Abschluss“; Police fertig gemacht → „Willkommen: Police ist da“, „Kündigung
  alte Versicherung“; eigene Wiedervorlage in der Zukunft (Später) → „Wie besprochen: später melden“; Kein Interesse →
  „Kein Interesse: Tür offen“. Die Zuordnung hängt an der Standardvorlage, auch wenn Sie Name oder Text ändern.
- **Neue Standardvorlagen (14.11.2026)**, in Sie und Du, ändern unter „Vorlagen & Signatur“. Bestehende Kunden
  bekommen sie beim nächsten Öffnen dazu; eigene Vorlagen und geänderte Texte bleiben, nichts wird doppelt angelegt.
  - **Termin: Vorbereitung**: Datum und Art des Termins (Telefon oder Videocall mit Link) und was bereitliegen sollte,
    je Produkt (Tier: Tierpass bzw. Chipnummer, Tierarztrechnungen; Sach: bisherige Police; immer: IBAN). Ergänzt die
    automatische Terminbestätigung, ersetzt sie nicht.
  - **Nicht erschienen**: freundlich, ohne Vorwurf, mit Terminlink zum neuen Buchen. Auf Wunsch Wiedervorlage
    „Nicht erschienen: nachfassen“, die bei einer neuen Buchung wieder verschwindet.
  - **Gesprächszusammenfassung**: Wünsche und Bedürfnisse sowie Rat und Gründe (Beratungsdokumentation, §§ 61, 62 VVG).
    Die Wünsche sind aus Formular und Assistent vorbefüllt, Notizen lassen sich mit einem Klick übernehmen; Rat und
    Gründe schreiben Sie selbst. Die App gibt keinen Rat, bitte prüfen Sie den Inhalt vor dem Senden. Auf Wunsch geht
    sie als PDF mit und liegt danach im Kontakt unter **Dokumente**.
  - **Mit dem Angebot (seit 18.11.2026):** Im Blatt **Angebot senden → Über die App senden** der Haken
    **Gesprächszusammenfassung mitsenden**. Der Entwurf kommt ohne KI aus der Terminvorbereitung (gewählte Tarife mit
    Beitrag und Leistungen aus dem Katalog, Schutz im Überblick, offene Klärpunkte, Notizen, bestehende Verträge,
    Angaben aus Formular und Chat, ohne Gesundheitsangaben). Die Gründe für Ihren Rat tragen Sie statt „[bitte
    ergänzen]“ ein. **Ansehen** zeigt die Zusammenfassung so, wie sie im PDF steht; gesendet wird erst danach (nach
    jeder Änderung erneut ansehen). Das PDF geht mit der Angebots-Mail und liegt als **Beratungsdokumentation** unter
    Dokumente. Nach **Habe ich selbst gesendet** schlägt das Blatt die Zusammenfassung vor: per App senden, im eigenen
    Mailprogramm (PDF teilen bzw. herunterladen, danach „Gesendet?“) oder nur ablegen. **Mit KI formulieren** erscheint
    nur, wenn die KI mit Verarbeitung in der EU eingerichtet ist, und nie bei Kranken, Zahn, BU, Leben oder Pflege;
    das Ergebnis ist als „Entwurf der KI, bitte prüfen“ markiert und darf keine eigenen Beträge, Versicherer oder
    Empfehlungen ergänzen. Steht die Vorlage in den Einstellungen auf **Aus**, gibt es Haken und Vorschlag nicht.
  - **Gründe vorschlagen (seit 18.11.2026):** Der Rat (die am Termin gewählten Tarife) steht ohne KI im Feld. Die
    Gründe schlägt die KI mit Verarbeitung in der EU vor, im Feld **Rat und Gründe** der Gesprächszusammenfassung und
    im Feld **Empfehlung mit Begründung** der Beratungsdokumentation. Steht dort noch „[bitte ergänzen]“, erscheint der
    Vorschlag beim Öffnen von selbst, gelb markiert unter dem Feld; sonst über **Gründe vorschlagen** bzw.
    **Begründung vorschlagen**. Er kommt erst mit **Übernehmen** ins Feld, bleibt dort änderbar und wird mit dem
    normalen Senden bzw. Ablegen gespeichert; **Verwerfen** lässt das Feld unverändert. Grundlage sind die gewählten
    Tarife (Versicherer, Tarif, Beitrag, Leistungen aus dem Katalog) und der Text unter Wünsche und Bedürfnisse
    (Angaben, Notizen, „Was hat … schon?“), ohne Gesundheitsangaben und nie mit Dokumenten oder PDFs. Bei Kranken,
    Zahn, BU, Leben, Pflege und Unfall sieht die KI nur Sparte, Versicherer, Tarif und Beitrag. Ohne gewählten Tarif
    oder ohne Angaben zum Bedarf ist der Knopf aus, darunter steht, was fehlt. Der Vorschlag nennt keine neuen
    Beträge oder Versicherer, vergleicht nicht und verspricht nichts; die Inhalte verantworten Sie.
  - **Beratungsdokumentation nach dem Termin:** einschalten unter **Einstellungen** oder in der **Einrichtung**
    (Frage „Beratungsdokumentation vorbereiten?“ mit **Ja, vorbereiten** oder **Nein**). Wer die Frage nie beantwortet
    hat, sieht sie einmal nach dem ersten Termin-Ergebnis (Angebot oder Abschluss) in „Wie lief der Termin?“; nach
    **Ja** lässt sich die Dokumentation zu diesem Termin gleich erstellen. Nach der Antwort fragt die App nicht mehr,
    ändern können Sie es jederzeit unter Einstellungen. Nur der Inhaber des Kontos entscheidet.
  - **Aufbewahrung:** Wird ein Kontakt auf Wunsch gelöscht, bleibt nur die Beratungsdokumentation als Nachweis
    (10 Jahre ab Erstellung, danach automatisch gelöscht); am gelöschten Kontakt steht sie mit Datum zum Öffnen.
    Bei Vertragsende werden auch diese PDFs mit allen Daten gelöscht (vorher Export).
  - **Unterlagen fehlen noch**: fehlende Angaben per Häkchen auswählen (plus freies Feld); der Kontakt kann einfach
    auf die E-Mail antworten. Auf Wunsch Wiedervorlage „Unterlagen nachfassen“ nach 3 Werktagen.
  - **Willkommen: Police ist da**: Erreichbarkeit und wie man einen Schaden meldet. Nach „Police erledigt“ schlägt die
    Abschluss-Karte die Mail direkt vor; eine hochgeladene Police wird angehängt.
  - **Kündigung alte Versicherung**: Musterkündigung als Textbaustein in der Mail, Felder Versicherer, Vertragsnummer
    und Kündigungstermin; auf Wunsch zusätzlich als PDF (liegt dann unter Dokumente).
  - **Wie besprochen: später melden**: Datum im Fenster wählen; nach dem Senden steht die Wiedervorlage „Wie besprochen
    melden“ zu diesem Tag (eine andere Wiedervorlage wird dabei ersetzt, nie doppelt).
  - **Kein Interesse: Tür offen**: kurz und ohne Angebot. Nach dem Senden endet das automatische Nachfassen für den
    Kontakt und eine offene Wiedervorlage entfällt, damit keine weiteren Nachrichten kommen.
- Jahresgespräch, Empfehlungsbitte und Geburtstag gibt es bewusst nicht als freie Vorlage: Das ist Werbung und läuft
  nur über die Bestandskampagnen mit Prüfung der Einwilligung.
- Wiedervorlagen ohne Doppelungen: Steht schon eine Wiedervorlage oder läuft eine Nachfass-Abfolge, legt eine Vorlage
  keine zweite an (Ausnahme: der ausdrücklich vereinbarte Tag bei „Wie besprochen“).
- Firmen-Postfächer mancher Versicherer lassen sich oft nicht verbinden; dann das eigene Mailprogramm nutzen.
