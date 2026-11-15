-- Automatisch nachfassen auch für alle bestehenden Kunden einschalten (Ole, 15.11.2026)
UPDATE "AgentConfig" SET "followUpSequencesEnabled" = true, "updatedAt" = NOW() WHERE "followUpSequencesEnabled" = false;
-- Neuigkeit TKV: genaues Geburtsdatum des Tieres nicht nötig, zum Termin reicht die Chipnummer
UPDATE "ProductUpdate" SET "body" = 'Bei Leads zur Tierkrankenversicherung fragt Ihr Assistent vor dem Termin die Gesundheit des Tieres in den letzten 24 Monaten ab (und welche Bereiche betroffen waren), ob nur OP-Schutz oder eine volle Krankenversicherung gewünscht ist und das Geburtsdatum des Halters für den Antrag. Nach der Buchung bittet er, die Chipnummer bereitzulegen. Die Angaben sehen Sie im Kontakt.', "updatedAt" = NOW()
WHERE "id" = 'upd_2611_tkv_angaben';
