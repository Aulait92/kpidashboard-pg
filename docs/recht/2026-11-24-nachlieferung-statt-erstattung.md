# Leadbestellungen: Nachlieferung statt Gutschrift und Erstattung (interne Rechtsprüfung, 24.11.2026)

Entscheidung Ole (24.11.2026): „Bei Leadbestellungen (Pay-per-Lead, Paket „Nur Leads“ und „Pay-per-Lead + Software“):
wir liefern Leads immer nach und erstatten nichts.“ Zusatz am selben Tag: „Die Garantien etc. können aus Leadangeboten raus.“

## Umsetzung
- **Reklamation:** Jede anerkannte Reklamation (auch Grenzfall „Sonstiges“) = 1 kostenloser Ersatzlead desselben
  Produkts. Keine Gutschrift, keine Erstattung, kein 50:50 mehr (ein halber Lead geht nicht). Schutz vor Missbrauch:
  Admin-Meldung bei Stornoquote über 20 % bleibt; die AGB sagen „erkennt der Anbieter die Reklamation an“, ein Anspruch
  bei Grenzfällen wird also nicht zugesagt. Code: `src/lib/ppl/storno.ts`, Verteilung `src/lib/ppl/engine.ts` (`quotaFor`),
  `src/lib/ppl/nachlieferung.ts`.
- **Offene Bestellungen:** Reste bezahlter Wochenbestellungen werden in den Folgewochen nachgeliefert (vorher verfielen
  sie zum Wochenende, Erstattung nur auf Anfrage). Kunde kann bezahlte Bestellungen nicht stornieren; beendet er den
  Vertrag, wird der Rest noch geliefert.
- **Texte:** AGB für Leadangebote nur mit den geltenden Abschnitten (`agbFuerAngebot`, `AGB_NUR_LEADS`,
  `agbPplSoftware` in `src/lib/legal-texts.ts`; Seite `/rechtliches/agb?paket=ppl|ppl_software`), Vertragszeilen
  `PPL_REKLAMATION`, `PPL_NACHLIEFERUNG` (`src/lib/vertrag-laufzeit.ts`), Kundenbereich „Bestellen“, Hilfe.
  Garantien, Setupgebühr, Pause, Werbebudget, Preisstaffel, Vorauszahlung, Halteangebote fallen in Leadangeboten weg.
  `LEGAL_VERSION` 24.11.2026.

## Bestand (alte Bedingungen bleiben)
- Alle bei Einführung bestehenden Bezüge (`LeadSubscription.stornoErsatz = false`, Migration
  `20261124150000_ppl_nachlieferung`): weiter Gutschrift auf die nächste Bestellung, 50:50 bei „Sonstiges“, nur laufende
  Woche. Das betrifft insbesondere Heinrich von Kleist, Convexa, Airtable-Bezüge und alle bisherigen Pay-per-Lead-Kunden.
- Vor dem Deploy angenommene Leadangebote (`Offer.leadAltBedingungen = true`) zeigen weiter ihre alte Fassung (volle AGB,
  alte Besondere Bedingungen „Nur Leads“ mit Erstattung, alte Reklamationszeile).
- Umstellung eines Bestandskunden nur mit seiner Zustimmung (neues Angebot oder Änderung nach „Änderungen dieser AGB“,
  6 Wochen Widerspruchsfrist); dann am Bezug den Schalter „Nachlieferung statt Gutschrift“ setzen.

## Risiko § 307 BGB (auch im B2B-Verkehr)
- Ein **ausnahmsloser** Erstattungsausschluss bei Vorkasse wäre voraussichtlich unwirksam: Er nähme dem Kunden auch dann
  jeden Anspruch, wenn wir dauerhaft nicht leisten oder selbst kündigen (Abweichung vom Leitbild §§ 320 ff., 326 Abs. 4,
  346 BGB; Kardinalpflicht). Folge wäre wegen des Verbots der geltungserhaltenden Reduktion der Wegfall der ganzen Klausel,
  also volle Erstattungsrechte.
- Darum enge Ausnahme im Abschnitt „Lieferung, Nachlieferung und Erstattung“: Erstattung bezahlter, nicht gelieferter
  Leads und offener Ersatzleads binnen 14 Tagen, wenn (1) der Anbieter kündigt, (2) die Lieferung wegen Wegfalls der
  Erlaubnis des Kunden endet (wir dürfen dann nicht liefern), (3) der Anbieter dauerhaft nicht liefern kann, insbesondere
  bei Einstellung des Produkts oder **mehr als 3 Monaten ohne einen offenen Lead**. Außerordentliche Kündigung und
  gesetzliche Ansprüche bei Verschulden bleiben unberührt.
- Die 3-Monats-Grenze macht „dauerhaft“ prüfbar; ohne sie bliebe offen, wann der Kunde sein Geld zurückbekommt, was die
  Klausel angreifbar macht. **Ole kann sie streichen oder verlängern**, das Risiko steigt dann.
- Reklamation: Nacherfüllung durch Ersatzlead statt Geld ist im B2B grundsätzlich zulässig, solange bei Fehlschlagen ein
  Anspruch bleibt; deshalb Verweis „kann er den Ersatzlead dauerhaft nicht liefern“ auf die Ausnahme.
- Transparenz (§ 307 Abs. 1 S. 2, § 305c BGB): Kernsatz steht direkt am Annahme-Knopf und in der Auftragsbestätigung
  („Bezahlte Leads verfallen nicht … Eine Erstattung gibt es dafür nicht.“, „Für jede anerkannte Reklamation liefern wir
  Ihnen kostenlos einen Ersatzlead nach.“).

## Conversion-Blick (AGENTS.md)
Kein eigener Hilfsagent verfügbar; Wortlaut selbst nach den Regeln geprüft: Nutzen zuerst („verfallen nicht“,
„kostenlos einen Ersatzlead“), Einschränkung in einem kurzen Satz danach, keine Gedankenstriche, Sie-Form.
Bitte von Ole bzw. Conversion-Texter gegenlesen lassen.

## Offen
- Erstattung in den Ausnahmefällen läuft von Hand (Admin), offene Bestellung danach auf „storniert“ setzen.
- `docs/recht/2026-11-24-nur-leads.md` Auflage A4 (Storno des Rests mit Erstattung, Auszahlung von Gutschriften) ist
  für neue Angebote überholt.
