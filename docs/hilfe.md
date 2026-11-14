# Hilfe zur App (Wissensbasis der KI-Hilfe)

Diese Datei ist die einzige Wissensquelle der KI-Hilfe im Kundenbereich
(`src/lib/hilfe.ts`). Sie beschreibt die App aus Sicht des Vertreters.
**Bei jeder Änderung an der Oberfläche hier mitpflegen.** Links nur auf die
Seiten aus der Liste „Seiten“ unten.

## Seiten

| Pfad | Name | Wofür |
|---|---|---|
| /buyer | Heute | Was heute zu tun ist: Chats, Termine, „Wie lief's?“, Anrufliste |
| /buyer/leads | Leads | Alle Leads als Liste, mit Filtern und Suche |
| /buyer/kanban | Pipeline | Alle Leads nach Phase, Karten verschieben |
| /buyer/chats | Chats | WhatsApp-Gespräche mit Leads |
| /buyer/zahlen | Zahlen | Kosten, Ertrag, Funnel, Hochrechnung |
| /buyer/konto | Konto & Rechnungen | Vertrag, Werbebudget ändern, weiteres Produkt buchen, Rechnungen, Zahlungsart, Pause/Urlaub (nur Inhaber) |
| /buyer/team | Team | Berater einladen, Leads verteilen (nur Inhaber) |
| /buyer/kalender | Mein Kalender | „Ihr Kalender“ verbinden (ein Kalender je Person), andere Quelle für freie Zeiten (ICS/Allianz), Team-Übersicht für Inhaber, Lead-Zeiten, Zeit blockieren |
| /buyer/einrichtung | Einrichtung | Fortschritt „Einrichtung x von y“, Fragebogen, Meta freigeben (prüfen/anfragen), Kalender, WhatsApp, Einwilligung im Leadformular, App aufs Handy, Provisionen, Hilfetermin |
| /buyer/bestand | Bestand | Bestandskunden und Kampagnen (Zusatzmodul; ohne Modul mit Knopf „Jetzt buchen“, sonst „Modul anfragen“) |
| /buyer/bestand/import | Kundenliste hochladen | Excel/CSV importieren |
| /buyer/bestellen | Bestellen | Leads für eine Woche bestellen (bei Pay-per-Lead) |
| /buyer/vorlagen | WhatsApp-Vorlagen | Welche Nachrichten der Assistent schickt und ob Meta sie freigegeben hat (nur lesen) |

## Einführungsvideos

- Beim ersten Öffnen von „Heute“ (neue Oberfläche) erscheint oben die Karte „Willkommen! Ihre Software in 1 Minute“
  mit einem kurzen Rundgang. Nach Ansehen oder Wegklicken (X) erscheint sie nicht mehr.
- Jederzeit wieder: **Profilmenü → „Einführung ansehen“** (/buyer/einfuehrung). Dort gibt es das Kurzvideo (ca. 1 Minute)
  und für Inhaber zusätzlich die ausführliche Einführung (ca. 3 Minuten: Kontakt öffnen, Anrufliste, selbst schreiben,
  Pipeline, Zahlen, Kalender, Team). Die Videos funktionieren auch ohne Ton (Einblendungen).

## Aufbau der App

- Oben bzw. auf dem Handy unten die Bereiche: Heute, Leads, Pipeline, Chats, Zahlen. Je nach Vertrag
  zusätzlich Einrichtung, Bestand, Bestellen. Kunden ohne WhatsApp-Assistent sehen Übersicht, Leads, Pipeline.
- Rechts oben das Profilmenü (Initialen): Benachrichtigungen, „Etwas unklar? Feedback“, Mein Kalender,
  Team und Konto & Rechnungen (nur Inhaber), Impressum, Datenschutz, Sicherheit & Datenschutz, Abmelden.
- Rollen: **Inhaber** sieht alles. **Berater** sehen nur ihre eigenen Leads, keine Zahlen, kein Konto, kein Team.
- Fast jede Aktion zeigt unten kurz eine Meldung mit „Rückgängig“.

## Heute

- Oben vier Kacheln: Chats, Termine, Wie lief's?, Anrufen. Antippen springt zum Abschnitt.
- **Braucht dich (Chats):** Leads, die geantwortet haben und auf Sie warten. „Antworten“ oder „Erledigt“.
- **Termine:** Videocall starten, Anrufen, Chat öffnen, Lead öffnen, Verschieben oder absagen (öffnet ein Fenster direkt in der App, siehe „Termine“).
- **Wie lief's?:** Nach einem Termin tragen Sie das Ergebnis ein: Angebot gesendet, Abschluss (mit Beitrag, siehe unten „Abschluss und Provision“),
  Nicht erschienen (kommt auf die Anrufliste) oder Kein Interesse. Den Rest (Phase, Wiedervorlage) erledigt die App.
- **Anrufliste:** Rückrufe und fällige Wiedervorlagen, „Überfällig“ markiert. Aktionen: Anrufen, Nicht erreicht,
  Erledigt, Später (Morgen / 3 Tage / 1 Woche / 2 Wochen), Termin buchen, Angebot gesendet, Abschluss,
  Lead öffnen, Kein Interesse.
- Ist alles abgearbeitet, steht dort „Alles erledigt“. Neue Aufgaben erscheinen von selbst.
- Solange noch kein einziger Lead da ist, erklärt „Heute“, wie es losgeht.

## Leads

- Zeitraum oben (Heute, Gestern, 7/30 Tage, Woche, Monat, Jahr, Maximum, eigener Zeitraum).
- **Suche** nach Name, Telefon oder E-Mail – sucht immer über alle Zeiträume.
- Ansichten: Alle, Rückruf nötig, Wiedervorlage fällig, Ohne nächsten Schritt, Termin.
- Hinweis „Kein nächster Schritt“: Für diesen Lead ist nichts geplant – Wiedervorlage oder Termin setzen.

## Lead öffnen (Lead-Detail)

- Oben die Phasen-Leiste: antippen, um die Phase zu ändern. Knöpfe **Gewonnen** und **Verloren**
  (bei Verloren fragt die App kurz nach dem Grund).
- Aktionen: **Anrufen**, **Chat** (WhatsApp), **Termin** (öffnet die Buchungsseite mit vorausgefüllten Daten), **Mehr**.
- Eigene Kacheln für **E-Mail** und **Wiedervorlage**. Unter „Mehr“ nur noch, was nicht als Kachel da ist:
  **Postfach verbinden** (ohne verbundenes Postfach), **Stornieren/Reklamieren** (bei gekauften Leads),
  **Daten löschen (DSGVO)** (nur Inhaber).
- Karte zum nächsten Termin (Videocall, Verschieben oder absagen im Fenster) und die Zusammenfassung des Assistenten.
- Inhaber können unter **Zuständig** den Lead einem Berater geben – der bekommt eine Push-Nachricht.
- „Angaben zum Lead“: alle Antworten aus dem Formular. Darunter Notizen (speichern sich von selbst).
- **Diktieren:** Auf dem Handy bei „Notizen“ auf „Diktieren“ tippen, dann unten in der Tastatur auf das Mikrofon und sprechen. Die Spracherkennung macht das Handy selbst, die App schickt keine Aufnahmen an Dritte.

## Pipeline

- Spalten: Neuer Lead, Nicht erreicht, (Im Gespräch), Termin vereinbart, Angebot gesendet, Abschluss,
  Kein Interesse, Disqualifiziert.
- Am Rechner Karten mit der Maus in eine andere Spalte ziehen. Auf dem Handy die Karte antippen und die Phase wählen.
- In „Abschluss“ fragt die App nach dem Beitrag (siehe „Abschluss und Provision“). Die Spalte „Abschluss“ zeigt
  die geschätzte Provision über alle Verträge, jede Karte „Sparte · Beitrag … · Provision ≈ …“ bzw. „2 Verträge · …“.
- Karten zeigen, wie lange der Lead schon in der Phase ist, und warnen bei „Kein nächster Schritt“.

## Chats (WhatsApp)

- Liste mit Filter „Alle“ / „Braucht dich“ und Suche.
- **Selbst schreiben:** Sobald Sie antworten, pausiert der Assistent in diesem Chat. Mit dem Schalter
  „Assistent“ schalten Sie ihn für diesen Chat wieder ein oder aus.
- **24-Stunden-Regel von WhatsApp:** Hat der Kunde länger als 24 Stunden nicht geschrieben, dürfen nur
  freigegebene Vorlagen raus. Dann erscheint „Nachfassen senden“ statt des Textfelds. Antwortet der Kunde,
  können Sie wieder frei schreiben.
- „Erledigt“ entfernt den Chat aus „Braucht dich“.
- Bei Terminen im Chat: Video-Link, Verschieben, Termin absagen (beides im Fenster, Absagen mit Rückfrage).
- Rechts bzw. oben: Kontakt, Angaben aus dem Formular, „Lead öffnen“.

## Der WhatsApp-Assistent

- Schreibt neue Leads in wenigen Minuten an, stellt ein paar Fragen und bucht einen Termin in freie Zeiten
  Ihres Kalenders. Die Bestätigung und eine Erinnerung etwa 24 Stunden vorher gehen per WhatsApp raus.
- Braucht ein Lead Sie (Frage, die der Assistent nicht beantworten soll), landet der Chat unter „Braucht dich“
  und Sie bekommen eine Push-Nachricht.
- **Ansprache (Sie oder Du)**: Standard ist „Sie“. Inhaber stellen das unter **Einstellungen → WhatsApp-Vorlagen**,
  **Einstellungen → E-Mail-Postfach** oder im Einrichtungs-Fragebogen um. Es gilt für den Assistenten,
  WhatsApp-Vorlagen, Termin-Nachrichten, Termin-E-Mails, die Buchungsseite und die E-Mail-Vorlagen.
- **Anrede**: Bei „Sie“ beginnen Nachrichten mit „Guten Tag Frau Schneider,“ bzw. „Guten Tag Herr Schneider,“, wenn die
  Anrede bekannt ist (Feld Anrede oder Geschlecht im Leadformular, Anrede beim Bestandskunden). Sonst mit vollem Namen
  („Guten Tag Julia Schneider,“), ohne Nachnamen mit „Guten Tag,“. Die Anrede wird nie aus dem Vornamen geraten.
  Bei „Du“: „Hallo Julia,“. Das gilt auch für den Assistenten im weiteren Chat.
- **Namen in Nachrichten**: „Ihre Buchung bei …“ und „digitaler Assistent von …“ nennen Ihren Firmennamen; „Ihr
  Videocall mit …“ nennt die Person, bei Teams den zuständigen Berater (Anzeigename unter **Team**).
- Wie sich der Assistent vorstellt und was er fragt, stellen wir für Sie ein. Änderungswünsche gern über
  „Etwas unklar? Feedback“ im Profilmenü oder im Hilfetermin.

## WhatsApp-Vorlagen

- WhatsApp erlaubt die erste Nachricht an einen Lead (und jede Nachricht nach mehr als 24 Stunden
  Funkstille) nur mit einem Text, den Meta vorher geprüft hat. Diese Vorlagen reichen wir für Ihre
  Nummer automatisch bei Meta ein, sobald WhatsApp verbunden ist. Sie müssen nichts tun.
- Ansehen: Profilmenü → **WhatsApp-Vorlagen**. Jede Vorlage steht als WhatsApp-Blase mit Beispielwerten
  (z. B. „Frau Schneider“ bzw. „Julia“) da; beim Senden setzt die App die echte Anrede, den Namen und den Termin ein.
- Status: **In Prüfung bei Meta** (meist Minuten bis wenige Stunden), **Freigegeben** oder
  **Abgelehnt**: dann kümmern wir uns und reichen einen angepassten Text neu ein.
- Erst wenn „Erste Nachricht an neue Leads“ freigegeben ist, kann der Assistent neue Leads anschreiben.
- Mit dem Bestandskunden-Modul kommen vier Kampagnen-Vorlagen dazu. Sie haben unten den Knopf
  „Keine Nachrichten mehr“: Wer ihn antippt, bekommt keine Kampagnen mehr (wie bei „STOPP“).
- **Sie- und Du-Fassungen**: Die Vorlagen des Assistenten gibt es als Du-Fassung („Hallo Julia,“) und als Sie-Fassung
  („Guten Tag Frau Schneider,“). Für Kontakte ohne bekannten Nachnamen gibt es eine eigene Sie-Fassung, die mit
  „Guten Tag,“ beginnt. Wir reichen alle Fassungen automatisch bei Meta ein, so greift ein Wechsel der Ansprache
  sofort. Bis eine neue Fassung freigegeben ist, steht „Neue Fassung in Prüfung bei Meta“ und die bisher
  freigegebene Fassung geht raus. Der Erstkontakt wird dadurch nie aufgehalten.
- Kampagnen an Bestandskunden und die Nachrichten rund um Empfehlungen sind immer gesiezt.
- Text anders formulieren? Schreiben Sie uns über „Etwas unklar? Feedback“, wir passen ihn an.

## Automatisches Nachfassen (Abfolgen)

- Wenn wir es für Sie eingeschaltet haben, fasst die App nach einem Ergebnis selbst nach:
  - **Nicht erreicht:** sofort eine WhatsApp („Wann passt es dir?“), nach 2 Tagen eine Anruf-Aufgabe auf
    „Heute“, nach 6 Tagen eine letzte, freundliche WhatsApp. Danach ist Schluss.
  - **Angebot gesendet:** nach 3 Tagen eine WhatsApp („Konntest du dir das Angebot anschauen?“),
    nach 7 Tagen eine Anruf-Aufgabe.
  - **Nicht erschienen:** sofort eine WhatsApp mit Link zum neuen Termin, nach 2 Tagen eine Anruf-Aufgabe.
- WhatsApp geht nur Mo–Sa zwischen 9 und 19 Uhr raus. Geht keine WhatsApp (z. B. keine Handynummer),
  legt die App stattdessen eine Anruf-Aufgabe an. Eine eigene, spätere Wiedervorlage bleibt bestehen.
- Das Nachfassen hört sofort auf, wenn der Lead antwortet, einen Termin bucht, „Stopp“ schreibt, auf
  Abschluss / Kein Interesse / Disqualifiziert steht, reklamiert oder gelöscht wird.
- Im Lead sehen Sie unter „Automatisches Nachfassen“, was schon passiert ist und was als Nächstes kommt.
  Mit „Automatisches Nachfassen stoppen“ beenden Sie es für diesen Lead.
- Ein- oder ausschalten für Ihr ganzes Konto: bitte kurz bei uns melden.

## Termine

- Buchung über „Termin“ beim Lead: Die Buchungsseite zeigt nur Ihre Lead-Zeiten (unter „Mein Kalender“),
  die in Ihrem Kalender noch frei sind, Telefon oder Video. Das gilt auch, wenn ein Lead selbst bucht
  oder verschiebt.
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
  Provisionen, Meta freigeben, WhatsApp verbinden, Einwilligung im Leadformular, Testlead (den macht performancegrowth).
  Offene Schritte sind anklickbar. Bei einigen Schritten gibt es ein kurzes Erklärvideo.
- **Meta freigeben:** Werbekonto-ID (Format act_…, steht im Werbeanzeigenmanager oben links bzw. in der Adresse nach „act=“; der ganze
  Link geht auch) und Facebook-Seite (Adresse facebook.com/… oder Seiten-ID) eintragen. Dann:
  - **„Anfrage von uns senden lassen“**: performancegrowth schickt die Partner-Anfrage, der Kunde bekommt in Meta eine Benachrichtigung
    und bestätigt sie nur noch. Klappt das nicht, die Schritte darunter selbst ausführen (Business-Einstellungen → Partner → Hinzufügen →
    unsere Business-ID → Werbekonto mit „Kampagnen verwalten“, Seite mit „Volle Kontrolle“).
  - **„Zugriff prüfen“**: zeigt für Werbekonto, Seite und Leads einzeln, ob alles da ist und was noch fehlt. Ist alles grün, ist der
    Schritt erledigt. Die App prüft offene Freigaben außerdem täglich selbst nach.
- **WhatsApp verbinden:** Vorher prüfen: eine Nummer, die nicht in der normalen WhatsApp-App genutzt wird (zweite SIM, Festnetz oder
  neue Nummer), SMS oder Anruf mit Code kann empfangen werden, Admin im Business Manager. Dann der geführte Ablauf.
- **Einwilligung im Leadformular:** Formulare, die performancegrowth anlegt, enthalten sie automatisch. Bei eigenen Formularen den
  angezeigten Text als Pflicht-Häkchen einfügen und „Ist in meinem Formular enthalten“ tippen.
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
    „aus Bestandskampagnen“ und „Verträge pro Kunde“. Empfehlungen und Bestandskampagnen zählen voll mit, weil sie
    aus Ihren Leads entstehen.
  - **Bestandsprovision** (Makler: **Bestandscourtage**): laufend pro Jahr aus allen Verträgen seit Start, z. B.
    „+ 140 € pro Jahr, aus 12 Verträgen, ab dem 2. Jahr“ (Vertreter bekommen Bestand ab dem 2. Vertragsjahr, Makler
    ab sofort). Darunter „in 5 Jahren: …“: so viel bringen die bisherigen Verträge in den nächsten 5 Jahren, wenn jedes
    Jahr 10 % der Verträge wegfallen. „+ … pro Jahr aus diesem Zeitraum“ zeigt, was die Abschlüsse im gewählten
    Zeitraum dazulegen. „So rechnen wir“ antippen für Satz, Storno und Annahmen.
  - **Gewinn:** Abschlussprovision (bzw. Courtage 1. Jahr) minus Lead-Kosten minus Betreuung, also ehrlich ohne
    künftige Bestandsprovision. „Aufschlüsselung“ antippen (am Rechner: mit der Maus darüber) zeigt Provision,
    Lead-Kosten, Betreuung & Software und weitere Posten. Darunter „plus Bestand: … in 5 Jahren“.
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
  3 Monate weiter abschließen (10 % Storno pro Jahr).
- Bei Teams eine Tabelle pro Person: bezahlte Leads, Erreicht, Termine, Abschlüsse, Quote, Abschlussprovision und
  Bestand pro Jahr (inklusive Empfehlungen und Cross-Selling).

## Monatsberichte

- Jeden Monat bekommen Sie von uns einen kurzen Rückblick per E-Mail: Leads (bezahlte Leads), Termine und, wenn
  eingetragen, Abschlüsse, Abschlussprovision (Makler: Courtage 1. Jahr) und neue Bestandsprovision im Vergleich zum
  Vormonat, was wir für Sie optimiert haben, unsere nächsten Schritte und 1–2 Tipps.
- Alle bisherigen Berichte finden Sie unter „Zahlen“ ganz unten im Abschnitt „Monatsberichte“.
- Je mehr Ergebnisse Sie bei Ihren Leads eintragen, desto genauer werden die Zahlen im Bericht.
- Manchmal melden wir uns statt eines Berichts lieber persönlich – dann besprechen wir den Monat im Gespräch.

## Abschluss und Provision
- Beim Abschluss fragt die App je nach Produkt nach einem Beitrag, alles freiwillig:
  - Privatschutz und TKV (Katze, Hund, Pferd): „Jahresbeitrag netto“. Vertreter: Provision ≈ 55 % davon
    (Abschlussprovision), dazu ab dem 2. Jahr 10 % Bestandsprovision pro Jahr. Makler: keine Abschlussprovision,
    sondern Bestandscourtage ≈ 22,5 % pro Jahr. Ohne Angabe rechnet die App mit einem Beitrag von 600 € (Privatschutz)
    bzw. 350 € (TKV).
  - PKV-Tarifoptimierung (nur Makler): „Monatsbeitrag netto“. Provision ≈ 10 Monatsbeiträge; ohne Angabe 2.500 €.
  - **Empfehlungen, Bestandskunden und unbekannte Produkte:** Die App fragt zuerst die **Sparte** (z. B. Katze,
    Privatschutz/Haftpflicht, Hausrat) und rechnet dann mit dem Satz dieser Sparte.
- Es ist eine Schätzung für die eigenen Zahlen, keine Abrechnung. Wer den Beitrag einträgt, bekommt genauere Werte.
- **Mehrere Verträge pro Kunde (Cross-Selling):** Im Kontakt mit Abschluss steht unter „Verträge“ der erste Abschluss.
  Mit **Weiteren Abschluss eintragen** kommen weitere Verträge dazu: Sparte (Katze, Hund, Pferd,
  Privatschutz/Haftpflicht, Unfall, Hausrat, Wohngebäude, Rechtsschutz, Kindersparplan, KFZ, Leben/BU, PKV, Sonstiges),
  Beitrag, Datum, optional Versicherer, Vertragsnummer und die Police als Dokument. Jeder Vertrag rechnet mit dem Satz
  seiner Sparte. **Bearbeiten**, **Storno** (zählt dann nicht mehr) und **Löschen** (nur weitere Verträge) gehen
  direkt in der Liste; jeder Schritt steht im Verlauf. Abschlüsse und Abschlussquote zählen weiter Kunden, nicht
  Verträge.
- **Erinnerung „Weiteres Produkt anbieten?“:** 3 Wochen nach dem ersten Abschluss erscheint die Aufgabe auf „Heute“,
  mit naheliegenden Sparten (z. B. zur Katze: Haftpflicht, Unfall). Nicht, wenn schon ein weiterer Vertrag eingetragen
  ist oder der Kontakt nicht mehr im Abschluss steht, und nur einmal je Kunde. Abschalten unter **Meine Provisionen**.
- **Bestand:** Kunden mit Abschluss kommen mit allen Verträgen automatisch in den Bestand, damit Bestandskampagnen
  wissen, was der Kunde schon hat. Importieren Sie den Kunden später selbst (gleiche Handynummer oder E-Mail), führt die
  App beide zusammen; Verträge mit gleicher Vertragsnummer gibt es nur einmal.
- Pro Kunde gibt es weiterhin nur eine Nachfrage nach Bewertung und Empfehlung, auch bei mehreren Verträgen.
- **Meine Provisionen** (Profilmenü, auch unter Konto und in der Einrichtung): „Ich arbeite als Vertreter / Makler“
  wählen und je Produkt die eigenen Sätze eintragen: Abschlussprovision in %, Bestandsprovision in % pro Jahr,
  typischer Jahresbeitrag; bei PKV die Monatsbeiträge. Oben stehen die Produkte, die Sie bei uns gebucht haben bzw.
  in Verträgen nutzen, darunter aufklappbar **Weitere Sparten (Cross-Selling)**, vorausgefüllt mit dem üblichen Satz
  für Sach. Ohne eingetragenen Beitrag rechnet die App mit dem typischen Beitrag. „Auf Standard“ setzt zurück. Nur der
  Inhaber kann speichern, Berater sehen die Sätze. Alle Zahlen rechnen danach mit den eigenen Sätzen.

## Garantien (Katzenversicherung)
- **Lead-Garantie:** Bei mindestens 20 € Werbebudget pro Tag gibt es in den ersten 30 Tagen nach Kampagnenstart mindestens
  100 Leads, sonst sind Betreuung und Software im Folgemonat kostenlos.
- **Break-even-Garantie (nur Vertreter, nicht Makler) – spätestens ab dem 4. Monat profitabel:** Liegt die Provision nach 4 Monaten
  (120 aktiven Tagen; bei Angeboten vor dem 13.11.2026, 19 Uhr: 90 Tage) unter den Kosten für Werbung und Betreuung, betreuen wir ohne
  Betreuungsgebühr weiter (auf Wunsch mit anderem Produkt), bis es sich rechnet, längstens 6 Monate. Voraussetzung:
  mindestens 20 €/Tag an den aktiven Tagen, mindestens 80 % der Termine wahrgenommen, Ergebnisse bei mindestens 80 % der Leads
  eingetragen („Wie lief's?“, Abschluss mit Beitrag) und Provisionssätze unter „Meine Provisionen“ hinterlegt.
- **Vertrags-Garantie (nur Makler, statt Break-even):** Sind nach 90 aktiven Tagen weniger als 15 Verträge abgeschlossen,
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
  aus Konto & Rechnungen, Neustart am Rückkehrtag). Eine Pause verlängert auch den Garantie-Zeitraum.
- Während der Abwesenheit steht oben ein Hinweis „Du bist bis … abwesend“ mit „ändern“ und „beenden“. Früher
  zurück: „beenden“ (oder „Ich bin wieder da“). Eine geplante Abwesenheit lässt sich im Profilmenü ändern
  oder löschen.

## Konto & Rechnungen (nur Inhaber)

- Vertrag (Paket, Monatsbetrag, weitere Verkäufer, Bestandskunden-Modul, Monatlich gesamt, Zahlweise, Laufzeit, Start),
  Rechnungen mit Status und „Jetzt bezahlen“ bei offenen Rechnungen.
- Laufzeit: ohne Laufzeit (Setup 2.490 €), 3 Monate (Setup 1.990 €) oder 12 Monate (Setup 990 €), jeweils netto;
  nach der Mindestlaufzeit monatlich kündbar.
- Laufzeit und Start wählen Sie in der Regel selbst bei der Annahme des Angebots (Angebotsseite, Abschnitt
  „Angebot annehmen“): Setup und Summen passen sich sofort an. Start frühestens 7 Tage, spätestens 90 Tage ab
  heute; ab diesem Tag läuft die Monatsgebühr, die Einrichtung dauert ca. 1–2 Wochen. Bei Sonderpreisen ist die
  Laufzeit fest vereinbart, das Startdatum bleibt wählbar.
- Zahlweise: monatlich oder jährlich im Voraus (2 Monate geschenkt: Jahresbetrag = 10 × Monatspreis inkl.
  Zusätze, nur mit 12 Monaten Laufzeit). Umstellen: bitte bei uns melden.
- Zahlungsart, Rechnungsadresse, USt-IdNr.: über das Zahlungsportal (Stripe) auf dieser Seite.
- WhatsApp-Gebühren von Meta sind im Preis enthalten, es kommt nichts dazu. Für Leads (Erstkontakt, Erinnerungen,
  Nachfassen) ohne Begrenzung; für Bestandskunden-Kampagnen bis 500 Nachrichten im Monat, mehr mit Zusatzpaketen
  (+500 für 99 €, +2.000 für 349 €, netto, gültig 3 Monate, siehe „Bestand“). Pakete stehen als eigener Posten auf der Rechnung.
- Bestandskunden-Modul nicht gebucht: Karte „Bestandskunden-Modul“ mit Knopf „Jetzt buchen – 149 € netto im Monat“
  (Bestätigung mit Häkchen, danach sofort freigeschaltet). Gebucht: „Modul kündigen (zum Ende des
  Abrechnungszeitraums)“; bis dahin nutzbar, die Kündigung lässt sich bis dahin mit „Kündigung zurücknehmen“
  aufheben.
- **Werbebudget ändern** (Karte „Werbebudget“, auch über Wachstum → „Budget ändern“ und in der Einrichtung beim
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
- **Pause/Urlaub** selbst eintragen (Start, Ende, Grund): Anzeigen stoppen, reduzierte Gebühr; Pause jederzeit beenden.
  Bei jährlicher Vorauszahlung pausieren nur die Anzeigen, eine Gutschrift gibt es nicht.
- Kündigung oder Vertragsfragen: bitte direkt bei uns melden.

## Weiteres Produkt buchen (nur Inhaber)
- **Wo:** Konto & Rechnungen → Karte „Produkte“ (auch über Wachstum → „Weitere Sparte dazubuchen“). Dort stehen die gebuchten
  Produkte mit Tagesbudget und Status („Läuft“, „In Einrichtung“, „Anfrage offen“) und darunter die Sparten, die man dazubuchen kann
  (z. B. Katzenversicherung; weitere wie Hund, Privatschutz, Unfall, Zahnzusatz oder Krankenhauszusatz, sobald wir sie freigeben).
  „Bewährt“ heißt: mit Erfahrungswert, angezeigt als Spanne, z. B. „ca. 20–25 € pro Lead · bei 30 €/Tag ca. 36 bis 45 Leads
  im Monat“. „Neu“ heißt: Neues Produkt, wir sammeln gerade Erfahrungswerte. Den Leadpreis sehen Sie nach den ersten Wochen
  in Ihren Zahlen.
- **Buchen:** „Produkt buchen“ → Tagesbudget wählen (Plus/Minus oder Regler), Start „so bald wie möglich“ oder ab Datum, Häkchen
  setzen, „Jetzt kostenpflichtig buchen“. Die Vorschau zeigt: einmalig 990 € Einrichtung, monatlich 350 € mehr (netto, ab Start), das
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

- Wo: Profilmenü → „Kollegen empfehlen“ oder Konto & Rechnungen → Karte „Kollegen empfehlen“. Ganz oben stehen
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
- Ihr Dankeschön: derzeit **3 Monate das Bestandskunden-Modul gratis**. Haben Sie das Modul noch nicht, schalten
  wir es frei; die 3 Monatsbeiträge schreiben wir Ihnen gut (verrechnet mit Ihren nächsten Rechnungen). 2 Wochen
  vor Ende der Gratiszeit bekommen Sie einen Hinweis; danach läuft das Modul zum normalen Preis weiter, abbestellen
  können Sie es jederzeit unter Konto & Rechnungen. Haben Sie das Modul schon, schreiben wir Ihnen 3 Monatsbeiträge
  gut. Jede weitere Empfehlung zählt zusätzlich (je 3 Monate).
- Das Dankeschön gilt, sobald der Kollege sein Angebot angenommen und die erste Zahlung geleistet hat. Sie bekommen
  dazu eine Push-Nachricht und eine E-Mail. Eine Empfehlung an sich selbst oder die eigene Agentur zählt nicht; ist
  der Kollege schon Kunde, gibt es keine Prämie.
- Stand Ihrer Empfehlungen: Eingegangen → Termin → Kunde geworden → Prämie gutgeschrieben.
- Die Prämie ist eine Gutschrift zwischen uns und Ihnen als Geschäftskunde, keine Provision an
  Versicherungsnehmer (Provisionsabgabeverbot nicht berührt).

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

- Kundenliste aus dem Versicherer-System als Excel oder CSV hochladen, Spalten zuordnen, Einwilligung bestätigen.
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
- Kampagne: Thema, Tageslimit, Vorschau, Start/Pause. Versand per WhatsApp Mo–Sa 9–19 Uhr.
  Antworten werden zum Lead, wer „Stopp“ schreibt, bekommt nichts mehr.

## Empfehlungen & Bewertungen (Zusatzmodul)

- **Was es macht:** Einige Tage nach jedem Abschluss (Standard 7) bekommt Ihr Kunde per WhatsApp in Ihrem Namen
  eine Nachricht: erst der direkte Draht zu Ihnen („Wenn etwas nicht gepasst hat, antworten Sie mir direkt hier“),
  dann die Bitte um eine Google-Bewertung mit Link. **Alle bekommen dieselbe Nachricht** – es gibt keine Vorab-Frage,
  die darüber entscheidet, wer den Google-Link bekommt (das verbieten die Google-Richtlinien).
- **Antworten:** Die KI liest die Antwort. Kritik oder Beschwerde → sofort Push und die Aufgabe „Kunde unzufrieden –
  bitte heute anrufen“ mit Zitat in „Heute“; die Bitte um Empfehlung geht an diesen Kunden nicht raus. Lob → Dank
  mit dem persönlichen Empfehlungslink (abschaltbar unter „Der richtige Moment“; ohne zweiten Google-Link). Rückfragen landen als „Braucht dich“ im Chat. Geklärte Kritik markieren Sie in
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
- **Dankeschön für Empfehlende (optional, standardmäßig aus):** Gutschein oder Spende, vorher angekündigt auf der
  Seite Ihres Kunden. Fällig nach einem stattgefundenen Gespräch oder 30 Tage nach dem Abschluss; die App erinnert
  Sie, Sie übergeben selbst und haken unter „Offene Dankeschöns“ ab. Es geht nie an die empfohlene Person und nicht
  bei Selbstempfehlung. Bis 15 € je Vertrag und Jahr ist es unkritisch; darüber bitte vorher mit Ihrem Versicherer
  oder Ihrer Rechtsberatung klären (§ 48b VAG). Die App gibt dazu keine Rechtsberatung.
- **Empfehlungslink senden:** In jedem Kontakt mit Abschluss (und bei Bestandskunden) gibt es den Knopf
  „Empfehlungslink senden“ – jederzeit nutzbar, z. B. nach einem guten Gespräch. Ohne WhatsApp-Verbindung erscheint
  der Text zum Kopieren oder Teilen. In der Kundenliste unter „Bestand“ öffnet der Knopf ein kleines Fenster:
  „Warum melden Sie sich?“ mit den Anlässen als Karten (ohne besonderen Anlass, Schaden geregelt, Beitrag gespart,
  nach dem Jahresgespräch). Der Anlass bestimmt nur den Einstieg der Nachricht; darunter steht die Vorschau des Textes,
  dann „Senden“. Mit Bestandskunden-Modul gibt es zusätzlich die Kampagne „Jährliche
  Empfehlungsbitte“ (persönlicher Link je Kunde, höchstens einmal im Jahr).
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
  Bestandskunden-Modul (149 €, siehe „Bestand“) und weitere Verkäufer (3 aktive Verkäufer inklusive, jeder weitere 49 €,
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

**Video:** Ein Video (ca. 2:40 Minuten) macht den ganzen Ablauf einmal vor. Es steht oben auf der Seite
„Ausführliche Anleitung“ (/buyer/hilfe/whatsapp), aufklappbar direkt über dem Knopf „Jetzt WhatsApp verbinden“
in der Einrichtung und für Inhaber unter Profilmenü → **Einführung ansehen**.

**Welche Nummer?** (drei Wege, keine Wertung)
- **Nummer aus der WhatsApp Business App** (häufigster Fall): Leads und Kunden kennen die Nummer schon.
  Der Vermittler schreibt weiter in der App, der Assistent übernimmt neue Leads über dieselbe Nummer.
  Nachrichten aus der App erscheinen auch unter „Chats“, der Assistent hält sich in dem Gespräch dann
  zurück. Im Fenster von Meta „Ja, diese Nummer ist mit der WhatsApp Business App verbunden“ wählen,
  danach in der App den QR-Code scannen. Voraussetzungen: aktuelle WhatsApp Business App, die Nummer
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
Werbekonto liegt), das Telefon zur Nummer (Code) bzw. das Handy mit der WhatsApp Business App (QR-Code),
einen Computer mit erlaubten Pop-up-Fenstern, etwa 10 Minuten.

**Ablauf:**
1. Einrichtung → Nummer wählen → „Jetzt WhatsApp verbinden“.
2. 360dialog (unser WhatsApp-Anbieter): Konto mit E-Mail und Passwort anlegen. Kostenlos, die Nummer
   bleibt Eigentum des Kunden.
3. Fenster von Meta: mit Facebook anmelden, „Weiter“.
4. Unternehmensportfolio auswählen oder neu anlegen. Die Auswahl lässt sich später nicht ändern.
5. WhatsApp-Profil: Anzeigename und Kategorie. Der Name muss zur Firma passen, z. B. „Max Mustermann
   Versicherungsmakler“.
6. Nummer bestätigen: Code per SMS oder Anruf eingeben. (Bei WhatsApp Business App stattdessen QR-Code
   in der App scannen.)
7. Automatisch zurück in die App: „Verbunden: +49 …“. Steht dort „wird eingerichtet“, ist nichts zu tun.

**Wenn es hakt:**
- Kein Fenster von Meta: Pop-up-Blocker. Pop-ups für die Seite erlauben und erneut verbinden.
- Unternehmensportfolio fehlt in der Liste: keine Admin-Rechte dort. Admin-Rechte geben lassen oder ein
  neues Portfolio anlegen.
- „Nummer wird bereits verwendet“: Die Nummer läuft noch in einer WhatsApp-App. Den passenden Weg
  wählen (Business App) oder eine andere Nummer nehmen.
- Anzeigename abgelehnt: an den Firmennamen (wie im Impressum) anpassen.
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
  wie PG-AB12CD). Nur noch abschicken. „Per E-Mail“ öffnet eine vorbereitete E-Mail.
- Wir antworten werktags in der Regel innerhalb weniger Stunden. Die Referenz hilft uns, Ihr Anliegen
  schnell zuzuordnen.
- Bitte keine Daten Ihrer Kunden (Namen, Telefonnummern) in die Nachricht schreiben.

## Kontakt zu uns

- In der KI-Hilfe „Mit Mensch sprechen“ (WhatsApp oder E-Mail an unser Team).
- „Etwas unklar? Feedback“ im Profilmenü – wir melden uns.
- 15-Minuten-Hilfetermin (Video) in der Einrichtung, solange sie offen ist.
- Telefon: +49 151 52418846.

## E-Mails aus der App (eigenes Postfach)

- **Einstellungen → E-Mail-Postfach**: Postfach verbinden – Microsoft (Outlook/365) per Anmeldung oder jeder andere
  Anbieter per SMTP (z. B. IONOS, Strato, T-Online, GMX; Gmail mit App-Passwort: smtp.gmail.com, Port 587).
  „Test senden“ schickt eine Probe-Mail an die eigene Adresse.
- **Signatur**: einmal hinterlegen (Name, Agentur, Telefon, Adresse). Sie steht automatisch unter jeder E-Mail an
  Leads – mit und ohne Vorlage. In einer Vorlage kann man die Stelle mit {signatur} selbst festlegen.
- **Vorlagen** mit Platzhaltern {anrede}, {vorname}, {nachname}, {name}, {produkt}, {terminlink}, {meinname}, {signatur}.
  {anrede} richtet sich nach der Ansprache: „Guten Tag Frau Beispiel“ (Sie mit bekannter Anrede; sonst „Guten Tag Anna
  Beispiel“, ohne Nachname „Guten Tag“) oder „Hallo Anna“ (Du).
  Die Standardvorlagen gibt es in beiden Fassungen; beim Wechsel der Ansprache ziehen unveränderte Standardvorlagen mit,
  eigene Texte bleiben.
- **{terminlink}**: persönlicher Buchungslink für genau diesen Kontakt (Zeiten aus Ihrem Kalender, Buchung landet
  am Kontakt). Steht schon ein Termin an oder ist kein Kalender verbunden, fällt der Satz mit dem Link weg.
  In „Nicht erreicht“ und „Nachfassen Angebot“ ist er schon drin.
- Beim Kontakt: Kachel **E-Mail**. Vorlage wählen, anpassen, Dokumente (z. B. das Angebot) anhängen, senden.
  Die E-Mail geht von der eigenen Adresse raus und steht im Verlauf.
- **Erinnern, falls kein Termin gebucht wird**: Steht der Terminlink in der Mail, legt die App nach dem Senden eine
  Wiedervorlage „Kein Termin gebucht: nachfassen“ an (morgen, in 2 Werktagen oder in 1 Woche). Bucht der Kontakt
  vorher, verschwindet sie. Gibt es schon eine Wiedervorlage oder läuft eine Nachfass-Abfolge, kommt keine zweite dazu.
- Firmen-Postfächer mancher Versicherer lassen sich oft nicht verbinden; dann das eigene Mailprogramm nutzen.
