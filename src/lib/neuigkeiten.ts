// Neuigkeiten im Kundenbereich: Laden, Ungelesen-Zähler, Pflege im Admin,
// optionaler Push beim Veröffentlichen und KI-Entwurf.

import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";
import { sendToBuyersOfCustomer } from "@/lib/push";
import { reportError } from "@/lib/monitoring";
import { claudeCall, runAgent, type LlmCall } from "@/lib/kampagnen/llm";
import {
  asAudience,
  asKind,
  audiencesForPlan,
  validateUpdate,
  type UpdateAudience,
  type UpdateKind,
  type UpdateView,
} from "@/lib/neuigkeiten-shared";

type Row = { id: string; title: string; body: string; kind: string; audience: string; publishedAt: Date | null };
const toView = (r: Row): UpdateView => ({
  id: r.id,
  title: r.title,
  body: r.body,
  kind: asKind(r.kind),
  audience: asAudience(r.audience),
  publishedAt: r.publishedAt?.toISOString() ?? null,
});

async function planOf(customerId: string): Promise<string> {
  return (await prisma.customer.findUnique({ where: { id: customerId }, select: { plan: true } }))?.plan ?? "software";
}

/** Veröffentlichte Neuigkeiten für einen Kunden (nach Paket gefiltert), neueste zuerst. */
export async function listUpdatesForCustomer(customerId: string, now = new Date()): Promise<UpdateView[]> {
  const rows = await prisma.productUpdate.findMany({
    where: { publishedAt: { not: null, lte: now }, audience: { in: audiencesForPlan(await planOf(customerId)) } },
    orderBy: { publishedAt: "desc" },
    take: 200,
  });
  return rows.map(toView);
}

/** Ungelesene Neuigkeiten eines Logins: veröffentlicht nach `updatesSeenAt`. */
export async function unreadUpdates(userId: string, customerId: string, now = new Date()): Promise<UpdateView[]> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { updatesSeenAt: true, createdAt: true } });
  if (!u) return [];
  // Neue Logins starten nicht mit der ganzen Historie als „ungelesen“ (höchstens die letzten 14 Tage)
  const since = u.updatesSeenAt ?? new Date(Math.max(u.createdAt.getTime() - 14 * 86400000, 0));
  const rows = await prisma.productUpdate.findMany({
    where: { publishedAt: { gt: since, lte: now }, audience: { in: audiencesForPlan(await planOf(customerId)) } },
    orderBy: { publishedAt: "desc" },
    take: 50,
  });
  return rows.map(toView);
}

export async function unreadUpdateCount(userId: string, customerId: string, now = new Date()): Promise<number> {
  return (await unreadUpdates(userId, customerId, now)).length;
}

/** Seite geöffnet bzw. Hinweis weggeklickt: alles bis jetzt gilt als gelesen. */
export async function markUpdatesSeen(userId: string, now = new Date()): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { updatesSeenAt: now } });
}

// ─── Admin ───────────────────────────────────────────────────────────────

export async function listAllUpdates(): Promise<UpdateView[]> {
  const rows = await prisma.productUpdate.findMany({ orderBy: [{ publishedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }], take: 300 });
  return rows.map(toView);
}

export type SaveInput = {
  id?: string | null;
  title: string;
  body: string;
  kind: UpdateKind;
  audience: UpdateAudience;
  publish: boolean;
  push: boolean;
};
export type SaveResult = { ok: true; id: string; pushed: number } | { ok: false; error: string };

/** Speichern als Entwurf oder veröffentlichen; Push nur mit Häkchen und nur einmal je Eintrag. */
export async function saveUpdate(input: SaveInput, actor?: AuditActor, now = new Date()): Promise<SaveResult> {
  const err = validateUpdate(input);
  if (err) return { ok: false, error: err };
  const data = { title: input.title.trim(), body: input.body.trim(), kind: asKind(input.kind), audience: asAudience(input.audience) };
  const prev = input.id ? await prisma.productUpdate.findUnique({ where: { id: input.id } }) : null;
  if (input.id && !prev) return { ok: false, error: "Eintrag nicht gefunden." };
  const publishedAt = input.publish ? (prev?.publishedAt ?? now) : null;
  const row = prev
    ? await prisma.productUpdate.update({ where: { id: prev.id }, data: { ...data, publishedAt } })
    : await prisma.productUpdate.create({ data: { ...data, publishedAt } });
  await audit(input.publish && !prev?.publishedAt ? "neuigkeit.publish" : "neuigkeit.save", {
    entity: "ProductUpdate",
    entityId: row.id,
    details: { title: row.title, audience: row.audience, published: !!publishedAt },
    ...(actor ? { actor } : {}),
  });
  let pushed = 0;
  if (input.publish && input.push && !row.pushedAt) pushed = await pushUpdate(row.id);
  return { ok: true, id: row.id, pushed };
}

export async function deleteUpdate(id: string, actor?: AuditActor): Promise<void> {
  const row = await prisma.productUpdate.delete({ where: { id } }).catch(() => null);
  if (row) await audit("neuigkeit.delete", { entity: "ProductUpdate", entityId: id, details: { title: row.title }, ...(actor ? { actor } : {}) });
}

/** Push an alle Logins mit Push von Kunden der passenden Zielgruppe. Gibt die Zahl der Geräte zurück. */
export async function pushUpdate(id: string): Promise<number> {
  const row = await prisma.productUpdate.findUnique({ where: { id } });
  if (!row?.publishedAt || row.pushedAt) return 0;
  // Erst markieren (kein doppelter Versand bei Doppelklick)
  const claimed = await prisma.productUpdate.updateMany({ where: { id, pushedAt: null }, data: { pushedAt: new Date() } });
  if (!claimed.count) return 0;
  const plans = row.audience === "software" ? ["software"] : row.audience === "betreuung" ? ["service"] : undefined;
  // Nur Kunden, bei denen mindestens ein Login Push eingeschaltet hat
  const subUserIds = (await prisma.pushSubscription.findMany({ where: { userId: { not: null } }, select: { userId: true } })).map((s) => s.userId!);
  const customers = await prisma.customer.findMany({
    where: {
      ...(plans ? { plan: { in: plans } } : { plan: { not: "internal" } }),
      archived: false,
      users: { some: { role: "BUYER", id: { in: subUserIds } } },
    },
    select: { id: true },
  });
  let sent = 0;
  for (const c of customers) {
    const r = await sendToBuyersOfCustomer(c.id, { title: `Neu: ${row.title}`.slice(0, 80), body: plainText(row.body).slice(0, 140), url: "/buyer/neuigkeiten", tag: `update:${row.id}` }).catch((e: unknown) => {
      reportError(e, "neuigkeit-push");
      return { sent: 0 };
    });
    sent += r.sent;
  }
  return sent;
}

const plainText = (s: string) => s.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

// ─── KI-Entwurf ──────────────────────────────────────────────────────────

const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    body: { type: "string" },
    kind: { type: "string", enum: ["neu", "verbessert", "behoben"] },
  },
  required: ["title", "body", "kind"],
};

/** Aus Stichworten von Ole einen kurzen, kundenfreundlichen Eintrag formulieren. */
export async function draftUpdateWithAi(notes: string, call: LlmCall = claudeCall): Promise<{ ok: true; title: string; body: string; kind: UpdateKind } | { ok: false; error: string }> {
  const text = notes.trim();
  if (text.length < 5) return { ok: false, error: "Bitte kurz in Stichworten beschreiben, was neu ist." };
  try {
    const { value } = await runAgent(
      call,
      {
        agent: "Neuigkeiten",
        system:
          "Du schreibst kurze Einträge für die Seite „Neuigkeiten“ einer Software für Versicherungsvermittler (performancegrowth). " +
          "Leser sind Vermittler, keine Techniker. Sprache: Deutsch, Sie-Form, freundlich und klar. " +
          "Titel: höchstens 60 Zeichen, sagt, was der Kunde jetzt kann. Text: 1–3 kurze Sätze, Nutzen statt Technik, " +
          "nenne den Ort in der App (z. B. „Unter **Konto & Rechnungen → Werbebudget**“), wichtige Stellen mit **fett**. " +
          "Keine internen Namen, keine Technikbegriffe, keine Versprechen, erwähne niemals Garantien. kind: neu, verbessert oder behoben.",
        user: `Stichworte von Ole:\n${text.slice(0, 1500)}`,
        schema: DRAFT_SCHEMA,
        maxTokens: 800,
      },
      (x) => {
        const o = (x ?? {}) as { title?: unknown; body?: unknown; kind?: unknown };
        const errors: string[] = [];
        const title = typeof o.title === "string" ? o.title.trim() : "";
        const body = typeof o.body === "string" ? o.body.trim() : "";
        if (!title || title.length > 80) errors.push("title fehlt oder ist länger als 80 Zeichen");
        if (!body || body.length > 600) errors.push("body fehlt oder ist länger als 600 Zeichen");
        if (/garantie/i.test(`${title} ${body}`)) errors.push("Das Wort „Garantie“ darf nicht vorkommen");
        return errors.length ? { ok: false as const, errors } : { ok: true as const, value: { title, body, kind: asKind(o.kind) } };
      },
    );
    return { ok: true, ...value };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "Der Entwurf hat nicht geklappt." };
  }
}
