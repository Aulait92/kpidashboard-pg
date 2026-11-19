# Vorschlag Erstanschreiben v10 (19.11.2026, nur Vorschlag, kein Code)

Stand: v9 (18.11.2026) ist gebaut und muss ohnehin neu bei Meta eingereicht werden. Dieser Vorschlag ändert keinen Code
in `src/lib/whatsapp/erstanschreiben.ts` bzw. `templates.ts`. Ole entscheidet; danach als v10 bauen und einreichen.
Wenn v9 und v10 beide freigegeben sind, als A/B-Test der Vorlage fahren (`TEMPLATE_BODY_B`, lib/whatsapp/ab-test.ts),
Ziel nicht nur Antwortquote, sondern Terminquote (Experiment-Modul `lib/experimente.ts`, Ziel `termin_gebucht`).

## Was v9 gut macht (bleibt)

- Eine Zeile, Frage fett, Thema konkret („zum Privatschutz“), Tier emotional mit Namen. Kein „Mehr lesen“.
- KI-Kennzeichnung und Erstinformation in Fußzeile bzw. PDF-Kopf (Pflicht, bleibt unverändert).
- Antwortknöpfe, wo das Produkt feste Antworten hat (Zahn).

## Was v10 ändern soll

1. **Grund zu antworten in 4 Wörtern** vor der Frage. v9 fragt sofort, ohne zu sagen, wofür. Die Lead-Personas
   (Selbstständiger, 60+) antworten eher, wenn klar ist, dass danach ein kurzer, kostenloser Termin kommt.
2. **Knöpfe für alle Produkte** (nicht nur Zahn): ein Tipp statt Tippen. Die junge Familie am Handy und die
   Person 60+ brechen beim Tippen am ehesten ab. Quick-Reply-Knöpfe sind in Vorlagen fest (Text bei Meta freigegeben),
   darum je Produkt feste Antworten.
3. **Dritter Knopf „Gleich Termin“** (Abkürzung): wer schon weiß, dass er sprechen will, bekommt direkt den
   Terminvorschlag (spart Antwort und Zwischenfrage, 2 statt 3 Taps bis zum Termin). Die Zwischenfrage kommt dann nach
   der Buchung als erste Angebotsfrage (Logik in bot.ts: Payload `gleich_termin` → `schlageVor`).

## Texte (Sie / Du), Fußzeile unverändert „KI-Assistent · Erstinformation im PDF oben“

**Privatschutz**
- Sie: „Hallo {{1}}, danke für Ihre Anfrage zum Privatschutz! Für Ihr kostenloses Angebot kurz vorab: *Sind Haftpflicht und Hausrat schon versichert?*“
  Knöpfe: [Schon versichert] [Wäre neu] [Gleich Termin]
- Du: „Hallo {{1}}, danke für deine Anfrage zum Privatschutz! Für dein kostenloses Angebot kurz vorab: *Sind Haftpflicht und Hausrat schon versichert?*“
  Knöpfe: [Schon versichert] [Wäre neu] [Gleich Termin]

**Zahnzusatz**
- Sie: „Hallo {{1}}, danke für Ihre Anfrage zur Zahnzusatzversicherung! Kurz vorab: *Was ist Ihnen am wichtigsten?*“
  Knöpfe: [Starker Zahnersatz] [Mit Zahnreinigung] [Gleich Termin]
- Du: analog „danke für deine Anfrage …“, „*Was ist dir am wichtigsten?*“

**Tierkrankenversicherung** (emotional bleibt)
- Sie: „Hallo {{1}}, schön, dass Sie {{2}} gut absichern möchten 🐾 *Nur Operationen oder auch Tierarztbesuche?*“
  Knöpfe: [Nur OP] [Auch Tierarzt] [Gleich Termin]
- Du: „Hallo {{1}}, schön, dass du {{2}} gut absichern möchtest 🐾 *Nur Operationen oder auch Tierarztbesuche?*“

**PKV (Tarifoptimierung, nur Makler)**
- Sie: „Hallo {{1}}, danke für Ihre Anfrage zur privaten Krankenversicherung! *Passt Ihnen ein kurzer, kostenloser Videotermin in den nächsten Tagen?*“
  Knöpfe: [Ja, gern] [Lieber Telefon] [Später]
- Du: analog.

Alle Knopftitel höchstens 20 Zeichen, keine Gedankenstriche, kein „Garantie“, keine Ersparnis- oder Ergebnisversprechen.

## Begründung und erwartete Wirkung (Annahmen gekennzeichnet)

| Änderung | Wirkung | Grundlage |
|---|---|---|
| Knöpfe für alle Produkte | Antwortquote +10 bis +20 % relativ | Annahme; Branchenwerte für WhatsApp Quick Replies gegenüber Freitext liegen deutlich höher, eigene Zahlen fehlen noch (Diagnose `q=vorlagen`/`q=journey`). |
| „Gleich Termin“ als Abkürzung | Terminquote +3 bis +8 % relativ | Annahme: jeder Schritt vor dem Ziel kostet erfahrungsgemäß 10 bis 20 % der Leute; ein Teil nimmt die Abkürzung. |
| „kostenlos“ früh | Antwortquote leicht höher, v. a. 60+ und Skeptische | Annahme; „kostenlos“ ist wahr (Erstberatung), keine Ergebnisaussage. Wird im Chat schon als Splittest `terminvorschlag_kostenlos` gemessen. |

## Rechtliche Grenzen

- **KI-Kennzeichnung** (KI-VO Art. 50) und **Erstinformation** (§ 15 VersVermV) bleiben unverändert in Fußzeile und PDF.
- **Werbung per WhatsApp** nur mit der Einwilligung aus dem Leadformular; jede Vorlage bleibt Kategorie wie bisher bei Meta
  (Marketing bzw. Utility nach Meta-Regeln), STOPP wirkt weiter.
- „Kostenlos“ nur, solange die Erstberatung tatsächlich nichts kostet (ggf. je Vermittler abschaltbar machen).
- Kein künstlicher Zeitdruck, keine erfundene Knappheit, kein sozialer Beweis ohne echte Zahlen (UWG § 5).
- Meta: Quick-Reply-Texte sind Teil der Vorlage; Änderung = neue Version, neue Prüfung.
