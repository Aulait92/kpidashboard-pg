-- Push „Wie lief der Termin?“ angekommen (Ole, 25.11.2026): Termin fällt aus der Sammel-Erinnerung um 8 Uhr. Nur additiv.
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "ergebnisPushOkAt" TIMESTAMP(3);
