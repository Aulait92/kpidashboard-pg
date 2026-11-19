# Beratungspräsentation: Abschluss-Schritt, Einwände, Messung (interne Rechtsprüfung, 19.11.2026)

Gegenstand: Folie „Ihre Entscheidung“ mit „Ja, so machen wir es“ (Termin und Kundenlink, Splittest B), Einwand-Folien,
Sprechhinweise, Messung „Folie erreicht“ und Zusage (`PraesentationEreignis`).

## Ergebnis

- **Kein Vertragsschluss per Klick.** „Ja, so machen wir es“ ist eine unverbindliche Zusage an den Vermittler. Im
  Kundenlink steht direkt am Knopf: „Unverbindlich: {Berater} meldet sich und füllt den Antrag mit Ihnen aus.“ Antrag,
  Pflichtinformationen des Versicherers (VVG-InfoV) und Beratungsdokumentation (§§ 61, 62 VVG) folgen wie bisher vor
  dem Vertragsschluss. Die Folie nennt „Unterlagen und Beratungsdokumentation per E-Mail“.
- **Preise nur aus den bestätigten Angeboten** (Tarifkatalog bzw. Angebot), Kombi-Rabatt mit Bedingung und Hinweis
  nach § 7a VVG wie bisher auf „Ihr Beitrag“. „Pro Tag“ ist als „rund“ gekennzeichnet und aus dem Monatsbeitrag
  gerechnet. Die Einwand-Folie „Zu teuer“ nennt die Summe der kleinsten Stufen nur, wenn sie aus den Angeboten stammt
  und klar günstiger ist, ausdrücklich ohne Kombi-Rabatt gerechnet („kleinste Stufe je Versicherung“).
- **Keine irreführenden Aussagen (§ 5 UWG, IDD Art. 17):** kein „Garantie“, keine Ergebnis- oder Leistungsversprechen,
  keine künstliche Dringlichkeit, kein erfundener sozialer Beweis (keine Bewertungen oder Quoten ohne echte Daten).
  „Bei der Kündigung Ihres bisherigen Vertrags helfen wir“ nur, wenn für eine gewählte Sparte ein bisheriger Vertrag
  erfasst ist. „Lohnt sich ein Wechsel nicht, sagen wir Ihnen das“ beschreibt die Beratungspflicht (bestmögliches
  Interesse, § 1a VVG), kein Ergebnis.
- **Widerrufsrecht 14 Tage** (§ 8 VVG) als Sicherheit, nicht als Druckmittel; die Einwand-Folie „Noch nachdenken“
  fragt nach dem offenen Punkt, sie drängt nicht zum Abschluss.
- **Datenschutz Messung:** gespeichert werden nur Termin, Quelle, Art, Folien-ID, Variante (berechtigtes Interesse,
  Art. 6 Abs. 1 f DSGVO: Qualität der Beratung). Kein Cookie und kein Speichern auf dem Gerät (§ 25 TDDDG greift
  nicht), keine IP, kein Gerät, keine Lesedauer, je Folie höchstens ein Eintrag. Lesefortschritt einzelner Kunden wird
  dem Vermittler nicht angezeigt, nur die aktive Zusage (vom Kunden selbst ausgelöst). Löschung mit dem Termin.

## Auflagen

1. Datenschutzhinweis des Kundenlinks bei nächster Überarbeitung um einen Satz ergänzen: „Wir zählen, welche Folien
   aufgerufen wurden und ob Sie zusagen, ohne Cookies und ohne Angaben zu Ihrem Gerät.“
2. Sozialen Beweis (Bewertungen, „die meisten wählen …“) erst mit echten, belegbaren Daten des Vermittlers zeigen.
3. Abschlussquote nicht als Werbeaussage gegenüber Vermittlern oder auf der Webseite verwenden, bevor der Test
   ausgewertet ist.

## Nachtrag: Herausforderer Fassung C (interne Rechtsprüfung, 19.11.2026)

Gegenstand: Splittest „praesentation“ (lib/experimente.ts, a = B Standard, b = C), startet angehalten. C: Einstieg mit
dem Anliegen des Kunden, Beitrag auf der Entscheidungsfolie, Wahl zwischen „Unsere Empfehlung“ und „Etwas günstiger“,
bisheriger Vertrag in Euro, „Unverbindlich. Den Antrag füllen wir gemeinsam aus.“ am Knopf.

- **Zwei Pakete statt Ja oder Nein (§ 5 UWG, § 61 VVG, IDD Art. 20):** Beide Pakete bestehen nur aus Tarifen der
  bestätigten Angebote, Preise je Paket mit Kombi-Rabatt gerechnet (wie „Ihr Beitrag“), „rund … am Tag“ aus dem
  Monatsbeitrag. Die Empfehlung bleibt als solche gekennzeichnet und vorausgewählt. „Etwas günstiger“ ist je Sparte die
  nächste echte Stufe unter der Empfehlung (keine Köder-Stufe, nicht künstlich verschlechtert); was dort anders ist,
  steht an der Karte („Unterschied: ohne …“, abweichende Werte), damit die Wahl informiert ist. Bei einer Auswahl von
  Hand steht sie als „Ihre Auswahl“ neben der Empfehlung, nichts wird still ersetzt.
- **Hinweis nach § 7a VVG** (auch einzeln abschließbar, Bedingung des Kombi-Rabatts) steht auf der Entscheidungsfolie,
  sobald ein Paket den Kombi-Rabatt enthält; C hat keine eigene Folie „Ihr Beitrag“.
- **Bisheriger Vertrag in Euro** nur, wenn für die Sparte ein bisheriger Beitrag erfasst ist (von Hand, Police oder
  Chat, wie die Spalte auf der Vergleichsfolie): „Ihr bisheriger Vertrag …: … im Monat. Ihre Auswahl: … mehr bzw.
  weniger im Jahr als bisher“, neutral, ohne Ersparnisversprechen, auch wenn es teurer wird.
- **Kein Vertragsschluss per Klick:** wie B; in C steht „Unverbindlich“ zusätzlich direkt am Knopf im Termin.
- Kein sozialer Beweis, keine Dringlichkeit, kein „Garantie“ (Tests prüfen das). Ergebnisse des Komplettchecks
  („Sie zahlen vielleicht doppelt“) bekommen keine eigene Folie: Es gibt keine geprüfte Erkennung doppelter Verträge,
  eine solche Aussage wäre ohne Datengrundlage irreführend; der Überblick (Ampel) bleibt.
- **Datenschutz Splittest:** Zuteilung je Lead-ID (pseudonym, ExperimentZuteilung), erst ab einer gezeigten Folie bzw.
  der Zusage; keine neuen Personendaten, kein Cookie.

Auflagen C:
1. Erst einschalten, wenn Ole die Fassung gesehen hat (Vorschau /demo/beratung?fassung=c).
2. Wählt der Kunde „Etwas günstiger“ bzw. eine Auswahl abweichend von der Empfehlung, trägt der Vermittler das in der
   Beratungsdokumentation unter „Entscheidung des Kunden“ ein (der Entwurf lässt dafür Platz; ein automatischer
   Satz folgt mit der nächsten Überarbeitung der Dokumentation).
3. Abschlussquote von C erst nach Auswertung (ab 100 Präsentationen je Fassung, p < 0,05) als Standard übernehmen.
