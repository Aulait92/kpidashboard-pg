# Policen vor dem Termin per WhatsApp: Datenschutz (Entwurf)

Stand: 17.11.2026 (Ole). **Entwurf, nicht live geschaltet.** Die Texte in Abschnitt 2 bis 4 gehen erst nach Prüfung durch
den Anwalt in die Rechtstexte (`/rechtliches/avv`, Datenschutzhinweise, `docs/datenschutz.md`). Der Teil mit
Gesundheitsbezug ist hinter dem Schalter `POLICEN_GESUNDHEIT_AN` (Railway-Variable, Standard aus).

## 1. Was die App macht

Aktualisiert 17.11.2026 nach der Rechtsprüfung (`docs/recht-gesundheitsunterlagen.md`, Abschnitt b). Muster-DSFA:
`docs/dsfa-policen-gesundheit.md`.

- **Zweck:** Leads können vor dem Termin Fotos oder PDFs ihrer bestehenden Policen in den WhatsApp-Chat schicken, damit
  sich der Vermittler vorbereiten kann (Komplettcheck). Freiwillig; ohne Unterlagen wird im Termin gemeinsam geschaut.
- **Eingang:** Nur in Chats mit zugeordnetem Lead. Private Chats aus der WhatsApp-Business-App und das Support-Postfach
  werden nicht geladen. Erlaubt: PDF, JPG, PNG, WebP bis 10 MB (Typ am Inhalt geprüft), höchstens 30 je Lead. HEIC,
  Word usw.: nicht gespeichert, Bitte um Foto oder PDF.
- **Sachversicherungen** (Haftpflicht, Hausrat, Wohngebäude, Kfz, Rechtsschutz, Tier): verschlüsselt gespeichert, kurz
  bestätigt („Danke, ist angekommen.“), Zuordnung und Auslesen per KI (Gesellschaft, Sparte, Beitrag, Zahlweise,
  Versicherungssumme, Selbstbeteiligung, Ablauf/Hauptfälligkeit; keine Namen, Nummern, Bankdaten, Gesundheitsangaben).

### Schalter `POLICEN_GESUNDHEIT_AN` aus (Stand heute, unverändert)

- Einladung nach der Vertragsfrage nur für Sachversicherungen; bei Leads zu Gesundheitsprodukten (PKV, Zahn, BU) gar keine.
- Jede Datei wird geladen und von der KI zugeordnet (nur Sparte und „Gesundheitsbezug möglich ja/nein“). Gesundheitsbezug:
  Datei verworfen, freundlicher Hinweis, dass sie im Termin angeschaut wird.

### Schalter an (Umsetzung nach Abschnitt b, erst nach DSFA und Anwalt einschalten)

- **Einwilligung vor dem Senden:** Nennt der Lead eine Gesundheitssparte (Vertragsliste) oder hat das Produkt
  Gesundheitsbezug, enthält schon die Einladung die ausdrückliche Einwilligung (Wortlaut Abschnitt 2) mit den Knöpfen
  [Ja, einverstanden] [Lieber im Termin] (`lib/policen/assistent.ts`). Sonst die normale Einladung.
- **Datei ohne Einwilligung:** Einordnung nur nach Dateiname, Begleittext und Angaben des Leads (`vorabEinordnung`).
  Gesundheitsbezug möglich (auch: unbekannt, z. B. „IMG_1234.jpg“, außer der Lead hat nur Sachversicherungen genannt):
  Inhalt **nicht geladen, keine KI**, nur die WhatsApp-Media-ID höchstens 24 Stunden gemerkt, Einwilligungsfrage
  (zweite Fassung „Danke für Ihre Unterlage …“). Höchstens zwei Fragen je Chat (Einladung bzw. erste Frage und einmal
  erneut), danach wird verworfen mit Hinweis. „Lieber im Termin“: Media-IDs gelöscht. Keine Antwort: nach 24 Stunden
  gelöscht (`prunePolicen`). Vermittler hat übernommen (Assistent aus): keine Rückfrage, verworfen.
  Klar Sachversicherung laut Dateiname bzw. Angaben: wie bisher geladen und zugeordnet; meldet die KI dann doch
  Gesundheitsbezug, wird der Inhalt verworfen und nach der Einwilligung gefragt.
- **Nach der Einwilligung:** Protokoll mit Wortlaut der beantworteten Frage, Version (`EINWILLIGUNG_VERSION`),
  Zeitpunkt, WhatsApp-Nummer, Lead und ID der Knopf-Antwort (`BestandConsentLog.leadId`, `version`, `waMessageId`).
  Dateien mit möglichem Gesundheitsbezug werden erst jetzt geladen. KI-Zuordnung nur über einen EU-Endpunkt
  (`POLICEN_KI_REGION=eu`, `POLICEN_KI_EU_URL`, `POLICEN_KI_EU_KEY`, optional `POLICEN_KI_EU_MODEL`; Anthropic-kompatible
  Messages-API, z. B. Claude über AWS Bedrock Frankfurt hinter einem Gateway). Ohne EU-Endpunkt: **keine KI**, Sparte nur
  laut Dateiname bzw. Angaben des Leads, Kennzeichen „Gesundheitsangaben möglich“. Gesundheitsunterlagen werden nie
  ausgelesen, nur dem Vermittler gezeigt.
- **Gesundheitsangaben im Chat:** gehen ausgeblendet an die KI (`redactHealthText`); was der Assistent festhält
  (`record_qualification`: Felder, Zusammenfassung, Protokoll), wird zusätzlich gefiltert (`angabenOhneGesundheit`,
  `ohneGesundheitsangaben`). Die Vertragsliste speichert nur Sparte, Gesellschaft und Person.
- **Widerruf:** im Chat nach Regeln („Widerruf“, „Unterlagen löschen“, „Einwilligung zurück“, „nicht mehr
  einverstanden“ …) und sinngemäß per KI (nur bei Verdacht, nur die eine Nachricht, Gesundheitsangaben ausgeblendet;
  ohne KI gilt die Regel). Sofort alles gelöscht (Dateien, Auszüge, Media-IDs), bestätigt, protokolliert, Vermittler
  per Push benachrichtigt. Im Kontakt: „Einwilligung widerrufen / Unterlagen löschen“ für Widerrufe, die den Vermittler
  anders erreichen.

### Löschung (für alle Unterlagen, auch bei Schalter aus)

- Ohne Abschluss: 30 Tage nach dem letzten Termin (ohne Termin: nach dem Eingang).
- Mit Abschluss: 90 Tage nach dem Abschluss (frühestens nach dem Eingang). 14 Tage vorher Erinnerung an den Vermittler
  (Push und Verlauf: „In die Kundenakte übernehmen“); kommt die Erinnerung später, bleiben ihm trotzdem 14 Tage.
- „Als Beratungsdokumentation behalten“ (Kontakt → Dokumente, nur bei Abschluss): keine automatische Löschung, mit Vermerk
  („Beratungsdokumentation (§ 61 VVG)“), Zeitpunkt und Login; aufhebbar. Bleibt bis zur Löschung durch den Vermittler,
  zum Widerruf (Standard: alles löschen), Art. 17 (`eraseLead`) bzw. Vertragsende (`eraseCustomerData`).

## 2. Einwilligungstext (Art. 9 Abs. 2 lit. a DSGVO)

Wortlaut aus `lib/policen/regeln.ts einwilligungText` (Version `2026-11-17.2`), so gesendet und protokolliert.
`{Berater}` = Vermittler in der Ansprache des Assistenten, `{Firma}` = Firma laut Anbieterangaben (entfällt, wenn
gleich dem Namen), `{Link}` = `/datenschutz/policen?k=<Token der Erstinformation>` (Langfassung, Abschnitt 3a).

> **Sie (Einladung):** Vor dem Termin können Sie uns Fotos oder PDFs Ihrer bisherigen Versicherungen hier schicken.
> Unterlagen zur Kranken-, Berufsunfähigkeits-, Lebens-, Pflege- oder Unfallversicherung können Angaben zu Ihrer
> Gesundheit enthalten.
>
> Sind Sie einverstanden, dass {Berater} ({Firma}) Ihre Unterlagen einschließlich dieser Gesundheitsangaben speichert
> und zur Vorbereitung Ihres Termins nutzt? Eine KI ordnet jede Unterlage einer Versicherungsart zu, Gesundheitsangaben
> werden nicht ausgewertet. Dafür setzen wir Dienstleister ein, auch in den USA. Sehen kann die Unterlagen nur Ihr Berater.
>
> Unterlagen von mitversicherten Personen schicken Sie bitte nur mit deren Einverständnis (bei Kindern als Elternteil).
> Ohne Vertragsabschluss löschen wir alles 30 Tage nach dem Termin. Sie können jederzeit widerrufen, zum Beispiel mit
> der Nachricht „Widerruf“.
>
> Mehr dazu: {Link}
>
> Knöpfe: [Ja, einverstanden] [Lieber im Termin]

Nach einer Datei beginnt der Text mit „Danke für Ihre Unterlage. Unterlagen zur Kranken-, … können Angaben zu Ihrer
Gesundheit enthalten.“, der Rest ist gleich. Du-Fassung entsprechend („Bist du einverstanden, dass {Berater} …“).
Höchstens 1.024 Zeichen (Test). Protokoll: `BestandConsentLog` (Kanal `whatsapp`, Aktion `erteilt` bzw. `widerrufen`,
Quelle `policen_gesundheit`, Wortlaut, Version, Nummer, Lead, Knopf-Antwort, Zeitpunkt); die Unterlage verweist auf den
Eintrag (`LeadDocument.consentId`, `consentAt`). Änderungsprotokoll: `policen.einwilligung`,
`policen.einwilligung_abgelehnt`, `policen.widerruf`, `policen.verworfen`, `policen.ansehen`, `policen.behalten`
(ohne Inhalte).

## 3. Datenschutzhinweise

### 3a. Langfassung zur Einwilligung (öffentliche Seite)

`/datenschutz/policen?k=<Token>` (`app/datenschutz/policen/page.tsx`, Texte `lib/policen/datenschutz-text.ts`), je
Vermittler mit seinen Anbieterangaben, in der Ansprache des Vermittlers, nicht indexiert. Verlinkt nur im
Einwilligungstext, also erst mit Schalter an. Inhalt: Verantwortlicher, Zweck, Datenarten, Rechtsgrundlagen, was mit den
Unterlagen passiert (KI nur Zuordnung), Empfänger, USA (DPF/SCC), Speicherdauer, Widerruf, Mitversicherte, Rechte.

### 3b. Ergänzung der Datenschutzhinweise (Entwurf, nicht live verlinken, solange der Schalter aus ist)

Für die Datenschutzhinweise des Vermittlers (Buchungsseite, Rückfall performancegrowth.de/datenschutz), Sie-Form, ohne
Gedankenstriche. Erst nach Freigabe durch den Anwalt übernehmen:

> **Unterlagen, die Sie uns per WhatsApp schicken**
>
> Wenn Sie möchten, können Sie uns vor dem Termin Fotos oder PDFs Ihrer bestehenden Versicherungsverträge per WhatsApp
> schicken. Wir nutzen sie, um Ihren Termin vorzubereiten. Unterlagen zur Kranken-, Berufsunfähigkeits-, Lebens-,
> Pflege- oder Unfallversicherung können Angaben zu Ihrer Gesundheit enthalten; wir fragen deshalb vorher ausdrücklich
> nach Ihrer Einwilligung (Art. 6 Abs. 1 lit. a und Art. 9 Abs. 2 lit. a DSGVO), für Sachversicherungen zusätzlich
> Art. 6 Abs. 1 lit. b DSGVO (vorvertragliche Maßnahmen auf Ihre Anfrage). Schicken Sie eine solche Unterlage vor der
> Einwilligung, laden wir sie nicht; der Verweis darauf wird nach spätestens 24 Stunden gelöscht.
>
> Die Unterlagen werden verschlüsselt in der EU gespeichert und sind nur für Ihren Berater sichtbar. Eine Software mit
> künstlicher Intelligenz ordnet jede Unterlage einer Versicherungsart zu (Unterlagen mit möglichen Gesundheitsangaben
> nur über einen Dienst in der EU oder gar nicht). Bei Sachversicherungen liest sie außerdem Versicherer, Beitrag,
> Zahlweise, Versicherungssumme, Selbstbeteiligung und Ablauf aus (Anthropic, PBC, USA; EU-US Data Privacy Framework bzw.
> Standardvertragsklauseln, keine Nutzung zum Training). Gesundheitsangaben werden nicht ausgewertet.
>
> Sie können die Einwilligung jederzeit widerrufen, zum Beispiel mit der Nachricht „Widerruf“, per E-Mail oder telefonisch;
> die Unterlagen werden dann sofort gelöscht. Die Rechtmäßigkeit der bis dahin erfolgten Verarbeitung bleibt unberührt.
>
> Kommt kein Vertrag zustande, löschen wir die Unterlagen 30 Tage nach dem letzten Termin. Nach einem Vertragsabschluss
> löschen wir sie nach 90 Tagen, soweit wir sie nicht zur Dokumentation unserer Beratung (§ 61 VVG) aufbewahren
> (Art. 9 Abs. 2 lit. f DSGVO).

## 4. Ergänzung AVV und TOM (Entwurf)

**AVV, Art und Umfang der Verarbeitung (neuer Punkt):**

- *Gegenstand:* Empfang, verschlüsselte Speicherung, Zuordnung und (nur Sachversicherungen) Auslesen von Unterlagen,
  die Leads des Kunden per WhatsApp schicken; Anzeige für die berechtigten Logins des Kunden; Löschung nach Frist.
- *Datenarten:* Vertragsunterlagen (Versicherer, Sparte, Beitrag, Zahlweise, Summen, Selbstbeteiligung, Laufzeit; im
  Dokument zusätzlich z. B. Name, Anschrift, Geburtsdatum, Vertragsnummer, Kfz-Kennzeichen, Bankverbindung,
  mitversicherte Personen). **Besondere Kategorie (Art. 9):** Gesundheitsdaten in Unterlagen zur Kranken-, BU-, Lebens-,
  Pflege- oder Unfallversicherung, nur mit ausdrücklicher Einwilligung der betroffenen Person, die der Kunde
  (Verantwortlicher) über den Assistenten einholt.
- *Betroffene:* Leads (Interessenten) des Kunden und in den Unterlagen genannte mitversicherte Personen.
- *Unterauftragsverarbeiter:* 360dialog (Transport, Abruf der Datei), Anthropic (Zuordnung; Auslesen nur
  Sachversicherungen; bei möglichem Gesundheitsbezug nur über den EU-Endpunkt, z. B. AWS Bedrock Frankfurt, dann
  zusätzlich AWS als Unterauftragsverarbeiter aufnehmen), Railway (Hosting, verschlüsselt).
- *Weisung:* Gesundheitsbezogene Unterlagen werden nur verarbeitet, wenn der Kunde die Funktion nutzt und die
  Einwilligung vorliegt; ohne Einwilligung wird die Datei verworfen.

**TOM (Anlage 1), Ergänzung:**

| Maßnahme | Umsetzung |
|---|---|
| Verschlüsselung der Inhalte | AES-256-GCM je Datei mit zufälligem IV, Schlüssel `ENCRYPTION_KEY` (nicht in der Datenbank), `lib/encryption.ts encryptBytes`; Datenbank zusätzlich nur intern erreichbar, TLS nach außen |
| Datensparsamkeit | Schalter an: Dateien mit möglichem Gesundheitsbezug vor der Einwilligung weder geladen noch an die KI gegeben (nur Media-ID, 24 Stunden); danach KI-Zuordnung nur über einen EU-Endpunkt, sonst keine; KI gibt nur Sparte und Ja/Nein zurück, ohne Dateinamen; Gesundheitsunterlagen nie ausgelesen; Chatverlauf ohne Dateinamen bei Gesundheitsbezug; Angaben des Assistenten ohne Gesundheitsangaben |
| Zugriff | Nur Logins des Kunden, die den Lead sehen dürfen (Inhaber, zuständiger Berater; `leadScope`). Admin in „Als Kunde ansehen“: keine Inhalte und keine Dateinamen gesundheitsbezogener Unterlagen. Abruf nur über die App (`Cache-Control: no-store`), kein öffentlicher Link, kein Objektspeicher |
| Protokollierung | Einwilligung und Widerruf im Einwilligungsprotokoll; Ansehen gesundheitsbezogener Unterlagen, Verwerfen und Widerruf im Änderungsprotokoll (ohne Inhalte) |
| Löschfristen | 30 Tage nach dem letzten Termin ohne Abschluss, 90 Tage nach dem Abschluss mit Erinnerung 14 Tage vorher, außer „Beratungsdokumentation behalten“ (Cron täglich 03:00 UTC, `prunePolicen`); ausstehende Einwilligung 24 Stunden; Widerruf sofort (Chat oder Knopf im Kontakt); Art. 17 und Vertragsende (`erasure.ts`) |
| Schalter | `POLICEN_GESUNDHEIT_AN` (Standard aus): ohne ihn werden Unterlagen mit Gesundheitsbezug nie gespeichert |

**Löschkonzept (`docs/datenschutz.md`, Abschnitt 4), neue Zeile nach Freigabe:**
„Unterlagen per WhatsApp (`LeadDocument`) | 30 Tage nach dem letzten Termin ohne Abschluss; 90 Tage nach Abschluss
(Erinnerung 14 Tage vorher), außer als Beratungsdokumentation behalten; ausstehende Einwilligung 24 Stunden; Widerruf
sofort; mit dem Lead bzw. Vertragsende | automatisch (`prunePolicen`), `eraseLead`/`eraseCustomerData`“

## 5. Offene Fragen an den Anwalt

Beantwortet nach bestem Wissen in `docs/recht-gesundheitsunterlagen.md` (Abschnitt a), umgesetzt nach Abschnitt b.
Was der Anwalt noch klären muss: dort Abschnitt c. Die ursprüngliche Liste:

1. **Zuordnung vor der Einwilligung:** Darf die Datei vor der Einwilligung kurz an die KI gehen, nur um die Sparte und
   den möglichen Gesundheitsbezug zu erkennen (nichts gespeichert, nur Ja/Nein zurück)? Alternative: vor jeder Datei
   fragen bzw. nur nach Dateiname und Vertragsliste entscheiden (dann mehr Rückfragen, mehr Fehlzuordnungen).
2. **Media-ID während der Rückfrage:** Ist das Merken der WhatsApp-Media-ID (Verweis auf die Datei bei Meta, höchstens
   24 Stunden) bis zur Antwort ein „Speichern“, das schon die Einwilligung braucht?
3. **Form und Inhalt der Einwilligung:** Reicht der Knopf „Ja, einverstanden“ als ausdrückliche Einwilligung? Ist der
   kurze Wortlaut ausreichend informiert (Zweck, Verantwortlicher, Widerruf), oder braucht es die ausführliche Fassung
   mit Link (Abschnitt 2)? Wer ist „wir“ (Vermittler; performancegrowth als Auftragsverarbeiter)?
4. **Mitversicherte Personen:** Unterlagen nennen oft Partner und Kinder (auch mit Gesundheitsangaben). Deckt die
   Einwilligung des Leads das, oder braucht es einen Hinweis bzw. eine eigene Einwilligung? Minderjährige?
5. **Unfall:** Zählt eine Unfallpolice (ohne Antrag) als Gesundheitsbezug? Die App behandelt Unfall vorsichtig wie
   Kranken/BU/Leben.
6. **Aufbewahrung bei Abschluss:** Wie lange dürfen bzw. müssen die Unterlagen nach einem Abschluss bleiben
   (Beratungsdokumentation § 61 VVG, Verjährung)? Heute: bis der Vermittler sie löscht.
7. **Widerruf per Stichwort:** Genügt „Widerruf“ bzw. „Unterlagen löschen“ im Chat (sofortige Löschung), auch wenn der
   Lead nur eine Unterlage meint?
8. **§ 203 StGB:** Fällt der Vermittler (bzw. wir als Dienstleister) bei Unterlagen zur Kranken-, Unfall- oder
   Lebensversicherung unter § 203 StGB, und reicht die Verpflichtung der Unterauftragsverarbeiter (Abschnitt 10.1)?
9. **DSFA:** Braucht der Kunde bzw. wir eine Datenschutz-Folgenabschätzung (Art. 35), wenn der Schalter an ist?
10. **Informationspflicht (Art. 13):** Reicht der Hinweis in den Datenschutzhinweisen (Abschnitt 3), oder muss die
    Einladung selbst einen Link enthalten?
11. **Drittland:** Ist die Zuordnung bzw. das Auslesen durch Anthropic (USA) mit dem bestehenden AVV und DPF abgedeckt,
    oder braucht es für Art.-9-Daten mehr (z. B. EU-Region, gesonderte Zusage)?

## 6. Umsetzung (Nachweise)

- Code: `src/lib/policen/` (`regeln.ts` Regeln und Texte, `server.ts` Ablauf, `ki.ts` Zuordnung und Auslesen,
  `media.ts` Abruf bei 360dialog, `assistent.ts` Einladung), Einhängepunkte in `lib/whatsapp/gateway.ts` und
  `lib/whatsapp/bot.ts`, Ansicht `components/lead-files.tsx` (Kontakt → Dokumente → „Unterlagen vom Kunden“) und
  `components/unterlagen-vom-kunden.tsx` (Terminvorbereitung), Abruf `api/buyer/leads/[id]/unterlagen/[docId]`
  (GET ansehen, DELETE löschen, PATCH behalten), Widerruf durch den Vermittler `api/buyer/leads/[id]/unterlagen`
  (DELETE). Verantwortlicher im Text `lib/policen/verantwortlicher.ts`, Langfassung `app/datenschutz/policen/page.tsx`
  mit `lib/policen/datenschutz-text.ts`. Gesundheitsfilter für Angaben des Assistenten `lib/gesundheitsdaten.ts`.
- Datenmodell: `LeadDocument` (Migration `20261118706700_lead_unterlagen_whatsapp`), dazu `erinnertAt`, `behaltenAt`,
  `behaltenVonId`, `behaltenVermerk` und im Einwilligungsprotokoll `leadId`, `version`, `waMessageId`
  (Migration `20261118706900_policen_gesundheit_einwilligung`).
- Tests: `tests/unit/policen.test.ts`, `tests/integration/policen-whatsapp.test.ts` (Speichern/Verschlüsseln,
  Einwilligung vorher bzw. nach der Datei, keine KI und kein Laden ohne Einwilligung, Verwerfen nach 24 Stunden, Frage
  höchstens einmal erneut, EU-Endpunkt, Widerruf nach Regeln und sinngemäß, Widerruf durch den Vermittler, Löschfristen
  mit Abschluss, Erinnerung und Behalten, Schalter aus unverändert, Art. 17, Rechte, Einladung, Gesundheitsangaben nicht
  in den Angaben des Assistenten).
- Nicht im Datenexport des Kunden (Konto → Export) enthalten: **offen**, nach Freigabe ergänzen (nur Metadaten oder
  auch Dateien?).
