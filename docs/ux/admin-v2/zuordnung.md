# Admin v2: Zuordnung aller Funktionen

Quelle: `docs/ux/admin-neu/funktionsinventar.json` (409 Einträge; das Inventar hat keine eigenen IDs, daher fortlaufend F001 bis F409 in der Reihenfolge der Datei). Demo: `docs/ux/admin-v2/demo.html`, Seite „Was wo ist“.

Struktur v2: **Mein Tag** › **Verkaufen** (Überblick, Kontakte, Angebote, Marketing) › **Betreuen** (Kunden, Chats, Monatsberichte, Nutzung & News) › **Liefern** (Überblick, Leads, Bezüge, Werbekonten) › **Geld** (Überblick, Rechnungen, Kosten, Auswertung) › unten **Werkzeuge**, **Einstellungen**, **Was wo ist**.

Einstufung: **vorne** = ohne Klick sichtbar auf Mein Tag oder oben auf einer Rollen-Startseite. **in Bereich** = in einer Rolle (Reiter, Drawer, Mehr-Menü) oder in Einstellungen. **Werkzeuge** = Technik und Einrichtung. **entfernen vorgeschlagen** = Dublette oder überholt.

## Zusammenfassung

| Einstufung | Anzahl |
|---|---:|
| vorne | 53 |
| in Bereich | 283 |
| Werkzeuge | 64 |
| entfernen vorgeschlagen | 9 |
| **gesamt** | **409** |

## Entfernen vorgeschlagen

- **F100** Später-Follow-up neu schreiben (ohne Oberfläche): Dublette zu F098 (Texte neu schreiben), nur Schnittstelle
- **F135** Daten aus altem Cold CRM übernehmen: einmalige Übernahme aus altem Cold CRM ist abgeschlossen
- **F141** Weiterleitung auf Kunden-Pipeline (keine eigene Funktion): reine Weiterleitung ohne Funktion
- **F144** Unterreiter Übersicht, Pipeline, Leads, Pay-per-Lead, Optimierung, Monatsberichte: Unterreiter ersetzt durch Rollen Betreuen, Liefern, Geld
- **F200** Erstanschreiben-Einstellungen (alt, ohne Oberfläche): alte Erstanschreiben-Einstellung, ersetzt durch F191
- **F261** Anzeige Airtable-Abgleich an/aus: Airtable-Abgleich nach Abschaltung überholt
- **F267** Bezüge aus Airtable übernehmen: Airtable-Import nach Abschaltung überholt
- **F340** Link Leads & Werbung (Dashboard /): reiner Link, ersetzt durch Navigation Liefern
- **F409** Diagnose Airtable-Felder (nur Technik, keine Oberfläche): Airtable-Diagnose nach Abschaltung überholt

## Alle Funktionen

| id | Funktion | bisher | neuer Ort in v2 | Einstufung | Grund |
|---|---|---|---|---|---|
| F001 | Seitenleiste mit Bereichen Heute, Vertrieb, Kunden, Chats, Zahlen | Rahmen (alle Admin-Seiten) | Navigation › Mein Tag, 4 Rollen, Werkzeuge, Einstellungen | vorne | Navigation nach Rollen statt Funktionen |
| F002 | Zähler-Badge an Heute (offene Punkte) | Rahmen (alle Admin-Seiten) | Navigation › Mein Tag › Zähler | vorne | offene Punkte auf einen Blick |
| F003 | Zähler-Badge an Chats (offene WhatsApp-Gespräche) | Rahmen (alle Admin-Seiten) | Navigation › Betreuen › Zähler | vorne | offene Chats sichtbar |
| F004 | Handy: Leiste unten mit allen Bereichen | Rahmen (alle Admin-Seiten) | Handy-Leiste › Mein Tag, 4 Rollen, Mehr | vorne | 5 Einträge plus Mehr |
| F005 | Logo führt zu Heute | Rahmen (alle Admin-Seiten) | Navigation › Logo führt zu Mein Tag | vorne | täglich gebraucht, sofort sichtbar |
| F006 | Befehlspalette mit Seiten-Sprüngen (35 Ziele) | Rahmen (alle Admin-Seiten) | Kopfzeile › Suche ⌘K › Seiten und Werkzeuge | vorne | findet jetzt auch Werkzeuge und Funktionen |
| F007 | Suche nach Kunden, Kontakten, Leads (API) | Rahmen (alle Admin-Seiten) | Kopfzeile › Suche ⌘K › Kunden, Kontakte, Leads | vorne | täglich gebraucht, sofort sichtbar |
| F008 | Tastenkürzel Cmd/Strg+K öffnet Suche, Pfeile/Enter/Esc darin | Rahmen (alle Admin-Seiten) | Kopfzeile › Suche ⌘K › Tastatur | vorne | täglich gebraucht, sofort sichtbar |
| F009 | Push-Benachrichtigungen aktivieren, abschalten, Test senden | Rahmen (alle Admin-Seiten) | Einstellungen › Konto › Benachrichtigungen | in Bereich | einmal einstellen |
| F010 | Profilmenü: Einstellungen, Sicherheit, Abmelden | Rahmen (alle Admin-Seiten) | Navigation › Profil Ole › Menü | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F011 | Zurück-Link merkt gefilterte Liste (Suche, Filter, Seite) | Rahmen (alle Admin-Seiten) | Alle Drawer › Schließen behält Liste und Filter | in Bereich | Drawer statt Seitenwechsel macht den Zurück-Link überflüssig |
| F012 | Push an Admins mit Sprungziel Kontaktakte (Buchung, Termin, Zahlung, Budget, Fragebogen) | Rahmen (alle Admin-Seiten) | Benachrichtigung › öffnet Verkaufen › Kontaktakte | in Bereich | Sprungziel auf neue Struktur umstellen |
| F013 | Push an Admins mit Sprungziel Kundenakte Abrechnung (Kündigung, Reaktivierung, Module, Verkäufer, Pakete) | Rahmen (alle Admin-Seiten) | Benachrichtigung › öffnet Betreuen › Kundenakte › Abrechnung | in Bereich | Sprungziel umstellen |
| F014 | Push an Admins mit Sprungziel WhatsApp (Verbindung prüfen, Kalender fehlt, Vorlage abgelehnt) | Rahmen (alle Admin-Seiten) | Benachrichtigung › öffnet Kundenakte › Einstellungen bzw. Werkzeuge › WhatsApp-Vorlagen | in Bereich | Vorlagen sind Technik |
| F015 | Push an Admins mit Sprungziel Pay-per-Lead (Bestellung, Lieferung, Storno, nicht verlängert) | Rahmen (alle Admin-Seiten) | Benachrichtigung › öffnet Liefern › Überblick | in Bereich | Sprungziel umstellen |
| F016 | Push an Admins: LinkedIn, Bank neu verbinden, Monatsberichte, Status/Variable fehlt, Empfehlungsprämie | Rahmen (alle Admin-Seiten) | Benachrichtigung › öffnet passende Rolle bzw. Werkzeuge | in Bereich | Sprungziel umstellen |
| F017 | Begrüßung und Zusammenfassung der offenen Punkte | /admin/heute | Mein Tag › Kopf › Zusammenfassung | vorne | beantwortet „Was ist jetzt dran?“ |
| F018 | Liste Braucht Sie aus allen Bereichen mit Sprungknopf | /admin/heute | Mein Tag › Karten je Rolle mit Sprungknopf | vorne | nach Rollen gebündelt statt lange Liste |
| F019 | Filter Alle, Vertrieb, Kunden, Chats, Freigaben | /admin/heute | Mein Tag › Karten je Rolle (ersetzt Filter) | vorne | Rollenkarten machen den Filter überflüssig |
| F020 | Aufgabe erledigt (Schnellknopf) | /admin/heute | Mein Tag › Jetzt dran › Haken | vorne | täglich gebraucht, sofort sichtbar |
| F021 | Aufgabe verschieben auf morgen (Schnellknopf) | /admin/heute | Mein Tag › Aufgabe › Mehr › Auf morgen | vorne | täglich gebraucht, sofort sichtbar |
| F022 | Termin-Ergebnis eintragen (stattgefunden, nicht erschienen, ...) | /admin/heute | Mein Tag › Termin › Ergebnis eintragen | vorne | direkt nach dem Termin |
| F023 | Reklamation (PPL-Storno) direkt annehmen oder ablehnen | /admin/heute | Liefern › Überblick › Braucht Aufmerksamkeit › Stornos (Drawer) | vorne | Storno gehört zur Rolle Liefern, Hinweis auf Mein Tag |
| F024 | Garantie-Fall gewähren | /admin/heute | Betreuen › Überblick › Braucht Aufmerksamkeit › Garantie-Fall (Drawer) | vorne | täglich gebraucht, sofort sichtbar |
| F025 | Garantie-Fall ablehnen mit Begründung | /admin/heute | Betreuen › Garantie-Fall (Drawer) › Mehr › Ablehnen mit Grund | vorne | täglich gebraucht, sofort sichtbar |
| F026 | Angebot als nachgefasst markieren | /admin/heute | Verkaufen › Angebote › Angebot (Drawer) › Mehr › Nachgefasst | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F027 | Punkt ausblenden für X Tage (Später, Gelesen, Erledigt) | /admin/heute | Mein Tag › Karte › Mehr › Später | vorne | täglich gebraucht, sofort sichtbar |
| F028 | Ausblenden rückgängig machen (Toast) | /admin/heute | Mein Tag › Hinweis unten › Rückgängig | vorne | täglich gebraucht, sofort sichtbar |
| F029 | Punkte: Formulare ohne Zuordnung, geparkte Leads, Reklamationen | /admin/heute | Mein Tag › Karte Liefern | vorne | täglich gebraucht, sofort sichtbar |
| F030 | Punkte: Zahlung offen, Lastschrift fehlgeschlagen, Ausgaben zuordnen | /admin/heute | Mein Tag › Karte Geld | vorne | täglich gebraucht, sofort sichtbar |
| F031 | Punkte: Onboarding wartet, Einrichtung hängt, Kunde reagiert nicht auf Leads, ruhende Konten vor Löschung | /admin/heute | Mein Tag › Karte Betreuen | vorne | täglich gebraucht, sofort sichtbar |
| F032 | Punkte: Bestandskunden-Modul gewünscht, Hilfe-Anfragen, Feedback/KI-Antworten schlecht | /admin/heute | Mein Tag › Karte Betreuen | vorne | täglich gebraucht, sofort sichtbar |
| F033 | Punkte: LinkedIn-Entwürfe, Post fehlgeschlagen, LinkedIn neu verbinden | /admin/heute | Mein Tag › Karte Verkaufen | vorne | LinkedIn dient der Kundengewinnung |
| F034 | Punkte: Support-Chats, Monatsberichte prüfen, Optimierung freigeben, Später-Follow-ups freigeben | /admin/heute | Mein Tag › Karten Betreuen, Liefern, Verkaufen | vorne | je nach Rolle verteilt |
| F035 | Punkt: Rechnungen ohne Steuernummer | /admin/heute | Geld › Überblick › Braucht Aufmerksamkeit | in Bereich | Einrichtungsfehler, erscheint nur wenn vorhanden |
| F036 | Punkt: Hintergrund-Jobs bzw. Werbedaten-Abgleich hängt | /admin/heute | Werkzeuge › Zustand › Hintergrund-Jobs (Hinweis auf Mein Tag nur bei Fehler) | Werkzeuge | Technik |
| F037 | Termine heute und Aufgaben heute als Zeilen | /admin/heute | Mein Tag › Jetzt dran und Termine heute | vorne | täglich gebraucht, sofort sichtbar |
| F038 | Läuft von allein: was die App in 7 Tagen automatisch erledigt hat | /admin/heute | Mein Tag › Läuft von allein (eingeklappt) | vorne | beruhigt ohne abzulenken |
| F039 | Hinweis neue Buchungen seit letztem Besuch | /admin/heute | Mein Tag › Karte Verkaufen | vorne | täglich gebraucht, sofort sichtbar |
| F040 | Umsatz bzw. Gewinn bis heute mit Monats-Hochrechnung | /admin/heute | Mein Tag › Kennzahl Umsatz Monat | vorne | täglich gebraucht, sofort sichtbar |
| F041 | Vertrieb auf einen Blick: Heute fällig, Überfällig, Antworten, Mail nie angerufen | /admin/heute | Verkaufen › Überblick › Braucht Aufmerksamkeit | vorne | täglich gebraucht, sofort sichtbar |
| F042 | Vertrieb auf einen Blick: nächste Termine | /admin/heute | Verkaufen › Überblick › Termine diese Woche | vorne | täglich gebraucht, sofort sichtbar |
| F043 | Vertrieb auf einen Blick: neue Anfragen der letzten 7 Tage | /admin/heute | Verkaufen › Überblick › Kennzahl Neue Anfragen | vorne | täglich gebraucht, sofort sichtbar |
| F044 | Vertrieb auf einen Blick: Kontakte je Stufe | /admin/heute | Verkaufen › Kontakte › Board (Spaltenzähler) | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F045 | Aufgabenliste gruppiert: Überfällig, Heute, Morgen, 7 Tage, Später | /admin/heute/aufgaben | Mein Tag › Mehr › Alle Aufgaben (Drawer) | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F046 | Ansicht Offen oder Erledigt | /admin/heute/aufgaben | Mein Tag › Alle Aufgaben › Umschalter Offen/Erledigt | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F047 | Filter nach Aufgabenart | /admin/heute/aufgaben | Mein Tag › Alle Aufgaben › Filter | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F048 | Aufgabe anlegen (Art, fällig, Uhrzeit), auch ohne Kontakt | /admin/heute/aufgaben | Kopfzeile › + Neu › Aufgabe | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F049 | Aufgabe erledigt oder wieder öffnen | /admin/heute/aufgaben | Mein Tag › Alle Aufgaben › Haken | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F050 | Aufgabe auf morgen oder in 1 Woche schieben | /admin/heute/aufgaben | Mein Tag › Alle Aufgaben › Mehr › Verschieben | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F051 | Aufgabe löschen | /admin/heute/aufgaben | Mein Tag › Alle Aufgaben › Mehr › Löschen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F052 | Aus Aufgabe anrufen oder Kontakt öffnen | /admin/heute/aufgaben | Mein Tag › Aufgabe › Anrufen bzw. Kontakt öffnen | vorne | täglich gebraucht, sofort sichtbar |
| F053 | Kontaktliste mit Zähler | /admin/vertrieb/kontakte | Verkaufen › Kontakte › Liste | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F054 | Suche nach Agentur, Name, E-Mail, Ort, Telefon | /admin/vertrieb/kontakte | Verkaufen › Kontakte › Suchfeld | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F055 | Filter Stufe | /admin/vertrieb/kontakte | Verkaufen › Kontakte › Filter Stufe | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F056 | Filter Cold Mail (erhalten, keine, geöffnet, geantwortet, bounced) | /admin/vertrieb/kontakte | Verkaufen › Kontakte › Mehr Filter | in Bereich | selten gebraucht, daher eingeklappt |
| F057 | Filter LinkedIn-Status und PLZ beginnt mit | /admin/vertrieb/kontakte | Verkaufen › Kontakte › Mehr Filter | in Bereich | selten gebraucht, daher eingeklappt |
| F058 | Mehrere Kontakte markieren und löschen | /admin/vertrieb/kontakte | Verkaufen › Kontakte › Auswahl › Mehr › Löschen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F059 | Direkt anrufen aus der Liste (Handy) | /admin/vertrieb/kontakte | Verkaufen › Kontakte › Liste › Telefon-Symbol (Handy) | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F060 | Seiten blättern | /admin/vertrieb/kontakte | Verkaufen › Kontakte › Liste lädt weiter | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F061 | Kontakt anlegen (Quelle, Name, Firma, E-Mail, Telefon) | /admin/vertrieb/kontakte/neu | Kopfzeile › + Neu › Kontakt; Verkaufen › Hauptknopf | vorne | täglich gebraucht, sofort sichtbar |
| F062 | Beim Anlegen LinkedIn-Profil, Nachricht und Aufgabe für heute mitgeben | /admin/vertrieb/kontakte/neu | + Neu › Kontakt › Weitere Angaben (eingeklappt) | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F063 | Akquise-Pipeline per Drag & Drop | /admin/vertrieb/pipeline | Verkaufen › Kontakte › Ansicht Board | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F064 | Beim Verschieben auf Verloren Grund abfragen | /admin/vertrieb/pipeline | Verkaufen › Kontakte › Board › Dialog Verloren | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F065 | Karten zeigen Cold-Mail-Status | /admin/vertrieb/pipeline | Verkaufen › Kontakte › Board › Karte | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F066 | Stufe ändern (Auswahl) | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Kopf › Stufe | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F067 | Verloren mit Grund und Wettbewerber | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Mehr › Verloren | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F068 | Anrufen und E-Mail schreiben aus dem Kopf | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Hauptknopf Anrufen, Mehr › E-Mail | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F069 | Link Entscheidungs-Call kopieren | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F070 | Präsentation öffnen | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Mehr › Präsentation | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F071 | Menü: Website, LinkedIn-Profil öffnen | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F072 | Kontakt löschen | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Mehr › Löschen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F073 | Kontakte zusammenführen mit Suche nach Kandidaten | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Mehr › Zusammenführen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F074 | Hinweis mögliche Dubletten | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Hinweisleiste | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F075 | Hinweis Empfehlung von Kunde mit Setup-Rabatt | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Hinweisleiste | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F076 | Website und Google neu auswerten (Adresse, Bewertung, Öffnungszeiten) | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Mehr › Daten auffrischen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F077 | Aktivität erfassen (Anruf, E-Mail, Notiz, Ergebnis, Grund) mit Folgeaufgabe | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Verlauf › Eintrag | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F078 | Verlaufseintrag bearbeiten oder löschen | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Verlauf › Eintrag › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F079 | Antworten auf Cold Mails ansehen, Stimmung setzen | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Verlauf (Antworten markiert) | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F080 | Antwort auf Cold Mail von Hand einfügen | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Verlauf › Mehr › Antwort einfügen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F081 | Cold-Mail-Kampagnen des Kontakts (geöffnet, bounced, abgemeldet) | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Daten › Cold Mail | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F082 | Termine (Calendly bzw. Buchungsseite) mit Meeting-Link | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Überblick › Termine | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F083 | Offene Aufgaben des Kontakts und neue Aufgabe | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Überblick › Nächste Aufgabe | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F084 | LinkedIn-Status und Profil-URL pflegen | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Daten | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F085 | Kundendaten: Kunden-Stufe, Monatswert, Produkte, Vertragsstart, Herkunft | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Daten › Kunde | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F086 | Kontakt mit Kundenakte verknüpfen | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Mehr › Mit Kunde verknüpfen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F087 | Haupt-E-Mail korrigieren | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Daten › Kontakt | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F088 | Weitere E-Mail hinzufügen, entfernen, zur Haupt-E-Mail machen | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Daten › Kontakt | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F089 | Adresse und Telefon bearbeiten | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Daten › Kontakt | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F090 | Stammdaten: Agenturtyp, Versicherer, Inhaber, Teamgröße, Potenzial, Social, Bewertung, Öffnungszeiten | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Daten › Agentur | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F091 | Kontakt-Felder allgemein ändern (ohne Oberfläche) | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Daten (Bearbeiten nutzt diese Schnittstelle) | in Bereich | technische Grundlage, keine eigene Stelle |
| F092 | Onboarding starten (neues Kundenkonto oder bestehendes) nach Annahme | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Hauptknopf nach Annahme: Onboarding starten | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F093 | Onboarding-Schritte abhaken | /admin/vertrieb/kontakte/[id] | Betreuen › Kundenakte (Drawer) › Überblick › Einrichtung | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F094 | Live schalten bzw. zurücknehmen | /admin/vertrieb/kontakte/[id] | Betreuen › Kundenakte (Drawer) › Überblick › Einrichtung › Live schalten | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F095 | Willkommens-Mail erneut senden | /admin/vertrieb/kontakte/[id] | Betreuen › Kundenakte (Drawer) › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F096 | Pflichtangaben aus dem Impressum (Erstinformation) anzeigen | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Daten › Erstinformation | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F097 | Später-Follow-up je Kontakt: freigeben, Texte Mail 1 und 2 bearbeiten | /admin/vertrieb/kontakte/[id] | Verkaufen › Überblick › Braucht Aufmerksamkeit › Follow-ups freigeben | vorne | täglich gebraucht, sofort sichtbar |
| F098 | Später-Follow-up: Mail sofort senden, Texte neu schreiben | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Follow-up › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F099 | Später-Follow-up stoppen oder planen | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Follow-up › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F100 | Später-Follow-up neu schreiben (ohne Oberfläche) | /admin/vertrieb/kontakte/[id] | entfällt | entfernen vorgeschlagen | Dublette zu F098 (Texte neu schreiben), nur Schnittstelle |
| F101 | Angebotskarte: Angebot ansehen und PDF | /admin/vertrieb/kontakte/[id] | Verkaufen › Kontaktakte (Drawer) › Überblick › Angebot | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F102 | Angebot per E-Mail senden mit Anrede, Rechner, Präsentation (PDF/Link), Zielgruppe | /admin/vertrieb/kontakte/[id] | Verkaufen › Angebot (Drawer) › Hauptknopf Senden | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F103 | Angebot als verschickt markieren (ohne Mail) | /admin/vertrieb/kontakte/[id] | Verkaufen › Angebot (Drawer) › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F104 | Angebot löschen | /admin/vertrieb/kontakte/[id] | Verkaufen › Angebot (Drawer) › Mehr › Löschen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F105 | Zahlungserinnerung: Später zahlen erlauben, Erinnerungsdatum | /admin/vertrieb/kontakte/[id] | Verkaufen › Angebot (Drawer) › Mehr › Später zahlen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F106 | Zahlungsstatus des Angebots (offen, bestätigt, bezahlt, fehlgeschlagen) | /admin/vertrieb/kontakte/[id] | Verkaufen › Angebote › Spalte Stand | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F107 | Angebot erstellen: Produkte, Werbebudget, Laufzeit, Start, Setup, Gültigkeit | /admin/vertrieb/kontakte/[id]/angebot | Kopfzeile › + Neu › Angebot › Schritt Produkte | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F108 | Angebot: Empfänger und Kunde ist Vertreter oder Makler (Garantieart) | /admin/vertrieb/kontakte/[id]/angebot | + Neu › Angebot › Schritt Empfänger | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F109 | Angebot: Paket wählen (z. B. Nur Betreuung) | /admin/vertrieb/kontakte/[id]/angebot | + Neu › Angebot › Schritt Paket | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F110 | Angebot: Testangebot 0 € ohne Zahlung, Später zahlen erlauben | /admin/vertrieb/kontakte/[id]/angebot | + Neu › Angebot › Mehr › Testangebot | in Bereich | Sonderfall, daher unter Mehr |
| F111 | Angebot: Verkäufer, Zahlweise und Module | /admin/vertrieb/kontakte/[id]/angebot | + Neu › Angebot › Schritt Zahlung | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F112 | Angebot: Zusammenfassung | /admin/vertrieb/kontakte/[id]/angebot | + Neu › Angebot › Schritt Zusammenfassung | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F113 | Verkaufspräsentation mit Angebotspreisen, Pfeiltasten, Vollbild | /admin/vertrieb/kontakte/[id]/praesentation | Verkaufen › Marketing › Unterlagen › Präsentation; Kontaktakte › Mehr | in Bereich | Präsentation dient dem Verkaufen |
| F114 | Fassung Vertreter oder Makler wählen | /admin/vertrieb/kontakte/[id]/praesentation | Verkaufen › Präsentation › Umschalter Vertreter/Makler | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F115 | Link für Interessenten erzeugen, kopieren, Aufrufe sehen | /admin/vertrieb/kontakte/[id]/praesentation | Verkaufen › Präsentation › Teilen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F116 | Präsentationslink beenden | /admin/vertrieb/kontakte/[id]/praesentation | Verkaufen › Präsentation › Teilen › Mehr › Link beenden | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F117 | Angebotsliste mit Versand, Öffnung, Gültigkeit, Stand | /admin/vertrieb/angebote | Verkaufen › Angebote | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F118 | Filter Alle verschickten, Offen, Angenommen, Abgelaufen/abgelehnt, Entwürfe | /admin/vertrieb/angebote | Verkaufen › Angebote › Filter | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F119 | Filter Zahlung offen | /admin/vertrieb/angebote | Verkaufen › Angebote › Filter Zahlung offen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F120 | Liste wartet auf Freigabe, einzeln oder alle freigeben | /admin/vertrieb/follow-ups | Verkaufen › Überblick › Braucht Aufmerksamkeit › Follow-ups freigeben | vorne | täglich gebraucht, sofort sichtbar |
| F121 | Listen Geplant, Laufend, Zuletzt beendet mit Vorschau und Fehler | /admin/vertrieb/follow-ups | Verkaufen › Überblick › Mehr › Follow-ups (Drawer) | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F122 | Einstellungen: Automatik an, Höchstzahl je Tag und Postfach, Buchungslink, Signatur, Angebotstext | /admin/vertrieb/follow-ups | Einstellungen › Verkaufen › Follow-up-Automatik | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F123 | Bestand jetzt prüfen (bestehende Später-Antworten einplanen) | /admin/vertrieb/follow-ups | Werkzeuge › Vertrieb › Follow-ups nachplanen | Werkzeuge | einmalige Wartung |
| F124 | Vertriebskalender verbinden bzw. trennen | /admin/vertrieb/buchungsseite | Werkzeuge › Verbindungen › Vertriebskalender | Werkzeuge | Einrichtung |
| F125 | Termintypen bearbeiten (Dauer, Puffer, Vorlauf) | /admin/vertrieb/buchungsseite | Einstellungen › Verkaufen › Buchungsseite | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F126 | Buchbare Zeiten je Wochentag | /admin/vertrieb/buchungsseite | Einstellungen › Verkaufen › Buchungsseite | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F127 | Einbettungscode für die Webseite kopieren | /admin/vertrieb/buchungsseite | Werkzeuge › Vertrieb › Buchungsseite einbetten | Werkzeuge | einmalige Einrichtung |
| F128 | Buchungslink kopieren | /admin/vertrieb/buchungsseite | Verkaufen › Überblick › Mehr › Buchungslink kopieren | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F129 | Status je Quelle (Instantly, Calendly, Formulare, LinkedIn) grün bei Eingang in 7 Tagen | /admin/vertrieb/import (Anbindungen) | Werkzeuge › Verbindungen › Zustand der Quellen | Werkzeuge | Technik |
| F130 | Webhook-Adressen kopieren und Anleitung | /admin/vertrieb/import (Anbindungen) | Werkzeuge › Verbindungen › Webhook-Adressen | Werkzeuge | Technik |
| F131 | Jetzt mit Instantly abgleichen | /admin/vertrieb/import (Anbindungen) | Werkzeuge › Importe & Abgleich › Instantly abgleichen | Werkzeuge | Technik |
| F132 | Instantly-CSV importieren | /admin/vertrieb/import (Anbindungen) | Werkzeuge › Importe & Abgleich › Instantly-CSV | Werkzeuge | Import |
| F133 | Calendly verbinden und Termine abgleichen | /admin/vertrieb/import (Anbindungen) | Werkzeuge › Verbindungen › Calendly | Werkzeuge | Einrichtung |
| F134 | Agenturliste (CSV) importieren | /admin/vertrieb/import (Anbindungen) | Werkzeuge › Importe & Abgleich › Agenturliste (CSV) | Werkzeuge | Import |
| F135 | Daten aus altem Cold CRM übernehmen | /admin/vertrieb/import (Anbindungen) | entfällt | entfernen vorgeschlagen | einmalige Übernahme aus altem Cold CRM ist abgeschlossen |
| F136 | Vertrieb neu importieren (ersetzt alles, Bestätigung ERSETZEN) | /admin/vertrieb/import (Anbindungen) | Werkzeuge › Importe & Abgleich › Vertrieb neu importieren (Gefahrenbereich) | Werkzeuge | riskant, gehört weit weg vom Tagesgeschäft |
| F137 | Waalaxy-Import (ohne Oberfläche) | /admin/vertrieb/import (Anbindungen) | Werkzeuge › Importe & Abgleich › Waalaxy | Werkzeuge | Import |
| F138 | LinkedIn-Nachrichten ohne Zuordnung als Lead übernehmen | /admin/vertrieb/import (Anbindungen) | Werkzeuge › Importe & Abgleich › LinkedIn-Nachrichten übernehmen | Werkzeuge | Import |
| F139 | Kontakte anreichern: Google-Kontingent heute | /admin/vertrieb/import (Anbindungen) | Werkzeuge › Zustand › Google-Kontingent | Werkzeuge | Technik |
| F140 | Team-Kalender für Hilfetermine der Kunden (Status) | /admin/vertrieb/import (Anbindungen) | Werkzeuge › Verbindungen › Team-Kalender | Werkzeuge | Einrichtung |
| F141 | Weiterleitung auf Kunden-Pipeline (keine eigene Funktion) | /admin/vertrieb/kunden | entfällt | entfernen vorgeschlagen | reine Weiterleitung ohne Funktion |
| F142 | Kundenliste mit Status, Test, Zahlung offen, Pause, Onboarding-Fortschritt, Nächster-Schritt-Quote | /admin/kunden | Betreuen › Überblick › Kundenliste mit Ampel | vorne | Gesundheit statt Statusspalten |
| F143 | Filter Alle, Zahlung offen, Onboarding, Pausiert, Ruhend | /admin/kunden | Betreuen › Kundenliste › Filter | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F144 | Unterreiter Übersicht, Pipeline, Leads, Pay-per-Lead, Optimierung, Monatsberichte | /admin/kunden | entfällt | entfernen vorgeschlagen | Unterreiter ersetzt durch Rollen Betreuen, Liefern, Geld |
| F145 | Kunden-Pipeline (Vertrag, Onboarding, Test, Aktiv, Pausiert, Gekündigt) per Drag & Drop | /admin/kunden/pipeline | Betreuen › Kundenliste › Mehr › Ansicht Phasen | in Bereich | selten gebraucht |
| F146 | Kunde eine Stufe vor oder zurück | /admin/kunden/pipeline | Betreuen › Kundenakte (Drawer) › Kopf › Phase | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F147 | Kunden nach Kanal (ohne Gekündigt) | /admin/kunden/pipeline | Geld › Auswertung › Kunden nach Kanal | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F148 | Kopf mit Stufe, Onboarding, WhatsApp an/aus, Zahlung offen, ruht/gekündigt/gelöscht, pausiert | /admin/kunden/[id] (Kopf) | Betreuen › Kundenakte (Drawer) › Kopf mit Ampel | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F149 | Hinweis hat X Kunden geworben (Link Empfehlungen) | /admin/kunden/[id] (Kopf) | Betreuen › Kundenakte (Drawer) › Überblick | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F150 | Abwesenheiten der Berater mit Vertretung | /admin/kunden/[id] (Kopf) | Betreuen › Kundenakte (Drawer) › Einstellungen › Team | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F151 | Testkunde komplett löschen | /admin/kunden/[id] (Kopf) | Werkzeuge › Testdaten › Testkunde löschen | Werkzeuge | Test und Technik |
| F152 | Reiter der Kundenakte | /admin/kunden/[id] (Kopf) | Betreuen › Kundenakte (Drawer) › 4 Reiter | in Bereich | vorher 8 Reiter |
| F153 | Neue Oberfläche für Kunden an/aus | /admin/kunden/[id] (Übersicht) | Betreuen › Kundenakte (Drawer) › Einstellungen › Funktionen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F154 | Vermittlertyp setzen | /admin/kunden/[id] (Übersicht) | Betreuen › Kundenakte (Drawer) › Einstellungen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F155 | Stornoquote der Verträge des Kunden | /admin/kunden/[id] (Übersicht) | Betreuen › Kundenakte (Drawer) › Leads & Kampagne | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F156 | Garantien: Stand und Fälle | /admin/kunden/[id] (Übersicht) | Betreuen › Kundenakte (Drawer) › Abrechnung › Garantie | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F157 | Als Testkunde markieren | /admin/kunden/[id] (Übersicht) | Betreuen › Kundenakte (Drawer) › Einstellungen › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F158 | Testdaten anlegen bzw. entfernen | /admin/kunden/[id] (Übersicht) | Werkzeuge › Testdaten › Testdaten anlegen/entfernen | Werkzeuge | Test und Technik |
| F159 | Selbst-Einrichtung freischalten | /admin/kunden/[id] (Übersicht) | Betreuen › Kundenakte (Drawer) › Einstellungen › Einrichtung | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F160 | Einrichtungsschritte ansehen (Einwilligung, Erstinformation, Meta-Zugriff) | /admin/kunden/[id] (Übersicht) | Betreuen › Kundenakte (Drawer) › Überblick › Einrichtung | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F161 | Erinnerung zur Einrichtung senden | /admin/kunden/[id] (Übersicht) | Betreuen › Kundenakte (Drawer) › Überblick › Einrichtung › Erinnern | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F162 | Meta-Zugriff prüfen | /admin/kunden/[id] (Übersicht) | Werkzeuge › Diagnose › Meta-Zugriff je Kunde | Werkzeuge | Diagnose |
| F163 | Einrichtung neu starten | /admin/kunden/[id] (Übersicht) | Betreuen › Kundenakte (Drawer) › Einstellungen › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F164 | Lead-Qualität: disqualifizierte Leads nach Grund und Produkt | /admin/kunden/[id] (Übersicht) | Betreuen › Kundenakte (Drawer) › Leads & Kampagne | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F165 | Nächster Schritt je Berater (Quote, ohne Schritt, vorzeitig verloren) | /admin/kunden/[id] (Übersicht) | Betreuen › Kundenakte (Drawer) › Überblick › Nutzung | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F166 | Eingebettete Kontaktakte (Verlauf, Aufgaben, Angebote, Onboarding) | /admin/kunden/[id] (Übersicht) | Betreuen › Kundenakte (Drawer) › Überblick › Verlauf | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F167 | Grunddaten: Region, Betreuungsgebühr, Meta-Werbekonto | /admin/kunden/[id] (Übersicht) | Betreuen › Kundenakte (Drawer) › Einstellungen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F168 | Meta-Werbekonto-ID setzen | /admin/kunden/[id]/leads | Werkzeuge › Meta & Werbung › Werbekonto zuordnen | Werkzeuge | Einrichtung |
| F169 | CAPI-Rückmeldung: Status und Dataset setzen | /admin/kunden/[id]/leads | Werkzeuge › Meta & Werbung › CAPI und Dataset | Werkzeuge | Technik |
| F170 | Leadformulare des Kunden an/aus | /admin/kunden/[id]/leads | Betreuen › Kundenakte (Drawer) › Leads & Kampagne › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F171 | Letzte Leads mit Abschluss/Storno | /admin/kunden/[id]/leads | Betreuen › Kundenakte (Drawer) › Leads & Kampagne | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F172 | KI-Kampagne starten (Produkt, Zusatzwunsch, Seiten-ID, Datenschutz-URL) | /admin/kunden/[id]/kampagne | Betreuen › Kundenakte (Drawer) › Leads & Kampagne › Kampagne starten | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F173 | Fortschritt abrufen, Plan, Anzeigen, Sofortformular ansehen | /admin/kunden/[id]/kampagne | Betreuen › Kundenakte (Drawer) › Leads & Kampagne › Kampagne | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F174 | Anzeigentext bearbeiten | /admin/kunden/[id]/kampagne | Betreuen › Kundenakte (Drawer) › Leads & Kampagne › Anzeige › Bearbeiten | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F175 | Bild neu erzeugen | /admin/kunden/[id]/kampagne | Betreuen › Kundenakte (Drawer) › Leads & Kampagne › Anzeige › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F176 | Kampagne bei Meta anlegen (pausiert) | /admin/kunden/[id]/kampagne | Betreuen › Kundenakte (Drawer) › Leads & Kampagne › Bei Meta anlegen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F177 | Angelegte Kampagne bei Meta löschen, Formular archivieren | /admin/kunden/[id]/kampagne | Betreuen › Kundenakte (Drawer) › Leads & Kampagne › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F178 | Verlauf der Läufe | /admin/kunden/[id]/kampagne | Betreuen › Kundenakte (Drawer) › Leads & Kampagne › Mehr › Verlauf | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F179 | Protokoll der Maßnahmen des Kunden | /admin/kunden/[id]/optimierung | Betreuen › Kundenakte (Drawer) › Leads & Kampagne › Maßnahmen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F180 | Maßnahme von Hand eintragen (Datum, Art, Text) | /admin/kunden/[id]/optimierung | Betreuen › Kundenakte (Drawer) › Leads & Kampagne › Maßnahmen › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F181 | 360dialog-Nummer zuordnen | /admin/kunden/[id]/whatsapp | Werkzeuge › WhatsApp › Nummer zuordnen | Werkzeuge | Einrichtung |
| F182 | Halb fertige WhatsApp-Verbindung zurücksetzen | /admin/kunden/[id]/whatsapp | Werkzeuge › WhatsApp › Verbindung zurücksetzen | Werkzeuge | Technik |
| F183 | Allianz-Online-Kalender verbinden, ändern, trennen | /admin/kunden/[id]/whatsapp | Betreuen › Kundenakte (Drawer) › Einstellungen › Kalender | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F184 | Buchbare Zeiten für Leads speichern | /admin/kunden/[id]/whatsapp | Betreuen › Kundenakte (Drawer) › Einstellungen › Kalender | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F185 | Zeit blockieren und Blocker löschen | /admin/kunden/[id]/whatsapp | Betreuen › Kundenakte (Drawer) › Einstellungen › Kalender | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F186 | Meta-Gebühren (intern) | /admin/kunden/[id]/whatsapp | Werkzeuge › WhatsApp › Meta-Gebühren | Werkzeuge | intern |
| F187 | Bestandskunden-Kampagnen (Hinweis, Link Abrechnung) | /admin/kunden/[id]/whatsapp | Betreuen › Kundenakte (Drawer) › Abrechnung › Module | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F188 | Kunde für den Assistenten hinzufügen | /admin/whatsapp/settings (je Kunde, auch im Kunden-Reiter) | Betreuen › Kundenakte (Drawer) › Einstellungen › WhatsApp-Assistent | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F189 | WhatsApp-Nummer von Hand verbinden (Nummer, API-Schlüssel) | /admin/whatsapp/settings (je Kunde, auch im Kunden-Reiter) | Werkzeuge › WhatsApp › Nummer von Hand verbinden | Werkzeuge | Technik |
| F190 | Assistent aktiv an/aus | /admin/whatsapp/settings (je Kunde, auch im Kunden-Reiter) | Betreuen › Kundenakte (Drawer) › Einstellungen › WhatsApp-Assistent | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F191 | Neue Leads automatisch anschreiben nach X Minuten | /admin/whatsapp/settings (je Kunde, auch im Kunden-Reiter) | Betreuen › Kundenakte (Drawer) › Einstellungen › WhatsApp-Assistent | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F192 | Automatisch nachfassen (Abfolgen) an/aus | /admin/whatsapp/settings (je Kunde, auch im Kunden-Reiter) | Betreuen › Kundenakte (Drawer) › Einstellungen › WhatsApp-Assistent | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F193 | Berater-E-Mail für Einladungen, Videoraum, belegte Zeiten aus ICS | /admin/whatsapp/settings (je Kunde, auch im Kunden-Reiter) | Betreuen › Kundenakte (Drawer) › Einstellungen › WhatsApp-Assistent | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F194 | Buchungskalender Google/Microsoft verbinden, Buchungslink für Leadformular | /admin/whatsapp/settings (je Kunde, auch im Kunden-Reiter) | Betreuen › Kundenakte (Drawer) › Einstellungen › Kalender | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F195 | Vorlagen des Kunden ansehen, Status bei Meta | /admin/whatsapp/settings (je Kunde, auch im Kunden-Reiter) | Werkzeuge › WhatsApp-Vorlagen | Werkzeuge | Vorlagen-Pflege ist Technik |
| F196 | Vorlage anlegen/bearbeiten mit Zweck, Platzhaltern, Handy-Vorschau | /admin/whatsapp/settings (je Kunde, auch im Kunden-Reiter) | Werkzeuge › WhatsApp-Vorlagen › Bearbeiten | Werkzeuge | Technik oder Einrichtung |
| F197 | Vorlage löschen | /admin/whatsapp/settings (je Kunde, auch im Kunden-Reiter) | Werkzeuge › WhatsApp-Vorlagen › Mehr › Löschen | Werkzeuge | Technik oder Einrichtung |
| F198 | Vorlagen bei Meta einreichen bzw. einzeln neu einreichen | /admin/whatsapp/settings (je Kunde, auch im Kunden-Reiter) | Werkzeuge › WhatsApp-Vorlagen › Bei Meta einreichen | Werkzeuge | Technik oder Einrichtung |
| F199 | Vorlage von Hand als freigegeben markieren | /admin/whatsapp/settings (je Kunde, auch im Kunden-Reiter) | Werkzeuge › WhatsApp-Vorlagen › Mehr › Als freigegeben markieren | Werkzeuge | Technik oder Einrichtung |
| F200 | Erstanschreiben-Einstellungen (alt, ohne Oberfläche) | /admin/whatsapp/settings (je Kunde, auch im Kunden-Reiter) | entfällt | entfernen vorgeschlagen | alte Erstanschreiben-Einstellung, ersetzt durch F191 |
| F201 | Support-WhatsApp verbinden (360dialog) | /admin/whatsapp/settings (global) | Werkzeuge › Verbindungen › Support-WhatsApp | Werkzeuge | Einrichtung |
| F202 | A/B-Tests der Vorlagen mit Antwort- und Terminquote | /admin/whatsapp/settings (global) | Werkzeuge › WhatsApp-Vorlagen › A/B-Tests | Werkzeuge | Feinjustierung |
| F203 | Übersicht aller Kunden mit Assistent (Liste, Sprung) | /admin/whatsapp/settings (global) | Betreuen › Kundenliste › Filter Assistent aktiv | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F204 | Hinweis Zahlung offen seit | /admin/kunden/[id]/abrechnung | Betreuen › Kundenakte (Drawer) › Abrechnung › Hinweis; Geld › Überblick | vorne | täglich gebraucht, sofort sichtbar |
| F205 | Kündigung & Rückkehr: ruht seit, reaktiviert | /admin/kunden/[id]/abrechnung | Betreuen › Kundenakte (Drawer) › Abrechnung | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F206 | Betreuungsgebühr eintragen, ändern, entfernen | /admin/kunden/[id]/abrechnung | Betreuen › Kundenakte (Drawer) › Abrechnung › Vertrag | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F207 | Kündigungsabsichten und angebotene Halteangebote | /admin/kunden/[id]/abrechnung | Betreuen › Überblick › Braucht Aufmerksamkeit › Kündigungsabsicht | vorne | täglich gebraucht, sofort sichtbar |
| F208 | Budgetänderung des Kunden übernehmen | /admin/kunden/[id]/abrechnung | Betreuen › Überblick › Braucht Aufmerksamkeit › Budgetänderung (Drawer) › Hauptknopf | vorne | täglich gebraucht, sofort sichtbar |
| F209 | Budgetänderung ablehnen | /admin/kunden/[id]/abrechnung | Betreuen › Budgetänderung (Drawer) › Mehr › Ablehnen | vorne | täglich gebraucht, sofort sichtbar |
| F210 | Produktbuchung des Kunden annehmen oder ablehnen | /admin/kunden/[id]/abrechnung | Betreuen › Überblick › Braucht Aufmerksamkeit › Produktbuchung | vorne | täglich gebraucht, sofort sichtbar |
| F211 | Aktive Verkäufer speichern und mit Stripe abgleichen | /admin/kunden/[id]/abrechnung | Betreuen › Kundenakte (Drawer) › Abrechnung › Vertrag | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F212 | Bestandskunden-Modul freischalten (kostenlos), sperren, sichtbar machen | /admin/kunden/[id]/abrechnung | Betreuen › Kundenakte (Drawer) › Abrechnung › Module | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F213 | Kontingent Bestandskunden speichern, Zusatzpakete sehen | /admin/kunden/[id]/abrechnung | Betreuen › Kundenakte (Drawer) › Abrechnung › Module | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F214 | Modul Empfehlungen & Bewertungen freischalten oder sperren | /admin/kunden/[id]/abrechnung | Betreuen › Kundenakte (Drawer) › Abrechnung › Module | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F215 | Zahlweise monatlich/jährlich umstellen | /admin/kunden/[id]/abrechnung | Betreuen › Kundenakte (Drawer) › Abrechnung › Vertrag › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F216 | Pause/Urlaub eintragen (ab, Neustart, Grund) | /admin/kunden/[id]/abrechnung | Betreuen › Kundenakte (Drawer) › Mehr › Pause eintragen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F217 | Pause beenden | /admin/kunden/[id]/abrechnung | Betreuen › Kundenakte (Drawer) › Kopf › Pause beenden | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F218 | Kundendaten endgültig löschen mit Grund | /admin/kunden/[id]/abrechnung | Betreuen › Kundenakte (Drawer) › Einstellungen › Mehr › Endgültig löschen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F219 | Rechnungen mit Status und PDF | /admin/kunden/[id]/abrechnung | Betreuen › Kundenakte (Drawer) › Abrechnung › Rechnungen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F220 | In Stripe öffnen | /admin/kunden/[id]/abrechnung | Betreuen › Kundenakte (Drawer) › Abrechnung › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F221 | Logins des Kunden mit Einladung offen, zuletzt aktiv | /admin/kunden/[id]/logins und /admin/buyers | Betreuen › Kundenakte (Drawer) › Einstellungen › Zugänge | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F222 | Neuen Login anlegen (E-Mail, Passwort, Kunde) | /admin/kunden/[id]/logins und /admin/buyers | Betreuen › Kundenakte (Drawer) › Einstellungen › Zugänge › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F223 | Passwort setzen | /admin/kunden/[id]/logins und /admin/buyers | Betreuen › Kundenakte (Drawer) › Einstellungen › Zugänge › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F224 | E-Mail-Adresse ändern | /admin/kunden/[id]/logins und /admin/buyers | Betreuen › Kundenakte (Drawer) › Einstellungen › Zugänge › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F225 | Login löschen | /admin/kunden/[id]/logins und /admin/buyers | Betreuen › Kundenakte (Drawer) › Einstellungen › Zugänge › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F226 | Einladung erneut senden bzw. Link zum Passwort ändern senden | /admin/kunden/[id]/logins und /admin/buyers | Betreuen › Kundenakte (Drawer) › Einstellungen › Zugänge › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F227 | Login einem anderen Kunden zuordnen | /admin/kunden/[id]/logins und /admin/buyers | Betreuen › Kundenakte (Drawer) › Einstellungen › Zugänge › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F228 | Als Kunde ansehen (nur lesend) | /admin/kunden/[id]/logins und /admin/buyers | Betreuen › Kundenakte (Drawer) › Mehr › Als Kunde ansehen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F229 | Login-Liste aller Kunden (Suche nach E-Mail) | /admin/kunden/[id]/logins und /admin/buyers | Werkzeuge › Zugänge › Alle Logins | Werkzeuge | Suche über alle Logins ist Support-Technik |
| F230 | Monatsübersicht aller Berichte mit Monat vor/zurück | /admin/monatsberichte | Betreuen › Monatsberichte | in Bereich | Bericht ist Kundenbetreuung |
| F231 | Berichte jetzt erzeugen | /admin/monatsberichte | Betreuen › Monatsberichte › Mehr › Jetzt erzeugen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F232 | Bericht ansehen mit Vorschau und Prüfbefunden | /admin/monatsberichte | Betreuen › Monatsberichte › Bericht (Drawer) | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F233 | Bericht senden | /admin/monatsberichte | Betreuen › Monatsberichte › Bericht (Drawer) › Hauptknopf Senden | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F234 | Bericht bearbeiten (Betreff, Einstieg) und senden | /admin/monatsberichte | Betreuen › Monatsberichte › Bericht (Drawer) › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F235 | Anrufen statt Mail | /admin/monatsberichte | Betreuen › Monatsberichte › Bericht (Drawer) › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F236 | Diesen Monat aussetzen | /admin/monatsberichte | Betreuen › Monatsberichte › Bericht (Drawer) › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F237 | Monatsberichte für diesen Kunden an/aus | /admin/monatsberichte | Betreuen › Kundenakte (Drawer) › Einstellungen › Monatsbericht | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F238 | Posteingang Leads ohne Zuordnung | /admin/lead-eingang | Liefern › Überblick › Braucht Aufmerksamkeit › Formulare ohne Zuordnung | vorne | Leads warten, also Tagesgeschäft |
| F239 | Formular zuordnen (Seite, Formular, Kunde, Produkt) | /admin/lead-eingang | Liefern › Formular (Drawer) › Hauptknopf Zuordnen | vorne | täglich gebraucht, sofort sichtbar |
| F240 | Beim Zuordnen Lead-Preis (PPL) und Airtable-Bezug | /admin/lead-eingang | Liefern › Formular (Drawer) › Preis (Airtable-Feld entfällt) | in Bereich | Airtable-Teil fällt nach Abschaltung weg |
| F241 | Facebook-Seite wählen und Formulare laden | /admin/lead-eingang | Liefern › Formular (Drawer) › Seite wählen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F242 | Wartende Leads ohne Zuordnung verwerfen | /admin/lead-eingang | Liefern › Formular (Drawer) › Mehr › Verwerfen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F243 | Zuordnung an/aus schalten | /admin/lead-eingang | Werkzeuge › Lead-Eingang › Formular-Zuordnungen | Werkzeuge | Einrichtung |
| F244 | Zuordnungen-Tabelle mit Preis, letztem Lead, Einwilligungs-Warnung | /admin/lead-eingang | Werkzeuge › Lead-Eingang › Formular-Zuordnungen | Werkzeuge | Einrichtung |
| F245 | Meta-Verbindung prüfen (Token, Rechte, Webhook-URL) | /admin/lead-eingang | Werkzeuge › Diagnose › Meta-Verbindung | Werkzeuge | Diagnose |
| F246 | Übergang: Webhook für Zapier | /admin/lead-eingang | Werkzeuge › Verbindungen › Zapier-Webhook (Übergang) | Werkzeuge | Übergangslösung |
| F247 | Alle Leads aller Kunden mit Status und Preis | /admin/leads | Liefern › Leads | in Bereich | nach Tag gruppiert, Probleme zuerst |
| F248 | Filter Kunde, Produkt, Status, Zeitraum (Monat oder von/bis) | /admin/leads | Liefern › Leads › Filter | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F249 | CSV-Export der gefilterten Leads (mit Protokoll) | /admin/leads | Liefern › Leads › Mehr › Export (CSV) | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F250 | Lead anrufen | /admin/leads | Liefern › Lead (Drawer) › Anrufen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F251 | Bezüge je Produkt mit Kontingent, geliefert, Preis, Filter, Lieferung | /admin/ppl | Liefern › Bezüge | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F252 | Übersicht je Kunde (Woche, Monat, liegt zurück) | /admin/ppl | Liefern › Bezüge › nach Kunde gruppiert | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F253 | Auswertung mit Zeitraum und Produktfilter (Diagramm, Tabelle) | /admin/ppl | Geld › Auswertung › Pay-per-Lead | in Bereich | Auswertung ist Finanzen |
| F254 | Geparkte Leads einem Bezug zuordnen | /admin/ppl | Liefern › Überblick › Braucht Aufmerksamkeit › Geparkt (Drawer) | vorne | täglich gebraucht, sofort sichtbar |
| F255 | Geparkten Lead verwerfen | /admin/ppl | Liefern › Geparkt (Drawer) › Mehr › Verwerfen | vorne | täglich gebraucht, sofort sichtbar |
| F256 | Storno prüfen: annehmen oder ablehnen | /admin/ppl | Liefern › Überblick › Braucht Aufmerksamkeit › Stornos (Drawer) | vorne | täglich gebraucht, sofort sichtbar |
| F257 | Gelieferte Leads suchen (Name, Telefon, E-Mail, ID, Bezug) | /admin/ppl | Liefern › Leads › Suchfeld | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F258 | Storno von Hand eintragen (Grund, Notiz) | /admin/ppl | Liefern › Lead (Drawer) › Mehr › Storno eintragen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F259 | Storno zurücknehmen | /admin/ppl | Liefern › Lead (Drawer) › Mehr › Storno zurücknehmen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F260 | Eingang aller PPL-Leads (ausgeliefert, geparkt, Dublette, ungültig) | /admin/ppl | Liefern › Leads (Status je Lead) | in Bereich | ersetzt eigene Eingangsliste |
| F261 | Anzeige Airtable-Abgleich an/aus | /admin/ppl | entfällt | entfernen vorgeschlagen | Airtable-Abgleich nach Abschaltung überholt |
| F262 | Bezug anlegen/bearbeiten (Kunde, Produkt, Menge, Preis, Start) | /admin/ppl/bezug/[id] | Liefern › Bezüge › Bezug (Drawer); + Neu › Bezug; Liefern › Hauptknopf | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F263 | Bezug: Modus Woche/Monat/einmalig, Live/Test, Lieferweg App/E-Mail/Webhook mit Format | /admin/ppl/bezug/[id] | Liefern › Bezug (Drawer) › Lieferung | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F264 | Gebiet mit Vorrang anlegen/ändern (PLZ, Menge, Zeitraum) | /admin/ppl/bezug/[id] | Liefern › Bezug (Drawer) › Gebiete | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F265 | Gebiet löschen | /admin/ppl/bezug/[id] | Liefern › Bezug (Drawer) › Gebiete › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F266 | Bestellung von Hand (bezahlt, ohne Stripe) | /admin/ppl/bezug/[id] | Liefern › Bezug (Drawer) › Mehr › Bestellung von Hand | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F267 | Bezüge aus Airtable übernehmen | /admin/ppl/import | entfällt (bis zur Abschaltung: Werkzeuge › Übergang) | entfernen vorgeschlagen | Airtable-Import nach Abschaltung überholt |
| F268 | Pool-Liste mit Ist/Ziel, Prognose, Status (auf Kurs, knapp, Unterdeckung) | /admin/media-buyer | Liefern › Werbekonten › Lead-Pools | in Bereich | Werbung erzeugt die Leads, daher Liefern |
| F269 | Autopilot je Pool an/aus | /admin/media-buyer | Liefern › Werbekonten › Pool (Drawer) | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F270 | Max. Tagesbudget je Kanal (Meta, Outbrain, TikTok, Google) | /admin/media-buyer | Einstellungen › Werbung › Media Buyer | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F271 | Kampagnen-Stichwort je Kanal | /admin/media-buyer | Einstellungen › Werbung › Media Buyer | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F272 | Trockenlauf Media Buyer | /admin/media-buyer | Werkzeuge › Meta & Werbung › Trockenlauf Media Buyer | Werkzeuge | Test |
| F273 | Jetzt anwenden (Budgets setzen) | /admin/media-buyer | Liefern › Werbekonten › Hauptknopf Empfehlung anwenden | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F274 | Empfehlung, Verlauf der Aktionen, Performance pro Kanal, Adspend-Zuordnung | /admin/media-buyer | Liefern › Werbekonten › Pool (Drawer) | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F275 | Werbekonten-Liste mit Modus, letzter Maßnahme (rot wenn alt), offen, letzter Lauf | /admin/optimierung | Liefern › Werbekonten | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F276 | Global: wöchentlicher Optimierungslauf an/aus | /admin/optimierung | Einstellungen › Werbung | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F277 | Global: Autopilot für alle Konten | /admin/optimierung | Einstellungen › Werbung | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F278 | Konto: Modus, Ziel-Leadpreis, Tagesbudget, Kampagnen-Stichwort | /admin/optimierung | Liefern › Werbekonto (Drawer) › Einstellungen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F279 | Alle Maßnahmen freigeben | /admin/optimierung | Liefern › Überblick › Braucht Aufmerksamkeit › Maßnahmen freigeben | vorne | täglich gebraucht, sofort sichtbar |
| F280 | Einzelne Maßnahme freigeben | /admin/optimierung | Liefern › Werbekonto (Drawer) | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F281 | Maßnahme ablehnen mit Notiz | /admin/optimierung | Liefern › Werbekonto (Drawer) › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F282 | Vorschlag als erledigt markieren mit Notiz | /admin/optimierung | Liefern › Werbekonto (Drawer) › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F283 | Trockenlauf je Konto | /admin/optimierung | Werkzeuge › Meta & Werbung › Trockenlauf je Konto | Werkzeuge | Test |
| F284 | Lauf jetzt starten | /admin/optimierung | Werkzeuge › Meta & Werbung › Lauf jetzt starten | Werkzeuge | läuft sonst automatisch |
| F285 | Meta-Änderungsprotokoll abrufen (30 Tage) | /admin/optimierung | Werkzeuge › Meta & Werbung › Meta-Änderungsprotokoll | Werkzeuge | Technik |
| F286 | Protokoll je Konto (Quelle Monatsbericht) | /admin/optimierung | Liefern › Werbekonto (Drawer) › Verlauf | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F287 | Status-Reiter Offen, Zurückgestellt, Erledigt | /admin/whatsapp (Chats) | Betreuen › Chats › Umschalter Offen/Erledigt | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F288 | Filter Alle, Leads der Kunden, Support-Nummer, Kunde, Interessent, unbekannt | /admin/whatsapp (Chats) | Betreuen › Chats › Filter | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F289 | Chats durchsuchen nach Name oder Nummer | /admin/whatsapp (Chats) | Betreuen › Chats › Suchfeld | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F290 | Rückmeldung Kalender verbunden/abgelehnt | /admin/whatsapp (Chats) | Betreuen › Chats › Gespräch › Hinweis | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F291 | Bot pausieren bzw. wieder einschalten | /admin/whatsapp (Chats) | Betreuen › Chats › Gespräch › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F292 | Gespräch übernehmen | /admin/whatsapp (Chats) | Betreuen › Chats › Gespräch › Hauptknopf Übernehmen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F293 | Antwort senden (Enter sendet am Rechner, Emoji, Textbausteine) | /admin/whatsapp (Chats) | Betreuen › Chats › Eingabe | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F294 | Freigegebene Vorlage senden (außerhalb 24 Stunden) | /admin/whatsapp (Chats) | Betreuen › Chats › Eingabe › Vorlage | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F295 | Termin des Leads verschieben (Dialog mit freien Zeiten) | /admin/whatsapp (Chats) | Betreuen › Chats › Gespräch › Mehr › Termin verschieben | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F296 | Termin des Leads absagen | /admin/whatsapp (Chats) | Betreuen › Chats › Gespräch › Mehr › Termin absagen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F297 | Seitenleiste Lead: Kontaktdaten, Formularangaben, Bot-Zusammenfassung, Termine, Ereignisse | /admin/whatsapp (Chats) | Betreuen › Chats › Gespräch › Lead-Angaben | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F298 | Anrufen, E-Mail, Zum CRM/Kunden aus dem Chat | /admin/whatsapp (Chats) | Betreuen › Chats › Gespräch › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F299 | Hinweis Bot kann keine Termine buchen, Kalender verbinden | /admin/whatsapp (Chats) | Betreuen › Chats › Gespräch › Hinweisleiste | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F300 | Support-Chat: Absender einem Vertriebskontakt zuordnen | /admin/whatsapp (Chats) | Betreuen › Chats › Gespräch › Mehr › Kontakt zuordnen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F301 | Braucht Aufmerksamkeit (Grund) und nicht zugestellt markiert | /admin/whatsapp (Chats) | Betreuen › Überblick › Braucht Aufmerksamkeit › Chats | vorne | täglich gebraucht, sofort sichtbar |
| F302 | Entwürfe zur Freigabe: Text bearbeiten, Bild wählen (Foto, Grafik, ohne), Hypothese sehen | /admin/marketing/linkedin | Verkaufen › Marketing › LinkedIn › Entwurf (Drawer) | in Bereich | LinkedIn dient der Kundengewinnung |
| F303 | Entwurf freigeben (planen) | /admin/marketing/linkedin | Verkaufen › Marketing › LinkedIn › Entwurf (Drawer) › Hauptknopf Freigeben | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F304 | Sofort veröffentlichen | /admin/marketing/linkedin | Verkaufen › Marketing › LinkedIn › Entwurf (Drawer) › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F305 | Entwurf verwerfen | /admin/marketing/linkedin | Verkaufen › Marketing › LinkedIn › Entwurf (Drawer) › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F306 | Geplante Posts und Freigabe zurücknehmen | /admin/marketing/linkedin | Verkaufen › Marketing › LinkedIn › Geplant | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F307 | Entwürfe jetzt generieren für X Tage | /admin/marketing/linkedin | Verkaufen › Marketing › LinkedIn › Mehr › Entwürfe erzeugen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F308 | Ergebnisse je Post (Impressionen, Zielgruppe, Reichweite) | /admin/marketing/linkedin | Verkaufen › Marketing › LinkedIn › Ergebnisse | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F309 | Zahlen je Post nachtragen, importierten Text setzen | /admin/marketing/linkedin | Werkzeuge › Importe & Abgleich › LinkedIn-Zahlen nachtragen | Werkzeuge | Datenpflege |
| F310 | LinkedIn-Statistik (Excel) hochladen | /admin/marketing/linkedin | Werkzeuge › Importe & Abgleich › LinkedIn-Statistik | Werkzeuge | Import |
| F311 | Fotos hochladen, beschreiben, löschen | /admin/marketing/linkedin | Verkaufen › Marketing › LinkedIn › Mehr › Fotos | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F312 | Einstellungen: Zielgruppe, Produkte, Über mich, Trust-Material, Posts pro Tag, Uhrzeiten | /admin/marketing/linkedin | Einstellungen › Marketing › LinkedIn | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F313 | LinkedIn verbinden bzw. trennen, Hinweis Zugang abgelaufen | /admin/marketing/linkedin | Werkzeuge › Verbindungen › LinkedIn (Hinweis auf Mein Tag bei Ablauf) | Werkzeuge | Verbindung ist Technik |
| F314 | Kennzahlen und alle Empfehlungen mit Stand und Prämie | /admin/marketing/empfehlungen | Verkaufen › Marketing › Empfehlungen | in Bereich | Empfehlungen bringen neue Kunden |
| F315 | Prämie als gutgeschrieben markieren | /admin/marketing/empfehlungen | Verkaufen › Marketing › Empfehlung (Drawer) › Hauptknopf Prämie gutschreiben | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F316 | Empfehlungsrabatt auf offene Angebote anwenden | /admin/marketing/empfehlungen | Verkaufen › Marketing › Empfehlung (Drawer) › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F317 | Top-Empfehler mit geworbenen Kunden, Umsatz, Prämien | /admin/marketing/empfehlungen | Verkaufen › Marketing › Empfehlungen › Top-Empfehler | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F318 | Web-Präsentation je Zielgruppe öffnen und als PDF | /admin/marketing/unterlagen | Verkaufen › Marketing › Unterlagen | in Bereich | Unterlagen dienen dem Verkaufen |
| F319 | Datei (PPTX/PDF) herunterladen | /admin/marketing/unterlagen | Verkaufen › Marketing › Unterlagen › Datei | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F320 | Datei hochladen bzw. ersetzen | /admin/marketing/unterlagen | Verkaufen › Marketing › Unterlagen › Mehr › Hochladen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F321 | Datei entfernen | /admin/marketing/unterlagen | Verkaufen › Marketing › Unterlagen › Datei › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F322 | Live-Demo der Beratungspräsentation | /admin/marketing/unterlagen | Verkaufen › Marketing › Unterlagen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F323 | Öffentlichen Rechner öffnen | /admin/marketing/unterlagen | Verkaufen › Marketing › Unterlagen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F324 | Kennzahlen-Kacheln (MRR, Kunden, Churn, CAC ...) | /admin/zahlen | Geld › Überblick › Kennzahlen | vorne | 4 statt vieler Kacheln |
| F325 | Sicht Kerngeschäft oder Gesamt mit Pay-per-Lead | /admin/zahlen | Geld › Überblick › Umschalter Kerngeschäft/Gesamt | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F326 | Kachel aufklappen (Drill-down Kunden je Kennzahl) | /admin/zahlen | Geld › Kennzahl › Drawer | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F327 | Investoren-Ansicht (interne Reiter ausblenden) | /admin/zahlen | Geld › Auswertung › Mehr › Investoren-Ansicht | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F328 | Investoren-Update: Highlights, Texte speichern, drucken | /admin/zahlen | Geld › Auswertung › Mehr › Investoren-Update | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F329 | Reiter Wachstum: Umsatz je Strom, Umsatzmix | /admin/zahlen | Geld › Auswertung › Wachstum | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F330 | Reiter Kunden: Kohorten, Kundenbasis, Abhängigkeit | /admin/zahlen | Geld › Auswertung › Kunden | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F331 | Reiter Wirtschaftlichkeit: Kundengewinnung, Bruttomarge je Strom | /admin/zahlen | Geld › Auswertung › Wirtschaftlichkeit | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F332 | Reiter Wirkung beim Vertreter: Pro 1 €, Lead bis Abschluss, Tempo | /admin/zahlen | Geld › Auswertung › Wirkung beim Vertreter | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F333 | Reiter Produkte: über alle Vertreter und je Vertreter, Zeitraum | /admin/zahlen | Geld › Auswertung › Produkte | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F334 | Reiter Vertrieb: Pipeline, Woher Kunden kommen | /admin/zahlen | Geld › Auswertung › Vertrieb | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F335 | Reiter Pay-per-Lead: verkaufte Leads je Monat | /admin/zahlen | Geld › Auswertung › Pay-per-Lead | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F336 | Reiter BWA mit Drill-down je Zeile und Hinweis offene Zuordnungen | /admin/zahlen | Geld › Kosten › BWA | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F337 | Einrichtungsgebühren je Monat, Umsatz von Hand nachtragen | /admin/zahlen | Geld › Überblick › Mehr › Umsatz nachtragen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F338 | Manuellen Umsatz löschen | /admin/zahlen | Geld › Überblick › Mehr › Umsatz nachtragen › Löschen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F339 | Kunden ohne hinterlegte Betreuungsgebühr | /admin/zahlen | Geld › Überblick › Braucht Aufmerksamkeit | vorne | täglich gebraucht, sofort sichtbar |
| F340 | Link Leads & Werbung (Dashboard /) | /admin/zahlen | entfällt | entfernen vorgeschlagen | reiner Link, ersetzt durch Navigation Liefern |
| F341 | Buchungsliste aller Kunden (Angebote, Produkte, Module, Budget, Pausen, Kündigungen) | /admin/zahlen/buchungen | Geld › Rechnungen › Buchungen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F342 | Filter Kunde, Art, Status, Zeitraum, Offen | /admin/zahlen/buchungen | Geld › Rechnungen › Buchungen › Filter | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F343 | Suche in Buchungen | /admin/zahlen/buchungen | Geld › Rechnungen › Suchfeld | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F344 | CSV-Export Buchungen | /admin/zahlen/buchungen | Geld › Rechnungen › Mehr › Export (CSV) | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F345 | Kunden je Monat (neu, reaktiviert, gekündigt, netto) | /admin/zahlen/lebenszyklus | Geld › Auswertung › Lebenszyklus | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F346 | MRR-Bewegung je Monat | /admin/zahlen/lebenszyklus | Geld › Auswertung › Lebenszyklus | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F347 | Reaktivierungsquote je Kündigungsmonat | /admin/zahlen/lebenszyklus | Geld › Auswertung › Lebenszyklus | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F348 | Kündigungsgründe, die zurückkommen | /admin/zahlen/lebenszyklus | Geld › Auswertung › Lebenszyklus | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F349 | Halteangebote: angenommen, MRR gerettet, später gekündigt | /admin/zahlen/lebenszyklus | Geld › Auswertung › Lebenszyklus | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F350 | Ruhende Konten mit Löschdatum, Aufbewahrung, Grund | /admin/zahlen/lebenszyklus | Betreuen › Kundenliste › Filter Ruhend | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F351 | Stornoquote der Verträge je Kunde und Sparte | /admin/zahlen/stornoquote | Geld › Auswertung › Stornoquote | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F352 | Leads ohne WhatsApp je Kunde (30 Tage, gesamt) | /admin/zahlen/whatsapp | Werkzeuge › Diagnose › WhatsApp-Abdeckung | Werkzeuge | Diagnose |
| F353 | Zustellfehler der letzten 14 Tage je Kunde und Code | /admin/zahlen/whatsapp | Werkzeuge › Diagnose › Zustellfehler | Werkzeuge | Diagnose |
| F354 | Hilfe-Anfragen an das Team | /admin/nutzung | Betreuen › Überblick › Braucht Aufmerksamkeit › Hilfe-Anfragen | vorne | täglich gebraucht, sofort sichtbar |
| F355 | KI-Hilfe: Fragen der Vertreter mit Bewertung | /admin/nutzung | Betreuen › Nutzung & News › KI-Fragen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F356 | Nutzung je Kunde: liegt herum, genutzte Aktionen, Seitenaufrufe, Fehler, Feedback | /admin/nutzung | Betreuen › Nutzung & News; fließt in die Ampel | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F357 | Weiterempfehlung (NPS) | /admin/nutzung | Betreuen › Nutzung & News › Kennzahl NPS | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F358 | Zusatzmodul Empfehlungen: Kandidaten fürs Gespräch | /admin/nutzung | Betreuen › Nutzung & News › Gesprächskandidaten | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F359 | Ankündigung des Zusatzmoduls an Kunden senden (Mail und In-App) | /admin/nutzung | Betreuen › Nutzung & News › Mehr › Ankündigung senden | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F360 | Übersicht aller Einstellungen in Gruppen | /admin/einstellungen | Einstellungen (7 Gruppen) | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F361 | Warnhinweise: Zwei-Faktor aus, Steuernummer fehlt, Statusmeldung aktiv | /admin/einstellungen | Einstellungen › Hinweisleiste oben | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F362 | Produkt buchbar an/aus | /admin/einstellungen/produkte | Einstellungen › Angebot & Produkte › Produkte | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F363 | Produkt als bewährt markieren und Nutzen-Text | /admin/einstellungen/produkte | Einstellungen › Angebot & Produkte › Produkte | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F364 | Beiträge rechnen (Pilot): Rechner je Gesellschaft und Sparte freischalten | /admin/einstellungen/beitraege | Einstellungen › Angebot & Produkte › Beiträge rechnen (Pilot) | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F365 | Budgetänderungen automatisch bei Meta umsetzen | /admin/einstellungen/kampagnen-automatik | Einstellungen › Werbung › Automatik | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F366 | Gebuchte Produkte starten das Agenten-Team | /admin/einstellungen/kampagnen-automatik | Einstellungen › Werbung › Automatik | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F367 | Müde Anzeigen erkennen mit Schwellen (Frequenz, CTR, Leadpreis, Mindestausgabe) | /admin/einstellungen/kampagnen-automatik | Einstellungen › Werbung › Müde Anzeigen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F368 | Halteangebote je Kündigungsgrund an/aus mit Werten (10 Angebote inkl. Rückkehrangebot) | /admin/einstellungen/halteangebote | Einstellungen › Kunden › Halteangebote | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F369 | Regeln für Rabatte (Anzeige) | /admin/einstellungen/halteangebote | Einstellungen › Kunden › Halteangebote | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F370 | Neuigkeiten-Liste, neu anlegen | /admin/einstellungen/neuigkeiten | Betreuen › Nutzung & News › Neuigkeiten | in Bereich | Kundenkommunikation |
| F371 | Eintrag bearbeiten: Art, Zielgruppe, Push an Kunden, veröffentlichen oder Entwurf | /admin/einstellungen/neuigkeiten | Betreuen › Nutzung & News › Neuigkeit (Drawer) | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F372 | KI-Entwurf aus Notizen | /admin/einstellungen/neuigkeiten | Betreuen › Nutzung & News › Neuigkeit (Drawer) › KI-Entwurf | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F373 | Eintrag löschen | /admin/einstellungen/neuigkeiten | Betreuen › Nutzung & News › Neuigkeit (Drawer) › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F374 | Vorschau im Kundenbereich | /admin/einstellungen/neuigkeiten | Betreuen › Nutzung & News › Neuigkeit (Drawer) › Vorschau | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F375 | Gute Berichte automatisch senden | /admin/einstellungen/monatsberichte | Einstellungen › Kunden › Monatsberichte | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F376 | Einstufung gut/schwach, Ziel-Leadpreis, Absender/Signatur | /admin/einstellungen/monatsberichte | Einstellungen › Kunden › Monatsberichte | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F377 | Infokarten-Liste, neue Karte | /admin/einstellungen/login | Werkzeuge › Inhalte › Login-Seite | Werkzeuge | Einrichtung |
| F378 | Karte bearbeiten (Badge, Titel, Text, Link, Bild) | /admin/einstellungen/login | Werkzeuge › Inhalte › Login-Seite | Werkzeuge | Einrichtung |
| F379 | Karte an/aus | /admin/einstellungen/login | Werkzeuge › Inhalte › Login-Seite | Werkzeuge | Einrichtung |
| F380 | Reihenfolge der Karten ändern | /admin/einstellungen/login | Werkzeuge › Inhalte › Login-Seite | Werkzeuge | Einrichtung |
| F381 | Karte löschen | /admin/einstellungen/login | Werkzeuge › Inhalte › Login-Seite | Werkzeuge | Einrichtung |
| F382 | Statusmeldung veröffentlichen (Text, Stufe, Bereich) | /admin/einstellungen/status | Werkzeuge › Zustand › Statusmeldung | Werkzeuge | nur bei Störung |
| F383 | Meldung als behoben markieren | /admin/einstellungen/status | Werkzeuge › Zustand › Statusmeldung | Werkzeuge | nur bei Störung |
| F384 | Meldung löschen | /admin/einstellungen/status | Werkzeuge › Zustand › Statusmeldung | Werkzeuge | nur bei Störung |
| F385 | Zustand jetzt und Support-Kontakt (Anzeige), Statusseite öffnen | /admin/einstellungen/status | Werkzeuge › Zustand › Statusmeldung | Werkzeuge | nur bei Störung |
| F386 | Rechner: Produkte, Quoten, Kosten, Garantien, Texte, Kontakt-Link | /admin/einstellungen/rechner | Einstellungen › Angebot & Produkte › Rechner | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F387 | Programm aktiv, Hinweise an Kunden, Prämie (fest, Monate Bestand, Monatspreis), Vorteil für Neukunden | /admin/einstellungen/empfehlungen | Einstellungen › Marketing › Empfehlungsprogramm | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F388 | Meta-Business-ID und Erklärvideos je Schritt | /admin/einstellungen/einrichtung | Werkzeuge › Einrichtung › Kunden-Einrichtung | Werkzeuge | Einrichtung |
| F389 | Steuernummer für Rechnungen | /admin/einstellungen/rechnungsangaben | Einstellungen › Finanzen › Rechnungsangaben | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F390 | Stripe-Konto prüfen (Pflichtangaben, Testmodus) | /admin/einstellungen/rechnungsangaben | Werkzeuge › Diagnose › Stripe-Konto | Werkzeuge | Diagnose |
| F391 | Fußzeile bei bestehenden Kunden setzen (Probelauf, Anwenden) | /admin/einstellungen/rechnungsangaben | Werkzeuge › Stripe › Rechnungsfußzeile | Werkzeuge | einmalige Wartung |
| F392 | Finalisierte Rechnungen zählen | /admin/einstellungen/rechnungsangaben | Werkzeuge › Stripe › Rechnungen zählen | Werkzeuge | Diagnose |
| F393 | Laufende Kosten anlegen, ändern (Zweck, Zeitraum) | /admin/einstellungen/kosten | Geld › Kosten › Laufende Kosten | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F394 | Laufende Kosten löschen | /admin/einstellungen/kosten | Geld › Kosten › Laufende Kosten › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F395 | Annahmen für Kennzahlen: Stunden, Stundensatz, eigene Kampagnen, PPL-Pilot-Ende | /admin/einstellungen/kosten | Einstellungen › Finanzen › Annahmen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F396 | Bank verbinden | /admin/einstellungen/bank | Werkzeuge › Verbindungen › Bank | Werkzeuge | Einrichtung |
| F397 | Umsätze jetzt abrufen | /admin/einstellungen/bank | Geld › Kosten › Mehr › Umsätze abrufen | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F398 | Bank trennen | /admin/einstellungen/bank | Werkzeuge › Verbindungen › Bank | Werkzeuge | Einrichtung |
| F399 | CSV hochladen (Commerzbank, Amex, automatisch) | /admin/einstellungen/bank | Werkzeuge › Importe & Abgleich › Kontoauszug (CSV) | Werkzeuge | Import |
| F400 | Regel speichern | /admin/einstellungen/bank | Geld › Ausgabe (Drawer) › Immer so zuordnen; Einstellungen › Finanzen › Regeln | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F401 | Regel löschen | /admin/einstellungen/bank | Einstellungen › Finanzen › Regeln › Mehr | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F402 | Ausgabe zuordnen (Zweck, inkl. USt, immer so bei Muster) | /admin/einstellungen/bank | Geld › Überblick › Braucht Aufmerksamkeit › Ausgaben zuordnen | vorne | täglich gebraucht, sofort sichtbar |
| F403 | Zugeordnete Ausgaben ansehen | /admin/einstellungen/bank | Geld › Kosten | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F404 | Zwei-Faktor einrichten, bestätigen, abschalten | /admin/einstellungen/sicherheit | Einstellungen › Konto › Sicherheit | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F405 | Überall abmelden | /admin/einstellungen/sicherheit | Einstellungen › Konto › Sicherheit | in Bereich | gehört zur Rolle, ein Klick entfernt |
| F406 | Änderungsprotokoll ansehen | /admin/einstellungen/protokoll | Werkzeuge › Protokoll | Werkzeuge | Nachvollziehen, nicht Tagesgeschäft |
| F407 | Protokoll filtern nach Kunde und Art | /admin/einstellungen/protokoll | Werkzeuge › Protokoll › Filter | Werkzeuge | Technik oder Einrichtung |
| F408 | Diagnose OpenAI-Erreichbarkeit (nur Technik, keine Oberfläche) | /api/admin | Werkzeuge › Diagnose › KI-Dienst erreichbar | Werkzeuge | Diagnose |
| F409 | Diagnose Airtable-Felder (nur Technik, keine Oberfläche) | /api/admin | entfällt | entfernen vorgeschlagen | Airtable-Diagnose nach Abschaltung überholt |

## Entscheidungen Ole (17.11.)

- Calendly (F133): entfernen, nur noch eigene Buchungsseite.
- Waalaxy-Import (F137): entfernen.
- LinkedIn-Statistik als Excel (F310) und Zahlen nachtragen (F309): bleiben.
- Kontoauszug als CSV (F399): entfernen, Bankverbindung reicht.
- Fundtest Aufgabe 13: Leadpreis je Werbekonto fehlte. Jetzt in Liefern › Werbekonten als Spalte „Leadpreis 7 Tage“ gegen Ziel, teuerste zuerst, plus Hinweis in „Braucht Aufmerksamkeit“, sobald ein Konto mehr als 5 € über Ziel liegt.
- Neu (Ole 17.11.): Betreuen › Kampagnen. Alle Kunden und Kampagnen auf einen Blick, Filter nach Produkt (PKV, Privatschutz, Katze, alle), Umschalter je Kampagne oder je Kunde, 30 oder 90 Tage. Spalten: Ausgaben, Leads, Leadpreis (Farbe gegen Mittelwert des Produkts), Termine mit Quote, Abschlüsse, Umsatz Vermittler, Umsatz je 1 € Werbung. Oben: beste Kampagne je Produkt als Vorlage, Kampagnen mit über 400 € Ausgaben ohne Abschluss. Kundenakte › Leads & Kampagne zeigt dieselben Zahlen für einen Kunden.
