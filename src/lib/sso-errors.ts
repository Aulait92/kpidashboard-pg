// Feste Fehlercodes für /login?fehler=… (kein Freitext in der URL).
export const SSO_ERRORS: Record<string, string> = {
  "nicht-eingerichtet": "Diese Anmeldung ist noch nicht eingerichtet.",
  abgebrochen: "Anmeldung abgebrochen.",
  abgelaufen: "Die Anmeldung ist abgelaufen. Bitte erneut versuchen.",
  "kein-konto": "Für dieses Konto gibt es keinen Zugang. Bitte mit der E-Mail-Adresse anmelden, mit der Sie eingeladen wurden.",
  fehlgeschlagen: "Die Anmeldung hat nicht geklappt. Bitte erneut versuchen oder mit Passwort anmelden.",
};
