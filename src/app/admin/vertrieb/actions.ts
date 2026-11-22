"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";
import { CUSTOMER_LABEL, CUSTOMER_STAGES, OUTCOME_BY_ID, SOURCE_LABEL, STAGE_RANK, STAGE_LABEL } from "@/lib/vertrieb/crm";
import { addDays, fromDayKey, verschiebeAufgabe } from "@/lib/vertrieb/dates";
import type { SalesActivityType as ActivityType, SalesCustomerStage as CustomerStage, SalesLossReason as LossReason, SalesStage as Stage, SalesTaskType as TaskType } from "@/generated/prisma/enums";
import { importContactsCsv, importVermittlerListe } from "@/lib/vertrieb/import-contacts";
import { istVermittlerListe, summeUebersprungen, type ListenErgebnis } from "@/lib/vertrieb/vermittler-format";
import { ensureSource } from "@/lib/vertrieb/source";
import { setzeStufe } from "@/lib/vertrieb/stufe";
import { offenesAngebotAblehnen } from "@/lib/vertrieb/angebot-ablehnen-server";
import { connectCalendly, syncCalendly } from "@/lib/vertrieb/calendly";
import { handleInboundLead } from "@/lib/vertrieb/inbound";
import { enrichContact } from "@/lib/vertrieb/contact-enrich";
import { importFromColdCrm, replaceFromColdCrm } from "@/lib/vertrieb/cold-crm-import";
import { LI_LABEL, importWaalaxyCsv } from "@/lib/vertrieb/linkedin";
import { ensureReplyTask, importInstantlyCsv, recordReply, removeReplyTaskIfNoPositive, syncInstantly } from "@/lib/vertrieb/instantly";
import { audit } from "@/lib/audit";
import { planFollowup, planFromOutcome, stopFollowup, stopFollowupOnStage } from "@/lib/vertrieb/followup";
import { addContactEmail, makePrimaryEmail, mergeContacts, removeContactEmail, searchMergeCandidates, updatePrimaryEmail } from "@/lib/vertrieb/contact-merge";
import { backfillContactData, makePrimaryPhone, removeContactPhone } from "@/lib/vertrieb/kontaktdaten-server";
import { adminZiel } from "@/components/admin-neu/ui/rueckweg";
import { nachholenAntworten, type NachholenErgebnis } from "@/lib/vertrieb/instantly-nachholen";

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

function refresh(contactId?: string | null) {
  revalidatePath("/admin/neu/vertrieb", "layout");
  revalidatePath("/admin/neu/kunden", "layout");
  // Aufgaben und Vertriebs-Kennzahlen stehen auf Heute (Admin-Makeover Runde 2)
  revalidatePath("/admin/neu", "layout");
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Heute, Vertrieb → Aufgaben)
  if (contactId) revalidatePath(`/admin/neu/vertrieb/kontakte/${contactId}`);
}

/** Weiterleitung nach einer Aktion: kam sie aus dem neuen Admin (/admin/neu), dorthin (fertige Seite), sonst alt.
 *  Gleiche Regel wie überall (components/admin-neu/ui/rueckweg.ts). */
const ziel = (altPfad: string) => adminZiel(altPfad);

// ─── Aktivität erfassen ─────────────────────────────────────────────────
export async function logActivity(fd: FormData) {
  await requireAuth();
  const contactId = s(fd, "contactId")!;
  const type = (s(fd, "type") ?? "ANRUF") as ActivityType;
  const outcome = OUTCOME_BY_ID[s(fd, "outcome") ?? "notiz"] ?? OUTCOME_BY_ID.notiz;
  const note = s(fd, "note");
  const lossReason = s(fd, "lossReason") as LossReason | null;

  const contact = await prisma.salesContact.findUniqueOrThrow({ where: { id: contactId } });
  let stage: Stage | undefined;
  if (outcome.stage) {
    // "Nicht erreicht" stuft keinen Kontakt zurück, der schon weiter ist
    const downgrade = outcome.id === "nicht_erreicht" && STAGE_RANK[contact.stage] > STAGE_RANK.NICHT_ERREICHT;
    if (!downgrade) stage = outcome.stage;
  }

  await prisma.$transaction(async (tx) => {
    await tx.salesActivity.create({
      data: { contactId, type, outcome: outcome.id === "notiz" ? null : outcome.label, note },
    });
    await tx.salesContact.update({
      where: { id: contactId },
      data: {
        stage,
        customerStage: stage === "GEWONNEN" && !contact.customerStage ? "VERTRAG" : undefined,
        lossReason: stage === "VERLOREN" ? lossReason ?? "SONSTIGES" : stage ? null : undefined,
        callAttempts: type === "ANRUF" ? { increment: 1 } : undefined,
        lastContactAt: type === "NOTIZ" ? undefined : new Date(),
      },
    });
    if (outcome.closesTasks || fd.get("closeOpen") === "on") {
      await tx.salesTask.updateMany({ where: { contactId, doneAt: null }, data: { doneAt: new Date() } });
    }
    if (fd.get("createTask") === "on" && s(fd, "taskTitle") && s(fd, "taskDue")) {
      await tx.salesTask.create({
        data: {
          contactId,
          title: s(fd, "taskTitle")!,
          type: (s(fd, "taskType") ?? "SONSTIGES") as TaskType,
          dueAt: fromDayKey(s(fd, "taskDue")!, s(fd, "taskTime") ?? "09:00"),
          note,
        },
      });
    }
  });
  if (stage === "GEWONNEN") await ensureSource(contactId);
  if (stage) await stopFollowupOnStage(contactId, stage);
  // Verloren mit offenem Angebot: „Offenes Angebot auch als abgelehnt markieren?“ (Ole, 18.11.2026)
  const declineOfferId = s(fd, "declineOfferId");
  if (stage === "VERLOREN" && declineOfferId) await offenesAngebotAblehnen(contactId, declineOfferId, lossReason ?? "SONSTIGES");
  // „Später wieder“: Follow-up per Mail im Instantly-Thread statt nur Aufgabe (ersetzt die 60-Tage-Aufgabe)
  if (outcome.id === "spaeter") {
    const due = s(fd, "taskDue");
    await planFromOutcome(contactId, note, fd.get("createTask") === "on" && due ? fromDayKey(due) : null);
  }
  refresh(contactId);
}

export async function setStage(fd: FormData) {
  await requireAuth();
  const contactId = s(fd, "contactId")!;
  const stage = s(fd, "stage") as Stage;
  const lossReason = s(fd, "lossReason") as LossReason | null;
  await setzeStufe(contactId, stage, { lossReason, competitor: s(fd, "competitor") });
  // „Offenes Angebot auch als abgelehnt markieren?“ (Ole, 18.11.2026): gleicher Grund
  const offerId = s(fd, "declineOfferId");
  if (stage === "VERLOREN" && offerId) await offenesAngebotAblehnen(contactId, offerId, lossReason);
  refresh(contactId);
}

export async function updateContact(fd: FormData) {
  await requireAuth();
  const contactId = s(fd, "contactId")!;
  await prisma.salesContact.update({
    where: { id: contactId },
    data: { phone: s(fd, "phone"), name: s(fd, "name") ?? undefined },
  });
  refresh(contactId);
}

/** Stammdaten: Adresse und Telefon von Hand pflegen (leeres Feld = löschen). */
export async function updateContactAddress(fd: FormData) {
  await requireAuth();
  const contactId = s(fd, "contactId")!;
  const v = (k: string) => (fd.get(k) == null ? undefined : (s(fd, k) ?? null));
  await prisma.salesContact.update({
    where: { id: contactId },
    data: { street: v("street"), zip: v("zip"), city: v("city"), phone: v("phone") },
  });
  refresh(contactId);
}

// ─── Aufgaben ───────────────────────────────────────────────────────────
export async function createTask(fd: FormData) {
  await requireAuth();
  const contactId = s(fd, "contactId");
  const title = s(fd, "title");
  const due = s(fd, "due");
  if (!title || !due) return;
  await prisma.salesTask.create({
    data: {
      contactId,
      title,
      type: (s(fd, "type") ?? "SONSTIGES") as TaskType,
      dueAt: fromDayKey(due, s(fd, "time") ?? "09:00"),
      note: s(fd, "note"),
    },
  });
  refresh(contactId);
}

export async function toggleTask(fd: FormData) {
  await requireAuth();
  const id = s(fd, "id")!;
  const t = await prisma.salesTask.findUniqueOrThrow({ where: { id } });
  await prisma.salesTask.update({ where: { id }, data: { doneAt: t.doneAt ? null : new Date() } });
  refresh(t.contactId);
}

export async function snoozeTask(fd: FormData) {
  await requireAuth();
  const id = s(fd, "id")!;
  const days = Number(s(fd, "days") ?? 1);
  const t = await prisma.salesTask.findUniqueOrThrow({ where: { id } });
  const base = t.dueAt < new Date() ? new Date(new Date().setUTCHours(t.dueAt.getUTCHours(), t.dueAt.getUTCMinutes())) : t.dueAt;
  await prisma.salesTask.update({ where: { id }, data: { dueAt: verschiebeAufgabe(base, days) } });
  refresh(t.contactId);
}

export async function deleteTask(fd: FormData) {
  await requireAuth();
  const id = s(fd, "id")!;
  const t = await prisma.salesTask.delete({ where: { id } });
  refresh(t.contactId);
}

// ─── Import ─────────────────────────────────────────────────────────────
export type ImportState = { ok: boolean; message: string; liste?: ListenErgebnis } | null;

/**
 * Agenturliste bzw. Vermittlerliste (erkannt an der Kopfzeile, lib/vertrieb/vermittler-format.ts). Die Vermittlerliste
 * erst als Trockenlauf (modus „pruefen“, nichts geschrieben), angelegt wird erst mit modus „importieren“.
 */
export async function importContactsAction(_p: ImportState, fd: FormData): Promise<ImportState> {
  await requireAuth();
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, message: "Bitte eine CSV-Datei wählen." };
  try {
    const text = await file.text();
    if (istVermittlerListe(text)) {
      const anwenden = fd.get("modus") === "importieren";
      const r = await importVermittlerListe(text, { anwenden });
      if (!anwenden) return { ok: true, message: "", liste: r };
      await audit("vertrieb.import_liste", {
        entity: "SalesContact",
        details: { datei: file.name, zeilen: r.zeilen, neu: r.neu, ergaenzt: r.ergaenzt, uebersprungen: r.uebersprungen, jeGesellschaft: r.jeGesellschaft, dauerMs: r.dauerMs },
      });
      refresh();
      return {
        ok: true,
        message: `${r.neu.toLocaleString("de-DE")} Kontakte angelegt, ${r.ergaenzt.toLocaleString("de-DE")} ergänzt, ${summeUebersprungen(r).toLocaleString("de-DE")} übersprungen.`,
        liste: r,
      };
    }
    if (fd.get("modus") === "pruefen") return null;
    const r = await importContactsCsv(text);
    refresh();
    return {
      ok: true,
      message: `${r.rows} Zeilen: ${r.created} neu, ${r.updated} aktualisiert, ${r.skipped} übersprungen. ${r.withStatus} Status übernommen, ${r.tasks} Aufgaben angelegt.`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function importInstantlyAction(_p: ImportState, fd: FormData): Promise<ImportState> {
  await requireAuth();
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, message: "Bitte eine CSV-Datei wählen." };
  try {
    const r = await importInstantlyCsv(await file.text(), s(fd, "campaign") ?? "");
    refresh();
    return { ok: true, message: `${r.rows} Leads: ${r.matched} zugeordnet (${r.sent} gesendet), ${r.unmatched} nicht in der Kontaktliste.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function syncInstantlyAction(prev: ImportState): Promise<ImportState> {
  void prev;
  await requireAuth();
  try {
    const r = await syncInstantly();
    refresh();
    return {
      ok: true,
      message: `${r.campaigns} Kampagnen, ${r.leads} Leads: ${r.matched} zugeordnet, ${r.sent} mit gesendeter Mail, ${r.replies} mit Antwort (${r.newReplies} neue Antwort-Mails gespeichert), ${r.created} neu im CRM angelegt, ${r.unmatched} noch nicht angeschrieben und nicht im CRM.`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Instantly-Antworten nachholen (Vorschau, dann Anwenden) ─────────────
export type NachholenState = { ok: boolean; message: string; ergebnis?: NachholenErgebnis } | null;

/** Fehlende Antworten der letzten 90 Tage aus allen Postfächern und Kampagnen: „vorschau“ schreibt nichts. */
export async function instantlyNachholenAction(_p: NachholenState, fd: FormData): Promise<NachholenState> {
  await requireAuth();
  const anwenden = s(fd, "mode") === "anwenden";
  try {
    const r = await nachholenAntworten({ anwenden });
    const { liste, ...zahlen } = r;
    void liste;
    if (anwenden) {
      await audit("vertrieb.instantly_nachholen", { entity: "SalesEmail", details: zahlen });
      refresh();
    }
    const n = (x: number, one: string, many: string) => `${x.toLocaleString("de-DE")} ${x === 1 ? one : many}`;
    const message = anwenden
      ? `${n(r.nachgeholt, "Antwort", "Antworten")} nachgeholt, ${n(r.neueKontakte, "Kontakt", "Kontakte")} neu angelegt, ${n(r.spaeter, "Später-Antwort", "Später-Antworten")} mit Follow-up.`
      : r.fehlend
        ? `${n(r.fehlend, "Antwort fehlt", "Antworten fehlen")} im CRM (${n(r.neueKontakte, "neuer Kontakt", "neue Kontakte")}, ${n(r.spaeter, "Später-Antwort", "Später-Antworten")}).`
        : `Alle ${n(r.gelesen, "Antwort", "Antworten")} der letzten ${r.tage} Tage sind im CRM.`;
    return { ok: true, message, ergebnis: r };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Kontakte löschen ───────────────────────────────────────────────────
// Löscht auch Verlauf, Aufgaben und Cold-Mail-Status (Cascade).
/** Gesperrte Kontakte (nie kontaktieren, Fall „Datenschutz und Recht“) nie normal löschen: der Sperrvermerk ginge
 *  verloren und ein Import könnte sie wieder anlegen. Dafür gibt es „Auf Verlangen löschen (Art. 17)“ (Hülle mit Sperrvermerk). */
async function gesperrteIds(ids: string[]): Promise<Set<string>> {
  const [nie, recht] = await Promise.all([
    prisma.salesContact.findMany({ where: { id: { in: ids }, OR: [{ nieKontaktierenAt: { not: null } }, { art17GeloeschtAt: { not: null } }] }, select: { id: true } }),
    prisma.datenschutzFallEreignis.findMany({ where: { contactId: { in: ids } }, distinct: ["contactId"], select: { contactId: true } }),
  ]);
  return new Set([...nie.map((n) => n.id), ...recht.map((r) => r.contactId ?? "")]);
}

export async function deleteContact(fd: FormData) {
  await requireAuth();
  const id = s(fd, "contactId");
  if (id && (await gesperrteIds([id])).has(id)) redirect(await ziel(`/admin/neu/vertrieb/kontakte/${id}`));
  if (id) {
    const gone = await prisma.salesContact.delete({ where: { id } });
    await audit("contact.delete", { entity: "SalesContact", entityId: id, details: { name: gone.name } });
    // Löschprotokoll: greift nach einer Wiederherstellung der Datenbank erneut (lib/loeschprotokoll.ts)
    await import("@/lib/loeschprotokoll").then((m) => m.protokolliereLoeschung([{ art: "vertriebskontakt", entityId: id, grund: "admin" }]));
  }
  revalidatePath("/admin/neu/vertrieb", "layout");
  revalidatePath("/admin/neu", "layout");
  redirect(await ziel("/admin/neu/vertrieb/kontakte"));
}

export async function deleteContacts(fd: FormData) {
  await requireAuth();
  const alle = fd.getAll("ids").filter((v): v is string => typeof v === "string" && !!v);
  const gesperrt = await gesperrteIds(alle);
  const ids = alle.filter((id) => !gesperrt.has(id));
  if (ids.length) {
    await prisma.salesContact.deleteMany({ where: { id: { in: ids } } });
    await import("@/lib/loeschprotokoll").then((m) => m.protokolliereLoeschung(ids.map((id) => ({ art: "vertriebskontakt" as const, entityId: id, grund: "admin" }))));
  }
  revalidatePath("/admin/neu/vertrieb", "layout");
  revalidatePath("/admin/neu", "layout");
}

// ─── Kunden-Pipeline ────────────────────────────────────────────────────
async function changeCustomerStage(contactId: string, next: CustomerStage) {
  const c = await prisma.salesContact.findUniqueOrThrow({ where: { id: contactId }, select: { customerStage: true, customerSince: true } });
  if (c.customerStage === next) return;
  await prisma.salesContact.update({
    where: { id: contactId },
    data: {
      customerStage: next,
      stage: "GEWONNEN",
      lossReason: null,
      customerSince: next === "AKTIV" && !c.customerSince ? new Date() : undefined,
    },
  });
  await prisma.salesActivity.create({
    data: {
      contactId,
      type: "STATUS",
      outcome: `Kunde: ${c.customerStage ? CUSTOMER_LABEL[c.customerStage] : "noch kein Kunde"} → ${CUSTOMER_LABEL[next]}`,
    },
  });
  await ensureSource(contactId);
}

export async function updateCustomer(fd: FormData) {
  await requireAuth();
  const contactId = s(fd, "contactId")!;
  const next = s(fd, "customerStage") as CustomerStage | null;
  const value = s(fd, "monthlyValue");
  const start = s(fd, "contractStart");
  await prisma.salesContact.update({
    where: { id: contactId },
    data: {
      products: s(fd, "products"),
      customerSource: s(fd, "customerSource"),
      customerSourceNote: s(fd, "customerSourceNote"),
      monthlyValue: value ? Math.round(Number(value.replace(",", "."))) || null : null,
      contractStart: start ? fromDayKey(start) : null,
    },
  });
  if (next) await changeCustomerStage(contactId, next);
  refresh(contactId);
}

/** Karte in der Kunden-Pipeline eine Spalte vor/zurück schieben */
export async function moveCustomer(fd: FormData) {
  await requireAuth();
  const contactId = s(fd, "contactId")!;
  const dir = Number(s(fd, "dir") ?? 1);
  const c = await prisma.salesContact.findUniqueOrThrow({ where: { id: contactId }, select: { customerStage: true } });
  const i = CUSTOMER_STAGES.findIndex((x) => x.id === c.customerStage);
  const next = CUSTOMER_STAGES[Math.min(CUSTOMER_STAGES.length - 1, Math.max(0, i + dir))];
  await changeCustomerStage(contactId, next.id);
  refresh(contactId);
}

// ─── E-Mail-Antwort manuell erfassen (z.B. aus Gmail/Outlook kopiert) ───
export async function addReplyManually(fd: FormData) {
  await requireAuth();
  const contactId = s(fd, "contactId")!;
  const text = s(fd, "text");
  if (!text) return;
  const day = s(fd, "date");
  await recordReply(contactId, {
    subject: s(fd, "subject"),
    text,
    isAutoReply: false,
    sentAt: day ? fromDayKey(day, "12:00") : new Date(),
    campaign: "manuell",
  });
  refresh(contactId);
}

// ─── Drag & Drop in den Kanban-Ansichten ────────────────────────────────
const STAGE_IDS: Stage[] = ["NEU", "NICHT_ERREICHT", "WIEDERVORLAGE", "INTERESSE", "TERMIN", "GEWONNEN", "SPAETER", "VERLOREN", "UNGUELTIG"];

export async function dragStage(contactId: string, stage: string, lossReason?: string) {
  await requireAuth();
  if (!STAGE_IDS.includes(stage as Stage)) throw new Error("Unbekannte Stufe");
  const to = stage as Stage;
  const before = await prisma.salesContact.findUniqueOrThrow({ where: { id: contactId }, select: { stage: true, customerStage: true } });
  if (before.stage === to) return;
  await prisma.salesContact.update({
    where: { id: contactId },
    data: {
      stage: to,
      lossReason: to === "VERLOREN" ? ((lossReason as LossReason) ?? "SONSTIGES") : null,
      customerStage: to === "GEWONNEN" && !before.customerStage ? "VERTRAG" : undefined,
    },
  });
  await prisma.salesActivity.create({
    data: { contactId, type: "STATUS", outcome: `${STAGE_LABEL[before.stage]} → ${STAGE_LABEL[to]}` },
  });
  // Verloren/Ungültig: offene Aufgaben schließen
  if (to === "VERLOREN" || to === "UNGUELTIG") {
    await prisma.salesTask.updateMany({ where: { contactId, doneAt: null }, data: { doneAt: new Date() } });
  }
  if (to === "GEWONNEN") await ensureSource(contactId);
  await stopFollowupOnStage(contactId, to);
  refresh(contactId);
}

export async function dragCustomer(contactId: string, customerStage: string) {
  await requireAuth();
  if (!CUSTOMER_STAGES.some((c) => c.id === customerStage)) throw new Error("Unbekannte Kunden-Stufe");
  await changeCustomerStage(contactId, customerStage as CustomerStage);
  refresh(contactId);
}

/** Antwort manuell als positiv/negativ einordnen (positiv → Aufgabe) */
export async function setReplySentiment(fd: FormData) {
  await requireAuth();
  const id = s(fd, "id")!;
  const choice = s(fd, "sentiment");
  if (!choice || !["POSITIV", "NEGATIV", "NEUTRAL", "AUTO", "SPAETER"].includes(choice)) return;
  const before = await prisma.salesEmail.findUniqueOrThrow({ where: { id }, select: { sentiment: true, rechtsArt: true } });
  // Datenschutz/Recht bleibt so eingeordnet (Ole, 19.11.2026): nie neutral, positiv oder automatisch
  if (before.rechtsArt) return;
  const e = await prisma.salesEmail.update({
    where: { id },
    data: choice === "AUTO" ? { isAutoReply: true, sentiment: "NEUTRAL" } : { isAutoReply: false, sentiment: choice },
  });
  if (choice === "POSITIV") await ensureReplyTask(e.contactId, (e.text ?? e.subject ?? "").slice(0, 300));
  else await removeReplyTaskIfNoPositive(e.contactId);
  if (choice === "SPAETER") {
    // „Später“: Stufe Später + Follow-up im Thread dieser Antwort
    const c = await prisma.salesContact.findUniqueOrThrow({ where: { id: e.contactId }, select: { stage: true } });
    if (c.stage !== "SPAETER" && !["TERMIN", "GEWONNEN"].includes(c.stage)) {
      await prisma.salesContact.update({ where: { id: e.contactId }, data: { stage: "SPAETER", lossReason: null } });
      await prisma.salesActivity.create({ data: { contactId: e.contactId, type: "STATUS", outcome: `${STAGE_LABEL[c.stage]} → ${STAGE_LABEL.SPAETER}`, note: "Antwort als „später“ eingeordnet" } });
    }
    await planFollowup(e.contactId, { source: "ANTWORT", replyEmailId: e.id });
  } else if (before.sentiment === "SPAETER") {
    await stopFollowup(e.contactId, "Antwort anders eingeordnet");
  }
  refresh(e.contactId);
}

// ─── LinkedIn (Waalaxy) ─────────────────────────────────────────────────
export async function importWaalaxyAction(_p: ImportState, fd: FormData): Promise<ImportState> {
  await requireAuth();
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, message: "Bitte eine CSV-Datei wählen." };
  try {
    const r = await importWaalaxyCsv(await file.text());
    refresh();
    const via = Object.entries(r.byVia).map(([k, v]) => `${v}× ${k}`).join(", ");
    return {
      ok: true,
      message:
        `${r.rows} Prospects: ${r.matched} Kontakten zugeordnet${via ? ` (${via})` : ""}, ${r.updated} aktualisiert, ${r.unmatched} nicht gefunden.` +
        (r.unmatchedNames.length ? ` Nicht gefunden z.B.: ${r.unmatchedNames.join("; ")}` : ""),
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** LinkedIn-Status/Profil auf der Kontaktseite manuell setzen */
export async function updateLinkedIn(fd: FormData) {
  await requireAuth();
  const contactId = s(fd, "contactId")!;
  const status = s(fd, "linkedinStatus");
  const url = s(fd, "linkedinUrl");
  const before = await prisma.salesContact.findUniqueOrThrow({ where: { id: contactId }, select: { linkedinStatus: true } });
  const now = new Date();
  await prisma.salesContact.update({
    where: { id: contactId },
    data: {
      linkedinUrl: url,
      linkedinStatus: status,
      linkedinRequestAt: status === "ANFRAGE_GESENDET" && before.linkedinStatus !== status ? now : undefined,
      linkedinConnectedAt: status === "VERNETZT" && before.linkedinStatus !== status ? now : undefined,
      linkedinMessageAt: status === "NACHRICHT_GESENDET" && before.linkedinStatus !== status ? now : undefined,
      linkedinReplyAt: status === "GEANTWORTET" && before.linkedinStatus !== status ? now : undefined,
    },
  });
  if (status && before.linkedinStatus !== status) {
    await prisma.salesActivity.create({ data: { contactId, type: "LINKEDIN", outcome: `LinkedIn: ${LI_LABEL[status] ?? status}` } });
  }
  refresh(contactId);
}

/** „WhatsApp erlaubt“ in der Kontaktakte (Ole, 18.11.2026): von Hand setzen bzw. entfernen, gilt statt der Automatik. */
export async function setWhatsappErlaubtAction(contactId: string, erlaubt: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAuth();
  if (!contactId) return { ok: false, error: "Kontakt fehlt." };
  const { setzeWhatsappErlaubt } = await import("@/lib/vertrieb/bonus-erinnerung-server");
  await setzeWhatsappErlaubt(contactId, erlaubt);
  refresh(contactId);
  return { ok: true };
}

/** „Nie kontaktieren“ in der Kontaktakte (Ole, 19.11.2026): von Hand setzen (Grund „manuell“) bzw. aufheben. */
export async function setNieKontaktierenAction(contactId: string, an: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAuth();
  if (!contactId) return { ok: false, error: "Kontakt fehlt." };
  const m = await import("@/lib/vertrieb/nie-kontaktieren-server");
  if (an) await m.nieKontaktierenSetzen(contactId, "manuell", { quelle: "von Hand in der Kontaktakte" });
  else if (await prisma.datenschutzFallEreignis.findFirst({ where: { contactId }, select: { id: true } })) {
    return { ok: false, error: "Fall „Datenschutz und Recht“: die Sperre bleibt dauerhaft." };
  } else await m.nieKontaktierenAufheben(contactId);
  await audit(an ? "vertrieb.nie_kontaktieren" : "vertrieb.nie_kontaktieren_aufgehoben", { entity: "SalesContact", entityId: contactId });
  refresh(contactId);
  return { ok: true };
}

/**
 * „Auf Verlangen löschen (Art. 17)“ in der Kontaktakte (Ole, 19.11.2026): Löschverlangen per Mail oder Telefon. Gleiche
 * Logik wie bei einer Antwort (lib/vertrieb/art17.ts): Kunden, Angebote, Leads und Empfehlungen werden nur gesperrt.
 */
export async function art17LoeschenAction(contactId: string): Promise<{ ok: boolean; message: string }> {
  const session = await requireAuth();
  if (!contactId) return { ok: false, message: "Kontakt fehlt." };
  const { vertriebArt17Loeschen, ART17_AUSNAHME_LABEL } = await import("@/lib/vertrieb/art17");
  const r = await vertriebArt17Loeschen(contactId, { quelle: "admin", wer: session.email });
  refresh(contactId);
  if (r.status === "geloescht") {
    return { ok: true, message: r.instantly === "fehler" ? "Gelöscht. Instantly war nicht erreichbar: Aufgabe zum Nachholen angelegt." : "Gelöscht. Der Sperrvermerk bleibt." };
  }
  if (r.status === "ausnahme") {
    return { ok: false, message: `Nicht gelöscht (${(r.gruende ?? []).map((g) => ART17_AUSNAHME_LABEL[g]).join(", ")}). Kontakt gesperrt, Aufgabe „Löschverlangen prüfen“ angelegt.` };
  }
  return { ok: r.status === "schon_geloescht", message: r.status === "schon_geloescht" ? "Schon gelöscht." : "Kontakt nicht gefunden." };
}

// ─── Sperren aus bisherigen Antworten nachholen (Vorschau, dann Anwenden) ─
export type SperrNachholState = { ok: boolean; message: string; ergebnis?: import("@/lib/vertrieb/nie-kontaktieren-server").SperrNachholErgebnis } | null;

/** Einmaliger Nachhol-Lauf (Ole, 19.11.2026): Austragungen, Widersprüche, Datenschutzfragen und Abmeldungen sperren. */
export async function sperrenNachholenAction(_p: SperrNachholState, fd: FormData): Promise<SperrNachholState> {
  await requireAuth();
  const anwenden = s(fd, "mode") === "anwenden";
  try {
    const { sperrenAusAntworten } = await import("@/lib/vertrieb/nie-kontaktieren-server");
    const r = await sperrenAusAntworten({ anwenden });
    const n = (x: number, one: string, many: string) => `${x.toLocaleString("de-DE")} ${x === 1 ? one : many}`;
    const neu = r.neu.austragen + r.neu.widerspruch + r.neu.datenschutz;
    if (anwenden) {
      await audit("vertrieb.sperren_nachholen", { entity: "SalesContact", details: { ...r.neu, schonGesperrt: r.schonGesperrt, uebersprungen: r.uebersprungen, aufgaben: r.aufgaben, ...r.instantly } });
      refresh();
    }
    const teile = `${r.neu.austragen} Austragung, ${r.neu.widerspruch} Widerspruch, ${r.neu.datenschutz} Datenschutz`;
    const message = anwenden
      ? `${n(neu, "Kontakt", "Kontakte")} gesperrt (${teile}), ${n(r.aufgaben, "Aufgabe", "Aufgaben")} „Auskunft nach Art. 15“.`
      : neu
        ? `${n(neu, "Kontakt wird", "Kontakte werden")} gesperrt (${teile}). ${n(r.schonGesperrt, "ist", "sind")} schon gesperrt.`
        : `Keine neuen Sperren. ${n(r.schonGesperrt, "Kontakt ist", "Kontakte sind")} schon gesperrt.`;
    return { ok: true, message, ergebnis: r };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Verlauf bearbeiten ─────────────────────────────────────────────────
export async function updateActivity(fd: FormData) {
  await requireAuth();
  const id = s(fd, "id")!;
  const day = s(fd, "date");
  const type = s(fd, "type") as ActivityType | null;
  const a = await prisma.salesActivity.update({
    where: { id },
    data: {
      outcome: s(fd, "outcome"),
      note: s(fd, "note"),
      type: type ?? undefined,
      occurredAt: day ? fromDayKey(day, s(fd, "time") ?? "09:00") : undefined,
    },
  });
  refresh(a.contactId);
}

export async function deleteActivity(fd: FormData) {
  await requireAuth();
  const a = await prisma.salesActivity.delete({ where: { id: s(fd, "id")! } });
  refresh(a.contactId);
}

// ─── Calendly ───────────────────────────────────────────────────────────
async function baseUrl() {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

export async function connectCalendlyAction(prev: ImportState): Promise<ImportState> {
  void prev;
  await requireAuth();
  try {
    const msg = await connectCalendly(`${await baseUrl()}/api/vertrieb/calendly/webhook?token=${process.env.VERTRIEB_WEBHOOK_TOKEN}`);
    return { ok: true, message: msg };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function syncCalendlyAction(prev: ImportState): Promise<ImportState> {
  void prev;
  await requireAuth();
  try {
    const r = await syncCalendly();
    refresh();
    return { ok: true, message: `${r.events} Termine geprüft (${r.invitees} Teilnehmer): ${r.new} neu übernommen, ${r.canceled} Absagen/Verschiebungen.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Lead manuell erfassen (z.B. LinkedIn-Nachricht, Empfehlung) ─────────
export async function createLeadManually(fd: FormData) {
  await requireAuth();
  // Ohne Herkunft nicht LinkedIn unterstellen (Usability-Check 18.11.2026)
  const source = s(fd, "source") ?? "SONSTIGES";
  const r = await handleInboundLead(
    {
      first_name: s(fd, "firstName"),
      last_name: s(fd, "lastName"),
      agentur: s(fd, "company"),
      email: s(fd, "email"),
      phone: s(fd, "phone"),
      city: s(fd, "city"),
      linkedin_url: s(fd, "linkedinUrl"),
      message: s(fd, "message"),
    },
    source,
    { activity: `Lead manuell erfasst (${SOURCE_LABEL[source] ?? source})`, taskTitle: s(fd, "taskTitle") ?? "Lead kontaktieren" },
  );
  refresh();
  if ("contactId" in r && r.contactId) redirect(await ziel(`/admin/neu/vertrieb/kontakte/${r.contactId}`));
  redirect(await ziel("/admin/neu/vertrieb/kontakte/neu?fehler=1"));
}

/** „Jetzt anreichern“ am Kontakt: Website und Google erneut auswerten, nur leere Felder füllen. */
export async function enrichAddressAction(fd: FormData) {
  await requireAuth();
  const id = s(fd, "id")!;
  const r = await enrichContact(id, { force: true });
  if (!r.fields.length) {
    const web =
      r.web === "no-source"
        ? "keine Agentur-Website bekannt (Feld Website leer, E-Mail bei Freemail/Versicherer)"
        : r.web === "not-found"
          ? "Website nicht lesbar"
          : r.web.startsWith("error")
            ? "Website-Fehler"
            : "Website ohne neue Angaben";
    const google =
      r.google === "no-key"
        ? "Google: Schlüssel fehlt"
        : r.google === "limit"
          ? "Google: Tageskontingent erreicht"
          : r.google.startsWith("unsure")
            ? `Google: Treffer nicht eindeutig, nichts übernommen (bester Treffer: ${r.google.replace(/^unsure:\s*/, "") || "?"})`
            : r.google === "not-found"
              ? "Google: kein Eintrag gefunden"
              : r.google === "no-query"
                ? "Google: Ort/PLZ fehlt für die Suche"
                : r.google.startsWith("error")
                  ? `Google: Fehler (${r.google.replace(/^error:\s*/, "").slice(0, 180)})`
                  : "Google: nichts Neues";
    await prisma.salesActivity.create({ data: { contactId: id, type: "NOTIZ", note: `Anreichern: ${web}; ${google}.` } });
  }
  refresh();
}

/** Protokollierte LinkedIn-Nachricht ohne erkanntes Interesse doch als Lead übernehmen */
export async function convertInboundLead(fd: FormData) {
  await requireAuth();
  const id = s(fd, "id")!;
  const lead = await prisma.salesInboundLead.findUniqueOrThrow({ where: { id } });
  const [first, ...rest] = (lead.name ?? "").split(/\s+/);
  const url = lead.answers?.match(/https:\/\/www\.linkedin\.com\/in\/\S+/)?.[0] ?? null;
  const r = await handleInboundLead(
    { first_name: first || null, last_name: rest.join(" ") || null, linkedin_url: url, message: lead.answers },
    lead.source,
    { activity: "LinkedIn-Nachricht als Lead übernommen", taskTitle: "Auf LinkedIn-Anfrage reagieren" },
  );
  if ("contactId" in r && r.contactId) {
    await prisma.salesInboundLead.update({ where: { id }, data: { contactId: r.contactId } });
    refresh();
    redirect(`/admin/neu/vertrieb/kontakte/${r.contactId}`);
  }
  refresh();
}

// ─── Übernahme aus dem alten Cold CRM ────────────────────────────────────
export async function importColdCrmAction(_prev: ImportState, _fd: FormData): Promise<ImportState> {
  await requireAuth();
  try {
    const r = await importFromColdCrm();
    refresh();
    return {
      ok: true,
      message: r.map((x) => `${x.table.replace(/^Sales/, "")}: ${x.inserted} übernommen${x.skipped ? `, ${x.skipped} übersprungen (schon vorhanden)` : ""}`).join(" · "),
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** Neu-Import: Vertrieb leeren (mit Sicherung) und frisch aus dem Cold CRM holen. */
export async function replaceColdCrmAction(_prev: ImportState, fd: FormData): Promise<ImportState> {
  const session = await requireAuth();
  if (s(fd, "confirm") !== "ERSETZEN") return { ok: false, message: "Zur Bestätigung bitte ERSETZEN eintippen." };
  // Quelle: altes Cold CRM oder (beim Livegang) die Testumgebung
  const source = s(fd, "source") === "staging" ? "staging" : "cold";
  try {
    const { backup, report } = await replaceFromColdCrm(new Date(), source);
    await audit("vertrieb.neuimport", { actor: { id: session.userId, email: session.email, role: session.role }, details: { source, backup, report } });
    refresh();
    return {
      ok: true,
      message: `Sicherung: ${backup} · ${report.map((x) => `${x.table.replace(/^Sales/, "")}: ${x.inserted}${x.skipped ? ` (${x.skipped} übersprungen)` : ""}`).join(" · ")}`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Vertriebskontakt mit Kundenakte verknüpfen ─────────────────────────
/** Verknüpft einen Kontakt mit einer bestehenden Kundenakte (leer = lösen). */
export async function linkContactCustomer(fd: FormData) {
  await requireAuth();
  const contactId = s(fd, "contactId")!;
  const customerId = s(fd, "customerId");
  if (customerId) {
    const taken = await prisma.salesContact.findFirst({ where: { customerId, NOT: { id: contactId } }, select: { name: true } });
    if (taken) throw new Error(`Diese Kundenakte ist schon mit „${taken.name}“ verknüpft.`);
    await prisma.customer.findUniqueOrThrow({ where: { id: customerId }, select: { id: true } });
  }
  const c = await prisma.salesContact.update({
    where: { id: contactId },
    data: { customerId: customerId ?? null },
    select: { customerStage: true },
  });
  // Verknüpft = Kunde: ohne Kunden-Phase landet er sonst nicht in der Kunden-Pipeline
  if (customerId && !c.customerStage) await changeCustomerStage(contactId, CUSTOMER_STAGES[0].id);
  await audit(customerId ? "vertrieb.verknuepft" : "vertrieb.verknuepfung_geloest", { entity: "SalesContact", entityId: contactId, customerId: customerId ?? null });
  refresh(contactId);
  if (customerId) revalidatePath(`/admin/neu/kunden/${customerId}`);
}

// ─── Weitere E-Mail-Adressen und Zusammenführen ─────────────────────────
export type ContactEmailState = { ok?: boolean; error?: string } | null;

export async function addContactEmailAction(_prev: ContactEmailState, fd: FormData): Promise<ContactEmailState> {
  await requireAuth();
  const id = s(fd, "contactId")!;
  const r = await addContactEmail(id, s(fd, "email") ?? "");
  if (!r.ok) return { error: r.error };
  refresh(id);
  return { ok: true };
}

export async function updatePrimaryEmailAction(_prev: ContactEmailState, fd: FormData): Promise<ContactEmailState> {
  await requireAuth();
  const id = s(fd, "contactId")!;
  const r = await updatePrimaryEmail(id, s(fd, "email") ?? "");
  if (!r.ok) return { error: r.error };
  refresh(id);
  return { ok: true };
}

export async function removeContactEmailAction(fd: FormData) {
  await requireAuth();
  const id = s(fd, "contactId")!;
  await removeContactEmail(id, s(fd, "email") ?? "");
  refresh(id);
}

export async function makePrimaryEmailAction(fd: FormData) {
  await requireAuth();
  const id = s(fd, "contactId")!;
  await makePrimaryEmail(id, s(fd, "email") ?? "");
  refresh(id);
}

// ─── Weitere Telefonnummern (lib/vertrieb/kontaktdaten-server.ts) ───────
export async function makePrimaryPhoneAction(fd: FormData) {
  await requireAuth();
  const id = s(fd, "contactId")!;
  await makePrimaryPhone(id, s(fd, "phoneId") ?? "");
  refresh(id);
}

export async function removeContactPhoneAction(fd: FormData) {
  await requireAuth();
  const id = s(fd, "contactId")!;
  await removeContactPhone(id, s(fd, "phoneId") ?? "");
  refresh(id);
}

/** Einmalig rückwirkend: alle Kontakte über vorhandene Buchungen, Mails und Formulare (idempotent). */
export async function backfillContactDataAction(prev: ImportState): Promise<ImportState> {
  void prev;
  await requireAuth();
  try {
    const r = await backfillContactData();
    await audit("vertrieb.kontaktdaten_rueckwirkend", { entity: "SalesContact", details: r });
    refresh();
    return {
      ok: true,
      message: `${r.contacts.toLocaleString("de-DE")} Kontakt${r.contacts === 1 ? "" : "e"} geprüft: ${r.emails} E-Mail-Adresse${r.emails === 1 ? "" : "n"} und ${r.phones} Telefonnummer${r.phones === 1 ? "" : "n"} ergänzt.`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function searchMergeCandidatesAction(contactId: string, q: string) {
  await requireAuth();
  return searchMergeCandidates(contactId, q);
}

/** Führt `dropId` in `keepId` zusammen und öffnet danach den verbleibenden Kontakt. */
export async function mergeContactsAction(keepId: string, dropId: string): Promise<{ error: string } | void> {
  const session = await requireAuth();
  const r = await mergeContacts(keepId, dropId, session.email ?? "Admin");
  if (!r.ok) return { error: r.error };
  await audit("contact.merge", { entity: "SalesContact", entityId: keepId, details: { dropId, moved: r.moved } });
  refresh(keepId);
  redirect(await ziel(`/admin/neu/vertrieb/kontakte/${keepId}`));
}
