-- Neuigkeit von heute ergänzen: Nächste Tage auf Heute, Wiedervorlage als Knopf, schnell schieben
UPDATE "ProductUpdate" SET
  "title" = 'Wiedervorlagen: schneller setzen, schieben und vorausplanen',
  "body" = 'Beim Lead finden Sie **Wiedervorlage** jetzt direkt neben Anrufen, Chat und Termin. Auf **Heute** sehen Sie unter **Nächste Tage** Wiedervorlagen und Termine der kommenden zwei Wochen und schieben Aufgaben mit **+1 Tag** oder **+1 Woche**; unter **Später …** wählen Sie auch einen eigenen Tag. Zusatzmodule unter **Konto & Rechnungen** können Sie schon vor Ihrem Start buchen, berechnet wird ab Abo-Beginn. Für Vertreter ist unter **Meine Provisionen** eine Bestandsprovision von 10 % ab dem 2. Jahr vorausgefüllt.',
  "updatedAt" = NOW()
WHERE "id" = 'upd_2611_spaeter_anrufen';
