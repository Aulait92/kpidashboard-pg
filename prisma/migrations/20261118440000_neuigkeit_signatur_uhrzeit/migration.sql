-- Neuigkeit vom 14.11. um Signatur in Vorlagen und neue Uhrzeitauswahl ergänzen (kleine Änderungen eines Tages zusammengefasst)
UPDATE "ProductUpdate"
SET "body" = "body" || E'\n\nIn Ihren E-Mail-Vorlagen steht Ihre Signatur jetzt automatisch am Ende (**Einstellungen → E-Mail-Postfach**). Und die Zeiten für Ihre Termine wählen Sie unter **Einstellungen → Mein Kalender** aus einer übersichtlichen Liste.',
    "updatedAt" = now()
WHERE "id" = 'upd_2611_empfehlung_ihr_name' AND "body" NOT LIKE '%E-Mail-Vorlagen steht Ihre Signatur%';
