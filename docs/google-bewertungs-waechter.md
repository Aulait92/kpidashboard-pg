# Bewertungs-Wächter: Google-Zugang einrichten (Anleitung für Ole)

Der Bewertungs-Wächter liest neue Google-Bewertungen der Vertreter, meldet sie per Push
(1–3 Sterne: dringend + Aufgabe „Schlechte Google-Bewertung – bitte antworten“ in „Heute“)
und schlägt eine Antwort vor. Veröffentlicht wird nur nach Klick des Vertreters.

Ohne Freigabe durch Google ist das Kontingent der Business-Profile-APIs **0**. Die App fällt
dann sauber zurück: gelber Hinweis „Bewertungs-Wächter wird freigeschaltet“, kein Fehler.

## Schritt für Schritt

1. **Google-Cloud-Projekt:** dasselbe Projekt wie beim Kalender-OAuth (gleiche
   `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`). In der Cloud Console die **Projektnummer** notieren
   (Dashboard → Projektinfo).
2. **Zugang beantragen:** Seite „Prerequisites“ der Google Business Profile APIs öffnen
   (https://developers.google.com/my-business/content/prereqs) und das Formular für den
   API-Zugang absenden, Option für den Basiszugang. Wichtig:
   - Mit einer E-Mail-Adresse, die Inhaber oder Verwalter eines Unternehmensprofils ist.
   - Das Profil sollte seit mindestens 60 Tagen bestätigt und aktiv sein, mit Website.
   - Google prüft innerhalb von etwa 14 Tagen. **Keine** Kontingent-Erhöhung beantragen, solange
     das Kontingent 0 ist – erst den Zugang.
3. **APIs aktivieren** (APIs & Dienste → Bibliothek), im selben Projekt:
   - My Business Account Management API
   - My Business Business Information API
   - Google My Business API (für Bewertungen lesen und beantworten, v4)
4. **Freigabe prüfen:** APIs & Dienste → Kontingente: 0 Anfragen/Minute = noch nicht freigegeben,
   300 Anfragen/Minute = freigegeben.
5. **OAuth-Client:** unter „Anmeldedaten“ beim bestehenden Web-Client die Weiterleitungs-URI
   ergänzen:
   - Produktion: `https://app.performancegrowth.de/api/google/business/callback`
   - Staging: `https://staging.performancegrowth.de/api/google/business/callback`
   Optional abweichend per Railway-Variable `GOOGLE_BUSINESS_REDIRECT_URI`.
6. **OAuth-Zustimmungsbildschirm:** Bereich `https://www.googleapis.com/auth/business.manage`
   hinzufügen. Das ist ein neuer, sensibler Bereich: Google verlangt dafür eventuell eine
   **erneute OAuth-Prüfung** (wie beim Kalender: Begründung + kurzes Video). Bis dahin sehen
   Vertreter beim Verbinden die Warnung „nicht bestätigte App“ bzw. nur Testnutzer können sich
   verbinden.
7. **Fertig:** Sobald Google freigibt, holt der Cron (alle 5 Min., je Kunde höchstens alle 45 Min.)
   die Bewertungen ab. Kunden mit Status „wird freigeschaltet“ werden automatisch weiter versucht.

## Datenschutz

- Gespeichert werden nur Bewertungs-ID, Sterne, Text, Name des Bewerters und Zeitpunkt
  (öffentlich auf Google), Löschfrist 2 Jahre (`runWaechter`), Trennen löscht alles.
- Tokens verschlüsselt (wie Kalender). Zugriff nur auf Wunsch des Vertreters (eigene Verbindung).
- Der KI-Antwortvorschlag nennt keine Namen, Vertrags- oder Versicherungsdetails; bei Kritik
  bietet er das Gespräch offline an. Die Antwort ist öffentlich – der Vertreter prüft sie.
- Zuordnung zu einem Kontakt nur bei eindeutigem, vollständigem Namen eines Kontakts mit Abschluss.
- AVV/Unterauftragsverarbeiter: Google ist bereits aufgeführt (Kalender); Zweck „Abruf und
  Beantwortung von Google-Bewertungen“ ergänzen (**Prüfen**).

## Unberechtigte Bewertungen melden

Offizielle Google-Hilfe: https://support.google.com/business/answer/4596773?hl=de
(im Modul verlinkt, mit Kurzanleitung).
