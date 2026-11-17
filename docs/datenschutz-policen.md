# Policen vor dem Termin per WhatsApp: Datenschutz (Entwurf)

Stand: 17.11.2026 (Ole). **Entwurf, nicht live geschaltet.** Die Texte in Abschnitt 2 bis 4 gehen erst nach Prüfung durch
den Anwalt in die Rechtstexte (`/rechtliches/avv`, Datenschutzhinweise, `docs/datenschutz.md`). Der Teil mit
Gesundheitsbezug ist hinter dem Schalter `POLICEN_GESUNDHEIT_AN` (Railway-Variable, Standard aus).

## 1. Was die App macht

- **Zweck:** Leads können vor dem Termin Fotos oder PDFs ihrer bestehenden Policen in den WhatsApp-Chat schicken, damit
  sich der Vermittler vorbereiten kann (Komplettcheck). Freiwillig; ohne Unterlagen wird im Termin gemeinsam geschaut.
- **Einladung:** Der Assistent bittet einmal darum, nachdem der Lead bestehende Verträge genannt hat (Vertragsfrage bzw.
  Komplettcheck „Ja“). Bei Schalter aus nur um Sachversicherungen (Haftpflicht, Hausrat, Kfz …), bei Leads zu
  Gesundheitsprodukten (PKV, Zahn, BU) gar nicht.
- **Eingang:** Nur in Chats mit zugeordnetem Lead. Private Chats aus der WhatsApp-Business-App und das Support-Postfach
  werden nicht geladen. Erlaubt: PDF, JPG, PNG, WebP bis 10 MB (Typ am Inhalt geprüft), höchstens 30 je Lead. HEIC,
  Word usw.: nicht gespeichert, Bitte um Foto oder PDF.
- **Zuordnung (KI, Anthropic):** Je Datei ein Aufruf, der nur die Sparte und „Gesundheitsbezug möglich ja/nein“
  zurückgibt (keine Inhalte). Dateiname und Begleittext können einen Gesundheitsbezug nur ergänzen. Ohne KI-Ergebnis
  und ohne erkennbare Sparte gilt vorsichtig: Gesundheitsbezug möglich.
- **Sachversicherungen** (Haftpflicht, Hausrat, Wohngebäude, Kfz, Rechtsschutz, Tier): verschlüsselt gespeichert, kurz
  bestätigt („Danke, ist angekommen.“), dann ausgelesen (Gesellschaft, Sparte, Beitrag, Zahlweise, Versicherungssumme,
  Selbstbeteiligung, Ablauf/Hauptfälligkeit; Prompt: keine Namen, Anschriften, Geburtsdaten, Vertrags-, Kunden- oder
  Kennzeichennummern, Bankdaten, Gesundheitsangaben).
- **Gesundheitsbezug** (Kranken, Zahn, BU, Leben/Rente, Pflege, Unfall):
  - Schalter aus: Datei wird verworfen (nicht gespeichert), freundlicher Hinweis, dass wir sie im Termin anschauen.
  - Schalter an, ohne Einwilligung: Es wird nur die WhatsApp-Media-ID gemerkt (kein Inhalt), dann die
    Einwilligungsfrage mit zwei Knöpfen. „Ja, einverstanden“: Einwilligung protokolliert, Datei erneut bei 360dialog
    geladen und verschlüsselt gespeichert. „Lieber im Termin“: Media-ID gelöscht, „Kein Problem, dann schauen wir sie im
    Termin an.“ Ohne Antwort: nach 24 Stunden gelöscht. Hat der Vermittler den Chat übernommen (Assistent aus), wird
    nicht gefragt und nicht gespeichert.
  - Mit Einwilligung: gespeichert, **nie ausgelesen**, nur dem Vermittler gezeigt, mit Kennzeichen „Gesundheitsangaben
    möglich, mit Einwilligung vom …“.
- **Widerruf:** „Widerruf“ bzw. „Unterlagen löschen“ im Chat löscht sofort alle Unterlagen des Leads und protokolliert
  den Widerruf. Der Vermittler kann jede Unterlage im Kontakt löschen.
- **Löschung:** automatisch 30 Tage nach dem letzten Termin (ohne Termin: nach dem Eingang), wenn kein Abschluss; mit dem
  Lead (Art. 17, `eraseLead`) und bei Vertragsende (`eraseCustomerData`). Bei Abschluss bleibt die Unterlage, bis der
  Vermittler sie löscht (offene Frage 6).

## 2. Einwilligungstext (Art. 9 Abs. 2 lit. a DSGVO)

Wortlaut, wie er gesendet und im Einwilligungsprotokoll gespeichert wird (`lib/policen/regeln.ts einwilligungText`):

> **Sie:** Unterlagen zur Kranken-, BU- oder Lebensversicherung können Gesundheitsangaben enthalten. Dürfen wir sie für
> Herrn Kannapinn zur Vorbereitung speichern? Sie können das jederzeit widerrufen.
>
> **Du:** Unterlagen zur Kranken-, BU- oder Lebensversicherung können Gesundheitsangaben enthalten. Dürfen wir sie für
> Ole zur Vorbereitung speichern? Du kannst das jederzeit widerrufen.
>
> Knöpfe: [Ja, einverstanden] [Lieber im Termin]

Protokoll (`BestandConsentLog`, dasselbe Einwilligungsprotokoll wie im Bestandskunden-Modul): Kanal `whatsapp`, Aktion
`erteilt` bzw. `widerrufen`, Quelle `policen_gesundheit`, Wortlaut, WhatsApp-Nummer, Zeitpunkt. Die Unterlage verweist
auf den Eintrag (`LeadDocument.consentId`, `consentAt`). Zusätzlich Änderungsprotokoll (`policen.einwilligung`,
`policen.widerruf`, `policen.verworfen`, `policen.ansehen`), ohne Inhalte.

**Vorschlag für eine ausführlichere Fassung** (falls der Anwalt mehr Information in der Frage verlangt; WhatsApp erlaubt
bis 1.024 Zeichen):

> Unterlagen zur Kranken-, BU- oder Lebensversicherung können Gesundheitsangaben enthalten. Dürfen wir sie für Herrn
> Kannapinn zur Vorbereitung Ihres Termins speichern? Gespeichert wird verschlüsselt, ausgelesen wird nichts. Ohne
> Abschluss löschen wir sie 30 Tage nach dem Termin. Sie können das jederzeit widerrufen, schreiben Sie einfach
> „Widerruf“. Mehr: [Link Datenschutzhinweise des Vermittlers]

## 3. Ergänzung Datenschutzhinweise für Leads (Entwurf)

Für die Datenschutzhinweise des Vermittlers (Buchungsseite, Rückfall performancegrowth.de/datenschutz), Sie-Form, ohne
Gedankenstriche:

> **Unterlagen, die Sie uns per WhatsApp schicken**
>
> Wenn Sie möchten, können Sie uns vor dem Termin Fotos oder PDFs Ihrer bestehenden Versicherungsverträge per WhatsApp
> schicken. Wir nutzen sie, um Ihren Termin vorzubereiten (Art. 6 Abs. 1 lit. b DSGVO, vorvertragliche Maßnahmen auf
> Ihre Anfrage). Die Unterlagen werden verschlüsselt gespeichert und sind nur für Ihren Berater sichtbar.
>
> Damit Ihr Berater sie schneller vorbereiten kann, ordnet eine Software mit künstlicher Intelligenz (Anthropic, PBC,
> USA; EU-US Data Privacy Framework bzw. Standardvertragsklauseln, keine Nutzung zum Training) jede Unterlage einer
> Sparte zu. Bei Sachversicherungen (z. B. Haftpflicht, Hausrat, Kfz) liest sie außerdem Versicherer, Beitrag,
> Zahlweise, Versicherungssumme, Selbstbeteiligung und Ablauf aus.
>
> Unterlagen zur Kranken-, Berufsunfähigkeits-, Lebens-, Pflege- oder Unfallversicherung können Angaben zu Ihrer
> Gesundheit enthalten. Diese speichern wir nur mit Ihrer ausdrücklichen Einwilligung (Art. 9 Abs. 2 lit. a DSGVO) und
> lesen sie nicht aus. Sie können die Einwilligung jederzeit widerrufen, zum Beispiel mit der Nachricht „Widerruf“; die
> Unterlagen werden dann sofort gelöscht. Die Rechtmäßigkeit der bis dahin erfolgten Verarbeitung bleibt unberührt.
>
> Kommt kein Vertrag zustande, löschen wir die Unterlagen 30 Tage nach dem Termin. Schließen Sie einen Vertrag ab,
> bewahren wir sie auf, solange wir sie für Ihre Betreuung und unsere gesetzlichen Pflichten brauchen.

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
  Sachversicherungen), Railway (Hosting, verschlüsselt). Keine neuen Empfänger.
- *Weisung:* Gesundheitsbezogene Unterlagen werden nur verarbeitet, wenn der Kunde die Funktion nutzt und die
  Einwilligung vorliegt; ohne Einwilligung wird die Datei verworfen.

**TOM (Anlage 1), Ergänzung:**

| Maßnahme | Umsetzung |
|---|---|
| Verschlüsselung der Inhalte | AES-256-GCM je Datei mit zufälligem IV, Schlüssel `ENCRYPTION_KEY` (nicht in der Datenbank), `lib/encryption.ts encryptBytes`; Datenbank zusätzlich nur intern erreichbar, TLS nach außen |
| Datensparsamkeit | Ohne Einwilligung kein Inhalt gespeichert (nur Media-ID, 24 Stunden); KI-Zuordnung gibt nur Sparte und Ja/Nein zurück; Gesundheitsunterlagen nie ausgelesen; Chatverlauf ohne Dateinamen bei Gesundheitsbezug |
| Zugriff | Nur Logins des Kunden, die den Lead sehen dürfen (Inhaber, zuständiger Berater; `leadScope`). Admin in „Als Kunde ansehen“: keine Inhalte und keine Dateinamen gesundheitsbezogener Unterlagen. Abruf nur über die App (`Cache-Control: no-store`), kein öffentlicher Link, kein Objektspeicher |
| Protokollierung | Einwilligung und Widerruf im Einwilligungsprotokoll; Ansehen gesundheitsbezogener Unterlagen, Verwerfen und Widerruf im Änderungsprotokoll (ohne Inhalte) |
| Löschfristen | 30 Tage nach dem letzten Termin ohne Abschluss (Cron täglich 03:00 UTC, `prunePolicen`), ausstehende Einwilligung 24 Stunden, Widerruf sofort, Art. 17 und Vertragsende (`erasure.ts`) |
| Schalter | `POLICEN_GESUNDHEIT_AN` (Standard aus): ohne ihn werden Unterlagen mit Gesundheitsbezug nie gespeichert |

**Löschkonzept (`docs/datenschutz.md`, Abschnitt 4), neue Zeile nach Freigabe:**
„Unterlagen per WhatsApp (`LeadDocument`) | 30 Tage nach dem letzten Termin ohne Abschluss; ausstehende Einwilligung
24 Stunden; Widerruf sofort; mit dem Lead bzw. Vertragsende | automatisch (`prunePolicen`), `eraseLead`/`eraseCustomerData`“

## 5. Offene Fragen an den Anwalt

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
  `components/unterlagen-vom-kunden.tsx` (Terminvorbereitung), Abruf `api/buyer/leads/[id]/unterlagen/[docId]`.
- Datenmodell: `LeadDocument` (Migration `20261118706700_lead_unterlagen_whatsapp`).
- Tests: `tests/unit/policen.test.ts`, `tests/integration/policen-whatsapp.test.ts` (Speichern/Verschlüsseln,
  Einwilligung ja/nein, Schalter aus, Widerruf, Löschfrist, Art. 17, Rechte, Einladung).
- Nicht im Datenexport des Kunden (Konto → Export) enthalten: **offen**, nach Freigabe ergänzen (nur Metadaten oder
  auch Dateien?).
