-- Login von Nico Yagci in sein Bestellkonto verschieben (Ole, 27.11.2026: „Mikael hat irgendwann die Leads von Nico
-- übernommen. Nico braucht nur ein Konto, in dem er bestellen kann.“). Der Login hing als Inhaber im Konto „Mikael“.
-- Zuweisungen dieses Logins an Leads und Chats im Konto Mikael lösen (bleiben im Konto, nur ohne Zuständigen), offene
-- Sitzungen beenden (sessionVersion + 1), damit Nico nicht weiter Mikaels Konto sieht.
UPDATE "Lead" SET "assignedUserId" = NULL
WHERE "assignedUserId" = 'cmqqr4wzo0p3c1mpl7eigba6n' AND "customerId" = 'cmsd7o2qr00111mozja8a14tb';
UPDATE "Conversation" SET "assignedUserId" = NULL
WHERE "assignedUserId" = 'cmqqr4wzo0p3c1mpl7eigba6n' AND "customerId" = 'cmsd7o2qr00111mozja8a14tb';

UPDATE "User"
SET "customerId" = 'cmt8k8wafnd421nrm27grnutv', "teamRole" = 'owner', "sessionVersion" = "sessionVersion" + 1
WHERE "id" = 'cmqqr4wzo0p3c1mpl7eigba6n' AND "customerId" = 'cmsd7o2qr00111mozja8a14tb'
  AND EXISTS (SELECT 1 FROM "Customer" WHERE "id" = 'cmt8k8wafnd421nrm27grnutv' AND "name" = 'Nico Yagci');
