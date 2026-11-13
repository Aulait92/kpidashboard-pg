-- Neuigkeit von heute ergänzen: Wiedervorlage sichtbar ändern, Zusatzmodule schon vor dem Start buchbar
UPDATE "ProductUpdate" SET
  "title" = 'Wiedervorlagen schneller ändern, Tag frei wählen',
  "body" = 'Beim Lead ändern oder setzen Sie die **Wiedervorlage** jetzt direkt oben unter den Knöpfen. Unter **Später** wählen Sie auch einen eigenen Tag (**Anderer Tag …**). Zusatzmodule unter **Konto & Rechnungen** können Sie schon vor Ihrem Start buchen, berechnet wird ab Abo-Beginn. Für Vertreter ist unter **Meine Provisionen** eine Bestandsprovision von 10 % ab dem 2. Jahr vorausgefüllt.',
  "updatedAt" = NOW()
WHERE "id" = 'upd_2611_spaeter_anrufen';
