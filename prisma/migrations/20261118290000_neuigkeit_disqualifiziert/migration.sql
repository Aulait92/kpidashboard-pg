-- Neuigkeit von heute ergänzen: Grund bei „Disqualifiziert“
UPDATE "ProductUpdate" SET
  "body" = 'In Ihrer **Pipeline** sehen Sie jetzt getrennt, wer im Chat geantwortet hat bzw. erreicht wurde (**Im Gespräch**) und wer schon einen Termin hat (**Termin vereinbart**). Bisher hieß die Spalte „In Beratung“. Wenn Sie einen Lead auf **Disqualifiziert** setzen, wählen Sie kurz den Grund (z. B. falsche Nummer oder doppelt) – damit verbessern wir Ihre Anzeigen und Formulare gezielt.',
  "updatedAt" = NOW()
WHERE "id" = 'upd_2611_pipeline_spalten';
