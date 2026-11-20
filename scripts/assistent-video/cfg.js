// Texte und Zeitplan (Frames bei 30 fps, aus dem Originalvideo gemessen)
const T = {
  demoFade: 78, demoFadeLen: 10,
  okFade: 287, lock1Fade: 308, chatFade: 374, lock2Fade: 950, appFade: 1108,
  fadeLen: [0, 6, 7, 5, 8, 7],
  notif1: 333, notif2: 979, card1: 1113, card2: 1162, card2Top: 0,
  step2: 306, step3: 372, step4: 750, step5: 948,
  endFade: 1310, endFadeLen: 9,
};
const formT = { paar: 115, haus: 139, recht: 157, nameFoc: 172, name0: 176, nameStep: 2.6, telFoc: 208, tel0: 212, telStep: 2, telBlur: 249, consent: 256, press: 271, release: 279 };
const ALT = {
  title: "So arbeitet Ihr digitaler Assistent",
  titleSub: "Ein echter Ablauf – vom Formular bis zum gebuchten Termin.",
  steps: ["Lead füllt das Formular aus", "Wenige Minuten später: WhatsApp in Ihrem Namen", "Der Assistent stellt die richtigen Fragen", "Der Lead bucht direkt einen Termin", "Sie bekommen den Termin – mit Zusammenfassung"],
  pills: ["Auf Facebook oder Instagram", "Wenige Minuten nach dem Absenden", "Rund um die Uhr – auch am Sonntagabend", "Direkt in Ihrem Kalender", "Bestätigung &amp; Erinnerung laufen automatisch"],
  berater: "Max Berger", formSub: "Privatschutz – bis zu 20 % sparen",
  q1: "Deine Lebenssituation", q2: "Woran bist du interessiert?",
  name: "Julia Koch", tel: "+49 151 23456789",
  okSub: "Max Berger meldet sich gleich bei dir.",
  waNotif: "Hallo Julia, danke für deine Anfrage zum Privatschutz! Hier ist der digitale Assistent von Max ...",
  leadName: "Julia Koch", greet: "Guten Abend, Max",
  summary: "Paar ohne Kinder, Interesse an Hausrat und Rechtsschutz; noch keine Verträge. Rückfrage: „Ja, für uns beide“. Bevorzugt Telefon.",
  auto: ["Bestätigung an Julia gesendet", "Erinnerung per WhatsApp 24 Std. vorher", "Lead steht in der Pipeline auf „Termin vereinbart“"],
  end1: "Sie führen nur noch", end2: "das Beratungsgespräch.", endSub: "Alles davor erledigt Ihr Assistent – rund um die Uhr.",
  msgs: [
    "Hallo Julia, danke für deine Anfrage zum Privatschutz! Hier ist der digitale Assistent von Max. Hast du kurz Zeit für zwei Fragen, damit wir dir ein passendes Angebot machen können?",
    "Hi, ja klar",
    "Super, danke dir! Du interessierst dich für Hausrat und Rechtsschutz. Hast du dafür aktuell schon einen Vertrag?",
    "Nein, noch nichts davon",
    "Danke, das hilft schon mal. Soll der Schutz auch für deinen Partner bzw. deine Partnerin gelten?",
    "Ja, für uns beide",
    "Alles klar! Am besten schaut Max das kurz persönlich mit dir an, dauert etwa 15 Minuten. Ich hätte Freitag um 10:00, Montag um 15:00 oder Dienstag um 16:00 frei – telefonisch oder per Video. Was passt dir?",
    "Montag 15 Uhr, gern telefonisch 👍",
    "Perfekt, dein Telefontermin mit Max am Montag, 16.11. um 15:00 Uhr ist gebucht ✅ Max ruft dich unter dieser Nummer an.",
  ],
};
const NEU = {
  ...ALT,
  titleSub: "Ein echter Ablauf: vom Formular bis zum gebuchten Termin.",
  steps: [...ALT.steps.slice(0, 4), "Sie bekommen den Termin mit Zusammenfassung"],
  pills: [...ALT.pills.slice(0, 2), "Rund um die Uhr, auch am Sonntagabend", ...ALT.pills.slice(3)],
  formSub: "Privatschutz: bis zu 20 % sparen",
  q1: "Ihre Lebenssituation", q2: "Woran sind Sie interessiert?",
  name: "Julia Becker",
  okSub: "Max Berger meldet sich gleich bei Ihnen.",
  waNotif: "Guten Tag Frau Becker, danke für Ihre Anfrage zum Privatschutz! Hier ist der digitale Assistent ...",
  leadName: "Julia Becker", greet: "Guten Abend, Herr Berger",
  auto: ["Bestätigung an Frau Becker gesendet", ALT.auto[1], ALT.auto[2]],
  endSub: "Alles davor erledigt Ihr Assistent, rund um die Uhr.",
  msgs: [
    "Guten Tag Frau Becker, danke für Ihre Anfrage zum Privatschutz! Hier ist der digitale Assistent von Max Berger. Haben Sie kurz Zeit für zwei Fragen, damit wir Ihnen ein passendes Angebot machen können?",
    ALT.msgs[1],
    "Super, vielen Dank! Sie interessieren sich für Hausrat und Rechtsschutz. Haben Sie dafür aktuell schon einen Vertrag?",
    ALT.msgs[3],
    "Danke, das hilft schon mal. Soll der Schutz auch für Ihren Partner bzw. Ihre Partnerin gelten?",
    ALT.msgs[5],
    "Alles klar! Am besten schaut Herr Berger sich das kurz persönlich mit Ihnen an, dauert etwa 15 Minuten. Ich hätte Freitag um 10:00, Montag um 15:00 oder Dienstag um 16:00 frei, telefonisch oder per Video. Was passt Ihnen?",
    ALT.msgs[7],
    "Perfekt, Ihr Telefontermin mit Herrn Berger am Montag, 16.11. um 15:00 Uhr ist gebucht ✅ Herr Berger ruft Sie unter dieser Nummer an.",
  ],
};
function chat(m) {
  return [
    { who: "b", text: m[0], at: 379, tm: "18:02" },
    { who: "l", text: m[1], typeFrom: 419, typeTo: 443, at: 450, tm: "18:03" },
    { type: "dots", at: 481, until: 510 },
    { who: "b", text: m[2], at: 510, tm: "18:03" },
    { who: "l", text: m[3], typeFrom: 550, typeTo: 576, at: 582, tm: "18:04" },
    { type: "dots", at: 607, until: 636 },
    { who: "b", text: m[4], at: 636, tm: "18:04" },
    { who: "l", text: m[5], typeFrom: 673, typeTo: 699, at: 705, tm: "18:05" },
    { type: "dots", at: 730, until: 759 },
    { who: "b", text: m[6], at: 759, tm: "18:05" },
    { who: "l", text: m[7], typeFrom: 817, typeTo: 843, at: 849, tm: "18:06" },
    { type: "dots", at: 874, until: 903 },
    { who: "b", text: m[8], at: 903, tm: "18:07" },
  ];
}
const which = (window.FASSUNG || "neu") === "alt" ? ALT : NEU;
window.CFG = { ...which, T, formT, chat: chat(which.msgs) };
