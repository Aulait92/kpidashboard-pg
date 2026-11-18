-- Datenmigration (18.11.2026): Die Neuigkeit upd_2611_schutz_termin_mails nannte noch den alten Weg „Termin vorbereiten →
-- Schutz im Überblick“. Der Bereich heißt jetzt „Was hat Frau Becker schon?“ und steht in Schritt 1 der Terminvorbereitung.
-- Nur der Text, kein Push.
UPDATE "ProductUpdate" SET "body" = 'Unter **Termin vorbereiten → Schritt 1** beantworten Sie bei „Was hat Frau Becker schon?“ je Versicherung nur „Ja, bei mir“, „Ja, woanders“, „Weiß nicht“ oder „Nein“; was Ihr Kunde schon im Chat genannt hat, ist vorbelegt, und alles wird automatisch gespeichert. Die Terminbestätigung und die Erinnerung am Vortag per E-Mail sagen Ihrem Kunden jetzt, was er zum Termin bereitlegen soll, dieselbe Liste wie im WhatsApp-Chat. Abschalten können Sie das unter **Einstellungen → Assistent** bei „Termin: Vorbereitung“.', "updatedAt" = NOW()
WHERE "id" = 'upd_2611_schutz_termin_mails';
