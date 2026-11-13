-- Neuigkeit Einführungsvideos um das Video „WhatsApp verbinden“ ergänzen (gleicher Tag → ein Eintrag)
UPDATE "ProductUpdate" SET
  "body" = 'Unter **Profil → Einführung ansehen** finden Sie jetzt einen kurzen Rundgang durch die App (ca. 1 Minute) und eine ausführliche Einführung (ca. 3 Minuten). Neu ist außerdem ein Video, das Schritt für Schritt zeigt, wie Sie WhatsApp verbinden – direkt in der **Einrichtung** über dem Knopf „Jetzt WhatsApp verbinden“. Alle Videos funktionieren auch ohne Ton.',
  "publishedAt" = '2026-11-13 23:00:00',
  "updatedAt" = '2026-11-13 23:00:00'
WHERE "id" = 'upd_2611_einfuehrungsvideo';
