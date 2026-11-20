# Datenschutzhinweise des Vermittlers (Art. 13/14 DSGVO): interne Prüfnotiz

Stand: 20.11.2026, Datenschutz & Compliance. Interne Prüfung nach AGENTS.md (keine Anwaltsfreigabe abwarten), keine Rechtsberatung.
Text: `src/lib/datenschutz-vermittler.ts` (`DATENSCHUTZ_VERMITTLER_VERSION = "20.11.2026"`). Noch nicht eingebunden.

## Ausgangslage

Fußzeile der Lead-Seiten (`src/components/lead-legal-footer.tsx`) und Buchungsseite (`src/app/book/[slug]/page.tsx`,
`privacyUrl`) verlinken ohne hinterlegte `websiteInfo.privacyUrl` auf performancegrowth.de/datenschutz. Für Lead- und
Termindaten ist der Vermittler Verantwortlicher, wir sind Auftragsverarbeiter (AVV). Die Information nach Art. 13 muss
den Verantwortlichen nennen; unsere eigene Datenschutzerklärung erfüllt das nicht. Ole, 20.11.2026: eigene Seite im
Namen des Vermittlers als Rückfall.

## Ampel

**GELB: einsetzbar, mit Auflagen.** Der Text deckt die Pflichtangaben nach Art. 13 Abs. 1, 2 und Art. 14 (Herkunft)
ab und gibt den tatsächlichen Stand im Code wieder. Vor dem Livegang A1 bis A3 erledigen; A4 bis A7 zeitnah.

## Auflagen vor dem Livegang

- **A1 Unterauftragsverarbeiter-Liste nachziehen.** Der Text nennt, was der Code tut; `SUBPROCESSORS` (AVV Anlage 2)
  ist nicht vollständig: OpenAI wird dort nur für Werbemotive „ohne Lead-Daten“ geführt, liest aber Policen über den
  EU-Endpunkt aus (`lib/policen/auslesen/konfig.ts`, `eu.api.openai.com`); Amazon Web Services (S3, Region EU) für die
  Ablage der Unterlagen steht nur in `lib/policen/avv-text.ts`, nicht in `SUBPROCESSORS`; Bedrock (AWS) ist als
  Alternative eingebaut. Änderung der Anlage 2 löst die Informationspflicht gegenüber den Vermittlern aus
  (14 Tage Widerspruch). Stufe A (Vertragstext), Ole entscheidet.
- **A2 Einbindung.** Rückfall in `leadLegalLinks` und auf `/book` auf die neue Seite statt `operatorPrivacy()`;
  Link „Technischer Dienstleister“ bleibt. Einwilligungstext auf `/book` (Fassung a) sagt „Datenschutzerklärung“:
  bei der neuen Seite „Datenschutzhinweise“. Seite ohne Sitzungsaufnahme, `noindex`.
- **A3 Leere Vermittlerdaten.** Ohne Name und Anschrift ist die Seite nach Art. 13 Abs. 1 lit. a mangelhaft
  (Rückfalltext verweist nur auf die Anbieterangaben). Seite nur ausspielen, wenn mindestens Name und Anschrift da
  sind; sonst Admin-Aufgabe wie bei „Impressum-URL fehlt“ (`lib/impressum-fehlt.ts`).

## Offene Punkte

- **A4 Datenschutzbeauftragter** (Art. 13 Abs. 1 lit. b): Die Funktion hat kein Feld dafür. Die meisten Vermittler
  brauchen keinen (unter 20 Personen ständig mit Daten befasst, § 38 BDSG); wer einen hat, braucht ein optionales Feld.
- **A5 Löschfrist für Leads ohne Abschluss** (Art. 5 Abs. 1 lit. e, Art. 13 Abs. 2 lit. a): Es gibt keine automatische
  Löschung inaktiver Leads (`lib/erasure.ts` löscht nur auf Anforderung, bei Vertragsende und für Nebendaten). Der Text
  nennt daher nur das Kriterium „nicht mehr erforderlich“. Empfehlung: feste Frist, zum Beispiel 24 Monate nach dem
  letzten Kontakt ohne Abschluss, als Cron mit Löschprotokoll; dann im Text konkret nennen. Gehört ins Löschkonzept.
- **A6 Gesundheitsangaben aus Anfrageformularen.** Der Abschnitt stützt sich auf eine ausdrückliche Einwilligung nach
  Art. 9 Abs. 2 lit. a. Ob die Meta-Formulare bzw. Funnel eine solche Einwilligung tatsächlich einholen, ist nicht
  geprüft. Falls nicht, ist die Rechtsgrundlage offen (Text dann anpassen und Formulare nachrüsten). Die Ausblendung
  vor der KI (`lib/gesundheitsdaten.ts`) arbeitet mit Mustern und ist kein vollständiger Filter; im Text steht deshalb
  „werden entfernt“ ohne Absolutzusage. Bei Zweifel auf „werden vor der Übermittlung ausgeblendet“ lassen.
- **A7 Rückmeldung an Meta (Conversions API).** Pseudonym, ohne Kontaktdaten und Sparte (`lib/capi/shared.ts`).
  Offen: gemeinsame Verantwortlichkeit Vermittler und Meta (Art. 26, EuGH Fashion ID) und ob lit. f trägt, wenn der
  Abschlusswert übermittelt wird. Der Abschnitt ist bedingt formuliert („kann“), weil die Rückmeldung je Kunde
  abschaltbar ist. Gleiches Thema wie der offene Punkt in `lib/funnel/meta.ts`.

## Annahmen

- Anthropic (Chat-Assistent, Angebote) läuft über die direkte API (USA), nicht über Bedrock EU (`lib/whatsapp/bot.ts`
  `new Anthropic()`); Drittlandgrundlage pauschal „DPF, soweit zertifiziert, sonst SCC“ wie im AVV. Zertifizierungen
  einzeln nicht nachgeprüft; vor Livegang die DPF-Liste für Anthropic, Resend, Railway, Sentry prüfen.
- Videotermine laufen über den Dienst des Vermittlers (Google Meet, Microsoft Teams), nicht über uns.
- SMS (seven.io) nur, wenn WhatsApp nicht erreichbar ist; Airtable und Zapier sind im Übergang und im Text nicht
  genannt, weil sie die Seiten der Leads nicht betreffen. Werden über sie noch Lead-Daten geführt: ergänzen.
- Beratungsdokumentation 10 Jahre (`lib/lead-files.ts` `BERATUNGSDOKU_AUFBEWAHRUNG_JAHRE`).
- Pay-per-Lead und eigene Funnel-Seiten von performancegrowth sind nicht Gegenstand: Dort sind wir selbst
  Verantwortlicher für die Erhebung, unsere Datenschutzerklärung bleibt richtig.
- Die Langfassung zu Unterlagen (`/datenschutz/policen`, `lib/policen/datenschutz-text.ts`) bleibt maßgeblich vor der
  Einwilligung; die neue Seite fasst sie nur zusammen und widerspricht ihr nicht (90 Tage, „ohne KI“, EU-KI-Dienst).

## Conversion-Blick

Kurze Abschnitte mit 1 bis 3 Sätzen, neutrale Ansprache, keine Gedankenstriche. Kein Pflicht-Haken nötig: Information
nach Art. 13 genügt für die Buchung (lit. b, siehe `buchungsseite-komplettcheck.md`). Widerspruch steht als eigener
Abschnitt (Art. 21 Abs. 4: getrennt von anderen Informationen).

Stufe: Text B (Bewertung, hier erledigt). Livegang und Änderung der AVV-Anlage: A (Ole).

## Umsetzung (20.11.2026, Freigabe Ole: „live, und ja und ja“)
- Live: Seite /erstinformation/<token>/datenschutz, verlinkt in Fußzeile und Buchungsseite, nur mit Name und Anschrift (A2, A3 erledigt).
- A1 erledigt: SUBPROCESSORS um OpenAI Ireland (EU-Endpunkt, Auslesen von Unterlagen) und den Speicher der Unterlagen laut POLICEN_S3_ENDPOINT ergänzt; die Datenschutzhinweise nennen den Speicher ebenfalls aus der Konfiguration.
- A5 erledigt: Leads ohne Abschluss werden 24 Monate nach dem letzten Kontakt anonymisiert (lib/lead-loeschfrist.ts, täglicher Wartungslauf, höchstens 200 je Lauf); Text „spätestens 24 Monate nach dem letzten Kontakt“.
- Neu: optionales Feld „Eigene Datenschutzseite“ in der Einrichtung (Schritt Erstinformation).
- Offen: A4 (Datenschutzbeauftragter), A6 (Art.-9-Einwilligung in Anfrageformularen prüfen), A7 (Rückmeldung an Meta, Art. 26).
