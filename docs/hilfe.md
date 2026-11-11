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
| /buyer/konto | Konto & Rechnungen | Vertrag, Rechnungen, Zahlungsart, Pause/Urlaub (nur Inhaber) |
| /buyer/team | Team | Berater einladen, Leads verteilen (nur Inhaber) |
| /buyer/kalender | Mein Kalender | Eigenen Kalender verbinden (bei Team-Zugängen), freie Zeiten erkennen, Lead-Zeiten, Zeit blockieren |
| /buyer/einrichtung | Einrichtung | Fragebogen, Meta-Zugriff, Kalender, App aufs Handy, Hilfetermin |
| /buyer/bestand | Bestand | Bestandskunden und Kampagnen (Zusatzmodul; ohne Modul mit Knopf „Jetzt buchen“, sonst „Modul anfragen“) |
| /buyer/bestand/import | Kundenliste hochladen | Excel/CSV importieren |
| /buyer/bestellen | Bestellen | Leads für eine Woche bestellen (bei Pay-per-Lead) |
| /buyer/vorlagen | WhatsApp-Vorlagen | Welche Nachrichten der Assistent schickt und ob Meta sie freigegeben hat (nur lesen) |

## Aufbau der App

- Oben bzw. auf dem Handy unten die Bereiche: Heute, Leads, Pipeline, Chats, Zahlen. Je nach Vertrag
  zusätzlich Einrichtung, Bestand, Bestellen. Kunden ohne WhatsApp-Assistent sehen Übersicht, Leads, Pipeline.
- Rechts oben das Profilmenü (Initialen): Benachrichtigungen, „Etwas unklar? Feedback“, Mein Kalender,
  Team und Konto & Rechnungen (nur Inhaber), Impressum, Datenschutz, Abmelden.
- Rollen: **Inhaber** sieht alles. **Berater** sehen nur ihre eigenen Leads, keine Zahlen, kein Konto, kein Team.
- Fast jede Aktion zeigt unten kurz eine Meldung mit „Rückgängig“.

## Heute

- Oben vier Kacheln: Chats, Termine, Wie lief's?, Anrufen. Antippen springt zum Abschnitt.
- **Braucht dich (Chats):** Leads, die geantwortet haben und auf Sie warten. „Antworten“ oder „Erledigt“.
- **Termine:** Videocall starten, Anrufen, Chat öffnen, Lead öffnen, Verschieben/absagen.
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
- Unter „Mehr“: **Wiedervorlage** setzen oder ändern (Schnellwahl oder Datum, mit Notiz), **E-Mail schreiben**
  (öffnet Ihr Mailprogramm), **Stornieren/Reklamieren** (bei gekauften Leads), **Daten löschen (DSGVO)** (nur Inhaber).
- Karte zum nächsten Termin (Videocall, Verschieben) und die Zusammenfassung des Assistenten.
- Inhaber können unter **Zuständig** den Lead einem Berater geben – der bekommt eine Push-Nachricht.
- „Angaben zum Lead“: alle Antworten aus dem Formular. Darunter Notizen (speichern sich von selbst).
- **Diktieren:** Auf dem Handy bei „Notizen“ auf „Diktieren“ tippen, dann unten in der Tastatur auf das Mikrofon und sprechen. Die Spracherkennung macht das Handy selbst, die App schickt keine Aufnahmen an Dritte.

## Pipeline

- Spalten: Neuer Lead, Nicht erreicht, (Im Gespräch), Termin vereinbart, Angebot gesendet, Abschluss,
  Kein Interesse, Disqualifiziert.
- Am Rechner Karten mit der Maus in eine andere Spalte ziehen. Auf dem Handy die Karte antippen und die Phase wählen.
- In „Abschluss“ fragt die App nach dem Beitrag (siehe „Abschluss und Provision“). Die Spalte „Abschluss“ zeigt
  die geschätzte Provision, jede Karte „Beitrag … · Provision ≈ …“.
- Karten zeigen, wie lange der Lead schon in der Phase ist, und warnen bei „Kein nächster Schritt“.

## Chats (WhatsApp)

- Liste mit Filter „Alle“ / „Braucht dich“ und Suche.
- **Selbst schreiben:** Sobald Sie antworten, pausiert der Assistent in diesem Chat. Mit dem Schalter
  „Assistent“ schalten Sie ihn für diesen Chat wieder ein oder aus.
- **24-Stunden-Regel von WhatsApp:** Hat der Kunde länger als 24 Stunden nicht geschrieben, dürfen nur
  freigegebene Vorlagen raus. Dann erscheint „Nachfassen senden“ statt des Textfelds. Antwortet der Kunde,
  können Sie wieder frei schreiben.
- „Erledigt“ entfernt den Chat aus „Braucht dich“.
- Bei Terminen im Chat: Video-Link, Verschieben, Absagen.
- Rechts bzw. oben: Kontakt, Angaben aus dem Formular, „Lead öffnen“.

## Der WhatsApp-Assistent

- Schreibt neue Leads in wenigen Minuten an, stellt ein paar Fragen und bucht einen Termin in freie Zeiten
  Ihres Kalenders. Die Bestätigung und eine Erinnerung etwa 24 Stunden vorher gehen per WhatsApp raus.
- Braucht ein Lead Sie (Frage, die der Assistent nicht beantworten soll), landet der Chat unter „Braucht dich“
  und Sie bekommen eine Push-Nachricht.
- Wie sich der Assistent vorstellt und was er fragt, stellen wir für Sie ein. Änderungswünsche gern über
  „Etwas unklar? Feedback“ im Profilmenü oder im Hilfetermin.

## WhatsApp-Vorlagen

- WhatsApp erlaubt die erste Nachricht an einen Lead (und jede Nachricht nach mehr als 24 Stunden
  Funkstille) nur mit einem Text, den Meta vorher geprüft hat. Diese Vorlagen reichen wir für Ihre
  Nummer automatisch bei Meta ein, sobald WhatsApp verbunden ist. Sie müssen nichts tun.
- Ansehen: Profilmenü → **WhatsApp-Vorlagen**. Jede Vorlage steht als WhatsApp-Blase mit Beispielwerten
  (z. B. „Julia“) da; beim Senden setzt die App den echten Namen und Termin ein.
- Status: **In Prüfung bei Meta** (meist Minuten bis wenige Stunden), **Freigegeben** oder
  **Abgelehnt**: dann kümmern wir uns und reichen einen angepassten Text neu ein.
- Erst wenn „Erste Nachricht an neue Leads“ freigegeben ist, kann der Assistent neue Leads anschreiben.
- Mit dem Bestandskunden-Modul kommen vier Kampagnen-Vorlagen dazu. Sie haben unten den Knopf
  „Keine Nachrichten mehr“: Wer ihn antippt, bekommt keine Kampagnen mehr (wie bei „STOPP“).
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
- Verschieben/Absagen: auf „Heute“ oder beim Lead an der Termin-Karte. Der Kunde bekommt die Änderung automatisch.
- Leads können über ihren Link selbst verschieben oder absagen.
- Damit Termine nur in freie Zeiten fallen: in der Einrichtung bzw. unter „Mein Kalender“ bei „Wie sollen wir
  Ihre freien Zeiten erkennen?“ einen Weg wählen. Die App liest nur, wann Sie belegt bzw. frei sind:
  1. **Google- oder Microsoft-Kalender** verbinden.
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
- **Zeit blockieren:** unter „Mein Kalender“ Datum und von–bis eintragen. In dieser Zeit werden keine Termine
  angeboten. Löschen jederzeit in der Liste.
- Gebuchte Termine kommen weiter als Kalendereinladung an Ihre Adresse für Termineinladungen (z. B. Allianz-Mail).

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

## Zahlen

- Zeitraum wählen. Funnel: Leads → Erreicht → Termin → Abschluss.
- Kosten & Ertrag: Lead-Kosten, Provision (geschätzt), Gewinn (Provision minus Lead-Kosten), Kosten pro Abschluss
  bzw. pro Termin, mit Vergleich zum Vorzeitraum. Auch die Hochrechnung und die Team-Tabelle zeigen die
  geschätzte Provision.

## Abschluss und Provision
- Beim Abschluss fragt die App je nach Produkt nach einem Beitrag, alles freiwillig:
  - Privatschutz und TKV: „Jahresbeitrag netto“. Vertreter: Provision ≈ 55 % davon (Abschlussprovision).
    Makler: keine Abschlussprovision, sondern Bestandsprovision ≈ 22,5 % pro Jahr. Ohne Angabe rechnet die App
    mit einem Beitrag von 600 € (Privatschutz) bzw. 350 € (TKV).
  - PKV-Tarifoptimierung (nur Makler): „Monatsbeitrag netto“. Provision ≈ 10 Monatsbeiträge; ohne Angabe 2.500 €.
  - Andere Produkte: „Wert des Abschlusses“, zählt direkt als Provision.
- „Provision (geschätzt)“ enthält bei Bestandsprovision den Betrag des 1. Jahres.
- Es ist eine Schätzung für die eigenen Zahlen, keine Abrechnung. Wer den Beitrag einträgt, bekommt genauere Werte.
- **Meine Provisionen** (Profilmenü, auch unter Konto und in der Einrichtung): „Ich arbeite als Vertreter / Makler“
  wählen und je Produkt die eigenen Sätze eintragen: Abschlussprovision in %, Bestandsprovision in % pro Jahr;
  bei PKV die Monatsbeiträge. Es erscheinen nur die Produkte, die man bei uns gebucht hat (sonst ein Hinweis).
  Ohne eingetragenen Beitrag rechnet die App mit einem Durchschnittsbeitrag. Vorausgefüllt mit üblichen Werten, „Auf Standard“ setzt
  zurück. Nur der Inhaber kann speichern, Berater sehen die Sätze. Alle Zahlen rechnen danach mit den eigenen Sätzen.
- „Hochrechnung für diesen Monat“ zum Aufklappen. Bei Teams eine Tabelle pro Person.

## Garantien (Katzenversicherung)
- **Lead-Garantie:** Bei mindestens 20 € Werbebudget pro Tag gibt es in den ersten 30 Tagen nach Kampagnenstart mindestens
  100 Leads, sonst sind Betreuung und Software im Folgemonat kostenlos.
- **Break-even-Garantie (nur Vertreter, nicht Makler):** Liegt die Provision nach 90 Tagen unter den Kosten für Werbung und Betreuung, betreuen wir ohne
  Betreuungsgebühr weiter (auf Wunsch mit anderem Produkt), bis es sich rechnet, längstens 6 Monate. Voraussetzung:
  mindestens 20 €/Tag an den aktiven Tagen, mindestens 80 % der Termine wahrgenommen, Ergebnisse bei mindestens 80 % der Leads
  eingetragen („Wie lief's?“, Abschluss mit Beitrag) und Provisionssätze unter „Meine Provisionen“ hinterlegt.
- **Vertrags-Garantie (nur Makler, statt Break-even):** Sind nach 90 aktiven Tagen weniger als 15 Verträge abgeschlossen,
  sind Betreuung und Software kostenlos (auf Wunsch mit anderem Produkt, ohne Setupgebühr), bis 15 erreicht sind,
  längstens 6 Monate. Voraussetzung: mindestens 20 €/Tag
  an den aktiven Tagen, mindestens 80 % der Termine wahrgenommen und Ergebnisse bei mindestens 80 % der Leads eingetragen.
  Als Vertrag zählt jeder Lead mit „Abschluss“. Wir können im Garantiefall eine Courtage-Abrechnung als Nachweis anfordern.
- **Wo sehe ich meinen Stand?** Unter „Zahlen“ (ganz unten, Karte „Deine Garantie“, nur für den Inhaber): Tag x von 30
  bzw. 90, Leads, Verträge bzw. Provision und Kosten seit Kampagnenstart und welche Voraussetzungen erfüllt sind (Haken) oder noch
  fehlen. Fehlen Provisionssätze, führt ein Link direkt zu „Meine Provisionen“.
- Die Tage zählen ab der ersten Auslieferung der Anzeigen. **Pausen (Urlaub, Krankheit) verlängern den Zeitraum** um die
  Pausentage, die Garantie verfällt dadurch nicht. Eine offene Rechnung zum Prüfzeitpunkt verhindert die Gutschrift, bis
  sie bezahlt ist.
- Die App prüft täglich automatisch; gutgeschrieben wird nach kurzer Prüfung durch uns auf der nächsten Rechnung.
- Genaue Bedingungen stehen in den AGB (Abschnitt „Garantien“). Fragen dazu: bei performancegrowth melden.

## Team (nur Inhaber)

- „Team“ im Profilmenü: Berater mit Name und E-Mail einladen (Link per Mail), höchstens 10 Zugänge.
- Im Paket mit Software sind 3 Logins inklusive (Inhaber + 2 Berater). Jeder weitere Login kostet 49 € netto im
  Monat, anteilig ab dem Tag der Einladung bis zum Entfernen. Der Einladen-Dialog zeigt den Aufpreis vorher an.
  Ab 10 Logins gibt es ein individuelles Angebot (bitte bei uns melden).
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

- Vertrag (Paket, Monatsbetrag, weitere Logins, Bestandskunden-Modul, Monatlich gesamt, Zahlweise, Laufzeit, Start),
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
  Nachfassen) ohne Begrenzung; für Bestandskunden-Kampagnen bis 500 Nachrichten im Monat.
- Bestandskunden-Modul nicht gebucht: Karte „Bestandskunden-Modul“ mit Knopf „Jetzt buchen – 149 € netto im Monat“
  (Bestätigung mit Häkchen, danach sofort freigeschaltet). Gebucht: „Modul kündigen (zum Ende des
  Abrechnungszeitraums)“; bis dahin nutzbar, die Kündigung lässt sich bis dahin mit „Kündigung zurücknehmen“
  aufheben.
- Schalter „Neue Leads per E-Mail“.
- **Pause/Urlaub** selbst eintragen (Start, Ende, Grund): Anzeigen stoppen, reduzierte Gebühr; Pause jederzeit beenden.
  Bei jährlicher Vorauszahlung pausieren nur die Anzeigen, eine Gutschrift gibt es nicht.
- Kündigung oder Vertragsfragen: bitte direkt bei uns melden.

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
- Kontingent: Auf der Seite steht „Kontingent diesen Monat: X von 500“. Ist es erreicht, startet keine neue
  Kampagne („Monatskontingent erreicht – mehr auf Anfrage“), laufende Kampagnen machen im nächsten Monat weiter.
  Mehr Nachrichten: bitte bei uns melden, wir erhöhen das Kontingent.

- Kundenliste aus dem Versicherer-System als Excel oder CSV hochladen, Spalten zuordnen, Einwilligung bestätigen.
  Gesundheitsdaten werden nie übernommen.
- Die App schlägt Chancen vor: Lücke schließen (z. B. KFZ ohne Hausrat), Jahresgespräch, Geburtstag in 30 Tagen,
  Ablauf/Wechsel in 60 Tagen.
- Kampagne: Thema, Tageslimit, Vorschau, Start/Pause. Versand per WhatsApp Mo–Sa 9–19 Uhr.
  Antworten werden zum Lead, wer „Stopp“ schreibt, bekommt nichts mehr.

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

## Kontakt zu uns

- „Etwas unklar? Feedback“ im Profilmenü – wir melden uns.
- 15-Minuten-Hilfetermin (Video) in der Einrichtung, solange sie offen ist.
- Telefon: +49 151 52418846.
