# LinkedIn: Posts fürs persönliche Profil (Ole, 14.11.2026)

Admin → Marketing → **LinkedIn** (`/admin/marketing/linkedin`).

## Was passiert
1. Täglich ab 17 Uhr (einstellbar) schreibt die KI die Entwürfe für den nächsten Posting-Tag
   (Posts pro Tag und Uhrzeiten einstellbar, Standard 5 · Mo–Fr). Push an Admins.
2. Ole liest, ändert bei Bedarf Text oder Foto und klickt **Freigeben** (oder „Jetzt posten“).
   Ohne Freigabe geht nichts raus.
3. Der Cron (alle 5 Minuten) veröffentlicht freigegebene Posts zur Uhrzeit über die LinkedIn-Posts-API.
4. Zahlen: per Export-Upload (je Post oder ganzes Profil); mit freigeschaltetem Statistik-Zugang zusätzlich
   automatisch nach 1, 3, 7 und 14 Tagen.
5. Die KI lernt daraus: bester Post = höchste **Zielgruppen-Reichweite** (Impressionen × Anteil
   Versicherungsvermittler unter den Zuschauern), jeder Entwurf testet genau eine Veränderung (Hypothese).

Texte immer ohne Gedankenstriche und ohne Hashtags (Regel für die KI + Bereinigung vor dem Speichern/Freigeben).
Stil wie Oles beste Posts: kurze Ein-Satz-Absätze, konkrete Zahlen/Fälle, Pfeile (→) für Rechnungen, Schluss-Frage + „Schreib mir eine DM“.

**Bilder** je Post: eigenes Foto/Beweis-Screenshot aus der Fotoablage → sonst fotorealistisches KI-Bild
(gpt-image-1, keine Illustrationen, kein Text im Bild, keine echten Personen/Marken) → sonst Text-Grafik
(Kernaussage auf Blau mit Logo, nur Typografie). Beim Freigeben wählbar: Foto, KI-Bild, Grafik oder keins.

**Trust-Posts**: Die KI bekommt echte, zusammengefasste Zahlen aus der Software (Leads und Termine der letzten
30 Tage, Reaktionszeit des Assistenten, NPS, Neuigkeiten; ohne Kundennamen) und Oles „Trust-Material“
(Einstellungen). Kunden-Cases/Zitate nur aus dem Trust-Material, Namen nur mit ausdrücklicher Freigabe.
Bei mehreren Posts am Tag ist mindestens einer ein Trust-Post.
Keine Wiederholungen: Die KI sieht die Einstiege aller Posts der letzten 6 Monate; schon gepostete Cases nur mit neuem
Blickwinkel. Fotos/Screenshots aus Posts der letzten 90 Tage schlägt sie nicht erneut vor (von Hand weiter wählbar).

Ziel ist Reichweite bei Versicherungsvermittlern, nicht Reichweite insgesamt. Zielgruppe und
Erkennungsbegriffe (Branche/Beruf) stehen in den Einstellungen.

## Einrichten (einmalig, Ole)
1. https://www.linkedin.com/developers/apps → **App erstellen** (mit der performancegrowth-Unternehmensseite verknüpfen).
2. Reiter **Products**: „Share on LinkedIn“ und „Sign In with LinkedIn using OpenID Connect“ hinzufügen.
3. Reiter **Auth** → Authorized redirect URLs:
   - `https://app.performancegrowth.de/api/linkedin/callback`
   - `https://staging.performancegrowth.de/api/linkedin/callback`
4. Railway-Variablen (beide Umgebungen): `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` (aus dem Reiter Auth).
5. In der App: **LinkedIn verbinden**, „Über mich“ ausfüllen, Fotos hochladen, ersten Statistik-Export hochladen.

Optional:
- Statistik-Zugang (`r_member_postAnalytics`, „Member Post Analytics“) im Developer-Portal beantragen.
  Erst wenn LinkedIn ihn freigibt: `LINKEDIN_ANALYTICS=1` setzen und neu verbinden (sonst lehnt LinkedIn die Anmeldung ab).
- `LINKEDIN_API_VERSION` (Standard `202610`); LinkedIn-Versionen gelten mindestens ein Jahr.

## Grenzen
- LinkedIn-Zugänge gelten 60 Tage, ohne automatische Verlängerung. Die App erinnert 7 Tage vorher
  (Push + Admin „Heute“), Neu-Verbinden ist ein Klick.
- Der Profil-Export enthält keine Zuschauerdaten je Post. Den genauen Zielgruppen-Anteil liefert der Export je Post;
  sonst gilt der Profil-Schnitt.
- Ältere Posts (vor der App) kommen über den Export ohne Text; Text kann auf der Seite ergänzt werden.
- Fotos: echte Fotos von Ole (max. 60, je 8 MB). Die KI beschreibt sie beim Hochladen (Claude, Bild wird dafür an Anthropic gesendet).
