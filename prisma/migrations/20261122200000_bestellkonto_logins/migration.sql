-- Logins für die Bestellkonten Nico Yagci und Tobias D'Angelo (Ole, 22.11.2026). Ohne Einladungsmail: Das Passwort ist
-- ein unbekannter Zufallswert. Ole schickt die Einladung selbst (Kundenakte → Logins → „Zugangslink senden“).
INSERT INTO "User" ("id", "email", "passwordHash", "role", "customerId", "teamRole")
SELECT 'login_bestellkonto_nico', 'n.yagci@mein-novus.de', '$2b$12$zRECiSYX5v1l7WbrJx2cteZin8gyGE8kxImlLO8IT73QfFBvo8Su2', 'BUYER', 'bestellkonto_nico_yagci', 'owner'
WHERE EXISTS (SELECT 1 FROM "Customer" WHERE "id" = 'bestellkonto_nico_yagci')
ON CONFLICT DO NOTHING;
INSERT INTO "User" ("id", "email", "passwordHash", "role", "customerId", "teamRole")
SELECT 'login_bestellkonto_tobias', 't.dangelo@mein-novus.de', '$2b$12$.VxE0fGQ4cn/EP.ZsmStXu5pG.hEf8FRAY5SJa8JKBln.bk21vrvu', 'BUYER', 'bestellkonto_tobias_dangelo', 'owner'
WHERE EXISTS (SELECT 1 FROM "Customer" WHERE "id" = 'bestellkonto_tobias_dangelo')
ON CONFLICT DO NOTHING;
