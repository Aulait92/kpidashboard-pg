-- Neuigkeit vom 14.11. ergänzen (mehrere Änderungen eines Tages in einem Eintrag): Termin buchen im Fenster der App
UPDATE "ProductUpdate"
SET "title" = 'Termine direkt in der App buchen oder von Hand eintragen',
    "body" = 'Im Kontakt unter **Termin** wählen Sie jetzt in einem Fenster direkt in der App eine freie Zeit aus Ihrem Kalender, ohne neuen Tab. Das gilt auch für **Termin buchen** auf **Heute**. Ohne Kalender tragen Sie den Termin von Hand ein (Telefon, Video oder vor Ort). Gibt es mit einem Lead noch keinen Chat, startet **Chat** das WhatsApp-Gespräch mit Ihrer freigegebenen Erstnachricht. Fehlt für einen Knopf etwas, etwa die Telefonnummer, erklärt ein Tippen darauf, was zu tun ist.',
    "updatedAt" = now()
WHERE "id" = 'upd_2611_termin_hand';
