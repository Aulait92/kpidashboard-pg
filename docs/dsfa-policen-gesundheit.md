# Muster-Datenschutz-Folgenabschätzung (Art. 35 DSGVO): WhatsApp-Assistent mit Unterlagen vom Kunden

Stand: 17.11.2026 · Fassung 1 (Entwurf) · erstellt von Ole Kannapinn UG (haftungsbeschränkt) als Auftragsverarbeiter zur
Unterstützung seiner Kunden (Art. 28 Abs. 3 lit. f DSGVO). **Keine Rechtsberatung.** Grundlage:
`docs/recht-gesundheitsunterlagen.md` (Rechtsprüfung), `docs/datenschutz-policen.md` (Ablauf, Texte, TOM).

**Für wen:** Versicherungsvermittler (Makler, Vertreter), die den WhatsApp-Assistenten nutzen. Verantwortlich für die
DSFA ist der Vermittler selbst. Für gleichartige Verarbeitungen genügt eine gemeinsame DSFA (Art. 35 Abs. 1 Satz 2,
ErwG 92): Sie können dieses Muster übernehmen, die markierten Stellen **[ergänzen]** ausfüllen, Ihre eigene Bewertung
dokumentieren und unterschreiben. Struktur nach DSK-Kurzpapier Nr. 5 und Art. 35 Abs. 7 DSGVO.

---

## 0. Angaben zum Verantwortlichen

| | |
|---|---|
| Verantwortlicher | **[Name, Firma, Anschrift]** |
| Status | **[Makler / Ausschließlichkeitsvertreter / Mehrfachvertreter]** |
| Datenschutzbeauftragter | **[Name, Kontakt]** bzw. „nicht benannt (§ 38 BDSG nicht erfüllt)“ |
| Beteiligte | Inhaber, zuständige Berater mit Zugriff auf Leads; Auftragsverarbeiter siehe 1.5 |
| Zeitpunkt | vor dem Einschalten der Funktion „Unterlagen mit Gesundheitsbezug“ (`POLICEN_GESUNDHEIT_AN`) |

## 1. Systematische Beschreibung der Verarbeitung (Art. 35 Abs. 7 lit. a)

### 1.1 Warum eine DSFA nötig ist

- **DSK-Muss-Liste Nr. 11** (Version 1.1 vom 17.10.2018): „Einsatz von künstlicher Intelligenz zur Verarbeitung
  personenbezogener Daten zur Steuerung der Interaktion mit den Betroffenen“. Der WhatsApp-Assistent ist ein solches
  System, schon ohne Gesundheitsdaten.
- Zusätzliche Kriterien nach WP 248 rev.01: besondere Kategorien (Art. 9, Gesundheitsdaten in Policen der Kranken-,
  BU-, Lebens-, Pflege- und Unfallversicherung), Berufsgeheimnis (§ 203 Abs. 1 Nr. 7 StGB jedenfalls für Vertreter),
  neue Technologie (KI), Übermittlung in Drittländer (USA). Ab zwei Kriterien in der Regel DSFA.

### 1.2 Zwecke

1. Leads (Interessenten) über WhatsApp erreichen, Bedarf klären, Termin vereinbaren (KI-Assistent, als KI erkennbar).
2. Vorbereitung des Beratungstermins mit den bestehenden Policen, die der Lead freiwillig als Foto oder PDF schickt.
3. Nachweis der Einwilligung, Löschung nach Frist, Widerruf.

Nicht Zweck: Risikoprüfung, Tarifempfehlung, Annahmeentscheidung, Weitergabe an Versicherer oder Vergleichsrechner,
Werbung oder Auswertungen mit den Unterlagen.

### 1.3 Betroffene und Daten

| Betroffene | Daten |
|---|---|
| Leads | Name, WhatsApp-Nummer, Chatverlauf, Angaben zum Bedarf, Termin; Unterlagen (Versicherer, Sparte, Beitrag, Laufzeit, Vertragsnummer, Anschrift, Geburtsdatum, Bankverbindung); bei Personenversicherungen mögliche Gesundheitsangaben (Vorerkrankungen, Zuschläge, Ausschlüsse); Einwilligungsprotokoll |
| Mitversicherte (Partner, Kinder) | wie oben, soweit in den Unterlagen genannt, auch Gesundheitsangaben |
| Berater (Nutzer) | Login, Zugriffe auf Unterlagen mit Gesundheitsbezug (Protokoll) |

### 1.4 Ablauf (Datenfluss)

1. Der Lead nennt im Chat bestehende Verträge. Nennt er eine Gesundheitssparte, enthält die Einladung des Assistenten
   die ausdrückliche Einwilligung mit den Knöpfen [Ja, einverstanden] [Lieber im Termin] und einem Link zur Langfassung.
2. Schickt der Lead eine Datei **ohne** Einwilligung und ist ein Gesundheitsbezug möglich (laut Dateiname, Begleittext
   oder Angaben des Leads; unbekannt gilt als möglich), wird der Inhalt nicht geladen und nicht an die KI gegeben. Nur
   der Verweis (WhatsApp-Media-ID) bleibt höchstens 24 Stunden; der Assistent fragt einmal erneut nach der Einwilligung.
3. **Nach** der Einwilligung: Datei laden (360dialog), Typ prüfen, verschlüsselt speichern (AES-256-GCM, Schlüssel
   außerhalb der Datenbank, Hosting in der EU). KI-Zuordnung (nur Sparte, „Gesundheitsbezug ja/nein“) bei möglichem
   Gesundheitsbezug nur über einen Dienst in der EU, sonst gar nicht. Gesundheitsunterlagen werden nie ausgelesen.
4. Sachversicherungen: Auslesen festgelegter Vertragsfelder (ohne Namen, Nummern, Bankdaten).
5. Anzeige nur für den Inhaber und den zuständigen Berater; Ansehen von Gesundheitsunterlagen wird protokolliert.
6. Löschung: ohne Abschluss 30 Tage nach dem letzten Termin; mit Abschluss 90 Tage nach dem Abschluss mit Erinnerung
   14 Tage vorher („In die Kundenakte übernehmen“), außer der Berater kennzeichnet eine Unterlage als
   Beratungsdokumentation (mit Vermerk und Zeitpunkt). Widerruf (Chat, sinngemäß erkannt, oder Knopf im Kontakt):
   sofort alles gelöscht.

### 1.5 Empfänger und Auftragsverarbeiter

| Empfänger | Aufgabe | Ort / Grundlage |
|---|---|---|
| Ole Kannapinn UG (haftungsbeschränkt), Berlin | Betrieb der Software | EU; AVV mit § 203-Klausel |
| Railway | Hosting, Datenbank | Rechenzentrum EU (Amsterdam); Unternehmen USA, DPF/SCC |
| 360dialog GmbH, Berlin | WhatsApp Business API | EU |
| Meta Platforms Ireland | WhatsApp-Transport, Speicherung bis 30 Tage | EU/USA, DPF/SCC |
| Anthropic (Ireland Ltd. / PBC) | KI-Assistent im Chat; Zuordnung und Auslesen von Sachversicherungen | USA, DPF/SCC, kein Training, Speicherung bis 30 Tage |
| EU-Endpunkt für die KI (z. B. AWS Bedrock Frankfurt) | Zuordnung von Unterlagen mit möglichem Gesundheitsbezug | EU **[falls eingerichtet; sonst keine KI für diese Unterlagen]** |

Versicherer erhalten nichts aus dieser Verarbeitung.

### 1.6 Rechtsgrundlagen

- Chat und Terminvereinbarung: Art. 6 Abs. 1 lit. b (vorvertraglich) bzw. lit. a (Einwilligung im Leadformular).
- Unterlagen: Art. 6 Abs. 1 lit. a und lit. b; bei Gesundheitsangaben zusätzlich Art. 9 Abs. 2 lit. a (ausdrückliche
  Einwilligung). Aufbewahrung nach Abschluss nur für Beratungsrelevantes: Art. 9 Abs. 2 lit. f, § 61 VVG.
- § 203 StGB: Offenbarung an Dienstleister nach § 203 Abs. 3 Satz 2, Verpflichtung zur Geheimhaltung nach Abs. 4.

## 2. Notwendigkeit und Verhältnismäßigkeit (Art. 35 Abs. 7 lit. b)

| Grundsatz | Umsetzung |
|---|---|
| Zweckbindung | Nur Terminvorbereitung; KI darf Unterlagen nur zuordnen bzw. Sachversicherungen auslesen; keine Empfehlungen, Annahmechancen, Zuschläge |
| Datenminimierung | Einwilligung vor dem Laden; ohne Einwilligung nur Verweis für 24 Stunden; KI erhält keinen Dateinamen und keine Kontaktdaten; Gesundheitsangaben aus dem Chat werden vor der KI ausgeblendet und nicht in Notizen übernommen |
| Freiwilligkeit | Unterlagen sind freiwillig, „Lieber im Termin“ gleichwertig; kein Nachteil bei Ablehnung |
| Transparenz | Kurztext im Chat (Verantwortlicher, Zweck, Gesundheitsangaben, KI, USA, Mitversicherte, Löschung, Widerruf) plus Langfassung je Vermittler; Assistent als KI gekennzeichnet (Art. 50 KI-VO) |
| Speicherbegrenzung | 30 bzw. 90 Tage automatisch, Erinnerung, Widerruf sofort, Löschung mit dem Lead (Art. 17) und bei Vertragsende |
| Richtigkeit | Unterlagen unverändert; ausgelesene Felder nur als Hilfe, Kennzeichnung „Gesundheitsangaben möglich“ im Zweifel |
| Betroffenenrechte | Auskunft und Löschung über den Vermittler; Widerruf formfrei, auch sinngemäß im Chat erkannt |
| Alternativen geprüft | Klassifikation vor der Einwilligung verworfen (keine Rechtsgrundlage nach Art. 9); Unterlagen nur im Termin bleibt als Wahl für den Lead |

## 3. Risiken für die Rechte und Freiheiten (Art. 35 Abs. 7 lit. c)

Bewertung nach Eintrittswahrscheinlichkeit (gering / mittel / hoch) und Schwere (gering / mittel / hoch) **nach**
Maßnahmen. **[Eigene Bewertung prüfen und ggf. anpassen.]**

| Nr. | Risiko | Quelle | Wahrscheinlichkeit | Schwere | Restrisiko |
|---|---|---|---|---|---|
| R1 | Unbefugter Zugriff auf Gesundheitsunterlagen (Datenleck, falscher Login) | Angreifer, Fehlbedienung | gering | hoch | mittel |
| R2 | Verarbeitung ohne wirksame Einwilligung (Lead schickt vor der Einwilligung, Einwilligung nicht nachweisbar) | Ablauf | gering | hoch | gering |
| R3 | Unterlagen Dritter (Partner, Kinder) ohne deren Wissen | Lead | mittel | mittel | mittel |
| R4 | Zugriff durch Behörden im Drittland (USA) bzw. Wegfall des DPF | Dienstleister | gering | hoch | mittel |
| R5 | Speicherung bei Meta bis 30 Tage außerhalb der Kontrolle des Vermittlers | Transport | hoch | gering | mittel |
| R6 | KI zieht Schlüsse aus Gesundheitsangaben oder übernimmt sie in Notizen | KI | gering | mittel | gering |
| R7 | Falsche Zuordnung (Gesundheitsunterlage als Sach eingestuft und ausgelesen) | KI, Dateiname | gering | mittel | gering |
| R8 | Zu lange Speicherung nach Abschluss | Vermittler | mittel | mittel | gering |
| R9 | Widerruf wird nicht erkannt oder nicht umgesetzt | Chat, Telefon, E-Mail | gering | mittel | gering |
| R10 | Verletzung des Berufsgeheimnisses (§ 203 StGB) durch Dienstleister | Dienstleister | gering | hoch | gering |
| R11 | Diskriminierung oder Entscheidungen zulasten des Leads | KI | sehr gering | hoch | gering (keine Entscheidungen durch die KI, Art. 22) |

## 4. Abhilfemaßnahmen (Art. 35 Abs. 7 lit. d)

| Risiko | Maßnahmen |
|---|---|
| R1 | Verschlüsselung je Datei (AES-256-GCM), Schlüssel außerhalb der Datenbank; Zugriff nur Inhaber und zuständiger Berater; Admin und Support sehen weder Inhalt noch Dateinamen gesundheitsbezogener Unterlagen; Ansehen protokolliert; kein öffentlicher Link, `no-store`; Zwei-Faktor-Anmeldung **[für alle Berater aktivieren]** |
| R2 | Einwilligung vor dem Senden in der Einladung; ohne Einwilligung kein Laden und keine KI, Verweis höchstens 24 Stunden, höchstens eine erneute Frage; Protokoll mit Wortlaut, Version, Zeitpunkt, Nummer, Lead, ID der Knopf-Antwort |
| R3 | Hinweis im Einwilligungstext (nur mit Einverständnis, bei Kindern als Elternteil); Information der Mitversicherten im Termin (Art. 14) **[im Beratungsablauf festhalten]** |
| R4 | Unterlagen mit möglichem Gesundheitsbezug nur über eine EU-Region an die KI oder gar nicht; DPF-Teilnahme der Anbieter prüfen und ablegen; Standardvertragsklauseln als Rückfall; Hinweis im Einwilligungstext |
| R5 | Unvermeidbarer Transport; Hinweis in der Langfassung; Prüfung „Local Storage“ bei 360dialog/Meta **[offen]** |
| R6 | Gesundheitsangaben aus dem Chat vor der KI ausgeblendet; Regel im System-Prompt; Filter für alle Angaben, die der Assistent festhält; Gesundheitsunterlagen nie ausgelesen |
| R7 | Im Zweifel „Gesundheitsbezug möglich“; Dateiname und Angaben des Leads können den Gesundheitsbezug nur ergänzen, nie aufheben; Auslesen nur bei klarer Sachversicherung |
| R8 | 90 Tage nach Abschluss automatisch gelöscht, Erinnerung 14 Tage vorher; Behalten nur mit Vermerk und Zeitpunkt; regelmäßige Prüfung der behaltenen Unterlagen **[Turnus festlegen, z. B. jährlich]** |
| R9 | Widerruf per Stichwort, nach Regeln und sinngemäß per KI erkannt; sofortige Löschung, Bestätigung an den Lead, Benachrichtigung des Beraters; Knopf „Einwilligung widerrufen / Unterlagen löschen“ für Widerrufe auf anderem Weg |
| R10 | § 203-Klausel im AVV, Verpflichtung der Mitarbeiter (`docs/vorlage-verpflichtung-203-stgb.md`), Vertraulichkeitsklauseln der Unterauftragsverarbeiter; Einwilligung nennt Dienstleister |
| R11 | Die KI ordnet nur zu; Beratung und Entscheidungen trifft der Berater im Termin |

Schalter: Die Verarbeitung von Unterlagen mit Gesundheitsbezug ist standardmäßig aus und wird erst nach Abschluss dieser
DSFA, der Prüfung durch einen Anwalt und Ihrer Freigabe eingeschaltet.

## 5. Stellungnahmen

- Datenschutzbeauftragter (Art. 35 Abs. 2): **[Stellungnahme, Datum]**
- Standpunkt der Betroffenen (Art. 35 Abs. 9), soweit angemessen: **[z. B. Rückmeldungen von Kunden, Beschwerden]**
- Versicherer (nur Ausschließlichkeitsvertreter, falls der Agenturvertrag die Nutzung externer Tools für
  Gesundheitsdaten regelt): **[Zustimmung ja/nein, Datum]**

## 6. Ergebnis und Freigabe

- Restrisiko nach Maßnahmen: **[gering / mittel]**. Ist es hoch und nicht weiter zu senken, ist vor Beginn die
  Aufsichtsbehörde zu konsultieren (Art. 36).
- Entscheidung: **[Freigabe / Freigabe mit Auflagen / keine Freigabe]**
- Ort, Datum, Unterschrift des Verantwortlichen: **[ ]**

## 7. Überprüfung

Überprüfen bei wesentlichen Änderungen (neue Sparten, anderer KI-Anbieter, Wegfall des DPF, neue Funktionen), sonst
mindestens jährlich (Art. 35 Abs. 11). Änderungen am Ablauf kündigen wir in den Neuigkeiten der App an.

## Anhang: Quellen

DSGVO Art. 4, 6, 7, 9, 13, 14, 17, 22, 28, 35, 36; § 203 StGB; § 61 VVG; DSK-Muss-Liste Version 1.1 (17.10.2018);
DSK-Kurzpapier Nr. 5 (Datenschutz-Folgenabschätzung); Art.-29-Gruppe WP 248 rev.01; EDPB Leitlinien 05/2020 zur
Einwilligung; EuGH C-21/23, C-252/21; BGH VIII ZR 53/09. Einzelnachweise: `docs/recht-gesundheitsunterlagen.md`, Abschnitt d.
