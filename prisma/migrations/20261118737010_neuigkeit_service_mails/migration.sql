-- Neuigkeit (18.11.2026): automatische E-Mails im Ablauf und Mails nach dem Abschluss (Pakete M4 und M6). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_service_mails_ablauf', 'E-Mails im Ablauf: automatisch oder mit einem Tipp',
 'Erreichen Sie einen Kontakt zweimal nicht, verpasst er einen Termin oder endet seine Bedenkzeit, geht jetzt zusätzlich zur WhatsApp eine passende E-Mail in Ihrem Namen raus; antwortet er vorher, entfällt sie. Nach dem Abschluss senden Sie die Danke-Mail mit einem Haken im Abschluss-Blatt, fehlende Unterlagen fordern Sie unter **Police fertig machen → Unterlagen fehlen?** an (die App erinnert nach 3 Tagen), und für Willkommens-Mail und Kündigung des alten Vertrags steht der passende Knopf direkt in der Aufgabe. Was automatisch geht, stellen Sie unter **Einstellungen → Assistent** ein.',
 'neu', 'software', '2026-11-18 03:00:00', '2026-11-18 03:00:00', '2026-11-18 03:00:00')
ON CONFLICT ("id") DO NOTHING;
