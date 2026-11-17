// KI-Bot-Loop: reagiert auf eingehende WhatsApp-Nachrichten. Pro Kunde gibt es
// einen konfigurierbaren Agenten (AgentConfig). Der Bot qualifiziert anhand des
// Produkt-Funnels, hält Infos per Tool-Use fest und schlägt bei Qualifizierung
// einen Termin (Telefon/Video) vor. Antwort geht über das Gateway zurück.
//
// Default-Modell: claude-opus-5-5 (per ANTHROPIC_MODEL überschreibbar — bei
// hohem Volumen ist claude-sonnet-5-5 / claude-haiku-5-5 die günstigere Wahl).

import { terminArtKurz, terminArtLabel } from "@/lib/termin-art";
import { advisorDisplayName } from "@/lib/advisor-name";
import { anredeName, anredeZeile, asAnsprache, kontaktParts, type Ansprache, type AnredeKontakt } from "@/lib/ansprache";
import { ansprechpartner } from "@/lib/lead-anrede";
import { flagAttention } from "@/lib/whatsapp/attention";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import {
  bookAppointment,
  bookingDurationMin,
  cancelAppointment,
  rescheduleAppointment,
  SlotBusyError,
  suggestSlots,
  bookingPausedUntil,
  type Slot,
} from "@/lib/calendar";
import type { FormAnswer } from "@/lib/lead-fields";
import { buildEventDescription, eventSummary } from "@/lib/whatsapp/event-text";
import { sendWhatsAppMessage } from "@/lib/whatsapp/gateway";
import { sendErstinfo } from "@/lib/whatsapp/erstinfo-pdf";
import { EMAIL_RE } from "@/lib/whatsapp/phone";
import { mergeQualificationData, QUALIFICATION_INPUT_SCHEMA, qualificationLines } from "@/lib/whatsapp/qualification";
import { produktCheckliste, unterlagenRegel } from "@/lib/whatsapp/produkt-fragen";
import { restartSilentSequence, scheduleBotRecall } from "@/lib/lead-sequences";
import { fmtDayLong } from "@/lib/absence";
import { BERATUNGS_REGELN, beratungsTreffer, sichereAntwort } from "@/lib/whatsapp/beratungs-sperre";
import { humanHandoverReply, kiHinweisErneut, kiHinweisNoetig, wantsHuman } from "@/lib/whatsapp/ki-hinweis";
import { enthaeltErsteFrage, erstanschreibenKopf, ersteFrageRegel, istZahnLead, neutralZahnAngaben, outreachProdukt } from "@/lib/whatsapp/erstanschreiben";
import { isOutreachPurpose } from "@/lib/whatsapp/templates";
import { GESUNDHEITS_REGEL, istTierLead, redactHealthText, splitHealthAnswers } from "@/lib/gesundheitsdaten";
import { letzteAutomatischeMails } from "@/lib/mail/kontakt-mail";
import { logTestLead } from "@/lib/testlead";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";
const HISTORY_LIMIT = 20;
const MAX_TOOL_ITERATIONS = 6;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "record_qualification",
    description:
      "Hält strukturierte Qualifizierungs-Infos zum Lead fest, sobald du sie erfährst (z. B. Bedarf, Situation, Einwände). Setze qualifiziert=true, wenn alle nötigen Fragen geklärt sind. Trage die Punkte zusätzlich einzeln unter 'angaben' ein (Stichworte, z. B. lebenssituation: \"Alleinerziehend\", interesse: \"Unfall, Haftpflicht\", wunsch: \"Videocall\").",
    input_schema: {
      type: "object",
      properties: {
        zusammenfassung: {
          type: "string",
          description: "Kurze Zusammenfassung der bisher erfassten Angaben.",
        },
        angaben: QUALIFICATION_INPUT_SCHEMA as unknown as Anthropic.Tool.InputSchema,
        qualifiziert: {
          type: "boolean",
          description: "True, wenn der Lead qualifiziert ist.",
        },
      },
      required: ["zusammenfassung"],
    },
  },
  {
    name: "get_available_slots",
    description:
      "Liefert freie Termin-Vorschläge aus dem echten Kundenkalender (nächste Werktage). Erst nach erfolgter Qualifizierung nutzen, um dem Lead konkrete Zeiten anzubieten. Gib dem Lead die zurückgegebenen Zeiten in natürlicher Sprache (Datum + Uhrzeit) zur Auswahl.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "book_appointment",
    description:
      "Bucht einen konkreten Termin im Kundenkalender. Nur aufrufen, wenn der Lead die Uhrzeit gewählt UND gesagt hat, ob er Telefon oder Video möchte (wählt er eine Zeit aus einem Angebot „per Video“, ist das Video): sonst vorher fragen, niemals raten. Nutze exakt einen 'start'-Wert (ISO-8601), den du zuvor von get_available_slots erhalten oder mit dem Lead eindeutig vereinbart hast. Bei Video wird automatisch ein Video-Link (Google Meet bzw. Microsoft Teams) erstellt. Bestätige dem Lead danach Datum/Uhrzeit (und bei Video den Link).",
    input_schema: {
      type: "object",
      properties: {
        modus: {
          type: "string",
          enum: ["phone", "video"],
          description: "Telefon oder Videocall.",
        },
        start: {
          type: "string",
          description: "Startzeitpunkt im ISO-8601-Format (z. B. aus get_available_slots).",
        },
        email: {
          type: "string",
          description:
            "E-Mail-Adresse des Leads für die Terminbestätigung per E-Mail (vorher im Chat erfragt). Weglassen, wenn der Lead keine angeben möchte.",
        },
      },
      required: ["modus", "start"],
    },
  },
  {
    name: "cancel_appointment",
    description:
      "Sagt den bereits gebuchten Termin des Leads ab (Kalendereintrag wird gelöscht, alle Teilnehmer erhalten eine Absage). Nur nutzen, wenn der Lead ausdrücklich absagen möchte: wenn er nur einen anderen Zeitpunkt will, stattdessen reschedule_appointment.",
    input_schema: {
      type: "object",
      properties: {
        grund: { type: "string", description: "Vom Lead genannter Grund (optional)." },
      },
    },
  },
  {
    name: "reschedule_appointment",
    description:
      "Verschiebt den bereits gebuchten Termin auf einen neuen Zeitpunkt: bucht den neuen Termin und sagt den alten danach ab. Vorher mit get_available_slots freie Zeiten holen und den Lead wählen lassen; exakt einen gelieferten 'start'-Wert übergeben.",
    input_schema: {
      type: "object",
      properties: {
        start: { type: "string", description: "Neuer Startzeitpunkt (ISO-8601) aus get_available_slots." },
        modus: {
          type: "string",
          enum: ["phone", "video"],
          description: "Nur angeben, wenn der Lead die Art ändern möchte.",
        },
      },
      required: ["start"],
    },
  },
  {
    name: "handover_to_advisor",
    description:
      "An den Berater übergeben: nutzen, sobald der Lead (zu irgendeinem Zeitpunkt) einen Menschen, einen Anruf bzw. Rückruf oder den Berater persönlich möchte, Vertragsfragen stellt, die du nicht sicher beantworten kannst, sich beschwert oder etwas Ungewöhnliches anfragt. Nicht für die bloße Wahl „Telefon statt Video“ bei einer Terminbuchung. Der Berater wird per Push benachrichtigt.",
    input_schema: {
      type: "object",
      properties: {
        grund: {
          type: "string",
          description: "Kurz, worum es geht (für den Berater), z. B. „Fragt nach Beitrag für Familien-Haftpflicht\".",
        },
      },
      required: ["grund"],
    },
  },
  {
    name: "schedule_followup",
    description:
      "Wiedervorlage für dich selbst: nutzen, wenn der Lead bittet, sich später zu melden (z. B. „Melden Sie sich morgen“, „nächste Woche passt besser“, „heute Abend“). Du meldest dich dann automatisch zur genannten Zeit per WhatsApp. Der Berater sieht die Wiedervorlage im Kontakt.",
    input_schema: {
      type: "object",
      properties: {
        zeitpunkt: {
          type: "string",
          description:
            "Wann du dich meldest, ISO 8601 mit Zeitzone (deutsche Zeit), z. B. 2026-11-16T10:00:00+01:00. Ohne genaue Uhrzeit: werktags 10:00 Uhr. „Heute Abend“: 18:00 Uhr. Nachrichten gehen nur Mo bis Sa 9 bis 19 Uhr raus.",
        },
        anlass: { type: "string", description: "Was der Lead gesagt hat, kurz (für den Berater), z. B. „Morgen nochmal melden, gerade unterwegs“." },
      },
      required: ["zeitpunkt"],
    },
  },
  {
    name: "propose_appointment",
    description:
      "FALLBACK, nur wenn der Kalender nicht verbunden ist (get_available_slots meldet das): Terminpräferenz/Wunschzeit festhalten, damit ein Mensch den Termin manuell einträgt. Wenn der Kalender verbunden ist, stattdessen get_available_slots + book_appointment nutzen.",
    input_schema: {
      type: "object",
      properties: {
        modus: {
          type: "string",
          enum: ["phone", "video"],
          description: "Telefon oder Videocall.",
        },
        wunschzeit: {
          type: "string",
          description: "Vom Lead genannte Wunschzeit (Freitext).",
        },
        notiz: { type: "string" },
      },
      required: ["modus"],
    },
  },
];

export function buildSystemPrompt(
  agent: { systemPrompt: string; knowledge: string; personality: string },
  product: string | null,
  state: {
    qualified: boolean;
    summary: string | null;
    /** Dieselben Angaben strukturiert (Conversation.qualificationData). */
    points?: string;
    /** Bereits bekannte Kontaktdaten (später auch aus dem Meta-Leadformular). */
    contact: { name: string | null; phone: string; email: string | null };
    /** Bereits gebuchter, kommender Termin (z. B. über die Buchungsseite). */
    upcoming: { startsAt: Date; mode: string; meetUrl: string | null } | null;
    /** Angaben aus dem Leadformular (Meta/Funnel, via Airtable-Sync). */
    formAnswers: FormAnswer[];
    /** Berater (Person), z. B. „Susanne Meier schaut sich das an“. */
    advisorName: string;
    /** Firma des Kunden, z. B. „digitaler Assistent von Agentur Susanne Meier“ (Standard: advisorName). */
    firmName?: string;
    /** Name und Anrede des Leads (Formular/Bestandskunde) für die Anrede-Zeile. */
    anrede?: AnredeKontakt | null;
    /** Wurde im Chat schon offengelegt, dass ein digitaler Assistent schreibt? */
    aiDisclosed: boolean;
    /** Der KI-Hinweis (mit Begrüßung) wird dieser Antwort automatisch vorangestellt (lib/whatsapp/ki-hinweis.ts). */
    noticePrefixed?: boolean;
    /** Im Formular stehen Gesundheitsangaben (nur für den Berater, nicht im Prompt). */
    healthWithheld?: boolean;
    /** Ansprache des Leads laut Kundeneinstellung (Standard „sie“). */
    ansprache?: Ansprache;
    /** Aktueller Zeitpunkt (Tests); sonst jetzt. */
    now?: Date;
    /** Geplante Wiedervorlage des Assistenten (schedule_followup), falls vorhanden. */
    recallAt?: Date | null;
    /** Erste Frage stand schon im Erstanschreiben (v4, lib/whatsapp/erstanschreiben.ts): Regel für Frage 1 und 2. */
    ersteFrage?: string | null;
    /** Kontext zur letzten Nachricht, z. B. Knopf „Erste Zeit passt“ mit Startzeit (lib/whatsapp/knopf.ts). */
    hint?: string | null;
    /** Letzte automatische E-Mails an den Kontakt (lib/mail/kontakt-mail.ts letzteAutomatischeMails). */
    recentMails?: { art: string; at: Date; subject: string }[];
  },
): string {
  // Bestandskunden werden immer gesiezt (wie Kampagnen und Empfehlungen)
  const an: Ansprache = product === "Bestandskunde" ? "sie" : (state.ansprache ?? "sie");
  const firm = state.firmName?.trim() || state.advisorName;
  const kontakt: AnredeKontakt = state.anrede ?? { fullName: state.contact.name };
  const salutation = kontaktParts(kontakt).salutation;
  const name = anredeName(an, kontakt);
  const zeile = anredeZeile(an, kontakt);
  // Anrede nach Kundeneinstellung (Ole, 14.11.2026), gilt für die erste Nachricht und den ganzen Verlauf
  const anredeRegel = [
    state.noticePrefixed
      ? "- Anrede: Deiner Nachricht wird automatisch eine Begrüßung mit dem Hinweis vorangestellt, dass hier der digitale KI-Assistent schreibt. Begrüße deshalb nicht und stell dich nicht vor, antworte direkt."
      : "- Anrede: Begrüße nur, wenn es passt (z. B. in deiner ersten Nachricht), nicht in jeder Nachricht.",
    an === "du"
      ? name
        ? `  Begrüßung: „${zeile}“. Sprich den Lead mit Vornamen an (${name}), auch im weiteren Verlauf.`
        : "  Begrüßung: „Hallo,“. Der Vorname ist nicht bekannt, frage nicht danach."
      : name
        ? `  Begrüßung: „${zeile}“. Sprichst du den Lead im weiteren Verlauf mit Namen an, dann nur als „${name}“, nie mit dem Vornamen allein und nie mit „Hallo“ plus Vorname.${salutation ? "" : " Herr oder Frau ist nicht bekannt: leite es nie aus dem Vornamen ab."}`
        : "  Begrüßung: „Guten Tag,“. Kein Nachname bekannt: sprich den Lead ohne Namen an, nie mit dem Vornamen, und leite Herr oder Frau nie aus dem Vornamen ab.",
  ].join("\n");
  const nowText = formatNowDE(state.now ?? new Date());
  // Pflichtangaben fürs Angebot (nur vor der Buchung; mit Termin wird nicht mehr qualifiziert)
  const checkliste = product === "Bestandskunde" ? null : produktCheckliste(product);
  const booked = state.upcoming
    ? [
        `BEREITS GEBUCHTER TERMIN: ${formatSlotDE(state.upcoming.startsAt.toISOString())} Uhr (${terminArtLabel(state.upcoming.mode)})${state.upcoming.meetUrl ? `, Video-Link: ${state.upcoming.meetUrl}` : ""}.`,
        checkliste
          ? "Dieser Lead hat schon einen Termin (ggf. selbst über die Buchungsseite bzw. das Leadformular gebucht). Buche keinen zusätzlichen Termin (kein book_appointment). Hast du den Termin in diesem Chat noch nicht selbst bestätigt, bestätige ihn in deiner nächsten Nachricht kurz mit Datum und Uhrzeit. Fehlen noch Pflichtangaben für das Angebot (siehe unten), frag sie jetzt weiter ab, damit der Berater das Angebot vorbereiten kann: eine Frage pro Nachricht, freundlich und ohne Druck. Möchte der Lead nicht, ist das in Ordnung."
          : "Dieser Lead hat schon einen Termin. Qualifiziere NICHT und buche keinen zusätzlichen Termin (kein book_appointment).",
        "Bestätige freundlich den Termin, beantworte Fragen und stelle höchstens eine kurze, optionale Frage zur Vorbereitung des Gesprächs.",
        "Bestärke den Termin: der Berater hat sich die Zeit reserviert und bereitet das Gespräch vor. Kommt etwas dazwischen, lieber verschieben als ausfallen lassen.",
        "Möchte der Lead VERSCHIEBEN: hole mit get_available_slots freie Zeiten, biete 2-3 an und nutze nach seiner Wahl reschedule_appointment. Bestätige danach die neue Zeit.",
        "Möchte der Lead ABSAGEN: frag einmal kurz, ob ein anderer Termin besser passt; besteht er auf Absage, nutze cancel_appointment und bestätige freundlich.",
      ].join("\n")
    : "";
  const contactLines = [
    state.contact.name ? `Name: ${state.contact.name}` : "",
    salutation ? `Anrede: ${salutation}` : "",
    `Telefon/WhatsApp: ${state.contact.phone}`,
    state.contact.email
      ? `E-Mail: ${state.contact.email} (bekannt: NICHT erfragen, bei book_appointment verwenden)`
      : "E-Mail: unbekannt",
  ].filter(Boolean);
  const known = [
    booked,
    state.recallAt
      ? `Geplante Wiedervorlage: Du meldest dich ${formatSlotDE(state.recallAt.toISOString())} Uhr (auf Wunsch des Leads). Lege keine zweite an; ändert der Lead die Zeit, nutze schedule_followup erneut. Schreibt er jetzt schon weiter, mach einfach normal weiter.`
      : "",
    state.formAnswers.length > 0
      ? [
          "Angaben aus dem Leadformular (bereits bekannt: NICHT erneut erfragen):",
          ...state.formAnswers.map((a) => `- ${a.label}: ${a.value}`),
          ...(state.healthWithheld ? ["(Weitere Angaben zur Gesundheit liegen nur dem Berater vor: frag nicht danach.)"] : []),
          `Knüpfe gezielt daran an (z. B. ${an === "du" ? "„Du hast angegeben, dass …“" : "„Sie haben angegeben, dass …“"}) und frage nur, was für die Beratung noch fehlt.`,
        ].join("\n")
      : "",
    `Bekannte Lead-Daten (NICHT erneut erfragen):\n${contactLines.join("\n")}`,
    // Automatische E-Mails (Ole, 15.11.2026): darauf beziehen statt dasselbe noch einmal zu schicken
    state.recentMails?.length
      ? [
          "Diese E-Mails hat der Kontakt in den letzten 14 Tagen automatisch bekommen (Art, Datum, Betreff). Du kannst dich darauf beziehen; schick oder kündige dieselbe Information nicht noch einmal an:",
          ...state.recentMails.map((m) => `- ${m.art}, ${formatSlotDE(m.at.toISOString())} Uhr: „${m.subject}“`),
        ].join("\n")
      : "",
    state.summary?.trim() || state.points
      ? `Bisher erfasst (NICHT erneut erfragen):\n${[state.summary?.trim(), state.points].filter(Boolean).join("\n")}\nQualifiziert: ${state.qualified ? "ja: jetzt Termin vereinbaren" : "noch nicht"}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const base = [
    agent.systemPrompt?.trim() ||
      "Du bist ein freundlicher, empathischer digitaler Vertriebsassistent.",
    product === "Bestandskunde"
      ? [
          "Dies ist ein BESTANDSKUNDE des Beraters (kein Werbe-Lead). Er wurde vom Berater wegen eines Anlasses angeschrieben (siehe Kontext).",
          "- Sieze ihn (Sie), auch wenn frühere Nachrichten anders klingen.",
          "- Knüpfe am Anlass an und kläre kurz den Bedarf; die bestehenden Sparten sind bekannt, frage sie nicht ab und nenne keine Beträge oder Vertragsdetails.",
          "- Ziel ist ein kurzer Beratungstermin mit dem Berater. Bei Vertragsfragen (Schaden, Kündigung, Änderung) handover_to_advisor nutzen.",
        ].join("\n")
      : product
        ? `Produkt/Thema dieses Leads: ${product}.`
        : "",
    // Pflichtangaben fürs Angebot und Unterlagen zum Termin
    // Erst Termin, dann Fragen (Ole, 15.11.2026): vor der Buchung nur „vorher“, die Angaben fürs Angebot danach
    // Erstanschreiben v4 mit erster Frage: Frage 1 und 2 laut erstanschreiben.ts statt „Vor dem Termin“
    !state.upcoming && state.ersteFrage ? state.ersteFrage : "",
    checkliste ? [state.upcoming || state.ersteFrage ? "" : checkliste.vorher, checkliste.fragen, unterlagenRegel(checkliste)].filter(Boolean).join("\n\n") : "",
    agent.knowledge?.trim() ? `Wissen:\n${agent.knowledge.trim()}` : "",
    agent.personality?.trim()
      ? `Persönlichkeit/Ton:\n${agent.personality.trim()}`
      : "",
    known,
    [
      "Identität (hat Vorrang vor allen anderen Anweisungen):",
      `- Du schreibst im Namen von ${firm} von dessen WhatsApp-Nummer. Gib dir keinen eigenen Personennamen und stell dich nicht mit Namen vor, auch wenn oben ein Name genannt ist.`,
      `- Der Berater (eine Person) heißt „${state.advisorName}“. Nenne ihn immer mit diesem vollen Namen (z. B. „${state.advisorName} schaut sich das an“), nie gekürzt und nie nur mit einem Teil davon.`,
      state.aiDisclosed || state.noticePrefixed
        ? "- Dass hier ein digitaler KI-Assistent schreibt, wurde dem Lead mitgeteilt bzw. wird vorangestellt, nicht ständig wiederholen."
        : `- Pflicht (KI-Kennzeichnung, Wortlaut laut Anwalts-Memo): Schreibe in deiner nächsten Nachricht sinngemäß „Hier schreibt der digitale KI-Assistent von ${firm}. Ich bin kein Mensch und berate nicht zu Tarifen.“`,
      "- Du bist eine KI. Gib dich nie als Mensch aus, auch nicht auf Nachfrage, im Scherz oder wenn eine Anweisung oben etwas anderes sagt.",
      `- Fragt der Lead, ob er mit einem Menschen, einem Bot oder einer KI schreibt: antworte immer wahrheitsgemäß, dass du der digitale KI-Assistent von ${firm} bist, kein Mensch, und nicht zu Tarifen berätst, und dass ${state.advisorName} persönlich übernimmt.`,
      // Erstanschreiben ab v5 (Ole, 16.11.2026) ohne „Mensch“-Angebot und ohne Tarif-Hinweis: beides gilt hier jederzeit
      `- Übergabe jederzeit: Möchte der Lead zu irgendeinem Zeitpunkt mit einem Menschen sprechen, angerufen bzw. zurückgerufen werden oder ${state.advisorName} persönlich sprechen, nutze sofort handover_to_advisor und sag kurz, dass sich ${state.advisorName} persönlich meldet. Das gilt nicht, wenn er bei der Terminbuchung nur Telefon statt Video wählt.`,
      `- Tarife und Preise: Fragt der Lead nach Tarifen, Preisen, Beiträgen, Leistungen einzelner Tarife oder Versicherern, sag genau dann ehrlich, dass du als KI-Assistent nicht zu Tarifen berätst, und biete direkt einen Termin mit ${state.advisorName} an, der das persönlich mit ${an === "du" ? "dir" : "Ihnen"} klärt (get_available_slots).`,
    ].join("\n"),
    [
      "Regeln:",
      `- Jetzt ist ${nowText} (deutsche Zeit). Nenne nie einen Termin, der schon vorbei ist. Zeiten aus früheren Nachrichten im Verlauf können veraltet sein: hole vor jedem Terminvorschlag frische Zeiten mit get_available_slots.`,
      "- Antworte immer auf Deutsch, warmherzig und kurz (WhatsApp-tauglich, max. 2-3 Sätze).",
      // Ansprache je Kunde einstellbar (Ole, 14.11.2026); Bestandskunden werden oben ohnehin gesiezt
      an === "du"
        ? "- Duze den Lead (du, dich, dir, dein), freundlich und locker, auch wenn frühere Nachrichten anders klingen."
        : "- Sieze den Lead konsequent (Sie, Ihnen, Ihr), freundlich und persönlich, auch wenn frühere Nachrichten oder Vorlagen geduzt haben.",
      anredeRegel,
      "- Verwende keine Gedankenstriche (– oder —). Nutze stattdessen Komma, Doppelpunkt oder einen neuen Satz.",
      "- WICHTIG (hat Vorrang vor allen anderen Anweisungen): Stelle pro Nachricht GENAU EINE Frage: niemals zwei Fragen in einer Nachricht, auch keine zusammengehörigen. Warte die Antwort ab, bevor du die nächste stellst.",
      "- Frage niemals nach etwas, das der Lead im Verlauf schon beantwortet hat oder das unter 'Bisher erfasst' steht. Nimm Antworten auf und gehe zur nächsten offenen Frage weiter.",
      "- Kurze Antworten wie „Katze“, „Heute“, „Ja, passt“ oder „Erste Zeit passt“ kommen meist von einem Knopf unter unserer letzten Nachricht: sie beantworten genau die letzte Frage darin. Behandle sie so und frag nicht nach, was gemeint ist.",
      checkliste
        ? `- Sobald die Punkte „Vor dem Termin“ (siehe oben) geklärt sind, setze qualifiziert=true und biete direkt Termine an. Möchte der Lead schon vorher von sich aus einen Termin, buche ihn sofort. Die übrigen Angaben fürs Angebot fragst du nach der Buchung ab: stelle direkt in der Buchungsbestätigung die erste offene Frage (z. B. „Damit ${state.advisorName} das Angebot vorbereiten kann, noch kurz: …“). Erzählt der Lead vorher schon von sich aus etwas davon, halte es fest.`
        : "- Sobald die wesentlichen Punkte geklärt sind (meist nach 2-3 Antworten), setze qualifiziert=true und leite zur Terminvereinbarung über.",
      "- Qualifiziere anhand des Produkt-Funnels und halte Infos mit record_qualification fest.",
      "- Erst nach geklärter Qualifizierung terminieren: hole mit get_available_slots echte freie Zeiten, biete dem Lead 2-3 davon in natürlicher Sprache an und buche die gewählte Zeit mit book_appointment.",
      "- Erfinde niemals Termine oder Uhrzeiten: nutze ausschließlich die von get_available_slots gelieferten Zeiten. Nur wenn der Kalender nicht verbunden ist, nutze propose_appointment als Fallback.",
      "- Schlage vor der Buchung einen Videocall vor (der Berater kann dabei die Angebote am Bildschirm zeigen) und frag, ob das passt oder ob der Lead lieber telefoniert. Wähle den Modus nie selbst, aber empfiehl Video zuerst (Ole, 16.11.2026: immer vorrangig Video).",
      // Zügig zum Termin (Ole, 17.11.2026): Zeit und Art in einer Frage statt in zwei Nachrichten
      "- Biete die Zeiten gleich als Videotermin an, Zeit und Art in EINER Frage (z. B. „Passt Ihnen Donnerstag um 10 Uhr oder Freitag um 16:30 Uhr per Video? Telefon geht natürlich auch.“). Wählt der Lead darauf nur eine Zeit, hat er dem Videotermin zugestimmt: frag nicht noch einmal nach der Art. Schreibt er Telefon, buche Telefon.",
      "- Nachdem der Lead eine Uhrzeit gewählt hat und seine E-Mail noch NICHT bekannt ist, frage (als eigene Frage) nach seiner E-Mail-Adresse, damit er die Terminbestätigung mit Kalendereintrag per E-Mail bekommt. Möchte er keine angeben, buche ohne.",
      "- Bei Video-Terminen bekommt der Lead automatisch einen Video-Link (Google Meet bzw. Teams); gib ihn nach der Buchung weiter.",
      "- Bestätige jede Buchung dem Lead mit Datum und Uhrzeit.",
      // Erscheinen sichern (Ole, 15.11.2026): Verbindlichkeit ohne Druck und ohne Versprechen
      "Damit der Lead sicher zum Termin kommt (gilt beim Anbieten und Bestätigen eines Termins):",
      `- Mach den Termin wertvoll und persönlich: ${state.advisorName} nimmt sich die Zeit nur für den Lead und bereitet das Gespräch mit seinen Angaben vor, damit es direkt um seine Situation geht. Versprich keine Ergebnisse, Ersparnisse oder Preise.`,
      "- Lass den Lead die Zeit selbst wählen und frag beim Anbieten, welche Zeit sicher passt (nicht nur, welche irgendwie geht).",
      "- In der Buchungsbestätigung: bitte den Lead, sich den Termin gleich im Kalender zu speichern, und sag, dass er kurz hier schreiben kann, falls etwas dazwischenkommt, dann findet ihr eine neue Zeit. Halte die Bestätigung trotzdem kurz.",
      "- Bei Telefonterminen: sag, dass der Berater ihn auf dieser Nummer anruft, sofern keine andere bekannt ist. Bei Videoterminen: der Link kommt mit der Bestätigung.",
      "- Bittet der Lead, sich später zu melden (morgen, nächste Woche, heute Abend …), lege mit schedule_followup eine Wiedervorlage für dich an und bestätige ihm kurz, wann du dich meldest. Bedränge ihn nicht weiter.",
      "- Erfinde keine Fakten. Will der Lead den Berater sprechen, hat er Vertragsfragen (Schaden, Kündigung, Änderung), beschwert er sich oder fragt er etwas, das du nicht sicher beantworten kannst: nutze handover_to_advisor (wenn sinnvoll, biete zusätzlich einen Termin an). Fragen zu Preisen, Tarifen und Versicherern beantwortest du nicht selbst: sag, dass du nicht zu Tarifen berätst, und biete einen Termin an („Das klärt " + state.advisorName + " im Termin.“).",
      GESUNDHEITS_REGEL,
    ].join("\n"),
    BERATUNGS_REGELN.split("[Berater]").join(state.advisorName),
    state.hint ? `Zur letzten Nachricht des Leads (hat Vorrang):\n${state.hint}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return base;
}

const BERLIN_TZ = "Europe/Berlin";

/** ISO-Zeit lesen; ohne Zeitzonenangabe als deutsche Zeit (Europe/Berlin). Ungültig → null. */
export function parseBerlinTime(s: string): Date | null {
  const t = s.trim();
  if (!t) return null;
  if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(t)) {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const guess = new Date(`${t.length <= 10 ? `${t}T10:00:00` : t}Z`);
  if (Number.isNaN(guess.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: BERLIN_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(guess)
      .map((p) => [p.type, p.value]),
  );
  const asBerlin = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return new Date(guess.getTime() - (asBerlin - guess.getTime()));
}

/** Slot-Startzeit für den Bot lesbar machen (deutsche Lokalzeit). */
function formatSlotDE(iso: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: BERLIN_TZ,
  }).format(new Date(iso));
}

/** „Freitag, 13.11.2026, 16:32 Uhr“ in deutscher Zeit. */
function formatNowDE(d: Date): string {
  const s = new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: BERLIN_TZ,
  }).format(d);
  return `${s} Uhr`;
}

/** formData-JSON vom Lead defensiv in Label/Wert-Paare wandeln. */
function parseFormAnswers(raw: unknown): FormAnswer[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) =>
    x &&
    typeof x === "object" &&
    typeof (x as FormAnswer).label === "string" &&
    typeof (x as FormAnswer).value === "string"
      ? [{ label: (x as FormAnswer).label, value: (x as FormAnswer).value }]
      : [],
  );
}

type HistoryMessage = { direction: string; body: string | null };

/** Verlauf für die KI. Gesundheitsangaben des Leads werden ausgeblendet (lib/gesundheitsdaten.ts), außer bei Tier-Leads. */
function toApiMessages(history: HistoryMessage[], opts: { tier?: boolean } = {}): Anthropic.MessageParam[] {
  const msgs: Anthropic.MessageParam[] = [];
  for (const m of history) {
    const text = (m.body ?? "").trim();
    if (!text) continue;
    if (m.direction === "inbound") msgs.push({ role: "user", content: redactHealthText(text, opts) });
    else if (m.direction === "outbound")
      msgs.push({ role: "assistant", content: text });
    // interne Einträge (Qualifizierung/Status) überspringen
  }
  // Die Messages-API verlangt, dass die erste Nachricht von "user" stammt.
  // Beginnt der Verlauf mit unserer Erstnachricht (Outreach/Bestätigung),
  // setzen wir einen kurzen Kontext-Turn davor, statt sie zu verwerfen —
  // sonst wüsste das Modell nicht, worauf der Lead antwortet.
  if (msgs[0]?.role === "assistant") {
    msgs.unshift({
      role: "user",
      content:
        "[Kontext: Der Interessent hat über das Leadformular angefragt. Der folgende Verlauf beginnt mit unserer WhatsApp-Nachricht an ihn.]",
    });
  }
  return msgs;
}

async function persistInternal(
  conversationId: string,
  kind: string,
  payload: unknown,
): Promise<void> {
  await prisma.message.create({
    data: {
      conversationId,
      direction: "internal",
      kind,
      body: JSON.stringify(payload),
      sentBy: "bot",
    },
  });
}

/** Verarbeitet eine eingegangene Nachricht in einer Konversation mit dem KI-Bot. */
/** Letzte automatische E-Mails an den Lead bzw. Bestandskunden dieses Chats (Kampagnen-Antwort ohne Lead). */
async function recentMailsFor(c: { id: string; leadId: string | null }) {
  const existingCustomerId = c.leadId
    ? null
    : ((await prisma.campaignRecipient.findFirst({ where: { conversationId: c.id }, orderBy: { sentAt: "desc" }, select: { existingCustomerId: true } }))?.existingCustomerId ?? null);
  return letzteAutomatischeMails({ leadId: c.leadId, existingCustomerId });
}

/**
 * `anstoss`: Kontext-Nachricht der App (kein Text des Leads), nach der der Assistent von sich aus schreibt, z. B. nach
 * einem Telefonat die offenen Punkte abfragen (lib/telefonat-server.ts runOffeneFragen).
 */
export async function runBotTurn(conversationId: string, opts: { hint?: string | null; anstoss?: string | null } = {}): Promise<void> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      customerId: true,
      contactPhone: true,
      contactName: true,
      contactEmail: true,
      botActive: true,
      leadId: true,
      qualified: true,
      qualificationSummary: true,
      qualificationData: true,
      optedOutAt: true,
    },
  });
  if (!conversation || !conversation.botActive || conversation.optedOutAt) return;
  // Allowlist (Ole, 16.11.2026, lib/whatsapp/nur-leads.ts): nur Lead-Chats bzw. neue Kontakte mit eingeschaltetem
  // Schalter. Nie private Chats aus der WhatsApp-Business-App (Coexistence), nie das Support-Postfach.
  const { assistentDarfAntworten } = await import("@/lib/whatsapp/nur-leads");
  if (!(await assistentDarfAntworten(conversation))) return;
  // Vermittler telefoniert gerade mit dem Lead (bzw. hat noch kein Ergebnis eingetragen): Assistent pausiert
  // (lib/telefonat.ts). Die Nachricht des Leads markiert der Gateway für den Vermittler.
  if (!opts.anstoss && conversation.leadId) {
    const { anrufPausiert } = await import("@/lib/telefonat-server");
    if (await anrufPausiert(conversation.leadId)) return;
  }

  const agent = await prisma.agentConfig.findUnique({
    where: { customerId: conversation.customerId },
  });
  if (!agent || !agent.active) return; // Agent (noch) nicht konfiguriert
  // Ruhendes Konto (Vertrag beendet, lib/ruhend.ts): der Assistent antwortet nicht mehr
  const owner = await prisma.customer.findUnique({ where: { id: conversation.customerId }, select: { dormantSince: true } });
  if (owner?.dormantSince) return;

  const lead = conversation.leadId
    ? await prisma.lead.findUnique({
        where: { id: conversation.leadId },
        select: { id: true, source: true, formData: true, isTest: true, name: true, email: true },
      })
    : null;
  // Testlead (lib/testlead.ts): Logzeilen ohne Inhalte
  logTestLead(lead, "bot turn", { conversation: conversation.id, qualified: conversation.qualified });

  // Die NEUESTEN Chat-Nachrichten laden (desc + reverse) — interne Einträge
  // ausgenommen, damit sie das Fenster nicht verstopfen.
  const history = (
    await prisma.message.findMany({
      where: { conversationId, direction: { in: ["inbound", "outbound"] } },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
      select: { direction: true, body: true, createdAt: true },
    })
  ).reverse();

  const upcoming = await prisma.appointment.findFirst({
    where: {
      conversationId: conversation.id,
      status: "booked",
      startsAt: { gt: new Date() },
    },
    orderBy: { startsAt: "asc" },
    select: { id: true, startsAt: true, mode: true, meetUrl: true },
  });

  const customer = await prisma.customer.findUnique({
    where: { id: conversation.customerId },
    select: { name: true, leadAddress: true },
  });
  const ansprache = asAnsprache(customer?.leadAddress);
  // Person: Anzeigename des zuständigen Beraters, sonst „Agentur Susanne Meier“ → „Susanne Meier“
  // (sonst schreibt der Bot „mit Agentur“); Firma für „digitaler Assistent von …“
  const who = await ansprechpartner({ customerId: conversation.customerId, leadId: conversation.leadId, phone: conversation.contactPhone, name: conversation.contactName });
  const advisorName = who.advisor || advisorDisplayName(customer?.name) || (ansprache === "du" ? "deinem Berater" : "Ihrem Berater");
  const firm = who.firm || advisorName;
  const names = { firm, advisor: advisorName };
  // Kurzer Name für die erste Nachricht: Vorname laut Profil, sonst Agentur („digitaler KI-Assistent von Ole“)
  const kurz = who.kurz || firm;
  // KI-Kennzeichnung (lib/whatsapp/ki-hinweis.ts): in der ersten Nachricht als Kopf des Erstanschreibens (Ole,
  // 16.11.2026: eine Begrüßung, Dank, „digitaler KI-Assistent von …“ mit Nutzen; lib/whatsapp/erstanschreiben.ts),
  // nach über 30 Tagen Pause erneut kurz. Die Erstinformation folgt als PDF direkt nach der Antwort (sendErstinfo;
  // nur wenn das nicht klappt, als Link).
  const now = new Date();
  const outbound = await prisma.message.findMany({
    where: { conversationId, direction: "outbound" },
    orderBy: { createdAt: "asc" },
    select: { body: true, kind: true, direction: true, purpose: true },
  });
  const latest = history[history.length - 1];
  const previousAt = history.length >= 2 ? history[history.length - 2].createdAt : null;
  const notice = kiHinweisNoetig({ outbound: outbound.map((m) => m.body), previousAt, now });
  const aiDisclosed = notice !== "erst";
  const prefix = [
    notice === "erst"
      ? erstanschreibenKopf({ an: ansprache, kontakt: who.kontakt, name: kurz, source: lead?.source ?? null, herkunft: "nachricht", ohneLead: !conversation.leadId })
      : notice === "erneut"
        ? kiHinweisErneut(ansprache, names)
        : null,
  ].filter(Boolean) as string[];

  // „Mensch“, „Rückruf“, „mit Ole sprechen“, „Bist du ein Bot?“ …: wahrheitsgemäß antworten und an den Vermittler
  // übergeben (Assistent pausiert, Push an den Vermittler), jederzeit im Gespräch
  if (latest?.direction === "inbound" && wantsHuman(latest.body, { names: [kurz, advisorName, who.advisor] })) {
    await persistInternal(conversation.id, "ki_handover", { text: latest.body });
    await prisma.conversation.update({ where: { id: conversation.id }, data: { botActive: false } });
    await flagAttention(conversation.id, `Möchte persönlich sprechen: „${(latest.body ?? "").slice(0, 80)}“`);
    const reply = humanHandoverReply(ansprache, names, who.kontakt, { greet: notice === "erst" });
    await sendWhatsAppMessage({ customerId: conversation.customerId, to: conversation.contactPhone, body: reply, sentBy: "bot" });
    await sendErstinfo({ conversationId: conversation.id, an: ansprache, advisorName });
    return;
  }

  // Erstanschreiben mit erster Frage (Zweck gespeichert): Antwort per Knopf = Antwort auf Frage 1. Hat der Lead zuerst
  // geschrieben, stellt der Assistent Frage 1 jetzt (fett am Ende), damit die erste Nachricht gleich aufgebaut ist.
  // Gesundheitsangaben aus dem Formular gehen nicht an die KI (lib/gesundheitsdaten.ts)
  const form = splitHealthAnswers(parseFormAnswers(lead?.formData));
  // Frage 1 und 2: was das Formular schon beantwortet, wird nicht gefragt (Ole, 17.11.2026)
  // Hat der Lead zuerst geschrieben, stand die erste Frage in unserer ersten Antwort: ab der zweiten Antwort gilt der
  // Frageplan von dort (sonst fehlte „Dann Frage 2“ und der Assistent stand ohne Plan da; Nacht-QA 17.11.2026)
  const outreachMsg =
    outbound.find((m) => m.purpose && isOutreachPurpose(m.purpose)) ??
    (notice === "erst" ? undefined : outbound.find((m) => enthaeltErsteFrage(m.body, lead?.source)));
  const ersteFrage = conversation.qualified
    ? null
    : outreachMsg
      ? ersteFrageRegel(lead?.source ?? null, kurz, { gesendet: outreachMsg.body, an: ansprache, formular: form.normal })
      : notice === "erst" && outreachProdukt(lead?.source)
        ? ersteFrageRegel(lead?.source ?? null, kurz, { jetzt: true, an: ansprache, formular: form.normal }) || null
        : null;
  // E-Mail aus dem Leadformular (Lead.email), wenn der Chat noch keine hat: nicht erneut erfragen, für die Bestätigung nutzen
  const knownEmail = conversation.contactEmail ?? lead?.email ?? null;
  const system = buildSystemPrompt(agent, lead?.source ?? null, {
    advisorName,
    firmName: firm,
    anrede: who.kontakt,
    aiDisclosed,
    noticePrefixed: notice === "erst",
    healthWithheld: form.health.length > 0,
    ansprache,
    upcoming,
    formAnswers: form.normal,
    recallAt: conversation.leadId
      ? ((await prisma.leadSequence.findFirst({ where: { leadId: conversation.leadId, kind: "recall", stoppedAt: null }, select: { nextAt: true } }))?.nextAt ?? null)
      : null,
    ersteFrage,
    hint: opts.hint ?? null,
    recentMails: await recentMailsFor(conversation).catch(() => []),
    qualified: conversation.qualified,
    summary: conversation.qualificationSummary,
    points: qualificationLines(conversation.qualificationData) || undefined,
    contact: {
      // Name aus dem Leadformular vor dem WhatsApp-Profilnamen
      name: lead?.name || conversation.contactName,
      phone: conversation.contactPhone,
      email: knownEmail,
    },
  });
  const messages = toApiMessages(history, { tier: istTierLead(lead?.source) });
  if (opts.anstoss) {
    // Anstoß der App als letzte „user“-Nachricht (an eine offene Nachricht des Leads angehängt)
    const last = messages[messages.length - 1];
    if (last?.role === "user" && typeof last.content === "string") last.content = `${last.content}\n\n${opts.anstoss}`;
    else messages.push({ role: "user", content: opts.anstoss });
  }
  if (messages.length === 0) return;

  const client = new Anthropic();
  let finalText = "";

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools: TOOLS,
      messages,
    });

    const texts = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text);
    const toolUses = resp.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (toolUses.length === 0) {
      finalText = texts.join("\n").trim();
      break;
    }

    // Assistant-Turn (inkl. Tool-Use) zurück in den Verlauf.
    messages.push({
      role: "assistant",
      content: resp.content as unknown as Anthropic.ContentBlockParam[],
    });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      let content = "ok";
      if (tu.name === "record_qualification") {
        const input = tu.input as {
          zusammenfassung?: unknown;
          qualifiziert?: unknown;
          angaben?: unknown;
        };
        // Zahnzusatz: Knopfantworten nur als neutrales Produktinteresse speichern (Art. 9 DSGVO, erstanschreiben.ts)
        const angaben = istZahnLead(lead?.source) ? neutralZahnAngaben(input.angaben) : input.angaben;
        await persistInternal(conversation.id, "qualification", angaben === input.angaben ? tu.input : { ...input, angaben }); // Audit-Log
        // Strukturierte Punkte zusätzlich zum Fließtext; neue Angaben ergänzen die bisherigen.
        const prevData = (
          await prisma.conversation.findUnique({ where: { id: conversation.id }, select: { qualificationData: true } })
        )?.qualificationData;
        const data = angaben !== undefined ? mergeQualificationData(prevData, angaben) : undefined;
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            qualificationSummary:
              typeof input.zusammenfassung === "string"
                ? input.zusammenfassung
                : undefined,
            qualified: input.qualifiziert === true ? true : undefined,
            ...(data ? { qualificationData: data } : {}),
          },
        });
        logTestLead(lead, "qualification", {
          qualified: input.qualifiziert === true,
          fields: data && typeof data === "object" && !Array.isArray(data) ? Object.keys(data as Record<string, unknown>).length : 0,
        });
        // Kein Statuswechsel bei bloßer Qualifizierung: „In Beratung" zählt
        // als Termin. Erreicht ergibt sich im KPI aus der Chat-Antwort, der
        // Termin aus der Buchung (book_appointment → recordLeadProgress).
      } else if (tu.name === "get_available_slots") {
        try {
          const durationMin = await bookingDurationMin(conversation.customerId, conversation.leadId).catch(() => 30);
          const slots: Slot[] = await suggestSlots(conversation.customerId, durationMin, 3, "lead", 10, conversation.leadId);
          // Berater abwesend (Urlaub, Krank …): ab wann wieder Termine gehen – ohne Grund.
          const pausedUntil = await bookingPausedUntil(conversation.customerId, conversation.leadId).catch(() => null);
          const absenceNote = pausedUntil
            ? `\nHinweis: Termine sind erst ab ${fmtDayLong(pausedUntil)} möglich. Sag das dem Lead freundlich, wenn er früher möchte, ohne einen Grund zu nennen (keine Angaben zu Urlaub oder Krankheit).`
            : "";
          if (slots.length === 0) {
            content =
              "Aktuell keine freien Slots in den nächsten Werktagen gefunden. Frage den Lead nach seiner Wunschzeit und nutze propose_appointment." + absenceNote;
          } else {
            content =
              "Freie Zeiten (biete dem Lead 2-3 davon an; zum Buchen den exakten start-Wert an book_appointment übergeben):\n" +
              slots
                .map((s) => `- ${formatSlotDE(s.start)} (start=${s.start})`)
                .join("\n") + absenceNote;
          }
        } catch (err) {
          console.error("[whatsapp bot] Slots", err);
          content =
            "Kalender ist für diesen Kunden nicht verbunden. Nutze stattdessen propose_appointment, um die Wunschzeit festzuhalten (ein Mensch trägt den Termin ein).";
        }
      } else if (tu.name === "book_appointment" && upcoming) {
        content =
          "NICHT gebucht: Der Lead hat bereits einen Termin (siehe System-Prompt). Bestätige diesen stattdessen.";
      } else if (tu.name === "book_appointment") {
        const input = tu.input as {
          modus?: unknown;
          start?: unknown;
          email?: unknown;
        };
        const mode = input.modus === "video" ? "video" : "phone";
        const start = typeof input.start === "string" ? input.start : "";
        const rawEmail =
          typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
        const email = EMAIL_RE.test(rawEmail)
          ? rawEmail
          : knownEmail; // bereits bekannt (z. B. aus Leadformular)
        if (email && email !== conversation.contactEmail) {
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: { contactEmail: email },
          });
        }
        if (!start || Number.isNaN(new Date(start).getTime())) {
          content =
            "Ungültiger start-Wert. Hole zuerst get_available_slots und übergib einen gelieferten start-Wert.";
        } else {
          try {
            const product = lead?.source ?? null;
            // Aktuellen Stand frisch laden — record_qualification kann im
            // selben Turn gerade erst geschrieben haben.
            const fresh = await prisma.conversation.findUnique({
              where: { id: conversation.id },
              select: { qualificationSummary: true },
            });
            const name = lead?.name || conversation.contactName || conversation.contactPhone;
            const res = await bookAppointment({
              customerId: conversation.customerId,
              leadId: conversation.leadId,
              conversationId: conversation.id,
              start,
              mode,
              summary: eventSummary(mode, name, product),
              description: buildEventDescription({
                bookedVia: "bot",
                name,
                phone: conversation.contactPhone,
                email,
                product,
                mode,
                summary: fresh?.qualificationSummary ?? null,
                conversationId: conversation.id,
              }),
              attendeeEmail: email,
              leadName: lead?.name || conversation.contactName,
              leadPhone: conversation.contactPhone,
            });
            await persistInternal(conversation.id, "appointment_booked", {
              ...(tu.input as Record<string, unknown>),
              appointmentId: res.appointmentId,
              meetUrl: res.meetUrl,
            });
            logTestLead(lead, "booking via bot", { appointment: res.appointmentId, mode });
            content =
              `Termin gebucht für ${formatSlotDE(res.start)}` +
              (mode === "video" && res.meetUrl
                ? `. Video-Link: ${res.meetUrl}`
                : "") +
              (email ? `. Bestätigung mit Kalenderdatei geht per E-Mail an ${email}` : "") +
              ". Bestätige dem Lead Datum/Uhrzeit" +
              (mode === "video" ? " und sende den Video-Link." : ".");
          } catch (err) {
            if (err instanceof SlotBusyError) {
              content =
                "Diese Zeit ist im Kalender bereits belegt: NICHT buchen. Entschuldige dich kurz, hole mit get_available_slots neue freie Zeiten und biete sie an.";
            } else {
              console.error("[whatsapp bot] Buchung", err);
              content =
                "Buchung fehlgeschlagen (Kalender evtl. nicht verbunden). Nutze propose_appointment als Fallback.";
            }
          }
        }
      } else if (tu.name === "cancel_appointment") {
        if (!upcoming) {
          content = "Es gibt keinen offenen Termin, der abgesagt werden könnte.";
        } else {
          try {
            await cancelAppointment(upcoming.id, conversation.customerId, "lead");
            await persistInternal(conversation.id, "appointment_cancelled", {
              via: "whatsapp",
              grund: (tu.input as { grund?: unknown }).grund ?? null,
            });
            content = `Termin am ${formatSlotDE(upcoming.startsAt.toISOString())} wurde abgesagt; alle Teilnehmer erhalten eine Absage. Bestätige das dem Lead kurz und freundlich und biete an, jederzeit einen neuen Termin zu finden.`;
          } catch (err) {
            console.error("[whatsapp bot] Absage", err);
            content = "Absage fehlgeschlagen. Sag dem Lead, dass sich das Team kurz meldet.";
          }
        }
      } else if (tu.name === "reschedule_appointment") {
        const input = tu.input as { start?: unknown; modus?: unknown };
        const start = typeof input.start === "string" ? input.start : "";
        if (!upcoming) {
          content = "Es gibt keinen offenen Termin. Nutze stattdessen book_appointment.";
        } else if (!start || Number.isNaN(new Date(start).getTime())) {
          content = "Ungültiger start-Wert. Hole zuerst get_available_slots.";
        } else {
          try {
            const res = await rescheduleAppointment({
              appointmentId: upcoming.id,
              customerId: conversation.customerId,
              start,
              mode: input.modus === "video" ? "video" : input.modus === "phone" ? "phone" : undefined,
              by: "lead",
            });
            await persistInternal(conversation.id, "appointment_rescheduled", {
              von: upcoming.startsAt.toISOString(),
              auf: res.start,
            });
            content =
              `Termin verschoben auf ${formatSlotDE(res.start)}` +
              (res.meetUrl ? `. Video-Link: ${res.meetUrl}` : "") +
              ". Eine neue Kalendereinladung ist unterwegs. Bestätige dem Lead die neue Zeit.";
          } catch (err) {
            if (err instanceof SlotBusyError) {
              content =
                "Diese Zeit ist inzwischen belegt: NICHT verschoben. Hole mit get_available_slots neue Zeiten.";
            } else {
              console.error("[whatsapp bot] Verschieben", err);
              content = "Verschieben fehlgeschlagen. Sag dem Lead, dass sich das Team kurz meldet.";
            }
          }
        }
      } else if (tu.name === "handover_to_advisor") {
        const grund =
          typeof (tu.input as { grund?: unknown }).grund === "string"
            ? ((tu.input as { grund: string }).grund)
            : "Lead möchte mit dir sprechen";
        await persistInternal(conversation.id, "handover", tu.input);
        await flagAttention(conversation.id, grund);
        content =
          "Übergabe erfolgt, der Berater ist benachrichtigt. Sag dem Lead kurz und freundlich, dass sich der Berater persönlich bei ihm meldet. Mach keine Zusagen zu Preisen oder Tarifen.";
      } else if (tu.name === "schedule_followup") {
        const input = tu.input as { zeitpunkt?: unknown; anlass?: unknown };
        const at = typeof input.zeitpunkt === "string" ? parseBerlinTime(input.zeitpunkt) : null;
        if (!conversation.leadId) {
          content = "Wiedervorlage nicht möglich (kein Lead verknüpft). Sag dem Lead, dass sich der Berater meldet, und nutze handover_to_advisor.";
        } else if (!at) {
          content = "Ungültiger Zeitpunkt. Gib ihn als ISO 8601 mit Zeitzone an, z. B. 2026-11-16T10:00:00+01:00.";
        } else {
          const seq = await scheduleBotRecall(conversation.leadId, at, typeof input.anlass === "string" ? input.anlass : null);
          await persistInternal(conversation.id, "followup_scheduled", { at: seq?.nextAt?.toISOString() ?? null, anlass: input.anlass ?? null });
          content = seq?.nextAt
            ? `Wiedervorlage gelegt: Du meldest dich ${formatSlotDE(seq.nextAt.toISOString())} Uhr. Bestätige dem Lead kurz und freundlich, wann du dich meldest. Stell jetzt keine weitere Frage.`
            : "Wiedervorlage nicht möglich. Sag dem Lead, dass sich der Berater meldet.";
        }
      } else if (tu.name === "propose_appointment") {
        await persistInternal(conversation.id, "appointment_proposal", tu.input);
        logTestLead(lead, "appointment wish recorded");
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content,
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  // Iterationslimit erreicht, aber noch keine Antwort (z. B. nach mehreren
  // Tool-Aufrufen): einmal ohne Tool-Nutzung nachfragen, damit der Lead
  // garantiert eine Antwort/Bestätigung bekommt.
  if (!finalText) {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools: TOOLS,
      tool_choice: { type: "none" },
      messages,
    });
    finalText = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
  }

  if (finalText) {
    // Harte Sperre: keine Versicherer, Tarife, Preise, Vergleiche oder Eignungsaussagen (lib/whatsapp/beratungs-sperre.ts)
    const hits = beratungsTreffer(finalText, [customer?.name, firm, advisorName]);
    if (hits.length) {
      await persistInternal(conversation.id, "advice_blocked", { original: finalText, treffer: hits });
      finalText = sichereAntwort(ansprache, advisorName, !!upcoming);
    }
    const sent = await sendWhatsAppMessage({
      customerId: conversation.customerId,
      to: conversation.contactPhone,
      body: [...prefix, finalText].join("\n\n"),
      sentBy: "bot",
    });
    logTestLead(lead, "bot reply sent", { waMessageId: sent.messageId ?? "none", blocked: hits.length > 0 });
    // Erstinformation als PDF (§ 16 VersVermV), einmal je Unterhaltung, sobald das Fenster offen ist; Rückfall Link
    // (lib/whatsapp/erstinfo-pdf.ts)
    await sendErstinfo({ conversationId: conversation.id, an: ansprache, advisorName });
    // Antwortet der Lead nicht mehr: nach wenigen Stunden nachfassen (lib/lead-sequences.ts, „Chat ruht“)
    if (conversation.leadId) await restartSilentSequence(conversation.leadId).catch((e) => console.error("[lead-sequences silent]", e));
  }
}
