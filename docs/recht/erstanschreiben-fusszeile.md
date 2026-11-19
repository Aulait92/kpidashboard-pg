# Erstanschreiben: Fußzeile, Erstinformation, KI-Hinweis (interne Rechtsprüfung, 19.11.2026)

Anlass: Ole will die Fußzeile „KI-Assistent · Erstinformation im PDF oben“ kürzen (Conversion). Prüfung durch den
Rechts-Agenten, Ergebnis ohne Anwaltsfreigabe (AGENTS.md, interne Rechtsprüfung).

## Ergebnis
- **Erstinformation (§§ 15, 16 VersVermV):** muss beim ersten Geschäftskontakt zugehen. Das Erstanschreiben fragt nach
  dem Bedarf und ist damit Geschäftskontakt. Das PDF im Kopf der Vorlage erfüllt die Pflicht (Textform, speicherbar),
  sofern der Lead der elektronischen Form zugestimmt hat (Formular-Zustimmung `ERSTINFO_ZUSTIMMUNG` seit 16.11.2026).
  Ein eigener Hinweis im Text oder in der Fußzeile ist **nicht** vorgeschrieben; der Dateiname macht das Dokument kenntlich.
- **KI-Hinweis (Art. 50 Abs. 1 und 5 KI-VO):** klar und spätestens bei der ersten Interaktion. Weil schon die erste
  Antwort des Leads an die KI geht, gehört er in die erste Nachricht. „KI-Assistent“ in der Fußzeile genügt.
- **Absender:** Pflicht aus § 15 trifft den Vermittler-Kunden; PDF-Inhalt, Dateiname und Anzeigename müssen ihn zeigen.
  Offen: Ist die UG selbst als Vermittlerin registriert? Nur dann passt „Erstinformation_Ole_Kannapinn_UG.pdf“.

## Ampel
| Option | Ampel |
|---|---|
| PDF im Kopf, Fußzeile nur „KI-Assistent“ | grün (umgesetzt mit v10) |
| PDF als zweite Nachricht erst nach der Antwort des Leads | gelb (Geschäftskontakt ohne Erstinformation, Abmahnrisiko § 3a UWG) |
| Link statt PDF | gelb bis rot (§ 16 Abs. 3, ohne personalisierte dauerhafte Seite rot) |

## Auflagen, die erhalten bleiben
1. Kein Erstanschreiben ohne PDF im Kopf (`ErstinfoPdfFehltError`).
2. Fußzeile „KI-Assistent“ in Vorlage und Freitext.
3. Erinnerungen nur an Leads, die das PDF schon haben, sonst mit PDF-Kopf.
4. Zustimmung zur elektronischen Erstinformation im Lead-Formular; alte Meta-Formulare umstellen.
5. Wahrheitsgemäße Antwort auf „Bist du ein Bot?“, Wiederholung des KI-Hinweises nach 30 Tagen (`ki-hinweis.ts`).
