-- Neuigkeiten im Kundenbereich (/buyer/neuigkeiten)
ALTER TABLE "User" ADD COLUMN "updatesSeenAt" TIMESTAMP(3);

CREATE TABLE "ProductUpdate" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'neu',
    "audience" TEXT NOT NULL DEFAULT 'alle',
    "publishedAt" TIMESTAMP(3),
    "pushedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductUpdate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductUpdate_publishedAt_idx" ON "ProductUpdate"("publishedAt");

-- Startinhalt (11.–13.11.2026): nur, was Kunden im Kundenbereich sehen bzw. nutzen.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_status', 'Status-Seite und „Sicherheit & Datenschutz“',
 'Unter **Status** sehen Sie jederzeit, ob alles reibungslos läuft. Die Seite **Sicherheit & Datenschutz** erklärt, wie wir Ihre Daten und die Ihrer Kunden schützen – beide Seiten finden Sie unten im Profilmenü bzw. im Fußbereich.',
 'neu', 'alle', '2026-11-11 15:00:00', '2026-11-11 15:00:00', '2026-11-11 15:00:00'),
('upd_2611_support', 'Hilfe-Chat: direkt mit unserem Team sprechen',
 'Der Hilfe-Chat beantwortet Ihre Fragen sofort. Wenn Sie lieber mit einem Menschen sprechen möchten, tippen Sie auf **„Mit Mensch sprechen“** – Ihr Anliegen landet direkt bei uns.',
 'verbessert', 'alle', '2026-11-11 16:00:00', '2026-11-11 16:00:00', '2026-11-11 16:00:00'),
('upd_2611_budget', 'Werbebudget selbst ändern',
 'Unter **Konto & Rechnungen → Werbebudget** passen Sie Ihr Tagesbudget je Produkt selbst an – sofort oder ab einem Datum. Sie sehen vorab, wie viele Leads Sie erwarten können und was sich am Preis ändert.',
 'neu', 'alle', '2026-11-11 17:00:00', '2026-11-11 17:00:00', '2026-11-11 17:00:00'),
('upd_2612_sicherheit', 'Mehr Sicherheit für Ihren Zugang',
 'Unter **Profil → Anmeldung & Sicherheit** können Sie die **Zwei-Faktor-Anmeldung** einschalten. Mit **„Überall abmelden“** beenden Sie alle Anmeldungen auf anderen Geräten mit einem Klick.',
 'neu', 'alle', '2026-11-12 09:00:00', '2026-11-12 09:00:00', '2026-11-12 09:00:00'),
('upd_2612_kollegen', 'Kollegen empfehlen',
 'Kennen Sie Kollegen, denen wir ebenfalls helfen können? Unter **Profil → Kollegen empfehlen** finden Sie Ihren persönlichen Link. Wird aus Ihrer Empfehlung ein Kunde, bedanken wir uns mit einer Prämie.',
 'neu', 'alle', '2026-11-12 10:00:00', '2026-11-12 10:00:00', '2026-11-12 10:00:00'),
('upd_2612_module', 'Zusatzmodule selbst buchen',
 'Unter **Konto & Rechnungen → Zusatzmodule** buchen Sie Erweiterungen selbst. Neu: **Empfehlungen & Bewertungen** – Ihre Kunden werden nach dem Abschluss automatisch um eine Google-Bewertung und eine Empfehlung gebeten. Die ersten **30 Tage sind kostenlos**.',
 'neu', 'software', '2026-11-12 11:00:00', '2026-11-12 11:00:00', '2026-11-12 11:00:00'),
('upd_2612_produkte', 'Weitere Produkte selbst dazubuchen',
 'Unter **Konto & Rechnungen → Produkte** buchen Sie eine weitere Sparte dazu, zum Beispiel Hund, Pferd, Privatschutz, Sterbegeld oder Kindersparpläne. Die **Einrichtung ist kostenlos** – wir kümmern uns um Kampagne und Leadformular.',
 'neu', 'alle', '2026-11-12 15:00:00', '2026-11-12 15:00:00', '2026-11-12 15:00:00'),
('upd_2613_symbol', 'Neues App-Symbol',
 'Die App hat ein neues Symbol. Falls auf Ihrem Handy noch das alte angezeigt wird: Symbol vom Home-Bildschirm entfernen und die App in Safari über **Teilen → Zum Home-Bildschirm** neu hinzufügen.',
 'verbessert', 'alle', '2026-11-13 05:00:00', '2026-11-13 05:00:00', '2026-11-13 05:00:00'),
('upd_2613_einrichtung', 'Einrichtung Schritt für Schritt',
 'Unter **Einrichtung** sehen Sie auf einen Blick, was schon erledigt ist und was noch fehlt – mit kurzen Anleitungen, etwa zur Freigabe Ihres Werbekontos und zur Verbindung von WhatsApp.',
 'verbessert', 'alle', '2026-11-13 05:30:00', '2026-11-13 05:30:00', '2026-11-13 05:30:00'),
('upd_2613_berichte', 'Monatsberichte',
 'Einmal im Monat fassen wir für Sie zusammen, was in Ihrer Kampagne passiert ist und was wir als Nächstes tun. Alle Berichte finden Sie unter **Zahlen → Monatsberichte**.',
 'neu', 'alle', '2026-11-13 06:00:00', '2026-11-13 06:00:00', '2026-11-13 06:00:00');
