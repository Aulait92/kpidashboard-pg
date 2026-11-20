# Policen auslesen: Vergleichsblatt in der Terminvorbereitung

Stand: 18.11.2026 (Ole). Code: `src/lib/policen/auslesen/`. Vorgaben: Rechtsprüfung
`docs/recht/policen-whatsapp-gesundheitsdaten.md` (Abschnitt „KI-Auslesen“, K1 bis K8), Freigabe Ole 18.11.2026.

## Was der Vermittler sieht

- **Spickzettel in der Terminvorbereitung** (Paket 3, 19.11.2026; Logik rein in `auslesen/spickzettel.ts`, Anzeige
  `components/policen-vergleich-kurz.tsx`): ganz oben in „Das will der Kunde“ ein Kasten „Verträge des Kunden“. Fertig:
  Beiträge im Monat, Zeile „Jahr · Anzahl · n bitte prüfen“, Badge „Bitte prüfen“, bis zu 3 Fragen für den Termin (Rest
  „Mehr (n)“), K6-Satz; Texte wortgleich mit der Vertragsseite (`kopfZeile`, `K6_SATZ`, `GRUND_TEXT`, `SPERRE_TEXT` in
  `vertragsseite.ts`). Ein Tipp auf den Kopf öffnet die Vertragsseite, ein Tipp auf eine Frage springt zur Karte. Weitere
  Zustände, jeweils mit nächster Handlung: nie gebeten („Ihr Assistent bittet vor dem Termin darum“, nur wenn Policen per
  WhatsApp eingerichtet ist), gebeten am TT.MM. (aus dem Strecken-Eintrag `policen_bitte`, keine neue Spalte; „Sonst im
  Termin nach den Policen fragen.“), Sparte offen (Chips direkt im Kasten, `sparteAction`), wird ausgelesen, ohne KI
  (Link „Unterlagen ansehen“, Liste aufgeklappt), gesperrt (Link „Im Original ansehen“ bzw. zur Liste). Funktion aus
  oder Konto nicht freigeschaltet: kein Kasten, die Unterlagen-Liste ist aufgeklappt. Chat-Angaben („Bestehende
  Verträge“) einer Sparte, die ausgelesen vorliegt, werden ausgeblendet. Die Dateien stehen eingeklappt unter
  „Unterlagen (n)“; ohne Zwei-Faktor steht „Zum Öffnen Zwei-Faktor einrichten“ am Link und die Begründung einmal darunter
  (kein gelber Kasten mehr).
- **Vertragsseite** (bis 19.11.2026 „Vergleichsblatt“; Route und Dateinamen bleiben; Paket 2 „Champions League“,
  Logik rein in `auslesen/vertragsseite.ts`): Titel „Verträge: {Name}“ ohne Untertitel. Kopf: Beiträge im Monat groß,
  darunter Jahr, Anzahl, „n bitte prüfen“, ein K6-Satz „Maschinell ausgelesen: bitte vor dem Termin mit dem Original
  prüfen.“ (ohne Zwei-Faktor-Login dahinter der Link zur Einrichtung). Darunter „Fragen für den Termin“ (3 sichtbar, Rest
  unter „Mehr (n)“), jede mit Nummer und Sprung zur Karte, die dieselbe Nummer trägt. Karten sortiert: mit Frage, dann
  mit unsicheren Feldern, dann ungeprüft, dann Rest. Sichtbar: Beitrag im Monat, „Kündigung bis“ (nur Sach, vorsichtig)
  bzw. Laufzeit, Deckungs- bzw. Versicherungssumme, Wer ist versichert, SF-Klassen, Kasko, Rechtsschutz-Bausteine,
  BU-/Rente, Bausteine mit „nein“ und immer alle unsicheren Felder; Badge „Bitte prüfen“ je ungeprüfter Karte, „bitte
  prüfen“ am Feld. Ein Tipp auf den Kartenkopf zeigt „Alle Angaben“ (Beitrag laut Unterlage, Kündigung zum, Laufzeit,
  Tarif, Vers.-Nr., SB …), „Original“ und „Bearbeiten“ (Speichern gilt als geprüft). „Werte stimmen“ je Karte und
  „In Bestand übernehmen“ je Karte entfallen.
  Genau eine Hauptaktion (am Handy fest unten über der Navigation): „Alle als geprüft markieren (n)“ (nur angezeigte,
  ausgelesene, ungeprüfte Auszüge; `bestaetigeAlle`, Audit `policen.auslesen_geprueft_alle`), danach nur mit sichtbarem
  Bestandsmodul „n Verträge in Bestand übernehmen“ (`uebernimmAlle`: nur Auszüge mit `geprueftAt`, nie ungeprüfte, keine
  stille Prüfungsfiktion; je Vertrag `uebernimmInBestand` mit Audit `policen.auslesen_bestand`, Kündigungsfrist als Notiz
  im Verlauf; Sammel-Audit `policen.auslesen_bestand_alle`). Ohne Bestandsmodul danach nur „Alle geprüft“. Bei „ohne KI“
  passiert beides nicht. Ohne ausgelesene Verträge: Hauptaktion „Zur Terminvorbereitung“, der Grund (z. B. „Nicht
  ausgelesen auf Wunsch des Kunden.“) steht einmal oben, die Unterlagen bleiben zu öffnen. Unten Unterlagen, die nicht
  ausgelesen wurden (Sparte wählen, erneut versuchen, Original).
- **Fragen für den Termin** (19.11.2026, `auslesen/zusammenfassung.ts`, rein; Anzeige auf der Vertragsseite, Spickzettel
  in der Terminvorbereitung): feste Vorlagen, Sie-Form, Euro nur als Beitrag „laut Unterlage“. Reihenfolge: Kündigungsfristen
  (nach Tagen, dann Beitrag), doppelt, Bausteine „nein“, nicht geschickt. Regeln (K8): Kündigungen nur Sach (Haftpflicht,
  Hausrat, Wohngebäude, Rechtsschutz, Kfz); „doppelt“ nur Haftpflicht, Hausrat, Rechtsschutz (mit beiden Versicherern,
  Summe nur, wenn alle Beiträge bekannt); nie PKV, BU, Leben. Frist vorsichtig: „bis“ = (Termin minus Frist) minus
  1 Tag; „noch n Tage“ nur mit Frist aus dem Dokument, Tagesgrenze Europe/Berlin; verpasste Frist mit nächster
  Kündigung; ohne Frist „Kündigungsfrist im Original prüfen“. „Nicht geschickt“ (Haftpflicht, Hausrat, Rechtsschutz)
  gegen die Sparten aller Unterlagen, entfällt bei „ohne KI“, ohne Auszug oder wenn eine Unterlage keine Sparte hat.
- **Plausibilität** (`auslesen/plausibel.ts`, nach `bereinige()`): „bitte prüfen“ bei Ablauf vor Beginn,
  Kündigungsfrist über 12 Monate, Monatsbeitrag Sach über 500 €, Deckungssumme unter 1 Mio., Versicherungssumme unter
  1.000 €. Werte bleiben unverändert.
- Nur der zuständige Vermittler bzw. Inhaber (`appointmentScope`, `writableCustomerId`). Admin-Vorschau: keine Inhalte.
- Keine Beratung, keine Bewertung: keine Hinweise zu PKV, BU, Leben (K8, kein Risiko-Scoring).

## Wann ausgelesen wird (alles muss zutreffen, sonst kein Aufruf beim Anbieter)

1. Anbieter eingerichtet: `POLICEN_OPENAI_API_KEY` (Standard-Anbieter OpenAI EU) bzw. ausdrücklich
   `POLICEN_AUSLESEN_ANBIETER=bedrock-eu` mit `KI_EU_AWS_*`. Notschalter `POLICEN_AUSLESEN_AN=0`. Nicht pausiert (401).
2. Kunde freigeschaltet: `POLICEN_AUSLESEN_KUNDEN` leer (alle) oder enthält die Kunden-ID.
3. **Einwilligung mit KI** (K1): letzter Eintrag im Nachweis `PolicenNachweis` (Policen per WhatsApp,
   `lib/policen/bitte.ts`) zum Lead ist `art = einwilligung`, `ki = true`, Textversion ab `2026-11-18.s1` bzw.
   `.g1` (`konfig.ts textVersionKi`). PKV, BU und Leben nur mit der Fassung, die Gesundheitsangaben nennt (`.gN`).
   Ablehnung, Widerruf, alte Einwilligungen oder fehlende Tabelle: nie.
4. **Sparte vorab, ohne KI** (K2): Wahl des Vermittlers, sonst Sparte der Unterlage (Dateiname/Begleittext) und
   Stichworte auf Seite 1 der PDF-Textebene (lokal mit pdf.js; dazu PHV, Autoversicherung; „Haftpflicht“ bzw. „Kfz“
   allein nur, wenn kein eindeutiges Wort dasteht; Kfz-, Grundbesitzer-, Berufs-Haftpflicht zählen nicht als
   Privathaftpflicht; Glas allein bleibt offen; PKV, BU, Leben nie aus schwachen Stichworten). Widerspruch, mehrere
   Sparten oder unklar: nicht auslesen, der Vermittler wählt. Meldet die KI danach eine andere Sparte: nichts übernommen.
5. **Sparte freigegeben** (K2): Haftpflicht, Hausrat, Kfz, Wohngebäude, Rechtsschutz sofort. PKV, BU, Leben erst,
   wenn im Admin (Einstellungen → Anbindungen → „KI für Unterlagen“) der Nachweis „keine Speicherung“ beim Anbieter
   mit Datum und Referenz hinterlegt ist (OpenAI: EU-Projekt mit Zero Data Retention). Optional einschränkbar mit
   `POLICEN_AUSLESEN_SPARTEN`.
6. **Bremse:** höchstens 15 Unterlagen je Lead, höchstens `POLICEN_AUSLESEN_MAX_PRO_TAG` (Standard 200) je Kalendertag
   für alle Kunden (Zähler `PolicenAuslesenTag`). Darüber: „Nicht automatisch ausgelesen“, Unterlage bleibt sichtbar,
   Admins einmal am Tag per Push benachrichtigt.

Ausgelöst nach jedem Eingang bzw. jeder Antwort im Lead-Chat (`lib/whatsapp/gateway.ts`, im Hintergrund) und beim
Öffnen des Vergleichsblatts für noch nicht ausgelesene Unterlagen.

## Anbieter (Adapter, K3)

| Adapter | Datei | Endpunkt | Hinweise |
|---|---|---|---|
| OpenAI EU (Standard) | `anbieter/openai-eu.ts` | fest `https://eu.api.openai.com/v1`, nicht per Variable änderbar | Offizielles SDK `openai`, Responses-API, `store: false`, Structured Outputs (`json_schema`, `strict`), PDF als `input_file` mit base64, Bilder als `input_image` (Files-API in der EU nur Speicherung, deshalb kein Upload). Modell `POLICEN_OPENAI_MODEL`, Standard `gpt-6.1-terra` (laut OpenAI-Doku 18.11.2026 in der EU verfügbar, Bild- und PDF-Eingabe). Optional `POLICEN_OPENAI_PROJECT`. |
| Amazon Bedrock EU | `anbieter/bedrock-eu.ts` | `lib/ki-eu.ts`, nur `eu-*` | Nur bei `POLICEN_AUSLESEN_ANBIETER=bedrock-eu`, nie als automatischer Ersatz. |

Kein Rückfall zwischen Anbietern oder Regionen. An die KI gehen höchstens die ersten 4 Seiten einer PDF (lokal
gekürzt; mit Rechteschutz verschlüsselte PDFs unverändert), Dateiname neutral („police.pdf“).

**Schlüssel:** `POLICEN_OPENAI_API_KEY` (eigener Schlüssel nur für Dokumente), Ablauf `POLICEN_OPENAI_KEY_ABLAUF`
(Standard `2027-11-17`). 28 Tage vorher einmal Push an die Admins (Cron 03:00 UTC). Antwortet OpenAI mit 401: Auslesen
pausiert (nur für diesen Schlüssel, ein neuer hebt die Pause auf; im Admin auch „Pause aufheben“), Push „Schlüssel
ungültig“ höchstens einmal am Tag.

**Diagnose:** `/api/ops/diagnose?q=policen-auslesen` zeigt Schalter, Sparten, Nachweis, Anbieter, Schlüssel gesetzt
(ja/nein, nie der Wert), Endpunkt, Modell, Ablauf, Pause und die heutige Anzahl.

## Schema und Filter (K4, K5)

- Festes Schema (`felder.ts`): alle Sparten Versicherer, Tarif, Versicherungsnummer (nur letzte 4 Zeichen,
  „…1234“), Beitrag, Zahlweise (Monatsbetrag berechnet), Beginn, Ablauf, Kündigungsfrist, nächster Kündigungstermin;
  Selbstbeteiligung (Sach). Je Sparte: Hausrat (Versicherungssumme, Wohnfläche, Unterversicherungsverzicht, Elementar,
  Fahrrad), Haftpflicht (Deckungssumme, Single/Paar/Familie/Alleinerziehend, Schlüsselverlust, Forderungsausfall), Kfz
  (SF Haftpflicht/Kasko, Kasko-Art, Fahrleistung, Werkstattbindung), Wohngebäude (Versicherungssumme, Wert 1914,
  Elementar), Rechtsschutz (Bausteine), PKV (Tarif, Selbstbehalt, Krankentagegeld), BU (Monatsrente, Endalter,
  Dynamik), Leben/Rente (Versicherungssumme, Rente, Endalter). Keine Felder für Gesundheitsangaben, kein Freitext.
- Anweisung verbietet Gesundheitsangaben ausdrücklich (`prompt.ts`). Nachfilter `bereinige`: nur Felder der Sparte,
  typgeprüft, Werte mit Gesundheitsbegriffen (Zuschlag, Ausschluss, Diagnose, Vorerkrankung, Gewicht, Raucher …)
  verworfen. Unsichere Felder „bitte prüfen“. Korrekturen des Vermittlers laufen durch dieselben Regeln.
- Gespeichert wird nur das bereinigte Feldobjekt (`PolicenAuszug.felder`). Prompts, Rohantworten und Volltext werden
  nie gespeichert oder geloggt; Fehler nur mit Grund und HTTP-Status (keine Fehlermeldung des Anbieters).

## Löschung (K7) und Statistik

- `PolicenAuszug` hängt an der Unterlage (`ON DELETE CASCADE`): Löschfrist der Unterlagen (90 Tage nach dem Termin),
  Widerruf (sofort), Löschen durch den Vermittler, Art. 17 bzw. Lead gelöscht.
- Ausnahme: „In Bestand übernehmen“ legt ausdrücklich einen `ExistingContract` am Bestandskunden des Leads an
  (`lib/vertraege.ts bestandskundeZuLead`), der bleibt.
- Eigene Tabelle ohne Anbindung an Statistik, Benchmarks oder andere KI-Auswertungen.

## Trennung vom Chat-Assistenten

- Der Chat (`lib/whatsapp/bot.ts`, `lib/kampagnen/llm.ts` runAgent) importiert nichts aus `lib/policen/auslesen`, das
  SDK `openai` steht nur in `anbieter/openai-eu.ts`. Der Webhook-Eingang (`lib/whatsapp/gateway.ts`) bindet das Modul
  nur dynamisch ein, damit es nicht in der Importkette des Chats liegt.
- Tests: `tests/unit/policen-auslesen-grenze.test.ts` (Importgrenze), `tests/integration/policen-auslesen.test.ts`
  (zur Laufzeit: Auslesen ohne Chat-Client, Chat-Anfrage ohne Dokumente und ohne Auszüge; gemockte SDKs).

## Texte an den Lead (Strecke v2, Paket 4 vom 20.11.2026)

`src/lib/policen/flow/texte.ts`: Chat-Nachricht, Bestätigung und Erinnerungen nennen einen konkreten Nutzen („ob Sie
etwas doppelt zahlen, wann Sie kündigen können und was genau versichert ist“) statt „ob Sie Geld sparen können“
(§ 5 UWG, K8). Der Test `tests/unit/policen-flow.test.ts` sperrt „sparen“, „günstiger“, „zu teuer“, „Garantie“,
„deutlich schneller“, „fehlt“ und „Lücke“ in allen Lead-Texten und hält den Formular-Wortlaut (Hash) und
`FLOW_TEXT_VERSION` fest. Formular, Fußzeilen, `BESTAETIGUNG_RE` und `istNeinDanke` sind unverändert.
Vorlagennamen tragen jetzt zusätzlich einen Hash des Textes (`pg_policen_<art>_<flow>_<text>_<an>`): Neuer Text heißt
neue Vorlage bei Meta. Bis sie freigegeben ist, geht im 24-Stunden-Fenster die Flow-Nachricht mit neuem Text,
außerhalb nichts (kein Rückfall auf den alten Text). Der WhatsApp-Cron reicht die neuen Vorlagen bei `POLICEN_FLOW=1`
selbst ein, also erst nach Oles Freigabe mergen bzw. einschalten.

## Offen

- AVV-Ergänzung § 1a/§ 4 (OpenAI Ireland Ltd. als Unterauftragnehmer) und Datenschutzhinweis (c) mit KI-Absatz vor dem
  breiten Einsatz; Freischaltung je Vermittler bei Bedarf mit `POLICEN_AUSLESEN_KUNDEN`.
- Nachweis „keine Speicherung“ (OpenAI EU-Projekt mit ZDR) schriftlich ablegen und im Admin hinterlegen, erst dann
  PKV/BU/Leben.
- Neuigkeit und Webseiten-Eintrag (unten) anlegen, sobald Ole den Livegang bestätigt.

## Vorgemerkt: Neuigkeit und Webseite (erst anlegen, wenn Ole den Livegang bestätigt)

`kind` neu, `audience` alle: „**Vergleichsblatt in der Terminvorbereitung:** Hat Ihr Kunde seine Policen per WhatsApp
geschickt und dem Auslesen zugestimmt, sehen Sie seine Verträge auf einen Blick: Beiträge im Monat, Kündigungstermine
und was fehlt. Prüfen Sie die Werte und übernehmen Sie Verträge mit einem Klick in Ihren Bestand.“

Webseite (`docs/webseite-offen.md`, Du-Form): „Vergleichsblatt: Schickt dein Kunde seine Policen per WhatsApp und
stimmt dem Auslesen zu, siehst du vor dem Termin seine Verträge auf einen Blick (Beiträge im Monat, Kündigungstermine,
fehlende Bausteine).“ Nur Sachversicherungen nennen, Kranken/BU/Leben „demnächst“, keine Ersparnisversprechen, keine Preise.
Der Eintrag vom 18.11. („Kein automatisches Auslesen nennen“) ist dann zu ersetzen.
