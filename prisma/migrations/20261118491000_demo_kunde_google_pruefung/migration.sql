-- Demo-Kunde für die OAuth-Prüfung von Google (Ole, 14.11.2026): Testzugang für die Prüfer.
-- plan "internal" = taucht in Zahlen, Abrechnung und Auswertungen nicht auf. Neue Oberfläche an.
-- Der Login hat bewusst KEIN gültiges Passwort: Ole setzt es unter Admin → Kunden-Logins → Passwort
-- und trägt es nur in der Google Cloud Console ein. Ohne Zwei-Faktor, ohne Zahlungsdaten.
INSERT INTO "Customer" ("id", "name", "plan", "newUi")
VALUES ('cust_google_review_demo', 'Google Review Demo', 'internal', true)
ON CONFLICT DO NOTHING;

INSERT INTO "User" ("id", "email", "passwordHash", "role", "customerId", "teamRole", "displayName")
VALUES ('usr_google_review_demo', 'google-review-demo@performancegrowth.de', '!', 'BUYER', 'cust_google_review_demo', 'owner', 'Google Review')
ON CONFLICT DO NOTHING;

-- Test-Leads mit E-Mail-Adresse (für „E-Mail schreiben“ im Video; Adresse im Kontakt änderbar)
INSERT INTO "Lead" ("id", "customerId", "name", "phone", "email", "status", "source", "createdAt")
VALUES
  ('lead_google_review_1', 'cust_google_review_demo', 'Anna Beispiel', '4915100000001', 'anna.beispiel@example.com', 'Neu', 'Katzenversicherung (TKV)', now()),
  ('lead_google_review_2', 'cust_google_review_demo', 'Ben Muster', '4915100000002', 'ben.muster@example.com', 'Im Gespräch', 'Privatschutz', now()),
  ('lead_google_review_3', 'cust_google_review_demo', 'Clara Test', '4915100000003', 'clara.test@example.com', 'Termin vereinbart', 'Katzenversicherung (TKV)', now())
ON CONFLICT DO NOTHING;
