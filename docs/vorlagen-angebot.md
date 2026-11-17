# WhatsApp-Vorlagen Angebot (P3) zur Freigabe durch Ole

Stand 17.11.2026. Beide Vorlagen sind **nur vorbereitet** (`VORBEREITET_ANGEBOT` in `src/lib/whatsapp/template-plan.ts`)
und werden **nicht** bei Meta eingereicht, bis Ole sie freigibt. Danach in `CORE_PURPOSES` aufnehmen und im nächsten
gesammelten Einreichungslauf (`template-submit.ts`) mitschicken.

Bis zur Freigabe gilt:

- „Angebot senden“ (Weg „Über die App senden“): im offenen 24-h-Fenster als Freitext (ohne Vorlagenkosten), sonst nur
  die E-Mail mit PDF. Das Blatt zeigt dann „WhatsApp: Chat ruht seit über 24 Stunden“.
- Nachfassen zum selbst gesendeten Angebot (Tag 2): die freigegebene Vorlage `followup_offer` („das Angebot zu
  Haftpflicht und Hausrat“). Fehlt auch die, wird es wie bisher eine Anruf-Aufgabe.

Platzhalter: {{1}} ist immer der Name (Sie „Frau Becker“, Du „Anna“; die Sie-Fassung ohne Namen beginnt mit
„Guten Tag,“ und die übrigen Platzhalter rücken auf). Je Vorlage drei Fassungen: Du, Sie, Sie ohne Namen. Keine
Gedankenstriche, kein Platzhalter am Textende (Meta-Regel).

## 1. Angebot senden (neuer Zweck `offer_send`, v5, UTILITY)

Geht raus, wenn der Vermittler „Über die App senden“ antippt und der Chat länger als 24 Stunden ruht.

- Sie: „Guten Tag {{1}}, vielen Dank für das Gespräch! Wie besprochen hier Ihr Angebot für {{2}}: {{3}} Bei Fragen schreiben Sie mir einfach hier.“
- Du: „Hallo {{1}}, vielen Dank für das Gespräch! Wie besprochen hier dein Angebot für {{2}}: {{3}} Bei Fragen schreib mir einfach hier.“
- Keine Knöpfe. {{2}} Thema aus der Auswahl im Termin („Haftpflicht und Hausrat“), {{3}} Link auf das PDF
  (`/ihr-angebot/<token>`, 60 Tage gültig).
- Kombi-Rabatt und Link zur Beratungspräsentation stehen nur im Freitext (offenes Fenster), nie in der Vorlage.

Beispiel (Freitext, Sie):

> Vielen Dank für das Gespräch, Frau Becker! Wie besprochen hier Ihr Angebot für Haftpflicht und Hausrat:
> https://app.performancegrowth.de/ihr-angebot/abc123
>
> Für Haftpflicht und Hausrat zusammen gilt ein Kombi-Rabatt von 10 %.
>
> Bei Fragen schreiben Sie mir einfach hier.

## 2. Nachfassen zum selbst gesendeten Angebot (neuer Zweck `followup_offer_selbst`, v5, MARKETING)

Tag 2 nach „Habe ich selbst gesendet“, nur ohne Antwort des Leads.

- Sie: „Guten Tag {{1}}, hier ist der digitale KI-Assistent von [Firma]. Konnten Sie sich das Angebot, das {{2}} Ihnen geschickt hat, schon anschauen? Ist für Sie eher der Beitrag oder die Leistung entscheidend?“
- Du: „Hallo {{1}}, hier ist der digitale KI-Assistent von [Firma]. Konntest du dir das Angebot, das {{2}} dir geschickt hat, schon anschauen? Ist für dich eher der Beitrag oder die Leistung entscheidend?“
- Knöpfe wie `followup_offer`: „Eher der Beitrag“ · „Eher die Leistung“ · „Kein Bedarf mehr“
- {{2}} „Herr Kannapinn“ (Du: „Ole“)

## Abfolge zum Angebot (zur Einordnung)

| Tag | Über die App gesendet (`offer`) | Selbst gesendet (`offer_selbst`) |
|---|---|---|
| Vorabend jedes WhatsApp- und E-Mail-Schritts | Push an den Vermittler „Frau Becker: Morgen fasst die App zum Angebot nach“ | gleich |
| 2 | WhatsApp (`followup_offer`) | WhatsApp (`followup_offer_selbst`, bis zur Freigabe `followup_offer`) |
| 3 | Anruf-Aufgabe plus Push „Frau Becker anrufen: Fragen zum Angebot?“ | gleich |
| 5 | E-Mail aus der Vorlage „Nachfassen Angebot“ mit [Rückruf wünschen] | keine E-Mail |
| 10 | letzte WhatsApp (`followup_last`) | letzte WhatsApp („das Angebot, das Herr Kannapinn Ihnen geschickt hat“) |
| 12 | Anruf-Aufgabe zum Schluss | gleich |

Stopp wie bei allen Abfolgen: Antwort des Leads, Abschluss, Absage, „Stopp“, Rückruf gewünscht, Schalter aus.
