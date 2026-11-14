-- Neuigkeit: 3 aktive Verkäufer inklusive, Leadpreise als Spanne, Abzeichen „Neu“
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_aktive_verkaeufer', 'Nur Verkäufer mit Leads zählen',
 'Im Paket mit Software sind jetzt **3 aktive Verkäufer** inklusive: Wer keine Leads bekommt, etwa ein Inhaber, der nur steuert, oder eine Assistenz, ist kostenlos. Unter **Team** wählen Sie beim Einladen, ob die Person Leads bekommt, und sehen einen möglichen Aufpreis vorher. Unter **Konto & Rechnungen → Produkte** stehen Leadpreise jetzt als Spanne, neue Sparten tragen das Abzeichen „Neu“.',
 'verbessert', 'alle', '2026-11-14 12:13:00', '2026-11-14 12:13:00', '2026-11-14 12:13:00')
ON CONFLICT ("id") DO NOTHING;
