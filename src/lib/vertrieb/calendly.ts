// Calendly → CRM: Buchungen und Absagen (Webhooks invitee.created / invitee.canceled)
// plus einmaliger Abgleich bestehender Termine über die API.
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Matcher } from "@/lib/vertrieb/linkedin";
import { scheduleAddressEnrichment } from "@/lib/vertrieb/address-enrich";
import { fmtDateTime } from "@/lib/vertrieb/dates";
import type { SalesStage as Stage } from "@/generated/prisma/enums";

const API = "https://api.calendly.com";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = process.env.CALENDLY_TOKEN;
  if (!token) throw new Error("CALENDLY_TOKEN ist nicht gesetzt.");
  const res = await fetch(path.startsWith("http") ? path : API + path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Calendly ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  return res.json() as Promise<T>;
}

type Location = { type?: string; location?: string | null; join_url?: string | null; additional_info?: string | null } | null;
type ScheduledEvent = { uri: string; name: string; status?: string; start_time: string; end_time?: string; location?: Location };
type Invitee = {
  uri: string;
  email: string;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  status?: string;
  rescheduled?: boolean;
  cancel_url?: string | null;
  reschedule_url?: string | null;
  questions_and_answers?: { question: string; answer: string }[];
  tracking?: { utm_source?: string | null; utm_medium?: string | null; utm_campaign?: string | null } | null;
  cancellation?: { reason?: string | null; canceled_by?: string | null; canceler_type?: string | null } | null;
  scheduled_event?: ScheduledEvent;
};

// ─── Signatur prüfen (falls Calendly sie mitschickt) ────────────────────
export function verifySignature(rawBody: string, header: string | null, key: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=") as [string, string]));
  if (!parts.t || !parts.v1) return false;
  const expected = crypto.createHmac("sha256", key).update(`${parts.t}.${rawBody}`).digest("hex");
  const ok = expected.length === parts.v1.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
  const fresh = Math.abs(Date.now() / 1000 - Number(parts.t)) < 10 * 60;
  return ok && fresh;
}

// ─── Kontakt finden oder anlegen ────────────────────────────────────────
async function findOrCreateContact(inv: Invitee, matcher: Matcher): Promise<{ id: string; created: boolean }> {
  const email = inv.email.trim().toLowerCase();
  const [first, ...rest] = (inv.name ?? "").trim().split(/\s+/);
  const firstName = inv.first_name ?? first ?? null;
  const lastName = inv.last_name ?? (rest.join(" ") || null);
  // E-Mail, Name … und Antworten im Buchungsformular (z.B. Agentur-E-Mail)
  const extraEmails = (inv.questions_and_answers ?? []).flatMap((qa) => qa.answer.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? []);
  for (const e of [email, ...extraEmails.map((x) => x.toLowerCase())]) {
    const m = matcher.match({ url: null, slug: null, firstName: null, lastName: null, email: e, company: null, location: null, status: null, connectedAt: null, messageAt: null, repliedAt: null, list: null, tags: null });
    if (m) return { id: m.id, created: false };
  }
  const m = matcher.match({ url: null, slug: null, firstName, lastName, email: null, company: null, location: null, status: null, connectedAt: null, messageAt: null, repliedAt: null, list: null, tags: null });
  if (m) return { id: m.id, created: false };

  const existing = await prisma.salesContact.findUnique({ where: { email }, select: { id: true } });
  if (existing) return { id: existing.id, created: false };
  const agency = (inv.questions_and_answers ?? []).find((qa) => /agentur|firma|unternehmen|company/i.test(qa.question))?.answer;
  const c = await prisma.salesContact.create({
    data: {
      email,
      name: agency ? `${agency}` : inv.name ?? email,
      firstName,
      lastName,
      stage: "TERMIN",
      description: "Über Calendly-Buchung angelegt",
    },
  });
  await scheduleAddressEnrichment(c.id);
  return { id: c.id, created: true };
}

const answersText = (inv: Invitee) =>
  (inv.questions_and_answers ?? []).filter((qa) => qa.answer?.trim()).map((qa) => `${qa.question}: ${qa.answer}`).join("\n") || null;

// ─── Buchung / Absage verarbeiten ───────────────────────────────────────
export async function recordBooking(inv: Invitee, ev: ScheduledEvent, matcher?: Matcher): Promise<"new" | "known"> {
  const known = await prisma.salesMeeting.findUnique({ where: { calendlyUri: inv.uri } });
  if (known) return "known";
  const { id: contactId, created } = await findOrCreateContact(inv, matcher ?? (await Matcher.load()));
  const startAt = new Date(ev.start_time);
  const loc = ev.location ?? null;
  const utm = inv.tracking?.utm_source ?? null;

  const task = await prisma.salesTask.create({
    data: {
      contactId,
      title: `Termin: ${ev.name}`,
      type: "TERMIN",
      dueAt: startAt,
      note: [loc?.join_url ? `Link: ${loc.join_url}` : loc?.location ? `Ort: ${loc.location}` : null, answersText(inv)].filter(Boolean).join("\n") || null,
    },
  });
  await prisma.salesMeeting.create({
    data: {
      contactId,
      calendlyUri: inv.uri,
      eventUri: ev.uri,
      title: ev.name,
      startAt,
      endAt: ev.end_time ? new Date(ev.end_time) : null,
      location: loc?.location ?? loc?.type ?? null,
      joinUrl: loc?.join_url ?? null,
      rescheduleUrl: inv.reschedule_url ?? null,
      cancelUrl: inv.cancel_url ?? null,
      answers: answersText(inv),
      utmSource: utm,
      inviteeName: inv.name ?? null,
      inviteeEmail: inv.email,
      taskId: task.id,
    },
  });
  await prisma.salesActivity.create({
    data: {
      contactId,
      type: "TERMIN",
      outcome: `Termin über Calendly gebucht: ${ev.name} am ${fmtDateTime(startAt)}`,
      note: [created ? "Neuer Kontakt aus Calendly" : null, inv.name && `Gebucht von ${inv.name} (${inv.email})`, utm && `Quelle (utm_source): ${utm}`, answersText(inv)].filter(Boolean).join("\n") || null,
    },
  });
  // Pipeline: auf "Termin" (Gewonnene Kunden bleiben, wo sie sind)
  const c = await prisma.salesContact.findUniqueOrThrow({ where: { id: contactId }, select: { stage: true } });
  if (c.stage !== "GEWONNEN" && c.stage !== "TERMIN") {
    await prisma.salesContact.update({ where: { id: contactId }, data: { stage: "TERMIN" as Stage, lossReason: null } });
  }
  return "new";
}

export async function recordCancellation(inv: Invitee) {
  const m = await prisma.salesMeeting.findUnique({ where: { calendlyUri: inv.uri } });
  if (!m || m.status !== "GEPLANT") return "ignored";
  const rescheduled = !!inv.rescheduled;
  await prisma.salesMeeting.update({
    where: { id: m.id },
    data: {
      status: rescheduled ? "VERSCHOBEN" : "ABGESAGT",
      cancelReason: inv.cancellation?.reason ?? null,
      canceledBy: inv.cancellation?.canceled_by ?? inv.cancellation?.canceler_type ?? null,
    },
  });
  if (m.taskId) await prisma.salesTask.deleteMany({ where: { id: m.taskId, doneAt: null } });
  await prisma.salesActivity.create({
    data: {
      contactId: m.contactId,
      type: "TERMIN",
      outcome: rescheduled ? `Termin verschoben: ${m.title} (war ${fmtDateTime(m.startAt)})` : `Termin abgesagt: ${m.title} am ${fmtDateTime(m.startAt)}`,
      note: inv.cancellation?.reason ? `Grund: ${inv.cancellation.reason}` : null,
    },
  });
  if (!rescheduled) {
    await prisma.salesTask.create({
      data: {
        contactId: m.contactId,
        title: "Neuen Termin vereinbaren (Calendly-Absage)",
        type: "ANRUF",
        dueAt: new Date(),
        note: inv.cancellation?.reason ? `Grund der Absage: ${inv.cancellation.reason}` : null,
      },
    });
  }
  return rescheduled ? "rescheduled" : "canceled";
}

export async function handleCalendlyWebhook(body: { event?: string; payload?: Invitee }) {
  const inv = body.payload;
  if (!inv?.uri || !inv.email) return { ignored: "no invitee" };
  if (body.event === "invitee.created") {
    if (!inv.scheduled_event) {
      // Fallback, falls das Event nicht eingebettet ist
      const uuid = inv.uri.split("/scheduled_events/")[1]?.split("/")[0];
      if (!uuid || !process.env.CALENDLY_TOKEN) return { ignored: "no scheduled_event" };
      inv.scheduled_event = (await api<{ resource: ScheduledEvent }>(`/scheduled_events/${uuid}`)).resource;
    }
    return { result: await recordBooking(inv, inv.scheduled_event) };
  }
  if (body.event === "invitee.canceled") return { result: await recordCancellation(inv) };
  return { ignored: body.event };
}

// ─── Verbinden & Abgleich über die API ──────────────────────────────────
async function me() {
  return (await api<{ resource: { uri: string; current_organization: string; name: string; email: string } }>("/users/me")).resource;
}

/** Legt (falls noch nicht vorhanden) die Webhook-Subscription bei Calendly an. */
export async function connectCalendly(callbackUrl: string) {
  const u = await me();
  const q = new URLSearchParams({ organization: u.current_organization, user: u.uri, scope: "user", count: "100" });
  const subs = await api<{ collection: { callback_url: string; state: string }[] }>(`/webhook_subscriptions?${q}`);
  const base = callbackUrl.split("?")[0];
  if (subs.collection.some((s) => s.callback_url.split("?")[0] === base && s.state === "active")) {
    return `Bereits verbunden (${u.name}, ${u.email}).`;
  }
  await api("/webhook_subscriptions", {
    method: "POST",
    body: JSON.stringify({
      url: callbackUrl,
      events: ["invitee.created", "invitee.canceled"],
      organization: u.current_organization,
      user: u.uri,
      scope: "user",
      signing_key: process.env.VERTRIEB_WEBHOOK_TOKEN,
    }),
  });
  return `Verbunden mit Calendly (${u.name}, ${u.email}). Neue Buchungen und Absagen kommen ab jetzt automatisch.`;
}

/** Holt Termine der letzten 30 Tage und alle zukünftigen und gleicht sie ab. */
export async function syncCalendly() {
  const u = await me();
  const matcher = await Matcher.load();
  const stats = { events: 0, invitees: 0, new: 0, canceled: 0 };
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  for (const status of ["active", "canceled"] as const) {
    let next: string | null = `/scheduled_events?${new URLSearchParams({ user: u.uri, min_start_time: since, status, count: "100", sort: "start_time:asc" })}`;
    while (next) {
      const page: { collection: ScheduledEvent[]; pagination: { next_page: string | null } } = await api(next);
      for (const ev of page.collection) {
        stats.events++;
        const uuid = ev.uri.split("/").pop();
        const invs = await api<{ collection: Invitee[] }>(`/scheduled_events/${uuid}/invitees?count=100`);
        for (const inv of invs.collection) {
          stats.invitees++;
          if (status === "active" && inv.status !== "canceled") {
            if ((await recordBooking(inv, ev, matcher)) === "new") stats.new++;
          } else {
            if ((await recordCancellation(inv)) !== "ignored") stats.canceled++;
          }
        }
      }
      next = page.pagination.next_page;
    }
  }
  return stats;
}
