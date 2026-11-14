-- Neuigkeit: Empfehlungen – Angebot, QR im Termin, Aufsteller, Trichter, Leitfaden
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_empfehlung_playbook', 'Empfehlungen: Angebot für Empfohlene, QR-Code im Termin und Auswertung, wo es hakt',
 'Unter **Empfehlungen & Bewertungen → Einstellungen** wählen Sie jetzt ein Empfehlungsangebot, zum Beispiel einen kostenlosen Versicherungs-Check: Es steht auf der Empfehlungsseite und im Text, den Ihr Kunde weiterleitet. Im Kontakt zeigt **Im Termin zeigen** einen QR-Code, mit dem Ihr Kunde gleich am Tisch empfiehlt; beim Senden können Sie einen Anlass wählen, etwa „Schaden geregelt“.

Neu sind außerdem ein Aufsteller zum Drucken, eine Zeile für Ihre E-Mail-Signatur, eine Aufgabe zum Nachfassen, ein Gesprächsleitfaden und die Übersicht **Wo gehen Empfehlungen verloren?**. Wer mit einem Lob antwortet, bekommt seinen Empfehlungslink direkt mit dem Dank. Empfohlene können Ihnen mit einem Tipp per WhatsApp schreiben.',
 'verbessert', 'software', '2026-11-14 00:00:00', '2026-11-14 00:00:00', '2026-11-14 00:00:00')
ON CONFLICT ("id") DO NOTHING;
