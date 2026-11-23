import type { SalesCustomerStage as CustomerStage, SalesStage as Stage, SalesTaskType as TaskType } from "@/generated/prisma/enums";
import { dayKey, fromDayKey } from "@/lib/vertrieb/dates";

// „Zuerst erledigen“ in der Aufgabenliste (Ole, 23.11.2026: „wenn viele offene aufgaben sind, verliert man oft den
// überblick. dann muss oben stehen, welche aufgaben die allerwichtigsten sind“). Reine Funktion, getestet in
// tests/unit/aufgaben-prioritaet.test.ts. Stufen:
//   0 Recht: Datenschutz (Art. 15/17, Widerspruch), Abmahnung; nach Frist („Frist TT.MM.JJJJ“ im Titel, sonst Fälligkeit)
//   1 Geld: Zahlung offen/Mahnung, Kündigungsgefahr, Einrichtung bzw. Aufgaben zahlender Kunden
//   2 Heißer Vertrieb: offenes Angebot, Termin heute, Kontakte in Interesse/Termin
//   3 Rest nach Fälligkeit
// Stufen 1 bis 3 nur, wenn heute fällig oder überfällig; Recht mit Frist in den nächsten 3 Tagen immer.
// Gesperrte Kontakte („Nie kontaktieren“): Aufgaben, die eine Kontaktaufnahme sind, fallen raus; Rechtsaufgaben bleiben.

export type PrioKontakt = {
  stage: Stage;
  customerStage?: CustomerStage | null;
  /** „Nie kontaktieren“ gesetzt */
  gesperrt?: boolean;
  /** Angebot verschickt und noch nicht angenommen oder abgelehnt */
  angebotOffen?: boolean;
};

export type PrioAufgabe = { id: string; title: string; type: TaskType; dueAt: Date; contact: PrioKontakt | null };

export type GrundTon = "rose" | "amber" | "emerald" | "violet" | "slate";
export type Grund = { label: string; ton: GrundTon };

export type Prioritaet = { stufe: 0 | 1 | 2 | 3; unterrang: number; frist: Date; grund: Grund };

/** Ab so vielen offenen Aufgaben (heute fällig oder überfällig) erscheint „Zuerst erledigen“. */
export const ZUERST_AB = 6;
export const ZUERST_MAX = 5;

// Titel aus lib/vertrieb/nie-kontaktieren.ts, datenschutz-recht.ts und art17.ts; jede „Frist TT.MM.JJJJ“ im Titel zählt mit
const RECHT = /Art\.?\s*1[57]\b|Auskunft|Löschverlangen|Löschung bestätigen|Widerspruch|Abmahnung|rechtliche Drohung|Frist\s+\d{1,2}\.\d{1,2}\.\d{4}/i;
const ABMAHNUNG = /Abmahnung|rechtliche Drohung/i;
const ZAHLUNG = /Mahnung|Zahlung (?:weiter )?(?:offen|fehlgeschlagen)|Lastschrift|Kunde anrufen:|Rechnung .*offen/i;
const KUENDIGUNG = /k(?:ü|ue)ndig|Churn|^Pause /i;
const EINRICHTUNG = /Onboarding|Paketwechsel|einrichten|Einrichtung|Go-live|Login|Vertrag senden/i;
const KONTAKTAUFNAHME_TYP: TaskType[] = ["ANRUF", "NACHFASSEN", "UNTERLAGEN", "TERMIN"];
const KONTAKTAUFNAHME = /anrufen|nachfassen|melden|schreiben|senden|Termin/i;
const ZAHLENDE_KUNDEN: CustomerStage[] = ["VERTRAG", "ONBOARDING", "TEST", "AKTIV"];

/** „Frist 24.11.2026“ aus dem Titel (Ende des Tages egal: es zählt der Kalendertag in Berliner Zeit). */
export function fristAusTitel(title: string): Date | null {
  const m = /Frist\s+(\d{1,2})\.(\d{1,2})\.(\d{4})/i.exec(title);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return fromDayKey(`${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
}

/** Kalendertage von heute bis `d` (Berliner Zeit): 0 = heute, 1 = morgen, -1 = gestern. */
export function tageBis(d: Date, now: Date): number {
  return Math.round((fromDayKey(dayKey(d)).getTime() - fromDayKey(dayKey(now)).getTime()) / 86_400_000);
}

export const istRechtsaufgabe = (title: string) => RECHT.test(title);

const zahlenderKunde = (c: PrioKontakt | null) => !!c && (c.customerStage ? ZAHLENDE_KUNDEN.includes(c.customerStage) : c.stage === "GEWONNEN");

function fristGrund(tage: number, abmahnung: boolean): Grund {
  if (tage < 0) return { label: "Frist abgelaufen", ton: "rose" };
  if (abmahnung) return { label: "Abmahnung", ton: "rose" };
  if (tage === 0) return { label: "Frist heute", ton: "rose" };
  if (tage === 1) return { label: "Frist morgen", ton: "rose" };
  if (tage <= 3) return { label: `Frist in ${tage} Tagen`, ton: "amber" };
  return { label: "Gesetzliche Frist", ton: "amber" };
}

function faelligGrund(tage: number): Grund {
  if (tage === 0) return { label: "Heute fällig", ton: "amber" };
  if (tage === -1) return { label: "Seit gestern fällig", ton: "rose" };
  return { label: `${-tage} Tage überfällig`, ton: "rose" };
}

/** Priorität einer offenen Aufgabe, `null` = gehört nicht nach oben (oder fällt wegen Sperre raus). */
export function aufgabePrioritaet(t: PrioAufgabe, now: Date): Prioritaet | null {
  const faelligTage = tageBis(t.dueAt, now);

  if (istRechtsaufgabe(t.title)) {
    const abmahnung = ABMAHNUNG.test(t.title);
    const frist = fristAusTitel(t.title) ?? t.dueAt;
    const tage = tageBis(frist, now);
    if (faelligTage > 0 && tage > 3) return null; // noch nicht dran
    return { stufe: 0, unterrang: abmahnung ? 0 : 1, frist, grund: fristGrund(tage, abmahnung) };
  }

  if (faelligTage > 0) return null;
  const c = t.contact;
  const kontaktaufnahme = KONTAKTAUFNAHME_TYP.includes(t.type) || KONTAKTAUFNAHME.test(t.title);
  if (c?.gesperrt && kontaktaufnahme) return null;

  if (ZAHLUNG.test(t.title)) return { stufe: 1, unterrang: 0, frist: t.dueAt, grund: { label: "Zahlung offen", ton: "rose" } };
  if (KUENDIGUNG.test(t.title)) return { stufe: 1, unterrang: 1, frist: t.dueAt, grund: { label: "Kündigungsgefahr", ton: "rose" } };
  if (zahlenderKunde(c) || /^(?:Paketwechsel|Onboarding:)/.test(t.title)) {
    return { stufe: 1, unterrang: EINRICHTUNG.test(t.title) ? 2 : 3, frist: t.dueAt, grund: { label: "Zahlender Kunde", ton: "emerald" } };
  }

  if (c?.angebotOffen || /Angebot/i.test(t.title)) return { stufe: 2, unterrang: 0, frist: t.dueAt, grund: { label: "Angebot offen", ton: "violet" } };
  if (faelligTage === 0 && (t.type === "TERMIN" || /^Termin\b/.test(t.title))) return { stufe: 2, unterrang: 1, frist: t.dueAt, grund: { label: "Termin heute", ton: "violet" } };
  if (c?.stage === "TERMIN") return { stufe: 2, unterrang: 2, frist: t.dueAt, grund: { label: "Termin vereinbart", ton: "violet" } };
  if (c?.stage === "INTERESSE") return { stufe: 2, unterrang: 3, frist: t.dueAt, grund: { label: "Hat Interesse", ton: "violet" } };

  return { stufe: 3, unterrang: 0, frist: t.dueAt, grund: faelligGrund(faelligTage) };
}

/** Die wichtigsten offenen Aufgaben, sortiert: Stufe, Unterrang, Frist, Fälligkeit, Titel, id (stabil). */
export function wichtigsteAufgaben<T extends PrioAufgabe>(tasks: T[], now: Date, max = ZUERST_MAX): { task: T; grund: Grund }[] {
  return tasks
    .map((task) => ({ task, p: aufgabePrioritaet(task, now) }))
    .filter((x): x is { task: T; p: Prioritaet } => x.p !== null)
    .sort(
      (a, b) =>
        a.p.stufe - b.p.stufe ||
        a.p.unterrang - b.p.unterrang ||
        a.p.frist.getTime() - b.p.frist.getTime() ||
        a.task.dueAt.getTime() - b.task.dueAt.getTime() ||
        a.task.title.localeCompare(b.task.title, "de") ||
        (a.task.id < b.task.id ? -1 : a.task.id > b.task.id ? 1 : 0),
    )
    .slice(0, max)
    .map(({ task, p }) => ({ task, grund: p.grund }));
}

/** Block nur bei vielen offenen Aufgaben (heute fällig oder überfällig). */
export function zeigeZuerst(tasks: Pick<PrioAufgabe, "dueAt">[], now: Date): boolean {
  return tasks.filter((t) => tageBis(t.dueAt, now) <= 0).length >= ZUERST_AB;
}
