"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";
import { CUSTOMER_LABEL, CUSTOMER_STAGES, OUTCOME_BY_ID, SOURCE_LABEL, STAGE_RANK, STAGE_LABEL } from "@/lib/vertrieb/crm";
import { addDays, fromDayKey } from "@/lib/vertrieb/dates";
import type { SalesActivityType as ActivityType, SalesCustomerStage as CustomerStage, SalesLossReason as LossReason, SalesStage as Stage, SalesTaskType as TaskType } from "@/generated/prisma/enums";
import { importContactsCsv } from "@/lib/vertrieb/import-contacts";
import { ensureSource } from "@/lib/vertrieb/source";
import { connectCalendly, syncCalendly } from "@/lib/vertrieb/calendly";
import { handleInboundLead } from "@/lib/vertrieb/inbound";
import { enrichContact } from "@/lib/vertrieb/contact-enrich";
import { importFromColdCrm, replaceFromColdCrm } from "@/lib/vertrieb/cold-crm-import";
import { LI_LABEL, importWaalaxyCsv } from "@/lib/vertrieb/linkedin";
import { ensureReplyTask, importInstantlyCsv, recordReply, removeReplyTaskIfNoPositive, syncInstantly } from "@/lib/vertrieb/instantly";
import { audit } from "@/lib/audit";
import { addContactEmail, makePrimaryEmail, mergeContacts, removeContactEmail, searchMergeCandidates } from "@/lib/vertrieb/contact-merge";

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

function refresh(contactId?: string | null) {
  revalidatePath("/admin/vertrieb", "layout");
  revalidatePath("/admin/kunden", "layout");
  if (contactId) revalidatePath(`/admin/vertrieb/kontakte/${contactId}`);
}

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
  refresh(contactId);
}

export async function setStage(fd: FormData) {
  await requireAuth();
  const contactId = s(fd, "contactId")!;
  const stage = s(fd, "stage") as Stage;
  const lossReason = s(fd, "lossReason") as LossReason | null;
  const competitor = s(fd, "competitor");
  const before = await prisma.salesContact.findUniqueOrThrow({ where: { id: contactId }, select: { stage: true, customerStage: true } });
  await prisma.salesContact.update({
    where: { id: contactId },
    data: {
      stage,
      lossReason: stage === "VERLOREN" ? lossReason ?? "SONSTIGES" : null,
      competitor,
      customerStage: stage === "GEWONNEN" && !before.customerStage ? "VERTRAG" : undefined,
    },
  });
  if (before.stage !== stage) {
    await prisma.salesActivity.create({
      data: { contactId, type: "STATUS", outcome: `${STAGE_LABEL[before.stage]} → ${STAGE_LABEL[stage]}` },
    });
  }
  if (stage === "GEWONNEN") await ensureSource(contactId);
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
  await prisma.salesTask.update({ where: { id }, data: { dueAt: addDays(base, days) } });
  refresh(t.contactId);
}

export async function deleteTask(fd: FormData) {
  await requireAuth();
  const id = s(fd, "id")!;
  const t = await prisma.salesTask.delete({ where: { id } });
  refresh(t.contactId);
}

// ─── Import ─────────────────────────────────────────────────────────────
export type ImportState = { ok: boolean; message: string } | null;

export async function importContactsAction(_p: ImportState, fd: FormData): Promise<ImportState> {
  await requireAuth();
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, message: "Bitte eine CSV-Datei wählen." };
  try {
    const r = await importContactsCsv(await file.text());
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

// ─── Kontakte löschen ───────────────────────────────────────────────────
// Löscht auch Verlauf, Aufgaben und Cold-Mail-Status (Cascade).
export async function deleteContact(fd: FormData) {
  await requireAuth();
  const id = s(fd, "contactId");
  if (id) {
    const gone = await prisma.salesContact.delete({ where: { id } });
    await audit("contact.delete", { entity: "SalesContact", entityId: id, details: { name: gone.name } });
  }
  revalidatePath("/admin/vertrieb", "layout");
  redirect("/admin/vertrieb/kontakte");
}

export async function deleteContacts(fd: FormData) {
  await requireAuth();
  const ids = fd.getAll("ids").filter((v): v is string => typeof v === "string" && !!v);
  if (ids.length) await prisma.salesContact.deleteMany({ where: { id: { in: ids } } });
  revalidatePath("/admin/vertrieb", "layout");
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
      outcome: `Kunde: ${c.customerStage ? CUSTOMER_LABEL[c.customerStage] : "–"} → ${CUSTOMER_LABEL[next]}`,
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
  if (!choice || !["POSITIV", "NEGATIV", "NEUTRAL", "AUTO"].includes(choice)) return;
  const e = await prisma.salesEmail.update({
    where: { id },
    data: choice === "AUTO" ? { isAutoReply: true, sentiment: "NEUTRAL" } : { isAutoReply: false, sentiment: choice },
  });
  if (choice === "POSITIV") await ensureReplyTask(e.contactId, (e.text ?? e.subject ?? "").slice(0, 300));
  else await removeReplyTaskIfNoPositive(e.contactId);
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
  const source = s(fd, "source") ?? "LINKEDIN";
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
  if ("contactId" in r && r.contactId) redirect(`/admin/vertrieb/kontakte/${r.contactId}`);
  redirect("/admin/vertrieb/kontakte/neu?fehler=1");
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
    redirect(`/admin/vertrieb/kontakte/${r.contactId}`);
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
  if (customerId) revalidatePath(`/admin/kunden/${customerId}`);
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
  redirect(`/admin/vertrieb/kontakte/${keepId}`);
}
