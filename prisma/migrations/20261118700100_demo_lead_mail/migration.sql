-- Demo-Kunde Google-Prüfung: Anna Beispiel bekommt eine zustellbare Adresse (example.com nimmt keine Mails an)
UPDATE "Lead" SET "email" = 'ole.kannapinn+demo@gmail.com'
WHERE "id" = 'lead_google_review_1' AND "customerId" = 'cust_google_review_demo' AND "email" = 'anna.beispiel@example.com';
UPDATE "Conversation" SET "contactEmail" = 'ole.kannapinn+demo@gmail.com'
WHERE "customerId" = 'cust_google_review_demo' AND "contactEmail" = 'anna.beispiel@example.com';
