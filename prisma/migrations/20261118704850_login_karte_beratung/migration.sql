-- Login-Seite (Ole, 15.11.2026): Karte „Bestandskunden-Modul“ ist ausgeblendet, solange das Modul für Kunden aus ist
-- (lib/login-karten-server.ts AUSGEBLENDETE_KARTEN). Dafür eine Karte zu Terminvorbereitung und Beratungspräsentation.
INSERT INTO "LoginCard" ("id", "key", "position", "enabled", "badge", "title", "text", "linkText", "linkUrl", "imagePath", "updatedAt")
VALUES
  ('login-karte-beratung', 'beratung', 2, true, 'Neu', 'Gut vorbereitet in jeden Termin',
   'Alles, was der Assistent erfragt hat, auf einen Blick. Ihre Angebote zeigen Sie im Videocall als Präsentation mit echten Preisen.',
   'Termine ansehen', '/buyer', NULL, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
