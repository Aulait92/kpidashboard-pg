// Feste Fehlercodes für /login?fehler=… (kein Freitext in der URL).
export const SSO_ERRORS: Record<string, string> = {
  "nicht-eingerichtet": "Diese Anmeldung ist noch nicht eingerichtet.",
  abgebrochen: "Anmeldung abgebrochen.",
  abgelaufen: "Die Anmeldung ist abgelaufen. Bitte erneut versuchen.",
  "kein-konto": "Für dieses Konto gibt es keinen Zugang. Bitte mit der E-Mail-Adresse anmelden, mit der Sie eingeladen wurden.",
  "admin-freigabe": "Ihre Firma muss die Anmeldung mit Microsoft für unsere App einmal freigeben (IT-Administrator). Bis dahin bitte mit Passwort anmelden.",
  einstellung: "Die Anmeldung ist gerade nicht möglich (Einstellung beim Anbieter). Bitte mit Passwort anmelden, wir kümmern uns darum.",
  fehlgeschlagen: "Die Anmeldung hat nicht geklappt. Bitte erneut versuchen oder mit Passwort anmelden.",
};
