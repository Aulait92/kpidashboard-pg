-- Google/Microsoft-Anmeldung in der App: Einmal-Code aus dem System-Browser zurück in die App.
-- Der Zweck trennt die Richtung, damit ein Code nur an seiner eigenen Stelle eingelöst werden kann.
ALTER TABLE "AppHandoff" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'browser';
