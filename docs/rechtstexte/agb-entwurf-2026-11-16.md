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
