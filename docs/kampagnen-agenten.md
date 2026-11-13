# Kampagnen-Agenten: Meta-Lead-Kampagne mit einem Klick

Admin → Kunden → Kunde → Reiter **„Kampagne (KI)“**. Produkt wählen, optional ein Satz
Zusatzwunsch, **„Kampagne mit KI erstellen“**. Ein Team aus KI-Agenten plant, textet,
gestaltet, baut das Sofortformular, prüft alles und legt die Kampagne **pausiert** im
Werbekonto des Kunden an. **Veröffentlicht wird immer von Hand im Werbeanzeigenmanager.**

Code: `src/lib/kampagnen/` (Ablauf `run.ts`, Agenten `agents.ts`, Meta `builder.ts`),
Oberfläche `src/app/admin/kunden/[id]/kampagne/`.

## Rollen

| # | Agent | Aufgabe | Ergebnis |
|---|---|---|---|
| 1 | Stratege | Kampagnenplan aus Kundenakte, Fragebogen und Budget | Budget, 1–2 Anzeigengruppen (Alter, Umkreis, Advantage+), 3–5 Anzeigen |
| 2 | Angle-Rechercheur | Werbe-Winkel aus Produkt, Region, Zielgruppe und unseren bewährten Mustern | 3–5 Winkel mit Hook |
| 3 | Texter | Primärtext, Überschrift, Beschreibung, Texte im Bild, Button – im Namen des Vermittlers, Anrede Sie (bzw. laut Fragebogen) | je Winkel eine Anzeige |
| 4 | Creative-Agent | Bilder über die vorhandene Creative-Pipeline (Claude-HTML → Foto/Illustration → PNG → R2) | 3–5 Bilder 1080×1080 |
| 5 | Formular-Agent | Meta-Sofortformular: Intro, 2–4 Qualifizierungsfragen, Danke-Seite, Einwilligung | Formular-Entwurf |
| 6 | Prüfer | Checkliste (unten) + feste Prüfungen ohne KI | grün / gelb / rot |
| 7 | Bauer (kein KI) | Anlegen per Marketing API, alles `PAUSED`, idempotent | Kampagne, Gruppen, Formular, Anzeigen |

Jeder Agent ist ein eigener Claude-Aufruf (Modell `claude-opus-5-5`, adaptive thinking,
JSON-Schema-Ausgabe). Der Code prüft jede Antwort (Zeichengrenzen, Anzahl, gültige Werte);
ungültig → **genau ein** Wiederholungsversuch mit den Fehlern als Hinweis, dann Abbruch.

## Ablauf

1. **Voraussetzungen** (vor dem Start, mit klarer Meldung was fehlt):
   - Werbebudget für das Produkt (Angebot bzw. „Budget ändern“)
   - Meta-Werbekonto in der Kundenakte und **Zugriff mit `ads_management`** – sonst: Kunde
     gibt unserem Business Manager Partnerzugriff auf das Werbekonto („Kampagnen verwalten“),
     Ole weist das Konto dem Systemnutzer zu
   - Facebook-Seite des Kunden (Seiten-ID; wird beim Start gespeichert) mit Seiten-Token –
     sonst: Partnerzugriff auf die Seite inkl. Leads, Seite dem Systemnutzer zuweisen
   - Datenschutz-URL des Kunden (Pflicht im Formular; sonst Impressum-URL aus der Website-Prüfung)
   - `ANTHROPIC_API_KEY`, `R2_BUCKET`/`R2_PUBLIC_URL`, `META_ACCESS_TOKEN`
2. Agenten 1–6 nacheinander; jeder Schritt wird sofort gespeichert (Fortschritt live auf der
   Seite). Der Lauf arbeitet im Hintergrund weiter, auch wenn die Seite zu ist; bleibt er
   hängen (Neustart), setzt der Cron ihn fort.
3. **Prüfer rot** → Texter bzw. Formular-Agent überarbeiten **einmal**, dann erneute Prüfung.
   Immer noch rot → Lauf „Prüfung rot“, **nichts wird bei Meta angelegt**.
4. **Grün/gelb** → mit Häkchen „direkt anlegen“ (Standard) sofort pausiert bei Meta anlegen;
   ohne Häkchen erst Texte bearbeiten / Bild neu erzeugen, dann „Bei Meta anlegen (pausiert)“.
5. Danach: Formular wird dem Kunden und Produkt zugeordnet (Lead-Eingang), Seite für den
   Leads-Webhook abonniert, Push an Ole „Kampagne für X ist angelegt (pausiert) – bitte prüfen
   und veröffentlichen“ mit Link in den Werbeanzeigenmanager.

**Fehler in der Mitte:** Bereits Angelegtes steht im Lauf (IDs). „Fortsetzen“ legt nur den
Rest an; „Bei Meta aufräumen“ löscht die Kampagne (mit Gruppen und Anzeigen) und archiviert
das Formular.

## Was angelegt wird (Marketing API, Graph v22.0)

- Kampagne: Ziel `OUTCOME_LEADS`, Kampagnenbudget (Tagesbudget aus dem Vertrag),
  `LOWEST_COST_WITHOUT_CAP`, `special_ad_categories: []`
  - Laut Meta ist die Kategorie „Financial products and services“ nur für Werbetreibende in den
    USA bzw. Zielgruppen in den USA Pflicht; wir werben nur in Deutschland.
- Anzeigengruppe(n): `LEAD_GENERATION`, `ON_AD`, Seite als `promoted_object`, Stadt aus der
  Kundenakte mit Umkreis 17–80 km (sonst Deutschland), Advantage+ Zielgruppe (dann Alter 25–65
  als weite Grenze)
- Sofortformular (`/{page_id}/leadgen_forms`, Seiten-Token): Qualifizierungsfragen, Name,
  Telefon, E-Mail (Schlüssel `full_name`, `phone_number`, `email` wie im Lead-Eingang),
  Datenschutz-Link, Einwilligung als Pflicht-Häkchen, Danke-Seite, Sprache Deutsch
- Bilder, Creatives (Button mit `lead_gen_form_id`), Anzeigen – **alle `PAUSED`**

Sicherheitsnetz im Code: Jeder Aufruf mit einem anderen Status als `PAUSED` bricht ab
(`assertNotActive`, mit Test abgesichert). Höchstens ein laufender Lauf je Kunde.

## Prüf-Checkliste

1. Meta-Werberichtlinien: keine Unterstellung persönlicher Merkmale („Haben Sie eine Katze?“),
   keine reißerischen Aussagen, kein irreführender Button
2. Wettbewerbsrecht: keine Irreführung, keine unbelegten Superlative, keine erfundenen Preise,
   Ersparnisse oder Garantien, keine Dringlichkeits-Lügen
3. Versicherungsvermittlung: Absender ist der Vermittler (Vertreter bzw. Makler), nicht der
   Versicherer-Konzern
4. Formular: Einwilligung (Telefon, E-Mail, WhatsApp) vorhanden, keine sensiblen Fragen
5. Sprache: Rechtschreibung, einheitliche Anrede, Zeichengrenzen
6. Plan: Budget passt zum Vertrag, Ort stimmt

Feste Prüfungen ohne KI: Datenschutz-URL, Ort vorhanden, Budget = Vertrag, Garantie-/
Superlativ-Wörter (rot), Anrede, fehlende Bilder.

## Kosten

KI-Kosten je Lauf werden grob protokolliert (Tokens × Preis je Mio. Tokens; einstellbar über
`CAMPAIGN_PRICE_IN_USD`/`CAMPAIGN_PRICE_OUT_USD`, Standard 5 $/25 $) und im Verlauf angezeigt.
Dazu kommen die Bild-Erzeugung (vorhandene Pipeline) und keine Meta-Kosten, solange die
Kampagne pausiert ist. Modell änderbar mit `CAMPAIGN_AGENT_MODEL` bzw. `CAMPAIGN_CREATIVE_MODEL`.

## Für Ole

- Werbekonto und Seite des Kunden müssen unserem Systemnutzer zugewiesen sein (Business
  Manager → Partner bzw. Systemnutzer → Assets zuweisen: Werbekonto „Kampagnen verwalten“,
  Seite inkl. Leads und Werbeanzeigen).
- Nach dem Anlegen im Werbeanzeigenmanager prüfen: Vorschau der Anzeigen, Formular-Vorschau,
  Zielgruppe – dann Kampagne veröffentlichen.
- Advantage+ Zielgruppe und Altersgrenzen: Meta kann die Altersgrenzen bei Advantage+ anders
  behandeln; das zeigt der Werbeanzeigenmanager vor dem Veröffentlichen.
