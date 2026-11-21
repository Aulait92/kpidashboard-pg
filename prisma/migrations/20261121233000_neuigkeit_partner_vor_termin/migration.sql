-- Neuigkeit angepasst (21.11.2026 spät): Die Frage „Entscheidet noch jemand mit?“ kommt jetzt vor der Terminwahl, damit
-- der Termin gleich für beide passt. Gleicher Eintrag, publishedAt bleibt. Kein Push.
UPDATE "ProductUpdate"
SET "title" = 'Entscheidet der Partner mit? Dann passt der Termin für beide',
    "body" = 'Bevor ein Termin gewählt wird, fragt Ihr Assistent kurz, ob noch jemand mitentscheidet, zum Beispiel der Partner. Wenn ja, achtet er darauf, dass eine Zeit gewählt wird, die für beide passt, damit im Termin gemeinsam entschieden werden kann. Sie sehen es vorab in der **Terminvorbereitung** unter „Das will der Kunde“.',
    "updatedAt" = '2026-11-21 23:30:00'
WHERE "id" = 'upd_2611_partner_entscheidet_mit';
