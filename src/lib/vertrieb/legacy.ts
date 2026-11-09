// Übersetzt die Freitext-Status der alten Cold-Calling-Liste in
// Pipeline-Stufe, Verlustgrund, Wettbewerber und eine Folgeaufgabe.
// Bewusst ohne Laufzeit-Imports, damit es auch in Skripten/Tests läuft.
import type { SalesLossReason as LossReason, SalesStage as Stage, SalesTaskType as TaskType } from "@/generated/prisma/enums";

export type LegacyResult = {
  stage: Stage;
  lossReason?: LossReason;
  competitor?: string;
  task?: { title: string; type: TaskType; dueAt: Date };
};

const WEEKDAYS: Record<string, number> = {
  sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6,
  "di:": 2, // "Di: nachtelefonieren"
};
const MONTHS: Record<string, number> = {
  januar: 1, februar: 2, "märz": 3, april: 4, mai: 5, juni: 6, juli: 7, august: 8,
  september: 9, oktober: 10, november: 11, dezember: 12,
};

function at9(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d, 8, 0)); // ~09:00/10:00 deutsche Zeit
}

/** Spätestes im Text genanntes Datum (Notizen sind chronologisch angehängt). */
export function parseDue(text: string, ref: Date): Date | null {
  const t = text.toLowerCase();
  const cands: { idx: number; date: Date }[] = [];
  const y = ref.getUTCFullYear();

  for (const m of t.matchAll(/(?<![\d.])(\d{1,2})\.(\d{1,2})\.?(?!\d)/g)) {
    const d = +m[1], mo = +m[2];
    if (d < 1 || d > 31 || mo < 1 || mo > 12) continue;
    let date = at9(y, mo, d);
    if (date.getTime() < ref.getTime() - 45 * 86400000) date = at9(y + 1, mo, d);
    cands.push({ idx: m.index!, date });
  }
  for (const [name, wd] of Object.entries(WEEKDAYS)) {
    const re = name.endsWith(":") ? new RegExp(`\\b${name}`, "g") : new RegExp(`\\b${name}\\b`, "g");
    for (const m of t.matchAll(re)) {
      const date = at9(y, ref.getUTCMonth() + 1, ref.getUTCDate());
      let diff = (wd - date.getUTCDay() + 7) % 7;
      if (diff === 0) diff = 7;
      date.setUTCDate(date.getUTCDate() + diff);
      cands.push({ idx: m.index!, date });
    }
  }
  for (const [name, mo] of Object.entries(MONTHS)) {
    for (const m of t.matchAll(new RegExp(`(ende |mitte |anfang )?\\b${name}\\b`, "g"))) {
      const day = m[1] === "ende " ? 24 : m[1] === "mitte " ? 15 : 2;
      let date = at9(y, mo, day);
      if (date < ref) date = at9(y + 1, mo, day);
      cands.push({ idx: m.index!, date });
    }
  }
  const rel: [RegExp, (r: Date) => Date][] = [
    [/\bmorgen\b/g, (r) => plusDays(r, 1)],
    [/nächste woche/g, (r) => plusDays(r, 7)],
    [/(nächste[sn]? jahr|neuen jahr|anfang des jahres)/g, (r) => at9(r.getUTCFullYear() + 1, 1, 7)],
  ];
  for (const [re, fn] of rel) for (const m of t.matchAll(re)) cands.push({ idx: m.index!, date: fn(ref) });

  if (!cands.length) return null;
  cands.sort((a, b) => a.idx - b.idx);
  return cands[cands.length - 1].date;
}

function plusDays(d: Date, n: number): Date {
  const r = at9(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function competitorOf(t: string): string | undefined {
  if (/lead\.?now/.test(t)) return "LEAD.NOW";
  if (/terminadler/.test(t)) return "Terminadler";
  if (/alkaio/.test(t)) return "Alkaio";
  return undefined;
}

function lossReasonOf(t: string): LossReason {
  if (/allianz/.test(t)) return "UEBER_ALLIANZ";
  if (/teuer|budget/.test(t)) return "ZU_TEUER";
  if (/lead|agentur|werbung|terminadler|toolbox|meta|cold calling|versorgt|hat schon|happy|insta|tiktok|anderweitig/.test(t)) return "HAT_ANBIETER";
  if (/kunden|bedarf|ausgelastet|genug|kapaz|überlastet|zu ?viel|mitarbeiter|geschäft/.test(t)) return "KEIN_BEDARF";
  if (/interesse/.test(t)) return "KEIN_INTERESSE";
  return "SONSTIGES";
}

export function classifyLegacy(raw: string | null | undefined, ref: Date = new Date()): LegacyResult | null {
  const text = (raw ?? "").trim();
  if (!text || /^[\s—–-]*$/.test(text)) return null;
  const t = text.toLowerCase();
  const due = parseDue(text, ref);
  const today = plusDays(ref, 0);
  const competitor = competitorOf(t);

  if (/zusage|geclosed|vertrag gesend|vertrag senden/.test(t)) {
    return { stage: "GEWONNEN", competitor, task: { title: "Vertrag nachhalten", type: "SONSTIGES", dueAt: today } };
  }
  if (/termin (für|am|mit|mittwoch|montag|dienstag|donnerstag|freitag)|termin:/.test(t)) {
    return { stage: "TERMIN", competitor, task: { title: "Termin nachhalten", type: "TERMIN", dueAt: due ?? today } };
  }
  if (/falsch|komische nummer|kein deutsch|blacklist|übernommen|gekündigt|rente\b|ruhestand|weirde/.test(t)) {
    return { stage: "UNGUELTIG", competitor };
  }
  if (/einseiter|präsentation|hat interesse|interesse an|möchte mit mir|können kunden|interessiert|per mail|e-mail schreiben|will .{0,20}leads|suchen gerade/.test(t)) {
    const sent = /gesendet|ausgesendet/.test(t);
    return {
      stage: "INTERESSE",
      competitor,
      task: sent
        ? { title: "Nachfassen: Unterlagen gesendet", type: "NACHFASSEN", dueAt: due ?? today }
        : { title: "Unterlagen senden", type: "UNTERLAGEN", dueAt: due ?? today },
    };
  }
  if (/nächste[sn]? jahr|neuen jahr|anfang des jahres|januar|februar|märz|april|\bmai\b|juni|in zukunft|späterem zeitpunkt|stellen sich gerade auf/.test(t)) {
    return { stage: "SPAETER", competitor, task: { title: "Wieder melden", type: "ANRUF", dueAt: due ?? plusDays(ref, 90) } };
  }
  if (/bei interesse/.test(t)) {
    return { stage: "VERLOREN", lossReason: "KEIN_INTERESSE", competitor };
  }
  if (/kein interesse|kein bedarf|keine? kunden|keinen kunden|versorgt|ausgelastet|genug|leads?\b|leads |werbung|agentur zusammen|vergeben|teuer|kapaz|überlastet|zu ?viel|aufgeschlossen|aufgelegt|nichts für|firmen|online|budget|mundpropaganda|mitarbeiter|toolbox|meta ads|ruft jeden tag|machen sie schon|cold calling|austausch mit anderer|hat schon|happy|bedient/.test(t)) {
    return { stage: "VERLOREN", lossReason: lossReasonOf(t), competitor };
  }
  if (!due && /mailbox|warteschleife|telefonwall|rangegangen|weitergeleitet|telefonassistenz/.test(t)) {
    return { stage: "NICHT_ERREICHT", competitor };
  }
  const fallback = /urlaub|krank|gebrochen/.test(t) ? plusDays(ref, 7) : today;
  return { stage: "WIEDERVORLAGE", competitor, task: { title: "Nochmal anrufen", type: "ANRUF", dueAt: due ?? fallback } };
}
