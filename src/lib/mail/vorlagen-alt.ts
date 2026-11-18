// Standardvorlagen bis Stand 2 (14.11.2026) und die in Stand 4 geänderten aus Stand 3 (15.11.2026), unverändert. Beim Laden (Stand < 3) werden gespeicherte Vorlagen, die
// genau so noch beim Kunden liegen (nicht selbst geändert), auf die neue Fassung gehoben (lib/mail/vorlagen.ts).
// Nur Betreff, Text und Schlüssel; nicht für neue Texte verwenden.

import type { Ansprache } from "@/lib/ansprache";

export const STANDARD_VORLAGEN_STAND2: Record<Ansprache, { key: string; name: string; subject: string; body: string }[]> = {
  sie: [
    {
      key: "nicht_erreicht",
      name: "Nicht erreicht",
      subject: "Ihre Anfrage: {produkt}",
      body: "{anrede},\n\nich habe gerade versucht, Sie telefonisch zu erreichen, leider ohne Erfolg. Sie hatten sich für {produkt} interessiert. Wann passt es Ihnen für ein kurzes Telefonat? Hier können Sie sich auch direkt einen Termin aussuchen: {terminlink}\n\n{signatur}",
    },
    {
      key: "angebot",
      name: "Angebot",
      subject: "Ihr Angebot: {produkt}",
      body: "{anrede},\n\nwie besprochen erhalten Sie im Anhang Ihr Angebot. Wenn Sie Fragen haben, melden Sie sich gern jederzeit.\n\n{signatur}",
    },
    {
      key: "nachfassen_angebot",
      name: "Nachfassen Angebot",
      subject: "Kurze Nachfrage zu Ihrem Angebot",
      body: "{anrede},\n\nkonnten Sie sich das Angebot schon in Ruhe ansehen? Gern beantworte ich offene Fragen kurz am Telefon. Einen passenden Termin können Sie sich hier aussuchen: {terminlink}\n\n{signatur}",
    },
    {
      key: "nach_abschluss",
      name: "Nach dem Abschluss",
      subject: "Vielen Dank für Ihr Vertrauen",
      body: "{anrede},\n\nvielen Dank für Ihr Vertrauen. Ihre Unterlagen erhalten Sie in Kürze. Wenn Sie Fragen haben, bin ich jederzeit für Sie da.\n\n{signatur}",
    },
    {
      key: "termin_vorbereitung",
      name: "Termin: Vorbereitung",
      subject: "Kurze Vorbereitung auf unser Gespräch",
      body: "{anrede},\n\nich freue mich auf unser Gespräch am {termin_datum} {termin_art}. Den Link zum Videocall finden Sie hier: {videolink}\n\nDamit wir die Zeit gut nutzen können, legen Sie sich bitte Folgendes bereit:\n{termin_unterlagen}\n\nFehlt etwas davon, ist das kein Problem. Wir klären es dann gemeinsam im Gespräch.\n\n{signatur}",
    },
    {
      key: "nicht_erschienen",
      name: "Nicht erschienen",
      subject: "Neuer Termin für unser Gespräch",
      body: "{anrede},\n\nleider haben wir uns bei unserem Termin verpasst. Das kann immer mal passieren. Wenn Sie möchten, suchen Sie sich hier einfach einen neuen Termin aus: {terminlink}\n\nSie können mir auch kurz auf diese E-Mail antworten, wann es Ihnen besser passt. Dann melde ich mich bei Ihnen.\n\n{signatur}",
    },
    {
      key: "beratungsdoku",
      name: "Gesprächszusammenfassung",
      subject: "Zusammenfassung unseres Gesprächs",
      body: "{anrede},\n\nvielen Dank für das Gespräch. Wie besprochen fasse ich die wichtigsten Punkte für Sie zusammen.\n\nIhre Wünsche und Bedürfnisse:\n{wuensche}\n\nMein Rat und die Gründe dafür:\n{rat}\n\nBitte lesen Sie die Zusammenfassung in Ruhe durch. Wenn etwas fehlt oder nicht stimmt, geben Sie mir bitte kurz Bescheid.\n\n{signatur}",
    },
    {
      key: "unterlagen_fehlen",
      name: "Unterlagen fehlen noch",
      subject: "Es fehlen noch ein paar Angaben",
      body: "{anrede},\n\nvielen Dank für Ihre Zeit. Damit ich alles für Sie fertig machen kann, fehlen mir noch folgende Angaben bzw. Unterlagen:\n{fehlende_unterlagen}\n\nAm einfachsten antworten Sie direkt auf diese E-Mail und schicken mir die Unterlagen als Anhang oder Foto mit.\n\n{signatur}",
    },
    {
      key: "willkommen",
      name: "Willkommen: Police ist da",
      subject: "Ihre Police ist da",
      body: "{anrede},\n\nIhre Police ist fertig, herzlich willkommen! Bitte bewahren Sie die Unterlagen gut auf. Auch künftig bin ich für alle Fragen rund um Ihre Versicherung für Sie da.\n\nSo erreichen Sie mich: Antworten Sie einfach auf diese E-Mail oder rufen Sie mich an.\n\nSo melden Sie einen Schaden: Geben Sie mir möglichst bald Bescheid und schildern Sie kurz, was passiert ist. Bewahren Sie Fotos, Rechnungen und andere Belege auf. Ich unterstütze Sie bei der Meldung an den Versicherer.\n\n{signatur}",
    },
    {
      key: "kuendigung",
      name: "Kündigung alte Versicherung",
      subject: "Kündigung Ihrer bisherigen Versicherung",
      body: "{anrede},\n\ndamit Sie nicht doppelt versichert sind, sollte Ihr bisheriger Vertrag rechtzeitig gekündigt werden. Dafür habe ich Ihnen unten eine Musterkündigung vorbereitet. Bitte ergänzen Sie Ihre Anschrift, unterschreiben Sie und schicken Sie die Kündigung an Ihren bisherigen Versicherer, am besten so, dass Sie den Versand nachweisen können.\n\n{musterkuendigung}\n\nWenn Sie Fragen haben, melden Sie sich gern.\n\n{signatur}",
    },
    {
      key: "wie_besprochen",
      name: "Wie besprochen: später melden",
      subject: "Wie besprochen melde ich mich später",
      body: "{anrede},\n\nvielen Dank für das Gespräch. Wie besprochen melde ich mich am {melde_datum} wieder bei Ihnen. Haben Sie vorher Fragen, antworten Sie einfach auf diese E-Mail.\n\n{signatur}",
    },
    {
      key: "tuer_offen",
      name: "Kein Interesse: Tür offen",
      subject: "Vielen Dank für Ihre Rückmeldung",
      body: "{anrede},\n\nvielen Dank für Ihre offene Rückmeldung. Ich respektiere Ihre Entscheidung und melde mich von mir aus nicht mehr bei Ihnen.\n\nSollten Sie später doch Fragen zu Ihrer Absicherung haben, können Sie sich gern an mich wenden.\n\nAlles Gute für Sie!\n\n{signatur}",
    },
  ],
  du: [
    {
      key: "nicht_erreicht",
      name: "Nicht erreicht",
      subject: "Deine Anfrage: {produkt}",
      body: "{anrede},\n\nich habe gerade versucht, dich telefonisch zu erreichen, leider ohne Erfolg. Du hattest dich für {produkt} interessiert. Wann passt es dir für ein kurzes Telefonat? Hier kannst du dir auch direkt einen Termin aussuchen: {terminlink}\n\n{signatur}",
    },
    {
      key: "angebot",
      name: "Angebot",
      subject: "Dein Angebot: {produkt}",
      body: "{anrede},\n\nwie besprochen bekommst du im Anhang dein Angebot. Wenn du Fragen hast, melde dich gern jederzeit.\n\n{signatur}",
    },
    {
      key: "nachfassen_angebot",
      name: "Nachfassen Angebot",
      subject: "Kurze Nachfrage zu deinem Angebot",
      body: "{anrede},\n\nkonntest du dir das Angebot schon in Ruhe ansehen? Gern beantworte ich offene Fragen kurz am Telefon. Einen passenden Termin kannst du dir hier aussuchen: {terminlink}\n\n{signatur}",
    },
    {
      key: "nach_abschluss",
      name: "Nach dem Abschluss",
      subject: "Vielen Dank für dein Vertrauen",
      body: "{anrede},\n\nvielen Dank für dein Vertrauen. Deine Unterlagen bekommst du in Kürze. Wenn du Fragen hast, bin ich jederzeit für dich da.\n\n{signatur}",
    },
    {
      key: "termin_vorbereitung",
      name: "Termin: Vorbereitung",
      subject: "Kurze Vorbereitung auf unser Gespräch",
      body: "{anrede},\n\nich freue mich auf unser Gespräch am {termin_datum} {termin_art}. Den Link zum Videocall findest du hier: {videolink}\n\nDamit wir die Zeit gut nutzen können, leg dir bitte Folgendes bereit:\n{termin_unterlagen}\n\nFehlt etwas davon, ist das kein Problem. Wir klären es dann gemeinsam im Gespräch.\n\n{signatur}",
    },
    {
      key: "nicht_erschienen",
      name: "Nicht erschienen",
      subject: "Neuer Termin für unser Gespräch",
      body: "{anrede},\n\nleider haben wir uns bei unserem Termin verpasst. Das kann immer mal passieren. Wenn du möchtest, such dir hier einfach einen neuen Termin aus: {terminlink}\n\nDu kannst mir auch kurz auf diese E-Mail antworten, wann es dir besser passt. Dann melde ich mich bei dir.\n\n{signatur}",
    },
    {
      key: "beratungsdoku",
      name: "Gesprächszusammenfassung",
      subject: "Zusammenfassung unseres Gesprächs",
      body: "{anrede},\n\nvielen Dank für das Gespräch. Wie besprochen fasse ich die wichtigsten Punkte für dich zusammen.\n\nDeine Wünsche und Bedürfnisse:\n{wuensche}\n\nMein Rat und die Gründe dafür:\n{rat}\n\nBitte lies dir die Zusammenfassung in Ruhe durch. Wenn etwas fehlt oder nicht stimmt, gib mir bitte kurz Bescheid.\n\n{signatur}",
    },
    {
      key: "unterlagen_fehlen",
      name: "Unterlagen fehlen noch",
      subject: "Es fehlen noch ein paar Angaben",
      body: "{anrede},\n\nvielen Dank für deine Zeit. Damit ich alles für dich fertig machen kann, fehlen mir noch folgende Angaben bzw. Unterlagen:\n{fehlende_unterlagen}\n\nAm einfachsten antwortest du direkt auf diese E-Mail und schickst mir die Unterlagen als Anhang oder Foto mit.\n\n{signatur}",
    },
    {
      key: "willkommen",
      name: "Willkommen: Police ist da",
      subject: "Deine Police ist da",
      body: "{anrede},\n\ndeine Police ist fertig, herzlich willkommen! Bitte bewahre die Unterlagen gut auf. Auch künftig bin ich für alle Fragen rund um deine Versicherung für dich da.\n\nSo erreichst du mich: Antworte einfach auf diese E-Mail oder ruf mich an.\n\nSo meldest du einen Schaden: Gib mir möglichst bald Bescheid und schildere kurz, was passiert ist. Bewahre Fotos, Rechnungen und andere Belege auf. Ich unterstütze dich bei der Meldung an den Versicherer.\n\n{signatur}",
    },
    {
      key: "kuendigung",
      name: "Kündigung alte Versicherung",
      subject: "Kündigung deiner bisherigen Versicherung",
      body: "{anrede},\n\ndamit du nicht doppelt versichert bist, sollte dein bisheriger Vertrag rechtzeitig gekündigt werden. Dafür habe ich dir unten eine Musterkündigung vorbereitet. Bitte ergänze deine Anschrift, unterschreib und schick die Kündigung an deinen bisherigen Versicherer, am besten so, dass du den Versand nachweisen kannst.\n\n{musterkuendigung}\n\nWenn du Fragen hast, melde dich gern.\n\n{signatur}",
    },
    {
      key: "wie_besprochen",
      name: "Wie besprochen: später melden",
      subject: "Wie besprochen melde ich mich später",
      body: "{anrede},\n\nvielen Dank für das Gespräch. Wie besprochen melde ich mich am {melde_datum} wieder bei dir. Hast du vorher Fragen, antworte einfach auf diese E-Mail.\n\n{signatur}",
    },
    {
      key: "tuer_offen",
      name: "Kein Interesse: Tür offen",
      subject: "Vielen Dank für deine Rückmeldung",
      body: "{anrede},\n\nvielen Dank für deine offene Rückmeldung. Ich respektiere deine Entscheidung und melde mich von mir aus nicht mehr bei dir.\n\nSolltest du später doch Fragen zu deiner Absicherung haben, kannst du dich gern an mich wenden.\n\nAlles Gute für dich!\n\n{signatur}",
    },
  ],
};

/** Stand 3 (15.11.2026) der Vorlagen, die Stand 4 (Pakete M4/M6, 18.11.2026) geändert hat. */
export const STANDARD_VORLAGEN_STAND3: Record<Ansprache, { key: string; name: string; subject: string; body: string }[]> = {
  sie: [
    {
      key: "nach_abschluss",
      name: "Nach dem Abschluss",
      subject: "{betreff_name}vielen Dank für Ihr Vertrauen",
      body: "{anrede},\n\nvielen Dank für Ihr Vertrauen. Ihre Unterlagen erhalten Sie in Kürze. Wenn Sie Fragen haben, antworten Sie einfach auf diese E-Mail.\n\n{signatur}",
    },
    {
      key: "wie_besprochen",
      name: "Wie besprochen: später melden",
      subject: "{betreff_name}wie besprochen melde ich mich später",
      body: "{anrede},\n\nvielen Dank für das Gespräch. Wie besprochen melde ich mich am {melde_datum} wieder bei Ihnen. Haben Sie vorher Fragen, antworten Sie einfach auf diese E-Mail.\n\n{signatur}",
    },
  ],
  du: [
    {
      key: "nach_abschluss",
      name: "Nach dem Abschluss",
      subject: "{betreff_name}vielen Dank für dein Vertrauen",
      body: "{anrede},\n\nvielen Dank für dein Vertrauen. Deine Unterlagen bekommst du in Kürze. Wenn du Fragen hast, antworte einfach auf diese E-Mail.\n\n{signatur}",
    },
    {
      key: "wie_besprochen",
      name: "Wie besprochen: später melden",
      subject: "{betreff_name}wie besprochen melde ich mich später",
      body: "{anrede},\n\nvielen Dank für das Gespräch. Wie besprochen melde ich mich am {melde_datum} wieder bei dir. Hast du vorher Fragen, antworte einfach auf diese E-Mail.\n\n{signatur}",
    },
  ],
};
