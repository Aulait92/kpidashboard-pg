# Policen mit Gesundheitsbezug per WhatsApp: rechtliche Einordnung und Umsetzungsempfehlung

Stand: 17.11.2026. Recherche als Grundlage für das Anwaltsgespräch, **keine Rechtsberatung**. Ergänzt den Entwurf
`docs/datenschutz-policen.md` (Commit 4c115c3) und beantwortet dessen offene Fragen 1 bis 11.

Ausgangslage: Vermittler (Vertreter oder Makler) sind Verantwortliche, wir (Ole Kannapinn UG) sind Auftragsverarbeiter.
Ein WhatsApp-KI-Assistent (360dialog bzw. Meta Cloud API, KI: Anthropic Claude über API) lädt Leads vor dem Termin ein,
Fotos oder PDFs bestehender Policen zu schicken. Sachversicherungen laufen bereits. Offen sind Kranken (PKV,
GKV-Zusatz), BU, Leben, Pflege und Unfall, deren Unterlagen Gesundheitsdaten (Art. 9 DSGVO) enthalten können.

Hinweis zur Recherche: Primärquellen wurden über Legal Data Hunter und die amtlichen Seiten geprüft (§ 203 StGB,
§ 61 VVG, BGH VIII ZR 53/09, EuGH C-21/23 und C-252/21, DSK-Muss-Liste im Wortlaut). Das Tageslimit von Legal Data
Hunter (kostenloser Plan) war während der Recherche erreicht; einige Fundstellen (u. a. EDPB-Randnummern, EuGH C-184/20,
C-667/21, BGH III ZR 544/13) stammen deshalb aus Websuche bzw. Fachwissen und sind in der Quellenliste als
„nicht im Volltext geprüft“ markiert.

---

## (a) Kurzfazit je Frage

### 1. Rechtsgrundlage und Einwilligung

- **Nur Art. 9 Abs. 2 lit. a DSGVO (ausdrückliche Einwilligung) trägt.** Keine andere Ausnahme passt:
  - lit. f (Rechtsansprüche) erfasst keine Terminvorbereitung, allenfalls später die Aufbewahrung zur Abwehr von
    Haftungsansprüchen (siehe Frage 5).
  - lit. h und [§ 22 Abs. 1 Nr. 1 lit. b BDSG](https://www.gesetze-im-internet.de/bdsg_2018/__22.html) betreffen
    Gesundheitsvorsorge und Versorgung durch Gesundheitsberufe, nicht Versicherungsvermittlung. Das BVerwG legt die
    Ausnahmen eng aus und verlangt selbst für eine PKV, die Diagnosen aus eingereichten Rechnungen für
    Vorsorgeangebote auswertet, eine Einwilligung ([BVerwG, Urt. v. 6.3.2026, 6 C 7.24](https://www.bverwg.de/060326U6C7.24.0),
    [Pressemitteilung 16/2026](https://www.bverwg.de/pm/2026/16)).
  - „Vorvertragliche Maßnahmen“ (Art. 6 Abs. 1 lit. b) sind nur eine Rechtsgrundlage nach Art. 6, keine Ausnahme
    vom Verbot des Art. 9 Abs. 1. Es braucht immer **beides**: Art. 6 und Art. 9 (EuGH
    [C-252/21, Meta/Bundeskartellamt](https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:62021CJ0252);
    EuGH C-667/21, Krankenversicherung Nordrhein). Für die Gesundheitsunterlagen also Art. 6 Abs. 1 lit. a
    zusammen mit Art. 9 Abs. 2 lit. a.
  - Auch die Versicherungswirtschaft stützt Gesundheitsdaten im Vertrieb auf Einwilligung
    ([Muster-Einwilligungs- und Schweigepflichtentbindungserklärung, mit dem Düsseldorfer Kreis abgestimmt](https://www.datenschutz-mv.de/static/DS/Dateien/Duesseldorfer_Kreis/Einw_Verswi.pdf)).
- **Was schon Gesundheitsdatum ist, legt der EuGH weit aus:** Es reicht, dass sich aus den Daten mittelbar,
  durch Schlussfolgerung oder Abgleich, ein Gesundheitsbezug ergeben kann, egal ob er den Nutzer oder eine andere
  Person betrifft und egal, was der Verantwortliche damit vorhat (EuGH
  [C-21/23, Lindenapotheke, 4.10.2024](https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:62023CJ0021);
  C-252/21 Rn. 68 ff.; C-184/20, OT). Risikozuschläge, Leistungsausschlüsse, Vorerkrankungen, BU-Klauseln: klar
  Art. 9. Eine reine Rentenversicherung ohne Gesundheitsprüfung ist meist kein Art.-9-Fall, aber § 203 StGB (Frage 4).
- **„Ausdrücklich“:** Der Betroffene muss die Einwilligung gerade für die Gesundheitsdaten in einer ausdrücklichen
  Erklärung bestätigen; elektronische Formen genügen (EDPB
  [Leitlinien 05/2020 zur Einwilligung](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-052020-consent-under-regulation-2016679_de),
  Abschnitt 4). Ein Knopf „Ja, einverstanden“ als Antwort auf eine Frage, die Gesundheitsangaben ausdrücklich nennt,
  ist nach bestem Wissen ausreichend: aktive Handlung, nicht vorausgewählt (EuGH C-673/17, Planet49), gesondert
  von anderen Erklärungen, eindeutig auf Art.-9-Daten bezogen, mit Zeitstempel und Nachrichten-ID nachweisbar
  (Art. 7 Abs. 1). Bloßes Schicken einer Datei nach einer allgemeinen Einladung genügt **nicht** (höchstens
  konkludent).
- **„Informiert“ (Art. 4 Nr. 11, ErwG 42):** Mindestens Verantwortlicher, Zweck, Art der Daten, Widerrufsrecht
  (EDPB 05/2020, Rn. 64). Gestaffelte Information ist zulässig: Kurztext im Chat mit allem Wesentlichen plus Link zu
  einer Langfassung. Zusätzlich empfehlenswert, weil für den Lead wesentlich: KI-Zuordnung, Dienstleister auch in den
  USA, Löschfrist.
- **Wer ist Verantwortlicher, wer wird genannt:** Verantwortlich ist der Vermittler (bei Maklern die Maklerfirma,
  bei Vertretern die Agentur). Er muss im Text mit Namen und Firma genannt werden; „wir“ allein reicht nicht, weil
  der Lead sonst nicht erkennt, wem er einwilligt. Wir als Auftragsverarbeiter müssen nicht namentlich in den
  Kurztext, gehören aber als Empfängerkategorie in die Langfassung (Art. 13 Abs. 1 lit. e). Versicherer sind nicht
  zu nennen (sie bekommen nichts).
- **Sonderfall Ausschließlichkeitsvertreter:** Manche Versicherer sehen ihre Vertreter als Auftragsverarbeiter oder
  gemeinsam Verantwortliche. Dann darf der Vertreter unsere App für Gesundheitsdaten möglicherweise nur mit
  Zustimmung des Versicherers nutzen. Im Anwaltsgespräch klären (Abschnitt c).

### 2. Klassifikation vor der Einwilligung

- **Nicht empfohlen.** Schon das Übermitteln an die KI ist Verarbeitung (Art. 4 Nr. 2: Auslesen, Abfragen,
  Offenlegung durch Übermittlung). Enthält die Datei Gesundheitsangaben, greift Art. 9 Abs. 1 unabhängig vom Zweck
  (C-252/21 Rn. 68 ff.; C-21/23). Für eine Klassifikation „nur um zu entscheiden, ob gelöscht wird“ gibt es keine
  Ausnahme in Art. 9 Abs. 2. Das Argument Datensparsamkeit hilft nicht über die fehlende Rechtsgrundlage.
- Erschwerend: Anthropic speichert API-Eingaben standardmäßig bis zu 30 Tage
  ([Anthropic Privacy Center](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-commercial-api-data)).
  „Sofort gelöscht“ stimmt dann nur bei uns, nicht beim Dienstleister in den USA.
- Das bloße Empfangen einer unaufgefordert geschickten Datei (Transport über Meta und 360dialog) lässt sich nicht
  verhindern und ist nach herrschender Sicht kein Verstoß des Empfängers, solange er sie danach nicht weiter nutzt
  und zügig verwirft.
- **Besser: Einwilligung vorher**, zusammen mit der Einladung, ein Tipp. Dann ist jede spätere Verarbeitung
  (Speichern, KI-Zuordnung) gedeckt, und die Frage stellt sich nicht. Die Klassifikation nur nach Dateiname oder
  Lead-Angabe ist als alleiniges Kriterium unzuverlässig (Handyfotos heißen „IMG_1234.jpg“) und taugt nur als
  zusätzliches Signal in Richtung „Gesundheitsbezug möglich“.

### 3. Übermittlung in die USA

- **Grundlage:** Angemessenheitsbeschluss zum EU-US Data Privacy Framework
  ([Durchführungsbeschluss (EU) 2023/1795](https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32023D1795))
  für zertifizierte Empfänger, sonst Standardvertragsklauseln (Art. 46 Abs. 2 lit. c) mit Transfer-Folgenabschätzung.
  Der Beschluss gilt für alle Datenkategorien, auch Art. 9; eine gesonderte Einwilligung nach Art. 49 ist nicht nötig.
- **Bestand des DPF:** Das EuG hat die Klage Latombe abgewiesen (T-553/23, 3.9.2025); das Rechtsmittel
  (C-703/25 P) ist beim EuGH anhängig
  ([WilmerHale, 1.12.2025](https://www.wilmerhale.com/en/insights/blogs/wilmerhale-privacy-and-cybersecurity-law/20251201-european-court-of-justice-to-review-challenge-to-eu-us-data-privacy-framework)).
  Fällt der Beschluss, gelten die SCC als Rückfall; dafür jetzt schon SCC in den Verträgen haben.
- **Anthropic:** Vertragspartner für EWR-Kunden ist Anthropic Ireland, Ltd., verarbeitet wird bei Anthropic, PBC
  (USA). DPF-Teilnahme laut Sekundärquellen, auf [dataprivacyframework.gov](https://www.dataprivacyframework.gov/list)
  prüfen und ablegen. Kein Training auf API-Daten (Commercial Terms). Speicherung bis 30 Tage, Zero Data Retention
  nur auf Antrag. Eine EU-Region bietet die direkte Anthropic-API derzeit nicht (`inference_geo` nur „global“ oder
  „us“, [Claude Docs: Data residency](https://platform.claude.com/docs/en/manage-claude/data-residency.md)). Claude
  über AWS Bedrock (Frankfurt) oder Google Vertex AI (EU-Region) verarbeitet in der EU.
- **Meta/WhatsApp:** Meta ist bei der Cloud API Auftragsverarbeiter, Nachrichten werden verschlüsselt bis zu 30 Tage
  gespeichert; Verarbeitung in Meta-Rechenzentren, Übermittlung in die USA nach DPF/SCC; Option „Local Storage“
  für Speicherung in einem gewählten Land
  ([Meta: Data Privacy & Security](https://developers.facebook.com/documentation/business-messaging/whatsapp/data-privacy-and-security)).
  Ob 360dialog Local Storage (EU) für unsere Nummern unterstützt, ist offen.
- **Im Einwilligungstext:** ein kurzer Satz („Dafür setzen wir Dienstleister ein, auch in den USA.“) genügt;
  Einzelheiten (Anbieter, Grundlage DPF/SCC) in die Langfassung (Art. 13 Abs. 1 lit. f).
- **Empfehlung:** Für alle Dateien mit möglichem Gesundheitsbezug die KI-Zuordnung über eine EU-Region (Bedrock
  Frankfurt oder Vertex EU) laufen lassen, hilfsweise Zero Data Retention bei Anthropic beantragen. Das senkt das
  Risiko deutlich und ist ein starkes Argument gegenüber Aufsicht und Anwalt.

### 4. § 203 StGB

- **Vertreter: ja.** Selbstständige Versicherungsvertreter, die Kranken-, Unfall- oder Lebensversicherungen
  vermitteln, sind „Angehörige eines Unternehmens der privaten Kranken-, Unfall- oder Lebensversicherung“ (BGH,
  [Urt. v. 10.2.2010, VIII ZR 53/09](https://www.rechtsprechung-im-internet.de/jportal/?quelle=jlink&docid=KORE302852010&psml=bsjrsprod.psml),
  damals § 203 Abs. 1 **Nr. 6**, seit der Reform 2017 [**Nr. 7**](https://www.gesetze-im-internet.de/stgb/__203.html)).
  Erfasst ist jede Person, die mit der **Anbahnung**, Abwicklung oder Verwaltung solcher Verträge befasst ist.
  Geschützt sind nicht nur Gesundheitsangaben, sondern schon die Tatsache, dass jemand eine Personenversicherung hat,
  und erst recht Umfang und Inhalt des Vertrags (Rn. 19). Das BGH-Urteil betraf gerade eine **Unfallversicherung**.
- **Makler: offen, eher nein.** Makler stehen auf der Seite des Kunden, nicht des Versicherers; das BGH-Urteil
  äußert sich nicht zu ihnen, die Literatur ist uneinheitlich
  ([Dr. Datenschutz, 18.3.2010](https://www.dr-datenschutz.de/geheimhaltungspflicht-nach-stgb-fuer-selbstaendige-versicherungsmakler/)).
  Für die App gilt: so bauen, als gelte § 203 für alle Kunden. Das kostet kaum etwas mehr.
- **GKV-Zusatzversicherungen** sind private Krankenversicherungen und fallen darunter; die GKV selbst nicht.
- **Folgen für uns (§ 203 Abs. 3 und 4):** Wir und unsere Unterauftragnehmer sind „sonstige mitwirkende Personen“.
  Der Vermittler darf uns Geheimnisse zugänglich machen, soweit es für unsere Tätigkeit erforderlich ist (Abs. 3
  Satz 2). Er macht sich strafbar, wenn er nicht dafür sorgt, dass wir zur Geheimhaltung verpflichtet sind (Abs. 4
  Satz 2 Nr. 1); wir machen uns strafbar, wenn wir weitere Mitwirkende (Railway, 360dialog, Meta, Anthropic) nicht
  verpflichten (Nr. 2), und unsere Leute bei unbefugtem Offenbaren (Abs. 4 Satz 1). Das ist mit der Klausel im AVV
  und `docs/vorlage-verpflichtung-203-stgb.md` angelegt. Bei den Großanbietern reicht nach überwiegender Ansicht die
  Vertraulichkeitsklausel in deren AVV/DPA; ein eigenes Papier unterschreiben sie nicht.
- **Zusätzlich** wirkt die Einwilligung des Leads als Befugnis zur Offenbarung, wenn sie die Dienstleister erwähnt.
  Deshalb gehört der Dienstleister-Satz in den Einwilligungstext.

### 5. Aufbewahrung und Löschung

- **Keine gesetzliche Aufbewahrungspflicht für Altpolicen-Fotos.**
  - [§ 61](https://www.gesetze-im-internet.de/vvg_2008/__61.html), § 62 VVG verlangen eine Beratungsdokumentation und
    deren Übermittlung an den Kunden, nennen aber **keine Aufbewahrungsfrist**. Die Altpolice ist nicht selbst die
    Dokumentation, kann aber Grundlage des Rats sein (z. B. bei Umdeckung oder Kündigung des Altvertrags).
  - Haftung nach § 63 VVG verjährt nach §§ 195, 199 BGB: drei Jahre ab Jahresende der Kenntnis, Höchstfrist zehn
    Jahre ab Entstehung (§ 199 Abs. 3 Nr. 1). Fehlt die Dokumentation, drohen Beweiserleichterungen bis zur
    Beweislastumkehr zulasten des Vermittlers (BGH, Urt. v. 13.11.2014, III ZR 544/13). Das ist ein berechtigter
    Grund, beratungsrelevante Unterlagen nach Abschluss aufzubewahren (Art. 17 Abs. 3 lit. e, Art. 9 Abs. 2 lit. f),
    aber keine Pflicht.
  - § 257 HGB, § 147 AO, GoBD: Aufbewahrt werden empfangene Handelsbriefe (sechs Jahre) und Buchungsbelege (acht
    Jahre). Eine fremde Altpolice zwischen Kunde und Versicherer ist keins von beiden. Courtage- und
    Provisionsabrechnungen schon, die liegen aber nicht in diesem Modul.
  - § 22 VersVermV (fünf Jahre) betrifft nur Aufzeichnungen über entgegengenommene Kundengelder, hier nicht einschlägig.
- **Ohne Abschluss:** Zweck erledigt, Rechtsgrundlage endet, löschen. 30 Tage nach dem letzten Termin ist vertretbar
  (Raum für Folgetermin). Ohne Termin: 30 Tage nach Eingang.
- **Mit Abschluss:** Die Unterlagen gehören, soweit beratungsrelevant, in die Kundenakte des Vermittlers (sein
  Maklerverwaltungsprogramm), nicht dauerhaft in unsere Lead-App. Die Einwilligung trägt die Speicherung nur bis zum
  Widerruf; danach nur noch Art. 9 Abs. 2 lit. f für das, was zur Abwehr von Haftungsansprüchen nötig ist.
  Empfehlung siehe Abschnitt b.

### 6. Datenschutz-Folgenabschätzung

- **Ja, erforderlich.** Die DSK-Muss-Liste (Art. 35 Abs. 4, [Version 1.1 vom 17.10.2018](https://www.datenschutzkonferenz-online.de/media/ah/20181017_ah_DSK_DSFA_Muss-Liste_Version_1.1_Deutsch.pdf))
  nennt unter **Nr. 11** „Einsatz von künstlicher Intelligenz zur Verarbeitung personenbezogener Daten zur Steuerung
  der Interaktion mit den Betroffenen“ mit dem Beispiel: „Ein Unternehmen setzt ein System ein, welches mit Kunden
  durch Konversation interagiert und für deren Beratung personenbezogene Daten durch eine künstliche Intelligenz
  verarbeitet werden“. Das trifft den WhatsApp-Assistenten **schon ohne Gesundheitsdaten**.
- Dazu kommen mehrere Kriterien der [WP 248 rev.01](https://ec.europa.eu/newsroom/article29/items/611236)
  (besondere Kategorien, Berufsgeheimnis, neue Technologie, Drittlandübermittlung). Ab zwei Kriterien in der Regel DSFA.
- Nr. 3 (umfangreiche Verarbeitung von Berufsgeheimnissen) greift für den einzelnen Vermittler eher nicht
  (ErwG 91), plattformweit über alle Kunden aber möglicherweise.
- **Wer:** Pflicht des Verantwortlichen (jeder Vermittler). Für gleichartige Verarbeitungen genügt eine gemeinsame
  DSFA (Art. 35 Abs. 1 Satz 2, ErwG 92). Wir sind zur Unterstützung verpflichtet (Art. 28 Abs. 3 lit. f) und sollten
  eine **Muster-DSFA** liefern, die der Vermittler übernimmt. Vor dem Einschalten von `POLICEN_GESUNDHEIT_AN` fertig haben.

### 7. Mitversicherte Personen und Kinder

- Policen nennen oft Partner und Kinder, teils mit Gesundheitsangaben (Zuschlag, Ausschluss beim Kind). Auch das sind
  Gesundheitsdaten (C-21/23: auch Daten über andere Personen), und bei Personenversicherungen Geheimnisse nach § 203.
- Die Einwilligung des Leads deckt **nur seine eigenen** Daten. Für Kinder willigen die Eltern als gesetzliche
  Vertreter ein (§§ 1626, 1629 BGB); für eine Versicherungsprüfung dürfte ein Elternteil allein handeln können
  (Angelegenheit des täglichen Lebens, § 1687 BGB, nicht sicher). Für erwachsene Mitversicherte (Partner) braucht es
  deren eigenes Einverständnis; die Versicherungswirtschaft holt dafür eigene Erklärungen ein (Muster Düsseldorfer Kreis).
- **Praktikabel:** Im Einwilligungstext ein Satz, dass Unterlagen anderer Personen nur mit deren Einverständnis
  geschickt werden (bei Kindern als Elternteil). Der Vermittler bestätigt im Termin und informiert die Mitversicherten
  (Art. 14). Restrisiko bleibt (Abschnitt c).

### 8. Unfallversicherung

- **Ja, als Gesundheitsbezug behandeln.** Unfallpolicen enthalten regelmäßig oder häufig Gesundheitsangaben
  (Vorinvalidität, Leistungsausschlüsse z. B. Bandscheibe, Zuschläge, bei Senioren-Unfall Hilfeleistungen), und die
  Unfallversicherung steht ausdrücklich in § 203 Abs. 1 Nr. 7 StGB (BGH VIII ZR 53/09 betraf genau sie). Die heutige
  App-Einstufung (`SPARTEN.unfall.gesundheit = true`) ist richtig.
- Gleiches gilt für Leben/Rente und Pflege: auch ohne Gesundheitsangabe im Einzelfall § 203-relevant.

### 9. Widerruf per Chat-Stichwort

- Der Widerruf ist **formfrei** und muss so einfach sein wie die Erteilung (Art. 7 Abs. 3). Ein Stichwort ist ein
  gutes zusätzliches Angebot, **aber nicht ausreichend als einziger Weg**: Jede erkennbare Erklärung zählt („bitte
  löschen Sie meine Unterlagen“, „ich will das doch nicht“), auch per E-Mail, Telefon oder im Termin.
- Der Assistent muss sinngemäße Widerrufe erkennen. Bei klarem Widerruf sofort löschen und bestätigen; nur wenn
  unklar ist, ob alle oder eine Unterlage gemeint ist, einmal nachfragen. Der Vermittler wird benachrichtigt und
  kann Widerrufe, die ihn anders erreichen, im Kontakt mit einem Klick umsetzen.
- Widerruf wirkt nur für die Zukunft; nach Abschluss kann eine Aufbewahrung auf Art. 9 Abs. 2 lit. f gestützt
  bleiben (nur Beratungsrelevantes, Lead informieren). Standard in der App: alles löschen.

---

## (b) Umsetzungsempfehlung für die App (bestes Wissen)

UX-Entscheidung in zwei Sätzen: Die Einwilligung wandert von „nach dem Eingang einer Datei“ in die **Einladung
selbst** (ein Tipp, zwei Knöpfe, kein neuer Schritt). Dadurch braucht es keine KI-Zuordnung vor der Einwilligung,
keine Rückfrage pro Datei und keine Sonderfälle.

### Ablauf

1. **Einladung mit Einwilligung (einmal je Lead):** Nach der Vertragsfrage sendet der Assistent eine interaktive
   Nachricht (Text höchstens 1.024 Zeichen, Knopftitel höchstens 20 Zeichen) mit **[Ja, einverstanden]** und
   **[Lieber im Termin]**. Gilt für alle Policen, auch Sach, weil vorher niemand weiß, was kommt.
2. **„Ja, einverstanden“:** Einwilligung protokollieren (Wortlaut mit Version, Ansprache, Vermittler, WhatsApp-Nummer,
   ID der Knopf-Antwort `wamid`, Zeitpunkt). Danach: „Danke! Schicken Sie die Unterlagen einfach hier als Foto oder PDF.“
3. **„Lieber im Termin“ oder keine Antwort:** keine weitere Bitte. Kommen trotzdem Dateien: Inhalt **nicht laden**,
   nur die Media-ID höchstens 24 Stunden merken und die Einwilligungsfrage einmal erneut stellen. Ja: laden. Nein oder
   Ablauf: Media-ID vergessen, kurzer Hinweis „Kein Problem, dann schauen wir sie im Termin an.“
4. **Nach Einwilligung, je Datei:** laden, Typ prüfen, verschlüsselt speichern (wie heute, AES-256-GCM), KI-Zuordnung
   (Sparte, Gesundheitsbezug ja/nein; im Zweifel ja). Sach: Felder auslesen wie heute. Gesundheitsbezug: nur speichern
   und dem Vermittler zeigen.
5. **Schalter `POLICEN_GESUNDHEIT_AN` aus:** gleicher Ablauf; Dateien mit Gesundheitsbezug werden nach der Zuordnung
   verworfen, Hinweis an den Lead. Die Einladung bittet dann nur um Haftpflicht, Hausrat, Wohngebäude, Kfz,
   Rechtsschutz; die Einwilligung wird trotzdem eingeholt, weil auch das Zuordnen bereits Verarbeitung ist.
6. **Vermittler hat den Chat übernommen (Assistent aus):** keine automatische Einwilligungsfrage; Dateien nur mit
   bereits erteilter Einwilligung verarbeiten, sonst wie Punkt 3 ohne Rückfrage (Vermittler sieht „Datei empfangen,
   keine Einwilligung“ und kann den Einwilligungs-Knopf mit einem Klick senden).

### Einwilligungstext

Platzhalter: `{Berater}` = Name des Vermittlers in der passenden Form („Herrn Kannapinn“ bzw. „Ole“), `{Firma}` = Firma
laut Impressum, `{Link}` = Kurz-Datenschutzhinweis zu Unterlagen (Langfassung). Ohne Gedankenstriche, Anführungszeichen
typografisch. Rund 800 Zeichen.

**Sie-Fassung**

> Vor dem Termin können Sie uns Fotos oder PDFs Ihrer bisherigen Versicherungen hier schicken. Unterlagen zur
> Kranken-, Berufsunfähigkeits-, Lebens-, Pflege- oder Unfallversicherung können Angaben zu Ihrer Gesundheit
> enthalten.
>
> Sind Sie einverstanden, dass {Berater} ({Firma}) Ihre Unterlagen einschließlich dieser Gesundheitsangaben
> speichert und zur Vorbereitung Ihres Termins nutzt? Eine KI ordnet jede Unterlage einer Versicherungsart zu,
> Gesundheitsangaben werden nicht ausgewertet. Dafür setzen wir Dienstleister ein, auch in den USA. Sehen kann
> die Unterlagen nur Ihr Berater.
>
> Unterlagen von mitversicherten Personen schicken Sie bitte nur mit deren Einverständnis (bei Kindern als
> Elternteil). Ohne Vertragsabschluss löschen wir alles 30 Tage nach dem Termin. Sie können jederzeit widerrufen,
> zum Beispiel mit der Nachricht „Widerruf“.
>
> Mehr dazu: {Link}
>
> [Ja, einverstanden] [Lieber im Termin]

**Du-Fassung**

> Vor dem Termin kannst du uns Fotos oder PDFs deiner bisherigen Versicherungen hier schicken. Unterlagen zur
> Kranken-, Berufsunfähigkeits-, Lebens-, Pflege- oder Unfallversicherung können Angaben zu deiner Gesundheit
> enthalten.
>
> Bist du einverstanden, dass {Berater} ({Firma}) deine Unterlagen einschließlich dieser Gesundheitsangaben
> speichert und zur Vorbereitung deines Termins nutzt? Eine KI ordnet jede Unterlage einer Versicherungsart zu,
> Gesundheitsangaben werden nicht ausgewertet. Dafür setzen wir Dienstleister ein, auch in den USA. Sehen kann
> die Unterlagen nur dein Berater.
>
> Unterlagen von mitversicherten Personen schick bitte nur mit deren Einverständnis (bei Kindern als Elternteil).
> Ohne Vertragsabschluss löschen wir alles 30 Tage nach dem Termin. Du kannst jederzeit widerrufen, zum Beispiel mit
> der Nachricht „Widerruf“.
>
> Mehr dazu: {Link}
>
> [Ja, einverstanden] [Lieber im Termin]

Hinweise zum Text: Wird die KI-Zuordnung auf eine EU-Region umgestellt und bleibt nur Meta als US-Bezug, bleibt der
USA-Satz trotzdem richtig. Die Langfassung (`{Link}`) nennt: Verantwortlicher mit Anschrift und ggf. DSB, Zweck,
Datenarten, Rechtsgrundlagen (Art. 6 Abs. 1 lit. a und b, Art. 9 Abs. 2 lit. a), Empfänger (Ole Kannapinn UG als
Auftragsverarbeiter, 360dialog, Meta, Anthropic bzw. AWS/Google, Railway), Drittland mit DPF/SCC, Speicherdauer,
Widerruf, Betroffenenrechte, Beschwerderecht. Abschnitt 3 im Entwurf `docs/datenschutz-policen.md` passt als Grundlage,
dort die Aussage „Einwilligung nur bei Gesundheitsbezug“ an den neuen Ablauf anpassen.

### Speicher-, Zugriffs- und Löschregeln

| Regel | Empfehlung |
|---|---|
| Vor Einwilligung | Kein Inhalt geladen, nur Media-ID höchstens 24 Stunden, kein KI-Aufruf |
| Speicherung | Verschlüsselt je Datei (wie heute), nur in der EU (Railway Amsterdam), kein öffentlicher Link, kein Objektspeicher ohne Verschlüsselung |
| KI-Dienst | Für Dateien nach Einwilligung bevorzugt Claude in einer EU-Region (Bedrock Frankfurt oder Vertex EU), sonst Anthropic mit beantragter Zero Data Retention; Anfrage ohne Lead-Name und Telefonnummer |
| Zugriff | Nur Logins des Vermittlers mit Zugriff auf den Lead. Wir (Admin, Support) sehen weder Inhalt noch Dateinamen gesundheitsbezogener Unterlagen; Ausnahme nur auf dokumentierte Weisung des Vermittlers, protokolliert |
| Protokoll | Einwilligung, Widerruf, Ansehen, Herunterladen, Löschen; ohne Inhalte |
| Chatverlauf | Bei Gesundheitsbezug nur „Unterlage empfangen“, keine Dateinamen, keine Sparte im Lead-Verlauf für andere Nutzer |
| Ohne Abschluss | Automatisch 30 Tage nach dem letzten Termin, ohne Termin 30 Tage nach Eingang |
| Mit Abschluss | Standard: 90 Tage nach Abschluss löschen, 14 Tage vorher Erinnerung an den Vermittler: „In Ihre Kundenakte übernehmen“ (Download). Wer behalten will, markiert die Unterlage als „Beratungsdokumentation“; dann bleibt sie bis zur Löschung durch den Vermittler, höchstens bis zum Vertragsende des Kunden bei uns (bestehende Ruhephasen-Regel) |
| Widerruf | Sofort alles löschen (Datei, Auszüge, Media-ID), Vermittler benachrichtigen, Bestätigung an den Lead |
| Art. 15/17 | Unterlagen in Auskunft und Löschung des Leads einbeziehen (`eraseLead`), Export für den Vermittler mit Dateien |
| Meta | Nach dem Laden die Medien bei Meta löschen lassen, soweit die API das für empfangene Medien zulässt; sonst gilt Metas Frist (bis 30 Tage) |

### Was die KI darf und nicht darf

**Darf:**
- Eine Unterlage einer Sparte zuordnen und „Gesundheitsbezug möglich ja/nein“ zurückgeben, erst nach Einwilligung.
- Bei Sachversicherungen die festgelegten Vertragsfelder auslesen (wie heute, ohne Namen, Nummern, Bankdaten).
- Im Chat einladen, Eingang bestätigen, Widerrufe erkennen und ausführen.

**Darf nicht:**
- Gesundheitsbezogene Unterlagen auslesen, zusammenfassen, bewerten oder daraus Empfehlungen, Annahmechancen,
  Risikozuschläge oder Tarifvorschläge ableiten.
- Nach Gesundheit, Vorerkrankungen oder Behandlungen fragen. Schreibt der Lead von sich aus Gesundheitsangaben in
  den Chat, nicht darauf eingehen („Das besprechen wir am besten im Termin.“), nichts davon in Notizen,
  Zusammenfassungen oder Terminvorbereitung übernehmen.
- Unterlagen oder Inhalte an Dritte (Versicherer, Vergleichsrechner) weitergeben oder für Kampagnen, Meta-Rückmeldung
  oder Auswertungen nutzen.
- Entscheidungen mit Wirkung für den Lead treffen (Art. 22).
- Als Mensch auftreten: Der Assistent muss als KI erkennbar sein (Art. 50 Abs. 1 KI-Verordnung, anwendbar seit
  2.8.2026; Stand der Änderungen durch das Digital-Omnibus-Paket prüfen).

### Weitere Schritte vor dem Einschalten

1. Ablauf auf „Einwilligung in der Einladung“ umstellen (Abschnitt b, Punkte 1 bis 6).
2. KI-Zuordnung für Unterlagen auf EU-Region umstellen oder ZDR beantragen; DPF-Einträge von Anthropic und Meta
   prüfen und ablegen.
3. Muster-DSFA erstellen (Nr. 11 DSK-Liste, für den Assistenten insgesamt) und Kunden bereitstellen.
4. AVV ergänzen (Entwurf in `docs/datenschutz-policen.md` Abschnitt 4), § 203-Klausel prüfen, Langfassung `{Link}`.
5. Anwaltsfragen aus Abschnitt c klären, dann `POLICEN_GESUNDHEIT_AN` einschalten.

---

## (c) Restrisiken und Punkte für den Anwalt

1. **Knopf als ausdrückliche Einwilligung:** Reicht „Ja, einverstanden“ in WhatsApp (bestes Wissen: ja), und ist der
   Kurztext mit Link ausreichend informiert? Muss der Dienstleister-Hinweis (USA) in den Kurztext?
2. **Einwilligung für alle Policen vorab:** Ist die Bündelung (eine Einwilligung, auch wenn der Lead nur Sach schickt)
   freiwillig und bestimmt genug? Alternative wäre eine zweistufige Frage, die aber Punkt 2 (Klassifikation vor
   Einwilligung) wieder öffnet.
3. **Unaufgefordert geschickte Dateien:** Ist das Merken der Media-ID (Verweis, kein Inhalt) bis 24 Stunden zulässig?
   Ist der Transport über Meta/360dialog vor Einwilligung unproblematisch?
4. **Mitversicherte Personen:** Genügt der Hinweis im Text plus Information im Termin, oder braucht es eine eigene
   Erklärung erwachsener Mitversicherter? Darf ein Elternteil allein für Kinder einwilligen?
5. **§ 203 StGB:** Gilt er für Makler? Reichen die Vertraulichkeitsklauseln der Großanbieter (Meta, Anthropic, AWS)
   als „zur Geheimhaltung verpflichtet“ (Abs. 4 Satz 2 Nr. 2)? Wortlaut der AVV-Klausel und der Mitarbeiter-Vorlage
   (die bereits Nr. 7 nennt).
6. **Ausschließlichkeitsvertreter:** Rolle gegenüber dem Versicherer (eigener Verantwortlicher oder
   Auftragsverarbeiter des Versicherers)? Braucht der Vertreter die Zustimmung seines Versicherers, und verbieten
   Agenturverträge externe Tools für Gesundheitsdaten?
7. **Aufbewahrung nach Abschluss:** Trägt Art. 9 Abs. 2 lit. f die Aufbewahrung beratungsrelevanter Altpolicen nach
   Widerruf? Sind 90 Tage Standard plus Markierung „Beratungsdokumentation“ angemessen?
8. **Drittland:** Reicht DPF/SCC für Art.-9-Daten bei Anthropic und Meta, oder verlangt der Anwalt EU-Verarbeitung?
   Risiko eines EuGH-Urteils in C-703/25 P (dann sofort SCC und TIA).
9. **Gesundheitsangaben im Freitext:** Leads schreiben Gesundheitsangaben auch ohne Datei in den Chat; die laufen
   heute über den KI-Assistenten (Anthropic). Braucht es dafür eine Regel oder Filterung, oder deckt die Einwilligung
   das ab, wenn sie erteilt ist?
10. **DSFA:** Bestätigung, dass Nr. 11 der DSK-Liste den Assistenten insgesamt erfasst, und ob eine Muster-DSFA durch
    uns genügt.
11. **Alter:** Minderjährige Leads (selten): Einwilligungsfähigkeit für Art.-9-Daten; Assistent bei Hinweis auf
    unter 18 keine Unterlagen annehmen lassen?
12. **Haftung und AGB:** Haftungsbegrenzung gegenüber Vermittlern für diese Funktion, Freistellung bei
    Weisungsverstoß des Kunden.

Restrisiken, die auch bei guter Umsetzung bleiben: Leads schicken Unterlagen Dritter ohne deren Wissen; Meta speichert
Medien bis zu 30 Tage außerhalb unserer Kontrolle; das DPF kann fallen; die Einstufung „Makler und § 203“ ist
ungeklärt; eine Aufsichtsbehörde kann strengere Anforderungen an „informiert“ stellen als der Kurztext erfüllt.

---

## (d) Quellen

Normen
- DSGVO, insbesondere Art. 4 Nr. 2, 11 und 15, Art. 6, 7, 9, 13, 14, 17, 22, 28, 35, 44 bis 49:
  [EUR-Lex 32016R0679](https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32016R0679)
- [§ 22 BDSG](https://www.gesetze-im-internet.de/bdsg_2018/__22.html)
- [§ 203 StGB](https://www.gesetze-im-internet.de/stgb/__203.html) (Wortlaut über Legal Data Hunter geprüft, Abs. 1 Nr. 7, Abs. 3, Abs. 4)
- [§ 61 VVG](https://www.gesetze-im-internet.de/vvg_2008/__61.html) (geprüft), [§ 62 VVG](https://www.gesetze-im-internet.de/vvg_2008/__62.html), [§ 63 VVG](https://www.gesetze-im-internet.de/vvg_2008/__63.html)
- [§ 199 BGB](https://www.gesetze-im-internet.de/bgb/__199.html), [§ 1687 BGB](https://www.gesetze-im-internet.de/bgb/__1687.html)
- [§ 257 HGB](https://www.gesetze-im-internet.de/hgb/__257.html), [§ 147 AO](https://www.gesetze-im-internet.de/ao_1977/__147.html)
- [§ 22 VersVermV](https://lxgesetze.de/versvermv/22) (Inhalt laut [IHK Magdeburg](https://www.ihk.de/magdeburg/recht/finanzdienstleistungen-und-versicherungswirtschaft/recht-versicherungsbranche/grundlegende-informationen/aufzeichnungspflichten-4794262))
- KI-Verordnung (EU) 2024/1689, Art. 50, Art. 113: [EUR-Lex 32024R1689](https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32024R1689)
- Durchführungsbeschluss (EU) 2023/1795 (DPF): [EUR-Lex 32023D1795](https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32023D1795)

Rechtsprechung
- BGH, Urt. v. 10.2.2010, VIII ZR 53/09 (selbstständiger Versicherungsvertreter unter § 203, Unfallversicherung,
  Schutz schon der Vertragstatsache): [rechtsprechung-im-internet.de](https://www.rechtsprechung-im-internet.de/jportal/?quelle=jlink&docid=KORE302852010&psml=bsjrsprod.psml) (Volltext geprüft)
- EuGH, Urt. v. 4.10.2024, C-21/23, Lindenapotheke (Begriff Gesundheitsdaten): [EUR-Lex 62023CJ0021](https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:62023CJ0021) (gefunden, Kernaussage aus Fachwissen)
- EuGH, Urt. v. 4.7.2023, C-252/21, Meta Platforms/Bundeskartellamt (Art. 9 bei mittelbarer Offenlegung, Einwilligung): [EUR-Lex 62021CJ0252](https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:62021CJ0252) (gefunden, Randnummern aus Fachwissen)
- EuGH, Urt. v. 1.8.2022, C-184/20, OT: [EUR-Lex 62020CJ0184](https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:62020CJ0184) (nicht im Volltext geprüft)
- EuGH, Urt. v. 21.12.2023, C-667/21, Krankenversicherung Nordrhein (Art. 6 und Art. 9 kumulativ): [EUR-Lex 62021CJ0667](https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:62021CJ0667) (nicht im Volltext geprüft)
- EuGH, Urt. v. 1.10.2019, C-673/17, Planet49 (aktive Einwilligung): [EUR-Lex 62017CJ0673](https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:62017CJ0673) (nicht im Volltext geprüft)
- BVerwG, Urt. v. 6.3.2026, 6 C 7.24 (PKV, Diagnosedaten nur mit Einwilligung): [bverwg.de](https://www.bverwg.de/060326U6C7.24.0), [Pressemitteilung 16/2026](https://www.bverwg.de/pm/2026/16) (Volltext nicht geprüft)
- BGH, Urt. v. 13.11.2014, III ZR 544/13 (Dokumentationsmangel, Beweiserleichterung) (nicht im Volltext geprüft)
- EuG, Urt. v. 3.9.2025, T-553/23, Latombe; Rechtsmittel C-703/25 P: [WilmerHale](https://www.wilmerhale.com/en/insights/blogs/wilmerhale-privacy-and-cybersecurity-law/20251201-european-court-of-justice-to-review-challenge-to-eu-us-data-privacy-framework), [Digital Policy Alert](https://digitalpolicyalert.org/event/35459-latombe-filed-appeal-against-general-court-dismissal-of-challenge-to-european-unionunited-states-data-protection-framework-adequacy-decision-in-latombe-v-commission)

Aufsicht, DSK, EDPB
- DSK, Liste der Verarbeitungstätigkeiten, für die eine DSFA durchzuführen ist, Version 1.1 vom 17.10.2018 (Nr. 3, 11, 16, 17 im Wortlaut geprüft): [PDF](https://www.datenschutzkonferenz-online.de/media/ah/20181017_ah_DSK_DSFA_Muss-Liste_Version_1.1_Deutsch.pdf)
- EDPB, Leitlinien 05/2020 zur Einwilligung (Rn. 64 Mindestinformation, Abschnitt 4 ausdrückliche Einwilligung, Widerruf): [edpb.europa.eu](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-052020-consent-under-regulation-2016679_de) (Randnummern nicht im Volltext geprüft)
- Art.-29-Gruppe, WP 248 rev.01 (DSFA-Kriterien): [ec.europa.eu](https://ec.europa.eu/newsroom/article29/items/611236)
- DSK, Orientierungshilfe Künstliche Intelligenz und Datenschutz (6.5.2024): [PDF](https://www.datenschutzkonferenz-online.de/media/oh/20240506_DSK_Orientierungshilfe_KI_und_Datenschutz.pdf)
- Düsseldorfer Kreis, Muster-Einwilligungs- und Schweigepflichtentbindungserklärung der Versicherungswirtschaft: [datenschutz-mv.de](https://www.datenschutz-mv.de/static/DS/Dateien/Duesseldorfer_Kreis/Einw_Verswi.pdf)

Anbieter
- Anthropic, Speicherdauer kommerzieller API-Daten: [privacy.claude.com](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-commercial-api-data)
- Anthropic, Data residency (`inference_geo`): [platform.claude.com](https://platform.claude.com/docs/en/manage-claude/data-residency.md)
- Meta, WhatsApp Cloud API Data Privacy & Security: [developers.facebook.com](https://developers.facebook.com/documentation/business-messaging/whatsapp/data-privacy-and-security)
- 360dialog, Architecture and Security: [docs.360dialog.com](https://docs.360dialog.com/docs/resources/architecture-and-security)
- DPF-Teilnehmerliste: [dataprivacyframework.gov](https://www.dataprivacyframework.gov/list) (Einträge Anthropic und Meta noch prüfen)

Literatur
- Dr. Datenschutz, Geheimhaltungspflicht nach StGB für selbstständige Versicherungsmakler? (18.3.2010): [dr-datenschutz.de](https://www.dr-datenschutz.de/geheimhaltungspflicht-nach-stgb-fuer-selbstaendige-versicherungsmakler/)
