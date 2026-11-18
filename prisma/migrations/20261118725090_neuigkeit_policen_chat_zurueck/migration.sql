-- Neuigkeit „Policen direkt im Chat“ erst veröffentlichen, wenn der EU-Policen-Speicher eingerichtet ist und die Funktion
-- wirklich läuft (AGENTS.md: nur Verfügbares als verfügbar beschreiben). Bis dahin wieder entfernen; beim Einschalten neu
-- mit eigener ID anlegen.
DELETE FROM "ProductUpdate" WHERE "id" = 'upd_2611_policen_chat';
