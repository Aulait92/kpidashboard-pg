# Merkliste (Ole)

Dinge, die Ole später angehen will. Neue Sitzungen bitte hier nachsehen und Ole daran erinnern.

- 18.11.2026: **Erledigt (Ole):** Microsoft-Herausgeberverifizierung (MPN-ID 7196909, Ole Kannapinn UG verifiziert),
  Calendly abgelöst (eigene Buchungsseite /termin), Support-WhatsApp +49 15679 811535 über 360dialog live,
  YouTube-Kanal eingerichtet. Offen: Apple-Fall 30000012681661 (seit 11.11. ohne Antwort, nachfassen).

- 15.11.2026: **Bestandskunden-Modul vorerst für Kunden aus** (Ole testet es ausführlich). Schalter
  `BESTAND_MODULE_AVAILABLE` in src/lib/bestand/sichtbar.ts; je Kunde sichtbar über Admin → Kunde → Abrechnung
  („Für diesen Kunden einblenden“, Feld bestandSichtbar). Kunden mit aktivem Modul behalten es. Wieder an: true setzen,
  dann Webseite (docs/webseite-offen.md), PPTX/PDF-Folien und Kollegen-Prämie „Modul gratis“ prüfen.

- 16.11.2026: **End-to-End-Test WhatsApp mit Testlead** (Ole). Testkunde „Ole Agentur“ (Nummer +1 501 430 4325 ist
  verbunden): Assistent einschalten (Admin → WhatsApp → Einstellungen), Vorlagen-Freigabe prüfen, Testlead mit Oles
  Handynummer einspielen, Ole testet den Chat bis zur Terminbuchung (Erstnachricht mit Knöpfen, Erstinformation als PDF,
  Fragen, Termin, Bestätigung).

- 15.11.2026: **Modul „Empfehlungen & Bewertungen“ vorerst aus** (Ole). Schalter `EMPFEHLUNG_MODULE_AVAILABLE` in
  src/lib/empfehlung/shared.ts. Wieder an, wenn die kritischen Teile fertig sind (u. a. Bewertungs-Wächter:
  Google-Freigabe, docs/google-bewertungs-waechter.md). Präsentationsfolie „Empfehlungen & Bewertungen (59 €)“ prüfen.


- 15.11.2026: **Google-Prüfung bestanden** (Projekt performancegrowth-sheets): `calendar.events` und `gmail.send` sind
  freigegeben, `calendar.freebusy` ist laut Console nicht sensibel. `GOOGLE_MAIL_VERIFIED=1` ist in der Produktion gesetzt
  (Gmail-Knopf im Postfach und in der Einrichtung). Kunden sehen keine Warnung „nicht bestätigte App“ mehr.
  Achtung: Jede Änderung am OAuth-Zustimmungsbildschirm oder ein neuer Bereich (z. B. `business.manage` für den
  Google-Bewertungs-Wächter, docs/google-bewertungs-waechter.md) braucht eine neue Prüfung. Solche Änderungen
  bündeln und erst dann einreichen.

- 15.11.2026: **Rückmeldung an Meta (Conversions API für CRM) einrichten.** Die App sendet je Kunde automatisch
  (lib/capi, alle 15 Minuten) an das erste Dataset des Werbekontos. In Meta je Kunde: 1. Partnerzugriff auf das
  Dataset (Pixel) für unseren Business Manager und den Systemnutzer (sonst Fehler „kein Zugriff“, Admin → Kunde →
  Leads → Rückmeldung an Meta); 2. im Events Manager das CRM-Dataset mit der Facebook-Seite der Lead-Formulare
  verbinden; 3. CRM-Stufen zuordnen (Lead, Erreicht, Termin vereinbart, Abschluss); 4. sobald der Vorschlag
  „Kampagne auf Conversion Leads umstellen“ in der Optimierung kommt, Lead-Kampagne mit Leistungsziel
  „Conversion Leads“ und der vorgeschlagenen Stufe anlegen bzw. umstellen. Offen: automatische Umstellung im
  Autopilot (bewusst nicht gebaut, nur Vorschlag), Anwalt (docs/datenschutz.md, Offene Punkte), Datenschutzerklärung.


- 16.11. abends (nach 20 Uhr): Erklärvideos gegen die Änderungen vom 15./16.11. prüfen und bei Bedarf neu aufnehmen
  (Neuigkeiten-Karte weg, Leitfaden und Diktieren weg, Bestandskunden-Modul aus, neue Terminvorbereitung, Kein-WhatsApp-Kennzeichen).
  `python3 tools/erklaervideos/betroffen.py` zeigt Kurz, Ausführlich und WhatsApp verbinden als betroffen.

- 16.11. abends: Kombi-Rabatt (Bündelrabatt) in Terminvorbereitung und Präsentation (Ole). Allianz PrivatSchutz:
  2+ Produkte Linie Komfort/Premium, 3 Jahre, 5 bis 20 % Staffel nach Anzahl (Beispiel 3 Produkte = 10 %). Rabatt automatisch
  berechnen, Hinweis „Mit Unfall: 15 %“ bzw. „Basis verhindert den Rabatt“, Beitragsfolie mit Einzelsumme, Rabatt (% und €),
  Endbeitrag, Staffel-Leiste, Bedingung als Fußnote; Live-Demo ergänzen. Keine neue Karte. Daten: data/tarifkatalog/<ges>/buendel.json.

- 16.11. ab 20 Uhr: Einführungsvideos „Kurz“ und „Ausführlich“ noch einmal neu aufnehmen, nach Abschluss der
  Usability-Runden. Die Aufnahme vom 16.11. früh (9814bd1, b788b6d) zeigt noch die alte Terminvorbereitung
  („Angebote hochladen“), die Knöpfe vor der Usability-Runde 1 und „Guten Abend“ (nachts aufgenommen).
  Ausführlich ist mit 3:50 länger als der Ton (3:20): Pausen bei „Angaben und Notizen“ und „Werbebudget“ kürzen.

- Später (Ole, 16.11.): Terminvorbereitung „+ Versicherung“ um weitere Produkte erweitern. Kandidaten: Unfall
  (auch Kinderunfall), Kfz, Fahrrad/E-Bike, Reise, Glas, Photovoltaik, Pferdehalterhaftpflicht, Pferde-OP,
  Haus- und Grundbesitzerhaftpflicht, Bauherrenhaftpflicht, Gewerbe/Betriebshaftpflicht. Gesundheitssparten
  (Kranken, Zahn, BU, Leben, Pflege) nur zur Handeingabe, nicht über „Angebot auslesen“ (Art. 9 DSGVO, Rechtsvorprüfung
  16.11. Punkt 3). Bei vielen Einträgen die Liste nach Tiere, Wohnen und Haftpflicht gruppieren, mit Suchfeld.
  Für jede neue Sparte Merkmale/Bausteine im Tarifkatalog-Schema und Tarifdaten der Gesellschaften (data/tarifkatalog).

- Später (Ole, 16.11.): Beiträge automatisch rechnen über eine echte Schnittstelle statt Screenshot. Bis dahin reicht
  „Beiträge rechnen“ (offizieller Rechner + Angaben zum Kopieren + „Angebot ablegen“ per Screenshot, „bitte prüfen“).
  Automatisches Auslesen der Allianz-Rechner ist ausgeschlossen (Nutzungsbedingungen allianz.de, Schutzmaßnahmen).
  Wege laut Recherche 16.11.:
  1. Mr-Money API (versicherungsmaklersoftware.de): Sach + Tierkranken Hund/Katze/Pferd, öffentliche Testzugänge,
     Hersteller-ID für Softwarefirmen. Klären: Allianz je Sparte, Zugang für Ausschließlichkeitsvertreter, Preis
     (Vertrieb 089 613991-01).
  2. softfair API (REST, Sandbox): Sach ohne Tierkranken, 1.000 € Einrichtung + ab 1.000 €/Monat + je Berechnung
     (vertrieb@softfair.de, Benjamin Strixner).
  3. Allianz direkt: BiPRO-Webservices, Testzugang für Softwarefirmen (Nutzungsbedingungen Onlinedienste Ziff. 4.4),
     über den Vertriebsverantwortlichen eines Allianz-Kunden anfragen; ob Tarifierung Sach/Tier dabei ist, offen.
  Allianz-Tarife in Vergleichern nur WG/Hausrat/PHV belegt und nur mit Allianz-Maklerberechtigung.
