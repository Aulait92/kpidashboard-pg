-- Neuigkeit: neue Struktur (UX-Überarbeitung Etappe 3)
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_wachstum', 'Alles an seinem Platz: Wachstum und Konto',
 'Unter **Wachstum** finden Sie jetzt Ihre Zahlen, das Werbebudget, weitere Produkte und die Pause auf einer Seite. **Konto & Rechnungen** zeigt nur noch Vertrag, Zahlung und Rechnungen. Die **WhatsApp-Vorlagen** sind nach Anlass sortiert, und die Pipeline fasst „Kein Interesse“ und „Disqualifiziert“ als **Verloren** zusammen.',
 'verbessert', 'software', '2026-11-16 01:30:00', '2026-11-16 01:30:00', '2026-11-16 01:30:00')
ON CONFLICT ("id") DO NOTHING;
