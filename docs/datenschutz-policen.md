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

## 4. Ergänzung AVV und TOM (fertiger Entwurf, 17.11.2026)

**Status:** Text fertig zur Prüfung durch den Anwalt, **nicht in Kraft**. Gültig bleibt der AVV in `src/lib/legal-texts.ts`
(`AVV`, `TOMS`, `SUBPROCESSORS`, Seite `/rechtliches/avv`). Die Ergänzung baut auf dem gekürzten Entwurf
`docs/rechtstexte/avv-kurzfassung-entwurf-2026-11-17.md` auf (Paragrafen dort), passt aber auch in die geltende
Fassung (Abschnittstitel in Klammern).

**Übernahme in die App (nach Freigabe, vor dem Einschalten von `POLICEN_GESUNDHEIT_AN`):**
1. Texte 4.1 bis 4.5 in `AVV` übernehmen, Anlage 2 (4.6) in `SUBPROCESSORS`, TOM (4.7) in `TOMS`; `LEGAL_VERSION` erhöhen.
2. Neuer Unterauftragsverarbeiter AWS: Kunden mit Vertrag **vor** dem Einsatz in Textform informieren, 14 Tage
   Widerspruchsfrist (AVV § 6 „Unterauftragsverarbeiter“). Erst danach `POLICEN_KI_REGION=eu` mit Bedrock nutzen.
3. Fundstellen der Vertraulichkeitsklauseln je Unterauftragsverarbeiter in `docs/datenschutz.md` Abschnitt 3
   (Nachweistabelle) eintragen, auch für AWS; § 203-Hinweis aus `docs/vorlage-verpflichtung-203-stgb.md` an AWS schicken.

Warum noch nicht im Code: AWS ist noch nicht im Einsatz (Kontoprüfung bei AWS läuft), ein neuer Unterauftragsverarbeiter
setzt die Mitteilung mit Widerspruchsfrist voraus, und Abschnitt 2 bis 4 dieses Dokuments gehen erst nach Prüfung durch
den Anwalt in die Rechtstexte. Eine Änderung von `SUBPROCESSORS` jetzt würde den geltenden Vertrag vorzeitig ändern.

### 4.1 AVV § 2 (Art, Zweck und Umfang), neuer Absatz nach „Terminvorbereitung und Beratungspräsentation“

> **Unterlagen vom Interessenten per WhatsApp.** Interessenten können dem Auftraggeber vor einem Termin Fotos oder PDFs
> ihrer bestehenden Versicherungsunterlagen über WhatsApp schicken. Der Auftragnehmer empfängt diese Dateien über die
> WhatsApp Business API, prüft Dateityp und Größe, speichert sie verschlüsselt und zeigt sie den berechtigten Nutzern
> des Auftraggebers an. Der in Anlage 2 genannte KI-Anbieter ordnet jede Unterlage einer Versicherungsart zu und gibt
> an, ob sie Gesundheitsangaben enthalten kann; nur bei Sachversicherungen liest er Versicherer, Beitrag, Zahlweise,
> Versicherungssumme, Selbstbeteiligung und Ablauf aus, ohne Namen, Nummern, Bankverbindungen und Gesundheitsangaben.
> Unterlagen mit möglichen Gesundheitsangaben werden nicht ausgelesen, nicht zusammengefasst und nicht bewertet.
>
> **Unterlagen mit Gesundheitsangaben (Art. 9 DSGVO).** Unterlagen zur Kranken-, Berufsunfähigkeits-, Lebens-, Pflege-
> oder Unfallversicherung verarbeitet der Auftragnehmer nur, wenn der Auftraggeber diese Funktion nutzt und die
> betroffene Person vorher über den digitalen Assistenten ausdrücklich eingewilligt hat. Ohne Einwilligung lädt der
> Auftragnehmer den Inhalt solcher Dateien nicht, gibt sie nicht an einen KI-Anbieter und merkt sich nur den Verweis
> auf die Datei, höchstens 24 Stunden. Die Zuordnung dieser Unterlagen erfolgt ausschließlich durch einen KI-Anbieter
> mit Verarbeitung in der EU (Anlage 2); steht er nicht zur Verfügung, unterbleibt die Zuordnung durch KI. Von Personen
> unter 18 Jahren werden keine solchen Einwilligungen eingeholt.
>
> **Datenarten:** Versicherungsunterlagen (Versicherer, Sparte, Beitrag, Zahlweise, Versicherungssummen,
> Selbstbeteiligung, Laufzeit; im Dokument außerdem zum Beispiel Name, Anschrift, Geburtsdatum, Vertragsnummer,
> Kfz-Kennzeichen, Bankverbindung, mitversicherte Personen); bei Personenversicherungen Gesundheitsdaten (Art. 9 DSGVO);
> Nachweis der Einwilligung (Wortlaut, Version, Zeitpunkt, WhatsApp-Nummer, Antwort-ID) und des Widerrufs.
>
> **Betroffene:** Interessenten des Auftraggebers und in den Unterlagen genannte mitversicherte Personen, auch Kinder.

### 4.2 AVV § 4 (Pflichten des Auftragnehmers), Verschwiegenheit nach § 203 StGB (Mitwirkende)

Die geltende Klausel („Verschwiegenheit nach § 203 StGB“ und „Verschwiegenheit der Unterauftragsverarbeiter“) bleibt.
Ergänzt wird ein Satz, der die Unterlagen und die Kette der Mitwirkenden ausdrücklich nennt:

> **Mitwirkende Personen bei Unterlagen der Personenversicherung.** Die Verschwiegenheit nach § 203 StGB erfasst
> insbesondere Unterlagen, die Interessenten über WhatsApp schicken, und die Tatsache, dass eine Person eine Kranken-,
> Unfall- oder Lebensversicherung hat oder anfragt. Der Auftragnehmer wirkt dabei als sonstige mitwirkende Person im
> Sinne von § 203 Abs. 3 Satz 2 StGB mit; dasselbe gilt für die in Anlage 2 genannten Unterauftragsverarbeiter, die
> diese Unterlagen übertragen, speichern oder verarbeiten. Der Auftragnehmer hat sie vertraglich zur Vertraulichkeit
> verpflichtet und in Textform auf die Strafbarkeit einer unbefugten Offenbarung nach § 203 Abs. 4 StGB hingewiesen;
> er sorgt dafür, dass sie von ihnen eingesetzte Personen und weitere Unterauftragsverarbeiter ebenso verpflichten
> (§ 203 Abs. 4 Satz 2 Nr. 2 StGB). Mitarbeitende des Auftragnehmers sehen weder Inhalt noch Dateinamen von
> Unterlagen mit möglichen Gesundheitsangaben, außer auf dokumentierte Weisung des Auftraggebers im Einzelfall.

### 4.3 AVV § 5 (Pflichten des Auftraggebers), neuer Satz

> Die Funktion für Unterlagen mit Gesundheitsangaben schaltet der Auftragnehmer nur auf Anforderung des Auftraggebers in
> Textform ein. Mit der Anforderung bestätigt der Auftraggeber, dass er eine Datenschutz-Folgenabschätzung durchgeführt
> hat (der Auftragnehmer stellt dafür eine Vorlage bereit) und, als gebundener Versicherungsvertreter, dass sein
> Agenturvertrag die Nutzung erlaubt bzw. die Zustimmung des Versicherers vorliegt. Für diese Bestätigung gilt die
> Zusicherung und Freistellung nach Satz 2 und den AGB.

### 4.4 AVV § 3 (Weisungen) bzw. § 9 (Löschung und Rückgabe), Löschfristen als Weisung

> **Löschung der Unterlagen vom Interessenten.** Der Auftraggeber weist den Auftragnehmer an (Art. 28 Abs. 3 lit. g
> DSGVO), Unterlagen, die Interessenten über WhatsApp schicken, automatisch zu löschen:
> 1. ohne Vertragsabschluss 30 Tage nach dem letzten Termin, ohne Termin 30 Tage nach dem Eingang;
> 2. nach einem Vertragsabschluss 90 Tage nach dem Abschluss; der Auftragnehmer erinnert den Auftraggeber 14 Tage
>    vorher, damit er beratungsrelevante Unterlagen in seine eigene Kundenakte übernehmen kann. Kennzeichnet der
>    Auftraggeber eine Unterlage als Dokumentation seiner Beratung, entfällt die automatische Löschung; sie bleibt bis
>    zur Löschung durch den Auftraggeber, längstens bis zur Löschung nach § 9;
> 3. Verweise auf Dateien, für die noch keine Einwilligung vorliegt, nach spätestens 24 Stunden;
> 4. nach einem Widerruf der Einwilligung sofort alle Unterlagen der betroffenen Person, auch als Dokumentation
>    gekennzeichnete, sowie mit der Löschung des Leads.
>
> Kopien bei Meta (WhatsApp) unterliegen Metas eigener Frist von bis zu 30 Tagen.

### 4.5 AVV § 7 (Drittländer), kein neuer Text

Der geltende Absatz deckt die Übermittlung ab (DPF bzw. Standardvertragsklauseln). Die Verarbeitung durch AWS findet in
der EU statt; der Hinweis auf die US-Muttergesellschaft steht in Anlage 2.

### 4.6 Anlage 2 (Unterauftragsverarbeiter), neue und geänderte Einträge

Grundlage: `SUBPROCESSORS` in `src/lib/legal-texts.ts`; nur die Zeilen, die sich für diese Funktion ändern. Die
übrigen Einträge (Resend, Airtable, Zapier, OpenAI, Cloudflare, Sentry, Google/Microsoft) bleiben unverändert.

| Unterauftragsverarbeiter | Zweck | Ort | Änderung |
|---|---|---|---|
| Amazon Web Services EMEA SARL, Luxemburg | KI-System (Claude von Anthropic über Amazon Bedrock, Region eu-central-1 Frankfurt) für die Zuordnung von Unterlagen, die Interessenten per WhatsApp schicken, und das Auslesen von Sachversicherungen; keine Speicherung der Ein- und Ausgaben, keine Nutzung zum Training | Verarbeitung in der EU (Frankfurt); Muttergesellschaft USA | **neu** |
| Anthropic, PBC | wie bisher; zusätzlich, solange die Funktion für Unterlagen mit Gesundheitsangaben aus ist: Zuordnung der Unterlagen, die Interessenten per WhatsApp schicken (Unterlagen mit möglichen Gesundheitsangaben werden danach verworfen), und Auslesen von Sachversicherungen. Bei eingeschalteter Funktion mit EU-Zugang erhält Anthropic keine Unterlagen (dann AWS) | USA | Zweck ergänzt |
| Meta Platforms Ireland Ltd. | wie bisher; zusätzlich: Übertragung der Dateien, die Interessenten per WhatsApp schicken (Speicherung bei Meta bis zu 30 Tage) | Irland / USA | Zweck ergänzt |
| 360dialog GmbH | Anbindung der WhatsApp Business API, einschließlich Abruf der Dateien, die Interessenten schicken | Deutschland | Zweck ergänzt |
| Railway Corporation | Hosting von Anwendung und Datenbank, einschließlich der verschlüsselt gespeicherten Unterlagen | Serverstandort EU (Amsterdam); Unternehmen USA | Zweck ergänzt |

Für den Code nach Freigabe (Einträge in `SUBPROCESSORS`):

```ts
{ name: "Amazon Web Services EMEA SARL", purpose: "KI-System (Claude über Amazon Bedrock) für die Zuordnung von Unterlagen, die Interessenten per WhatsApp schicken, und das Auslesen von Sachversicherungen; keine Speicherung der Ein- und Ausgaben, keine Nutzung zum Training", location: "EU (Frankfurt); Unternehmen USA" },
```

Nachweis je Unterauftragsverarbeiter (in `docs/datenschutz.md` Abschnitt 3 eintragen, Fundstelle der
Vertraulichkeitsklausel nach § 203 Abs. 4 Satz 2 Nr. 2 StGB):

| Dienst | Vertrag | Fundstelle Vertraulichkeit | Drittland |
|---|---|---|---|
| AWS | AWS Customer Agreement mit AWS GDPR Data Processing Addendum (Teil der Service Terms) | **offen: Klausel ablegen** | Amazon.com, Inc. DPF; SCC im DPA |
| Anthropic | Commercial Terms mit DPA | **offen** | DPF bzw. SCC |
| Meta | WhatsApp Business Data Processing Terms | **offen** | DPF (WhatsApp LLC, Meta Platforms, Inc.) bzw. SCC |
| 360dialog | AVV 360dialog | **offen** | EU |
| Railway | Railway DPA | **offen** | DPF bzw. SCC |

### 4.7 TOM (Anlage 1), Ergänzung

| Maßnahme | Umsetzung |
|---|---|
| Verschlüsselung der Inhalte | AES-256-GCM je Datei mit zufälligem IV, Schlüssel `ENCRYPTION_KEY` (nicht in der Datenbank), `lib/encryption.ts encryptBytes`; Datenbank zusätzlich nur intern erreichbar, TLS nach außen |
| KI in der EU | Zuordnung und Auslesen von Unterlagen bei eingeschalteter Funktion nur über Amazon Bedrock, Region eu-central-1, regionaler Endpunkt (`lib/ki-eu.ts`); eigener IAM-Nutzer nur mit Bedrock-Aufrufrecht, Zugangsdaten nur als Railway-Variablen (`KI_EU_AWS_ACCESS_KEY_ID`, `KI_EU_AWS_SECRET_ACCESS_KEY`); nur `eu-*`-Regionen zugelassen; ohne EU-Zugang keine KI für Unterlagen mit möglichem Gesundheitsbezug |
| Datensparsamkeit | Schalter an: Dateien mit möglichem Gesundheitsbezug vor der Einwilligung weder geladen noch an die KI gegeben (nur Media-ID, 24 Stunden); KI gibt nur Sparte und Ja/Nein zurück, ohne Dateinamen; Gesundheitsunterlagen nie ausgelesen; Chatverlauf ohne Dateinamen bei Gesundheitsbezug; Gesundheitsangaben im Chat vor jeder KI ausgeblendet (`redactHealthText`), Angaben des Assistenten ohne Gesundheitsangaben |
| Minderjährige | Alter unter 18 laut Leadformular (`minderjaehrig`): keine Einwilligungsfrage, Gesundheitsunterlagen verworfen; Einwilligungstext „ab 18 Jahren“ |
| Zugriff | Nur Logins des Kunden, die den Lead sehen dürfen (Inhaber, zuständiger Berater; `leadScope`). Admin in „Als Kunde ansehen“: keine Inhalte und keine Dateinamen gesundheitsbezogener Unterlagen. Abruf nur über die App (`Cache-Control: no-store`), kein öffentlicher Link, kein Objektspeicher |
| Protokollierung | Einwilligung und Widerruf im Einwilligungsprotokoll; Ansehen gesundheitsbezogener Unterlagen, Verwerfen und Widerruf im Änderungsprotokoll (ohne Inhalte) |
| Löschfristen | 30 Tage nach dem letzten Termin ohne Abschluss, 90 Tage nach dem Abschluss mit Erinnerung 14 Tage vorher, außer „Beratungsdokumentation behalten“ (Cron täglich 03:00 UTC, `prunePolicen`); ausstehende Einwilligung 24 Stunden; Widerruf sofort (Chat oder Knopf im Kontakt); Art. 17 und Vertragsende (`erasure.ts`) |
| Verschwiegenheit | Mitarbeitende nach `docs/vorlage-verpflichtung-203-stgb.md` verpflichtet; Unterauftragsverarbeiter über DPA und Hinweis in Textform |
| Schalter | `POLICEN_GESUNDHEIT_AN` (Standard aus): ohne ihn werden Unterlagen mit Gesundheitsbezug nie gespeichert |

Vorschlag für `TOMS` (Satz für die öffentliche Anlage 1):

> Unterlagen, die Interessenten per WhatsApp schicken, werden je Datei verschlüsselt gespeichert und nur den
> zuständigen Nutzern des Auftraggebers angezeigt. Unterlagen mit möglichen Gesundheitsangaben werden erst nach
> Einwilligung geladen, nur in der EU durch KI zugeordnet, nie ausgelesen und nach festen Fristen automatisch gelöscht.

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
