-- Login-Seite: Karten „Sparte“ und „Bestand“ anlegen und aktivieren (Rotation),
-- „Kollegen“ anlegen, aber ausgeschaltet (Ole, 18.11.). Die bisherige Karte
-- bleibt als Eintrag erhalten (ausgeschaltet, am Ende der Liste); ohne gepflegte
-- Karte wird der bisherige Standard-Inhalt übernommen.

INSERT INTO "LoginCard" ("id", "key", "position", "enabled", "badge", "title", "text", "linkText", "linkUrl", "imagePath", "updatedAt")
VALUES
  ('login-karte-sparte', 'sparte', 1, true, 'Neu buchbar', 'Mehr Leads mit einer weiteren Sparte',
   'Privatschutz, Hund, Pferd und mehr: Einrichtung kostenlos, neue Leads in wenigen Tagen.',
   'Sparte dazubuchen', '/buyer/konto#produkte', '/login-karten/sparte.webp', CURRENT_TIMESTAMP),
  ('login-karte-bestand', 'bestand', 2, true, 'Bestandskunden-Modul', 'In Ihrem Bestand steckt mehr',
   'Sprechen Sie Ihre Bestandskunden per WhatsApp gezielt auf fehlende Sparten an. Die Software findet, wer passt.',
   'Bestand ansehen', '/buyer/bestand', '/login-karten/bestand.webp', CURRENT_TIMESTAMP),
  ('login-karte-kollegen', 'kollegen', 3, false, 'Empfehlen lohnt sich', 'Kennen Sie einen Kollegen, der mehr Kunden will?',
   'Ihr Kollege spart 300 € bei der Einrichtung. Sie bekommen 3 Monate das Bestandskunden-Modul gratis.',
   'Kollegen empfehlen', '/buyer/empfehlen', '/login-karten/kollegen.webp', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Bisherige Karte (falls gepflegt) mit Bild übernehmen
INSERT INTO "LoginCard" ("id", "position", "enabled", "badge", "title", "text", "linkText", "linkUrl", "image", "imageType", "updatedAt")
SELECT 'login-karte-bisher', 4, false, "badge", "title", "text", "linkText", "linkUrl", "image", "imageType", "updatedAt"
FROM "LoginInfo" WHERE "id" = 'default'
ON CONFLICT ("id") DO NOTHING;

-- Ohne gepflegte Karte: bisheriger Standard-Inhalt als Eintrag
INSERT INTO "LoginCard" ("id", "position", "enabled", "badge", "title", "text", "updatedAt")
SELECT 'login-karte-bisher', 4, false, 'Neu', 'Urlaub oder krank?',
  'Ein Klick auf „Ich bin abwesend“: Leads, Termine und Rückrufe gehen an Ihre Vertretung oder warten bis zu Ihrer Rückkehr.',
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "LoginInfo" WHERE "id" = 'default')
ON CONFLICT ("id") DO NOTHING;
