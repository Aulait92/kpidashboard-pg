# WhatsApp-Vorlage Glückwunsch zum Abschluss (P4)

Stand 17.11.2026. **Nur vorbereitet, nicht eingereicht** (Zweck `glueckwunsch` steht in `VORBEREITETE_PURPOSES`,
`src/lib/whatsapp/template-plan.ts`). Freigeben: Zweck in `CORE_PURPOSES` aufnehmen, dann reicht der Cron die Fassungen je
Kunde bei Meta ein. Kategorie voraussichtlich MARKETING (Meta prüft und stuft selbst ein).

Regeln (Ole, Ergänzung D im Plan): nicht automatisch, nicht per Mail. Beim Eintragen des Abschlusses der Haken
„Glückwunsch per WhatsApp senden“, vorausgewählt nur, wenn der Termin höchstens 3 Tage zurückliegt. Bis zur Freigabe geht
der Glückwunsch nur im offenen 24-h-Fenster als Freitext; sonst ist der Haken ausgegraut mit dem Hinweis „Geht nur bis
24 Stunden nach der letzten Nachricht von Frau Becker.“

## Freitext (im offenen Fenster, `src/lib/abschluss.ts` glueckwunschText)

- Sie: „Schön, dass Sie sich für Ihren neuen Schutz entschieden haben, Frau Becker! Bei Fragen erreichen Sie Herrn Kannapinn jederzeit hier.“
- Du: „Schön, dass du dich für deinen neuen Schutz entschieden hast, Julia! Bei Fragen erreichst du Ole jederzeit hier.“

## Vorlage (Zweck `glueckwunsch`, v5)

Meta erlaubt den Namen nur über die Anrede-Zeile am Anfang, deshalb steht er dort statt mitten im Satz:

- Sie: „Guten Tag {{1}}, schön, dass Sie sich für Ihren neuen Schutz entschieden haben! Bei Fragen erreichen Sie {{2}} jederzeit hier.“
- Sie ohne Namen: „Guten Tag, schön, dass Sie sich für Ihren neuen Schutz entschieden haben! Bei Fragen erreichen Sie {{1}} jederzeit hier.“
- Du: „Hallo {{1}}, schön, dass du dich für deinen neuen Schutz entschieden hast! Bei Fragen erreichst du {{2}} jederzeit hier.“
- {{1}} Name (Sie „Frau Schneider“, Du „Julia“), {{2}} Vermittler im Akkusativ (Sie „Herrn Schmidt“, Du „Thomas“)
- Keine Knöpfe. Keine Versprechen zu Police oder Unterlagen (Plan, Risiko 5).
