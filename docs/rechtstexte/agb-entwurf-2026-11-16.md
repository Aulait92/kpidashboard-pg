# Entwurf: Änderungen an AGB und AVV (Rechtsprüfung 16.11.2026)

**Status: Entwurf, nicht in Kraft.** Die gültigen Texte stehen unverändert in `src/lib/legal-texts.ts`
(`LEGAL_VERSION` „15.11.2026 (Fassung 2)“). Ole entscheidet mit dem Anwalt. Keine Rechtsberatung.

**Umsetzung nach Freigabe:** Texte in `src/lib/legal-texts.ts` übernehmen, `LEGAL_VERSION` erhöhen (neue Fassung),
Kommentar mit Datum ergänzen. Für Kunden mit angenommenem Vertrag gilt das Verfahren aus AGB „Änderungen dieser AGB“:
Mitteilung in Textform mindestens sechs Wochen vor Inkrafttreten, Hinweis auf Widerspruch und Folge, Kündigungsrecht.
Angenommene Angebote behalten ihre Fassung (`Offer.termsUrl`/`dpaUrl`); da `/rechtliches/*` immer die aktuelle Fassung
zeigt, die bisherige Fassung vorher als Datei ablegen (z. B. `docs/rechtstexte/agb-2026-11-15-fassung-2.md`).

Quellen und Bewertung je Thema: `docs/datenschutz.md`, Abschnitt 10.

## Thema 2: Freistellung (AGB „Kundendaten: Zusicherung und Freistellung“, AVV „Pflichten des Auftraggebers“)

**Problem:** Die Freistellung knüpft nur an die „Verletzung dieser Zusicherung“ bzw. an eine „unzulässige Ansprache“
an, ohne Verschulden des Kunden. In der kundenfeindlichsten Auslegung ist das eine verschuldensunabhängige Haftung. Der
BGH hat eine solche Freistellungsklausel auch gegenüber Unternehmern für unwirksam gehalten (BGH, Urteil vom 05.10.2005,
VIII ZR 16/05, BGHZ 164, 196: Freistellung von Rechten Dritter, Verschuldensprinzip als wesentlicher Grundgedanke,
§ 307 Abs. 2 Nr. 1 BGB). Fällt die Klausel weg, bleibt nur die gesetzliche Haftung; Kosten der Rechtsverteidigung
müssten wir dann einzeln als Schaden nachweisen.

**Vorschlag AGB, letzter Absatz des Abschnitts (ersetzt den bisherigen):**

> Verletzt der Kunde diese Zusicherung oder spricht er Personen über die Software unzulässig an, stellt er den Anbieter
> von Ansprüchen Dritter frei, insbesondere des Versicherers sowie von betroffenen Personen, Mitbewerbern und Verbänden,
> die darauf beruhen; das gilt nicht, wenn der Kunde die Verletzung nicht zu vertreten hat. Die Freistellung umfasst die
> angemessenen Kosten der Rechtsverteidigung. Der Anbieter informiert den Kunden unverzüglich über geltend gemachte
> Ansprüche, gibt ihm Gelegenheit zur Stellungnahme und erkennt Ansprüche nicht ohne Abstimmung mit dem Kunden an.
> Soweit der Anbieter die Verletzung mit zu vertreten hat, insbesondere durch eine fehlerhafte Funktion der Software,
> mindert sich die Freistellung entsprechend § 254 BGB. Geldbußen, die gegen den Anbieter selbst festgesetzt werden,
> sind von der Freistellung nicht erfasst.

**Vorschlag AVV „Pflichten des Auftraggebers“, zweiter Absatz, Satzende:** statt „… freistellt, die auf einer Verletzung
dieser Zusicherung beruhen“ künftig „… nach Maßgabe der AGB (Abschnitt „Kundendaten: Zusicherung und Freistellung“)
freistellt“, damit beide Texte dieselbe Verschuldensregel haben.

**Begründung:**
- Verschulden mit Beweislast beim Kunden entspricht dem gesetzlichen Leitbild (§ 280 Abs. 1 Satz 2 BGB), hält also
  § 307 Abs. 2 Nr. 1 BGB stand und schützt trotzdem gut: Der Kunde muss sich entlasten.
- „Behörden“ entfällt in der Liste, und Geldbußen gegen uns sind ausdrücklich ausgenommen: Eine im Voraus versprochene
  Übernahme von Geldbußen ist nach der Rechtsprechung regelmäßig sittenwidrig (BAG, Urteil vom 25.01.2001,
  8 AZR 465/00, § 138 BGB). Behördliche Kosten, die keine Geldbuße sind, bleiben als Schaden geltend zu machen.
- Mitverschulden nach § 254 BGB statt „gilt nicht, soweit“: klarer und näher am Gesetz.

**Anwalt:** Reicht das, oder soll die Zusicherung als selbstständige Garantie (§ 276 Abs. 1 Satz 1 BGB) ausgestaltet
werden? Das wäre in AGB nach VIII ZR 16/05 riskanter.

## Thema 3: KI-Verordnung, Rollen und KI-Kompetenz (AGB „Leistungen: Software“)

**Problem:** Die AGB sagen nur „nach dem Verständnis der Parteien stellt der Anbieter das KI-System bereit“. Die
Kennzeichnungspflicht nach Art. 50 Abs. 1 KI-VO trifft den **Anbieter** (Art. 3 Nr. 3). Für den Vermittler als
**Betreiber** (Art. 3 Nr. 4) folgt aus Art. 50 für einen Chat-Assistenten keine eigene Kennzeichnungspflicht
(Abs. 3 und 4 betreffen Emotionserkennung, Deepfakes und Texte zur Information der Öffentlichkeit), wohl aber seit
02.02.2025 die Pflicht zur KI-Kompetenz seines Personals (Art. 4, Art. 113 Satz 3 lit. a). Die Klausel sollte das
klar zuordnen, damit kein Streit entsteht, wer bei einem fehlenden Hinweis haftet (Bußgeld bis 15 Mio. € bzw. 3 %,
Art. 99 Abs. 4 lit. g).

**Vorschlag AGB, ersetzt den Absatz „Nach dem Verständnis der Parteien …“:**

> Der Anbieter ist Anbieter des digitalen Assistenten im Sinne von Art. 3 Nr. 3 der KI-Verordnung und stellt sicher,
> dass der Assistent Interessenten spätestens mit der ersten Nachricht klar darauf hinweist, dass sie mit einem
> KI-System schreiben (Art. 50 Abs. 1 und 5 KI-Verordnung). Der Kunde setzt den Assistenten als Betreiber im Sinne von
> Art. 3 Nr. 4 der KI-Verordnung in eigener Verantwortung ein. Er sorgt dafür, dass Personen, die in seinem Auftrag mit
> dem Assistenten arbeiten, über ausreichende KI-Kompetenz verfügen (Art. 4 KI-Verordnung); die Hilfe und die
> Einweisung des Anbieters kann er dafür nutzen. Beide Seiten unterstützen sich bei ihren Pflichten nach der
> KI-Verordnung.

**Begründung:** Wir bauen und betreiben das System und bestimmen den Hinweis, der Vermittler nutzt es unter seinem
Namen nur in der Ansprache. Selbst wenn der Vermittler im Einzelfall als (Mit-)Anbieter gälte, ist die Pflicht aus
Art. 50 Abs. 1 technisch erfüllt (Hinweis in der ersten Nachricht, nicht abschaltbar, `lib/whatsapp/ki-hinweis.ts`).
Art. 25 (Rollenwechsel bei eigenem Namen) gilt nur für Hochrisiko-Systeme, der Assistent ist keins.

**Anwalt:** Ob die Nennung des Vermittlers („digitaler KI-Assistent von …“) ihn zum Anbieter macht
(„unter seinem eigenen Namen … in Betrieb nimmt“, Art. 3 Nr. 3).
