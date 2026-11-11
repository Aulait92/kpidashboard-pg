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
| /buyer/kalender | Mein Kalender | Eigenen Kalender verbinden (bei Team-Zugängen) |
| /buyer/einrichtung | Einrichtung | Fragebogen, Meta-Zugriff, Kalender, App aufs Handy, Hilfetermin |
| /buyer/bestand | Bestand | Bestandskunden und Kampagnen (Zusatzmodul; ohne Modul mit Knopf „Modul anfragen“) |
| /buyer/bestand/import | Kundenliste hochladen | Excel/CSV importieren |
| /buyer/bestellen | Bestellen | Leads für eine Woche bestellen (bei Pay-per-Lead) |

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

- Buchung über „Termin“ beim Lead: Die Buchungsseite zeigt echte freie Zeiten aus Ihrem Kalender,
  Telefon oder Video.
- Verschieben/Absagen: auf „Heute“ oder beim Lead an der Termin-Karte. Der Kunde bekommt die Änderung automatisch.
- Leads können über ihren Link selbst verschieben oder absagen.
- Damit Termine nur in freie Zeiten fallen: Kalender verbinden (Google oder Outlook/Microsoft 365) in der
  Einrichtung bzw. unter „Mein Kalender“. Die App liest nur, wann Sie belegt sind.

## Benachrichtigungen (Push)

- Einschalten: oben im Kundenbereich „Benachrichtigungen einschalten“ oder im Profilmenü
  „Benachrichtigungen“. Einmal pro Gerät. Im Profilmenü gibt es „Test senden“.
- **iPhone:** Nur möglich, wenn die App auf dem Home-Bildschirm liegt: in **Safari** öffnen (nicht aus
  WhatsApp heraus), unten auf „Teilen“, dann „Zum Home-Bildschirm“, danach die App über das neue Symbol
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
  sind Betreuung und Software kostenlos, bis 15 erreicht sind, längstens 6 Monate. Voraussetzung: mindestens 20 €/Tag
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
- Zahlweise: monatlich oder jährlich im Voraus (2 Monate geschenkt: Jahresbetrag = 10 × Monatspreis inkl.
  Zusätze, nur mit 12 Monaten Laufzeit). Umstellen: bitte bei uns melden.
- Zahlungsart, Rechnungsadresse, USt-IdNr.: über das Zahlungsportal (Stripe) auf dieser Seite.
- WhatsApp-Gebühren von Meta sind im Preis enthalten, es kommt nichts dazu. Für Leads (Erstkontakt, Erinnerungen,
  Nachfassen) ohne Begrenzung; für Bestandskunden-Kampagnen bis 500 Nachrichten im Monat.
- Bestandskunden-Modul nicht gebucht: Karte „Bestandskunden-Modul“ mit Knopf „Modul anfragen“, wir melden uns.
- Schalter „Neue Leads per E-Mail“.
- **Pause/Urlaub** selbst eintragen (Start, Ende, Grund): Anzeigen stoppen, reduzierte Gebühr; Pause jederzeit beenden.
  Bei jährlicher Vorauszahlung pausieren nur die Anzeigen, eine Gutschrift gibt es nicht.
- Kündigung oder Vertragsfragen: bitte direkt bei uns melden.

## Bestand (Bestandskunden, Zusatzmodul)

- Zusatzmodul für 149 € netto im Monat, inklusive WhatsApp-Gebühren für bis zu 500 Kampagnen-Nachrichten im Monat.
  **Für Makler inklusive** (0 €, im Paket Betreuung + Software); das Kontingent gilt genauso.
  Ohne Modul zeigt „Bestand“ eine Beschreibung und den Knopf „Modul anfragen“ (Anfrage geht an uns).
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

## Datenschutz

- Daten liegen auf Servern in der EU. Löschen eines Leads: Lead öffnen → „Mehr“ → „Daten löschen (DSGVO)“
  (nur Inhaber, unwiderruflich).
- Die KI-Hilfe kennt nur diese Anleitung, keine Kundendaten. Bitte keine Kundendaten in die Hilfe eingeben.

## Kontakt zu uns

- „Etwas unklar? Feedback“ im Profilmenü – wir melden uns.
- 15-Minuten-Hilfetermin (Video) in der Einrichtung, solange sie offen ist.
- Telefon: +49 151 52418846.
