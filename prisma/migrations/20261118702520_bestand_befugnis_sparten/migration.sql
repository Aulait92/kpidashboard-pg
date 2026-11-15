-- Ausschließlichkeitsvertreter: Textversion der Befugnis-Bestätigung, angebotene Sparten (Anwalts-Memo, 15.11.2026)
ALTER TABLE "Customer" ADD COLUMN "bestandAgentConfirmedVersion" TEXT;
ALTER TABLE "Customer" ADD COLUMN "bestandSparten" TEXT[] DEFAULT ARRAY[]::TEXT[];
