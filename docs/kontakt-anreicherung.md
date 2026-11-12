# Vertriebskontakte automatisch anreichern

Stand 12.11.2026. Code: `src/lib/vertrieb/contact-enrich.ts`

Jeder neue Vertriebskontakt wird im Hintergrund angereichert, egal ob er aus Instantly, Calendly, einem Formular, LinkedIn oder einer Empfehlung kommt. Bestehende Kontakte zieht der WhatsApp-Cron gedrosselt nach: `ADDRESS_ENRICH_PER_RUN` Kontakte je Lauf, Standard 20. Mit `ADDRESS_ENRICH=off` lässt sich die Anreichern-Funktion abschalten.

## Was ergänzt wird

**1. Website bzw. Agenturseite**
- Woher: Feld „Website“, sonst die E-Mail-Domain. Für Allianz, AXA und Signal Iduna ist die Agenturseite schon eingebaut.
- Was: Straße, PLZ, Ort, Telefon, Fax, Öffnungszeiten, Inhaber laut Impressum, Versicherer bzw. „Makler“, Teamgröße (nur bei eindeutigen Angaben) und Social-Links zu Facebook, Instagram, XING und LinkedIn.
- Gelesen werden höchstens drei Seiten: Startseite, Impressum und gegebenenfalls Kontakt.
- Ohne KI. Läuft einmal je Kontakt und nach 30 Tagen erneut, wenn die Adresse noch fehlt.

**2. Google (Places API New)**
- Was: Bewertung und Anzahl, Öffnungszeiten, Link „Google Maps“ und Betriebsstatus. Adresse, Telefon und Website nur, wenn sie leer sind.
- Suche: Agentur plus Ort, sonst Name plus Versicherer plus PLZ.
- **Übernommen wird nur ein sicherer Treffer:** gleiche Website, gleiche Telefonnummer, oder Nachname im Google-Eintrag plus passende PLZ bzw. passender Ort. Im Zweifel bleibt der Kontakt unverändert.
- Aufgefrischt wird alle 30 Tage.
- Ist ein Eintrag laut Google „dauerhaft geschlossen“, steht ein Hinweis im Verlauf.

**Regeln**
- Es werden nur leere Felder gefüllt, Handeingaben nie überschrieben.
- Ausnahme: Die Bewertung kommt immer frisch von Google. Öffnungszeiten ersetzt Google nur, wenn sie leer sind oder selbst automatisch ergänzt wurden.
- Jede Ergänzung steht im Verlauf („Automatisch ergänzt: …“). Quelle und Zeitpunkt stehen im Feld `enrichment` und in der Kontaktakte unter Stammdaten → „Ergänzt“.
- Der Knopf **„Jetzt anreichern“** in der Kontaktakte startet Website und Google sofort neu, auch vor Ablauf der 30 Tage. Das Tageslimit gilt dabei weiter.

## Google-Schlüssel einrichten (Ole, einmalig, ca. 10 Minuten)

1. In der [Google Cloud Console](https://console.cloud.google.com/) dasselbe Projekt wählen wie für den Kalender-Login.
2. **APIs & Dienste → Bibliothek →** nach „Places API (New)“ suchen und **Aktivieren** klicken. Für das Projekt muss ein Rechnungskonto hinterlegt sein.
3. **APIs & Dienste → Anmeldedaten → Anmeldedaten erstellen → API-Schlüssel.**
4. Den Schlüssel einschränken:
   - **API-Einschränkungen:** nur „Places API (New)“.
   - **Anwendungseinschränkungen:** keine. Railway hat keine feste IP-Adresse, deshalb funktioniert eine IP-Beschränkung nicht zuverlässig.
5. In Railway bei **live-app** und **staging-app** die Variable `GOOGLE_PLACES_API_KEY` eintragen. Den Schlüssel nicht in den Chat kopieren.
6. Optional die Variable `GOOGLE_PLACES_MAX_PER_DAY` setzen. Standard sind 200 Anfragen am Tag.
7. Prüfen unter Admin → Vertrieb → Anbindungen, Karte „Kontakte anreichern“. Dort steht „Google: x/200 heute“ statt „Schlüssel fehlt“.

**Kosten:** Wir fragen Bewertung, Öffnungszeiten, Telefon und Website ab. Google rechnet das nach der SKU **„Text Search Enterprise“** ab, eine Anfrage je Kontakt und Auffrischung.
- Preis und monatliches Freikontingent: siehe die aktuelle [Google-Maps-Preisliste](https://developers.google.com/maps/billing-and-pricing/pricing). Die Beträge haben wir nicht fest eingetragen, weil Google sie ändert.
- Die Kostenbremse `GOOGLE_PLACES_MAX_PER_DAY` begrenzt die Anfragen am Tag.
- Zusätzlich empfiehlt sich in der Cloud Console ein **Budget-Alarm** unter Abrechnung → Budgets und Benachrichtigungen.

## Zu prüfen (Ole)

- **Google-Nutzungsbedingungen:** Die Bedingungen der Google Maps Platform schränken das dauerhafte Speichern von Places-Inhalten ein. Die Place-ID ist ausgenommen. Wir speichern Bewertung und Öffnungszeiten und frischen sie alle 30 Tage auf.
  - Bitte prüfen, ob das für unseren Zweck reicht. Andernfalls auf 30 Tage verkürzen (Konstante `GOOGLE_REFRESH_DAYS`) oder nur die Place-ID speichern und Bewertungen beim Öffnen der Kontaktakte frisch laden.
- **Datenschutz:** Die Angaben sind öffentliche Geschäftsdaten von B2B-Kontakten, Rechtsgrundlage ist Art. 6 Abs. 1 f DSGVO. Google steht als Dienstleister im Verzeichnis in docs/datenschutz.md.
