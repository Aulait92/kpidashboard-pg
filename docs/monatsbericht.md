# Monatsberichte für Kunden (für Ole)

Stand 17.11.2026. Code: `src/lib/monatsbericht/`, Admin: **Admin → Monatsberichte** (`/admin/monatsberichte`),
Einstellungen: **Admin → Einstellungen → Monatsberichte**.

## Grundsatz

Ehrlich, aber konstruktiv – und **bei Kunden, bei denen es nicht gut läuft, entscheidest du selbst.**

- **gut** → darf automatisch raus, aber nur wenn „Gute Berichte automatisch senden“ an ist. **Standard: aus**
  (im ersten Monat siehst du jeden Bericht zuerst).
- **mittel** und **schwach** → **nie automatisch**. Es entsteht ein Entwurf plus Aufgabe in „Heute“:
  „Monatsbericht prüfen: <Kunde> (schwach) – Empfehlung: anrufen statt schicken“.
- Die Einstufung ist **intern** und erscheint nie beim Kunden.
- **Garantien werden nie erwähnt** (für Kunden bewusst ausgeblendet).

## Ablauf

1. Ab dem **2. des Monats** (bis zum 5., falls ein Lauf ausfällt), ab 7 Uhr, erzeugt der Cron je Lauf für wenige
   Kunden einen Bericht über den Vormonat – idempotent je Kunde und Monat. „Fehlende Berichte jetzt erstellen“ in
   der Übersicht startet es sofort.
2. Berücksichtigt werden aktive Kunden (Paket Software oder Nur Betreuung, nicht archiviert, nicht „keine
   Monatsberichte“). **Kein Bericht** bei weniger als 14 Tagen mit Werbeausgaben (pausiert/neu).
3. Kennzahlen: Leads (ohne anerkannte Reklamationen), Werbekosten, Leadpreis, Termine (nicht abgesagt),
   Abschlüsse und geschätzte Provision (aus „Meine Provisionen“), Anteil Leads mit Ergebnis – jeweils auch Vormonat.
   Maßnahmen: angelegte Kampagnen (Kampagnen-Agenten), Budgetänderungen.
4. **Einstufung** (Schwellen einstellbar):
   - Erwartung = Werbekosten ÷ Ziel-Leadpreis (Einstellung, sonst Rechner: Katze, Makler mit eigenem Wert).
   - **schwach**: Leads < 60 % der Erwartung, oder Leadpreis > 150 % des Ziels, oder 0 Termine bei ≥ 15 Leads.
   - **gut**: Leads ≥ 85 % der Erwartung und keine Warnzeichen (Leadpreis > 120 %, Leads ohne Termine).
   - sonst **mittel**. Zusätzlich „Datenlage unsicher“, wenn < 50 % der Leads ein Ergebnis haben.
5. **Text** schreibt Claude (Sie-Form, kurz, positiv-ehrlich, nur Fakten aus den Daten): Kennzahlen + Vormonat,
   was wir getan haben, nächste Schritte, 1–2 Tipps ohne Vorwurf, Angebot für ein kurzes Gespräch.
   Bei mittel/schwach zeigt der Bericht nur Kennzahlen, die nicht entmutigen (Leads, Termine; Leadpreis nicht, wenn er
   der Grund ist; Abschlüsse/Provision nur bei verlässlicher Datenlage).
6. **Prüfung** (deterministisch + Claude): keine Zahl ohne Grundlage in den Daten, kein „Garantie“, keine
   Versprechen; außerdem Ton und Rechtschreibung. Bei Befund eine Überarbeitung; bleibt ein Befund, geht der Bericht
   auch bei „gut“ nicht automatisch raus.

## Deine Knöpfe (Admin → Monatsberichte → Bericht)

- **So senden** · **Bearbeiten und senden** (Betreff/Absätze ändern) · **Nicht senden, ich rufe an** (legt Aufgabe
  „Anrufen: <Kunde> – Monat … besprechen“ an) · **Diesen Monat aussetzen**.
- **Für diesen Kunden keine Monatsberichte** (dauerhaft, wieder einschaltbar).

## E-Mail und Kundenbereich

- Versand an die Inhaber-Logins des Kunden, mit Kennzahl-Kacheln, Tipps und Knopf „Kurzes Gespräch vereinbaren“
  (Terminlink aus den Einstellungen, sonst Kundenbereich). Signatur aus den Einstellungen.
- Gesendete Berichte stehen beim Kunden unter **Zahlen → Monatsberichte** (ohne Einstufung).

## Voraussetzungen

- `ANTHROPIC_API_KEY` (Text und Prüfung), `RESEND_API_KEY` (Versand), `APP_URL`.
- Empfehlung: Terminlink (z. B. Calendly) in den Einstellungen eintragen.
