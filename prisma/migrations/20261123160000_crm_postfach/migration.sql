-- E-Mails aus der Kontaktakte (Ole, 23.11.2026): Vorlagen für den Vertrieb. Das Postfach je Admin liegt in
-- "AdminMailbox" (purpose 'crm:<userId>'), dafür ist keine Tabellenänderung nötig.
CREATE TABLE "SalesMailTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "bodyDu" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SalesMailTemplate_pkey" PRIMARY KEY ("id")
);

-- Vier Startvorlagen (Sie und Du), danach unter Einstellungen → Mail- und WhatsApp-Vorlagen änderbar
INSERT INTO "SalesMailTemplate" ("id", "name", "subject", "body", "bodyDu", "sort", "updatedAt") VALUES
('crm_vorlage_nachfassen_angebot', 'Nachfassen nach Angebot', 'Kurze Frage zum Angebot',
'{anrede},

ich wollte kurz nachhören, ob Sie das Angebot schon ansehen konnten.

Hier ist es noch einmal: {angebotslink}

Wenn noch Fragen offen sind, rufe ich Sie gern an. Antworten Sie einfach mit einer Uhrzeit, die Ihnen passt.

Viele Grüße
{ole}',
'{anrede},

hast du dir das Angebot schon ansehen können?

Hier ist es noch einmal: {angebotslink}

Wenn noch Fragen offen sind, rufe ich dich gern an. Antworte einfach mit einer Uhrzeit, die dir passt.

Viele Grüße
{ole}', 10, CURRENT_TIMESTAMP),
('crm_vorlage_termin_verpasst', 'Termin verpasst, neuer Termin', 'Unser Termin',
'{anrede},

schade, dass es mit unserem Termin nicht geklappt hat. Das kann passieren.

Wann passt es Ihnen besser? Nennen Sie mir einfach zwei Zeiten, dann rufe ich Sie an.

Viele Grüße
{ole}',
'{anrede},

schade, dass es mit unserem Termin nicht geklappt hat. Das kann passieren.

Wann passt es dir besser? Nenn mir einfach zwei Zeiten, dann rufe ich dich an.

Viele Grüße
{ole}', 20, CURRENT_TIMESTAMP),
('crm_vorlage_unterlagen', 'Unterlagen nach dem Gespräch', 'Unterlagen zu unserem Gespräch',
'{anrede},

vielen Dank für das Gespräch. Wie besprochen hier die wichtigsten Punkte:

1.
2.
3.

Ihr Angebot finden Sie hier: {angebotslink}

Melden Sie sich gern, wenn noch etwas offen ist.

Viele Grüße
{ole}',
'{anrede},

danke für das Gespräch. Wie besprochen hier die wichtigsten Punkte:

1.
2.
3.

Dein Angebot findest du hier: {angebotslink}

Melde dich gern, wenn noch etwas offen ist.

Viele Grüße
{ole}', 30, CURRENT_TIMESTAMP),
('crm_vorlage_kurz_nachgefragt', 'Kurz nachgefragt', 'Kurze Frage',
'{anrede},

ich wollte mich kurz melden: Ist das Thema neue Kunden für {firma} gerade noch aktuell?

Eine kurze Antwort reicht mir, auch wenn es gerade nicht passt.

Viele Grüße
{ole}',
'{anrede},

ich wollte mich kurz melden: Ist das Thema neue Kunden für {firma} gerade noch aktuell?

Eine kurze Antwort reicht mir, auch wenn es gerade nicht passt.

Viele Grüße
{ole}', 40, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
