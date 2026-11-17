-- Angebot nach dem Termin senden und nachfassen (Paket P3, Ole 17.11.2026): Kennzeichen „abgelegt“ und „gesendet“ am
-- Termin, geheimer Link auf das Angebots-PDF, Rückruf-Link für die Nachfass-Mail (Minimalseite, Ausbau in P5).
ALTER TABLE "Appointment" ADD COLUMN "angebotAbgelegtAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN "angebotGesendetAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN "angebotVersand" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "angebotKanaele" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "angebotDateiId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "angebotToken" TEXT;
CREATE UNIQUE INDEX "Appointment_angebotToken_key" ON "Appointment"("angebotToken");
ALTER TABLE "Lead" ADD COLUMN "rueckrufToken" TEXT;
ALTER TABLE "Lead" ADD COLUMN "rueckrufGewuenschtAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Lead_rueckrufToken_key" ON "Lead"("rueckrufToken");
-- Vorab-Check-Push vor jedem automatischen Nachfassen zum Angebot (Ole, 17.11.2026): je Schritt einmal
ALTER TABLE "LeadSequence" ADD COLUMN "vorabCheckStep" INTEGER;
