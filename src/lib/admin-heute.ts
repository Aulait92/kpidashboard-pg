// „Heute“ der neuen Admin-Oberfläche (Admin-A): sammelt aus allen Bereichen,
// was jetzt eine Entscheidung oder Handarbeit braucht, und zeigt daneben,
// was die App von allein erledigt hat. Nur echte Daten, keine Platzhalter.

import { prisma } from "@/lib/prisma";
import { REASON_LABEL, type EscalationReason } from "@/lib/support";
import { HEARTBEAT_MAX_AGE_MIN, type HeartbeatKey } from "@/lib/heartbeat";
import { onboardingProgressFor } from "@/lib/onboarding";
import { stuckSetups } from "@/lib/selbst-einrichtung";
import { shortName, isTerminReview } from "@/lib/vertrieb/crm";
import { dayBounds, openTasks } from "@/lib/vertrieb/queries";
import { offeneGarantieFaelle } from "@/lib/garantien-server";
import { GARANTIE_LABEL, heuteTitel, monatName, type Kennzahlen } from "@/lib/garantien";

const DAY = 24 * 60 * 60 * 1000;

export type HeuteArea = "Vertrieb" | "Kunden" | "Leads" | "Pay-per-Lead" | "System";
/** bad = hält Geld oder Leads auf, warn = sollte heute passieren, info = gut zu wissen */
export type HeuteTone = "bad" | "warn" | "info";
export type HeuteIcon = "phone" | "calendar" | "euro" | "inbox" | "form" | "undo" | "check" | "chat" | "alert" | "offer" | "star" | "task";

export type HeuteItem = {
  key: string;
  area: HeuteArea;
  tone: HeuteTone;
  icon: HeuteIcon;
  title: string;
  detail: string;
  /** Hauptknopf (führt direkt zur Stelle, an der man es erledigt) */
  action: { label: string; href: string };
  /** Zeitpunkt für die Reihenfolge innerhalb gleicher Dringlichkeit (älteste zuerst) */
  since?: Date | null;
  /** Sofort-Aktion direkt in der Liste */
  quick?: HeuteQuick;
  /** „Später“: blendet den Punkt für `days` Tage aus (je Admin) */
  later?: { label: string; days: number };
};

export type HeuteQuick =
  | { kind: "task"; taskId: string }
  /** „Wie lief der Termin?“: Ergebnis-Knöpfe */
  | { kind: "termin"; taskId: string }
  | { kind: "storno"; leadId: string }
  | { kind: "offer"; offerId: string; contactId: string }
  /** Garantiefall: Gewähren (Stripe-Gutschrift) oder Ablehnen mit Begründung */
  | { kind: "garantie"; fallId: string; grundVorschlag: string };

/** Ausgeblendete Punkte („Später“, „Gelesen“, „Nachgefasst“) entfernen. */
export function withoutDismissed(items: HeuteItem[], dismissedKeys: Iterable<string>): HeuteItem[] {
  const hidden = new Set(dismissedKeys);
  return hidden.size ? items.filter((i) => !hidden.has(i.key)) : items;
}

/** Schlüssel aus „Heute“: kurz, ohne Leerzeichen (Schutz vor Unsinn aus dem Formular). */
export function validHeuteKey(key: unknown): key is string {
  return typeof key === "string" && /^[a-z]+(?::[A-Za-z0-9_-]+)?$/.test(key) && key.length <= 120;
}

const TOMORROW = { label: "Morgen", days: 1 };
/** So viele Reklamationen einzeln (mit Knöpfen), der Rest gesammelt */
const STORNO_SINGLE = 4;

export type AutoRow = { key: string; icon: HeuteIcon; title: string; detail: string; count: number };

const TONE_RANK: Record<HeuteTone, number> = { bad: 0, warn: 1, info: 2 };

/** Dringendes zuerst, bei gleicher Dringlichkeit das Älteste zuerst. */
export function rankItems(items: HeuteItem[]): HeuteItem[] {
  return [...items].sort((a, b) => {
    const t = TONE_RANK[a.tone] - TONE_RANK[b.tone];
    if (t) return t;
    return (a.since?.getTime() ?? Infinity) - (b.since?.getTime() ?? Infinity);
  });
}

/** Ganze Tage seit `d` (mindestens 0). */
export function daysSince(d: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / DAY));
}

/** „seit 1 Tag“ / „seit 3 Tagen“ / „seit heute“ */
export function sinceText(d: Date, now: Date): string {
  const n = daysSince(d, now);
  return n === 0 ? "seit heute" : n === 1 ? "seit 1 Tag" : `seit ${n} Tagen`;
}

/** „heute“ / „gestern“ / „vor 6 Tagen“ */
export function agoText(d: Date, now: Date): string {
  const n = daysSince(d, now);
  return n === 0 ? "heute" : n === 1 ? "gestern" : `vor ${n} Tagen`;
}

export function greeting(hour: number): string {
  return hour < 11 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend";
}

/** Kopfzeile: „4 Dinge brauchen Sie · 2 davon halten Leads oder Geld auf“ */
export function summary(items: HeuteItem[]): string {
  if (!items.length) return "Alles erledigt. Neue Punkte erscheinen hier automatisch.";
  const bad = items.filter((i) => i.tone === "bad").length;
  const head = items.length === 1 ? "1 Punkt braucht Sie" : `${items.length} Punkte brauchen Sie`;
  return bad ? `${head} · ${bad} ${bad === 1 ? "davon hält" : "davon halten"} Leads oder Geld auf` : head;
}

/** Heartbeat zu alt oder fehlgeschlagen? (null = in Ordnung oder nie gelaufen) */
export function heartbeatProblem(key: HeartbeatKey, hb: { at: Date; ok: boolean; note: string | null } | undefined, now: Date): string | null {
  if (!hb) return null;
  const ageMin = (now.getTime() - hb.at.getTime()) / 60000;
  if (ageMin > HEARTBEAT_MAX_AGE_MIN[key]) return `letzter Lauf vor ${Math.round(ageMin / 60) || 1} Std.`;
  if (!hb.ok) return hb.note ? `Fehler: ${hb.note.slice(0, 120)}` : "letzter Lauf mit Fehler";
  return null;
}

const name = (n: string) => n.replace(/^Allianz\s+/i, "");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export async function loadAdminHeute(now = new Date(), userId?: string) {
  const { start, tomorrow } = dayBounds();
  const week = new Date(now.getTime() - 7 * DAY);
  const [
    tasks,
    meetings,
    staleOffers,
    overdueCustomers,
    onboardings,
    attentionChats,
    untouchedLeads,
    parked,
    stornoReview,
    failedOrders,
    unassigned,
    heartbeats,
    helpDown,
    feedback,
    supportRequests,
  ] = await Promise.all([
    openTasks({ dueAt: { lt: tomorrow } }),
    prisma.salesMeeting.findMany({
      where: { status: "GEPLANT", startAt: { gte: now, lt: tomorrow } },
      orderBy: { startAt: "asc" },
      take: 5,
      include: { contact: { select: { id: true, name: true } } },
    }),
    prisma.offer.findMany({
      where: { status: "sent", acceptedAt: null, sentAt: { lt: new Date(now.getTime() - 5 * DAY) }, validUntil: { gte: now } },
      orderBy: { sentAt: "asc" },
      take: 5,
      select: { id: true, company: true, contactName: true, sentAt: true, viewedAt: true, monthlyFee: true, salesContactId: true },
    }),
    prisma.customer.findMany({
      where: { archived: false, paymentOverdueSince: { not: null } },
      select: { id: true, name: true, paymentOverdueSince: true, pauses: { where: { status: "active", kind: "dunning" }, select: { id: true }, take: 1 } },
    }),
    prisma.onboarding.findMany({ where: { status: "running", liveAt: null }, select: { customerId: true, startDate: true, customer: { select: { name: true } } } }),
    prisma.conversation.groupBy({
      by: ["customerId"],
      where: { needsAttention: true, status: "open", attentionAt: { lt: new Date(now.getTime() - DAY) } },
      _count: true,
      _min: { attentionAt: true },
    }),
    prisma.lead.groupBy({
      by: ["customerId"],
      where: {
        firstContactAt: null,
        status: null,
        createdAt: { gte: new Date(now.getTime() - 14 * DAY), lt: new Date(now.getTime() - 2 * DAY) },
        customer: { archived: false, users: { some: { role: "BUYER" } } },
      },
      _count: true,
      _min: { createdAt: true },
    }),
    prisma.poolLead.findMany({ where: { status: "parked" }, orderBy: { createdAt: "asc" }, select: { createdAt: true, productKey: true } }),
    prisma.lead.findMany({
      where: { stornoState: "review" },
      orderBy: { stornoRequestedAt: "asc" },
      select: { id: true, name: true, stornoReason: true, stornoNote: true, stornoRequestedAt: true, customer: { select: { name: true } } },
    }),
    prisma.leadOrder.findMany({
      where: { status: "failed", periodEnd: { gte: now } },
      select: { id: true, amount: true, updatedAt: true, subscription: { select: { customer: { select: { id: true, name: true } } } } },
    }),
    prisma.unassignedLead.groupBy({ by: ["formId"], where: { resolvedAt: null }, _count: true, _min: { createdAt: true } }),
    prisma.systemHeartbeat.findMany(),
    prisma.usageEvent.count({ where: { type: "help", at: { gte: week }, meta: { path: ["rating"], equals: "down" } } }),
    prisma.usageEvent.findMany({ where: { type: "feedback", preview: false, at: { gte: new Date(now.getTime() - 3 * DAY) } }, select: { at: true }, orderBy: { at: "asc" } }),
    // Hilfe-Chat: Kunde hat unser Team kontaktiert (WhatsApp/E-Mail/Rückmeldung)
    prisma.usageEvent.findMany({
      where: { type: "support", name: "contacted", preview: false, at: { gte: new Date(now.getTime() - 3 * DAY) } },
      orderBy: { at: "asc" },
      take: 10,
      select: { id: true, at: true, customerId: true, meta: true },
    }),
  ]);

  const items: HeuteItem[] = [];

  // ── System ─────────────────────────────────────────────
  for (const key of ["cron", "sync"] as const) {
    const problem = heartbeatProblem(key, heartbeats.find((h) => h.key === key), now);
    if (problem) {
      items.push({
        key: `hb:${key}`,
        area: "System",
        tone: "bad",
        icon: "alert",
        title: key === "cron" ? "Hintergrund-Jobs laufen nicht" : "Abgleich der Werbedaten hängt",
        detail: `${problem.replace(/\.$/, "")} · ohne ${key === "cron" ? "diesen Job gehen Erinnerungen, Nachfassen und Mails nicht raus" : "Abgleich fehlen aktuelle Kosten und Leads"}.`,
        action: { label: "Status ansehen", href: "/api/status" },
        since: heartbeats.find((h) => h.key === key)?.at,
        later: TOMORROW,
      });
    }
  }

  // Bank & Karten: neue Ausgaben ohne Zuordnung (fehlen sonst in Marge/Kosten)
  const bankOpen = await prisma.bankTransaction.count({ where: { status: "neu" } }).catch(() => 0);
  if (bankOpen > 0) {
    items.push({
      key: "bank:open",
      area: "System",
      tone: "info",
      icon: "euro",
      title: `${bankOpen} ${bankOpen === 1 ? "Ausgabe" : "Ausgaben"} zuordnen`,
      detail: "Aus Konto oder Kreditkarte · ohne Zuordnung fehlen sie in Marge und Kosten",
      action: { label: "Zuordnen", href: "/admin/einstellungen/bank/zuordnen" },
      later: { label: "Später", days: 3 },
    });
  }

  // ── Kunden ─────────────────────────────────────────────
  for (const c of overdueCustomers) {
    const since = c.paymentOverdueSince!;
    items.push({
      key: `pay:${c.id}`,
      area: "Kunden",
      tone: "bad",
      icon: "euro",
      title: `${name(c.name)} zahlt nicht`,
      detail: `Rechnung offen ${sinceText(since, now)}${c.pauses.length ? " · Anzeigen automatisch gestoppt, starten nach Zahlung wieder" : ""}`,
      action: { label: "Zur Abrechnung", href: `/admin/kunden/${c.id}/abrechnung` },
      since,
      later: TOMORROW,
    });
  }
  for (const o of failedOrders) {
    const c = o.subscription.customer;
    items.push({
      key: `order:${o.id}`,
      area: "Pay-per-Lead",
      tone: "bad",
      icon: "euro",
      title: `Lastschrift fehlgeschlagen: ${name(c.name)}`,
      detail: `Bestellung über ${eur(Number(o.amount))} · ohne Zahlung bekommt der Käufer keine Leads`,
      action: { label: "Öffnen", href: `/admin/kunden/${c.id}/abrechnung` },
      since: o.updatedAt,
      later: TOMORROW,
    });
  }
  // Garantiefälle (täglicher Cron, lib/garantien-server.ts): Anspruch → Gewähren/Ablehnen,
  // Bedingungen fehlen → Hinweis (Ablehnen mit vorgeschlagener Begründung oder Kulanz)
  for (const f of await offeneGarantieFaelle().catch(() => [])) {
    const kz = f.kennzahlen as Kennzahlen & { fehlend?: string[] };
    const fehlend = kz.fehlend ?? [];
    const betrag = f.betrag ?? kz.betrag ?? 0;
    const gutschrift = betrag > 0 ? `Gutschrift ${eur(betrag)} netto auf die nächste Rechnung` : "kein Betrag gutzuschreiben";
    items.push(
      kz.status === "bedingungen_fehlen"
        ? {
            key: `garantie:${f.id}`,
            area: "Kunden",
            tone: "info",
            icon: "alert",
            title: `Garantie ${name(f.kunde)}: ${GARANTIE_LABEL[f.art]} verfehlt, Bedingungen fehlen`,
            detail: `${fehlend.join(" · ")} · ohne Anspruch, ${monatName(f.monat)} nur aus Kulanz kostenlos`,
            action: { label: "Kundenakte", href: `/admin/kunden/${f.customerId}` },
            since: f.createdAt,
            quick: { kind: "garantie", fallId: f.id, grundVorschlag: `Bedingungen nicht erfüllt: ${fehlend.join("; ")}`.slice(0, 500) },
          }
        : {
            key: `garantie:${f.id}`,
            area: "Kunden",
            tone: "warn",
            icon: "euro",
            title: heuteTitel(name(f.kunde), f.art, kz),
            detail: `Alle Bedingungen erfüllt · ${gutschrift}`,
            action: { label: "Kundenakte", href: `/admin/kunden/${f.customerId}` },
            since: f.createdAt,
            quick: { kind: "garantie", fallId: f.id, grundVorschlag: "" },
          },
    );
  }
  // Bestandskunden-Modul vom Kunden angefragt (Konto oder Bereich „Bestand“)
  const moduleRequests = await prisma.customer.findMany({
    where: { archived: false, existingCustomersEnabled: false, bestandRequestedAt: { not: null } },
    select: { id: true, name: true, bestandRequestedAt: true },
    orderBy: { bestandRequestedAt: "asc" },
  });
  for (const c of moduleRequests) {
    items.push({
      key: `modul:${c.id}`,
      area: "Kunden",
      tone: "warn",
      icon: "star",
      title: `${name(c.name)} möchte das Bestandskunden-Modul`,
      detail: `Angefragt ${agoText(c.bestandRequestedAt!, now)} · kurz anrufen, dann unter „Abrechnung“ buchen`,
      action: { label: "Zur Abrechnung", href: `/admin/kunden/${c.id}/abrechnung` },
      since: c.bestandRequestedAt,
      later: TOMORROW,
    });
  }
  const progress = await onboardingProgressFor(onboardings.map((o) => o.customerId));
  for (const ob of onboardings) {
    const p = progress.get(ob.customerId);
    if (!p || p.live || p.waitingYou === 0) continue;
    const start = ob.startDate ? ` · Start ${ob.startDate.toLocaleDateString("de-DE", { day: "numeric", month: "numeric" })}` : "";
    items.push({
      key: `ob:${ob.customerId}`,
      area: "Kunden",
      tone: ob.startDate && ob.startDate.getTime() - now.getTime() < 3 * DAY ? "bad" : "warn",
      icon: "check",
      title: `Onboarding ${name(ob.customer.name)}: ${plural(p.waitingYou, "Schritt wartet", "Schritte warten")} auf Sie`,
      detail: `${p.percent} % erledigt${start}`,
      action: { label: "Checkliste öffnen", href: `/admin/kunden/${ob.customerId}` },
      since: ob.startDate,
      later: TOMORROW,
    });
  }
  // Selbst-Einrichtung hängt seit mindestens 7 Tagen beim Kunden (vorher erinnert die App selbst, Tag 1/3/7)
  for (const st of await stuckSetups(now).catch(() => [])) {
    items.push({
      key: `setup-stuck:${st.customerId}`,
      area: "Kunden",
      tone: "warn",
      icon: "alert",
      title: `Einrichtung hängt: ${name(st.name)} (seit ${st.days} Tagen)`,
      detail: `Offen beim Kunden: ${st.open.join(", ")} · Erinnerungen Tag 1/3/7 sind raus – kurz anrufen oder Hilfetermin anbieten`,
      action: { label: "Einrichtung ansehen", href: `/admin/kunden/${st.customerId}` },
      since: null,
      later: TOMORROW,
    });
  }
  const customerNames = new Map(
    (
      await prisma.customer.findMany({
        where: { id: { in: [...new Set([...attentionChats, ...untouchedLeads].map((r) => r.customerId))] } },
        select: { id: true, name: true },
      })
    ).map((c) => [c.id, c.name]),
  );
  const stale = new Map<string, { chats: number; leads: number; since: Date | null }>();
  for (const r of attentionChats) stale.set(r.customerId, { chats: r._count, leads: 0, since: r._min.attentionAt });
  for (const r of untouchedLeads) {
    const cur = stale.get(r.customerId) ?? { chats: 0, leads: 0, since: null };
    cur.leads = r._count;
    if (r._min.createdAt && (!cur.since || r._min.createdAt < cur.since)) cur.since = r._min.createdAt;
    stale.set(r.customerId, cur);
  }
  for (const [customerId, s] of stale) {
    const parts = [s.chats ? `${plural(s.chats, "Chat wartet", "Chats warten")} über 24 Std. auf Antwort` : "", s.leads ? `${plural(s.leads, "Lead", "Leads")} seit über 2 Tagen ohne Kontakt` : ""].filter(Boolean);
    items.push({
      key: `stale:${customerId}`,
      area: "Kunden",
      tone: "warn",
      icon: "chat",
      title: `${name(customerNames.get(customerId) ?? "Kunde")} reagiert nicht auf Leads`,
      detail: `${parts.join(" · ")} · am besten kurz anrufen oder Hilfetermin anbieten`,
      action: { label: "Kundenakte", href: `/admin/kunden/${customerId}` },
      since: s.since,
      // „Erledigt“ = angerufen/angeschrieben; kommt nach 3 Tagen wieder, falls weiter nichts passiert
      later: { label: "Erledigt", days: 3 },
    });
  }

  // ── Leads / Pay-per-Lead ───────────────────────────────
  if (unassigned.length) {
    const leads = unassigned.reduce((a, r) => a + r._count, 0);
    const oldest = unassigned.reduce<Date | null>((a, r) => (r._min.createdAt && (!a || r._min.createdAt < a) ? r._min.createdAt : a), null);
    items.push({
      key: "forms",
      area: "Leads",
      tone: "bad",
      icon: "form",
      title: unassigned.length === 1 ? "Formular ohne Zuordnung" : `${unassigned.length} Formulare ohne Zuordnung`,
      detail: `${plural(leads, "Lead wartet", "Leads warten")} im Posteingang, bis das Formular einem Kunden zugeordnet ist`,
      action: { label: "Zuordnen", href: "/admin/lead-eingang" },
      since: oldest,
      later: TOMORROW,
    });
  }
  if (parked.length) {
    const products = [...new Set(parked.map((p) => p.productKey))].slice(0, 3).join(", ");
    items.push({
      key: "parked",
      area: "Pay-per-Lead",
      tone: "bad",
      icon: "inbox",
      title: parked.length === 1 ? "1 Lead geparkt" : `${parked.length} Leads geparkt`,
      detail: `${products} · kein Käufer mit freiem Kontingent. Ausliefern oder verwerfen.`,
      action: { label: "Ansehen", href: "/admin/ppl?ansicht=geparkt" },
      since: parked[0]?.createdAt,
      later: TOMORROW,
    });
  }
  for (const l of stornoReview.slice(0, STORNO_SINGLE)) {
    const reason = (l.stornoReason ?? "").replace(/^ppl:/, "") || "ohne Grund";
    items.push({
      key: `storno:${l.id}`,
      area: "Pay-per-Lead",
      tone: "warn",
      icon: "undo",
      title: `Reklamation prüfen: ${name(l.customer.name)}`,
      detail: `${l.name ?? "Lead"} · Grund „${reason}“${l.stornoNote ? ` · ${l.stornoNote.slice(0, 100)}` : ""}`,
      action: { label: "Details", href: "/admin/ppl?ansicht=storno" },
      since: l.stornoRequestedAt,
      quick: { kind: "storno", leadId: l.id },
    });
  }
  if (stornoReview.length > STORNO_SINGLE) {
    const rest = stornoReview.slice(STORNO_SINGLE);
    items.push({
      key: "storno",
      area: "Pay-per-Lead",
      tone: "warn",
      icon: "undo",
      title: `${rest.length} weitere ${rest.length === 1 ? "Reklamation" : "Reklamationen"} prüfen`,
      detail: `${[...new Set(rest.map((l) => name(l.customer.name)))].slice(0, 3).join(", ")} · Grund „Sonstiges“ oder hohe Quote, deshalb nicht automatisch anerkannt`,
      action: { label: "Prüfen", href: "/admin/ppl?ansicht=storno" },
      since: rest[0]?.stornoRequestedAt,
    });
  }

  // ── Vertrieb ───────────────────────────────────────────
  for (const m of meetings) {
    items.push({
      key: `meet:${m.id}`,
      area: "Vertrieb",
      tone: "warn",
      icon: "calendar",
      title: `Termin ${m.startAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })} mit ${shortName(m.contact.name)}`,
      detail: m.title,
      action: { label: "Öffnen", href: `/admin/vertrieb/kontakte/${m.contact.id}` },
      since: m.startAt,
    });
  }
  const overdue = tasks.filter((t) => t.dueAt < start);
  const shown = tasks.slice(0, 6);
  for (const t of shown) {
    const late = t.dueAt < start;
    items.push({
      key: `task:${t.id}`,
      area: "Vertrieb",
      tone: late ? "warn" : "info",
      icon: t.type === "ANRUF" ? "phone" : "task",
      title: t.contact && !t.title.includes(shortName(t.contact.name)) && !t.title.includes(t.contact.name) ? `${t.title}: ${shortName(t.contact.name)}` : t.title,
      detail: `${late ? `Überfällig ${sinceText(t.dueAt, now)}` : "Heute fällig"}${t.note ? ` · ${t.note.slice(0, 120)}` : ""}`,
      action: t.contact ? { label: t.type === "ANRUF" ? "Anrufen" : "Öffnen", href: `/admin/vertrieb/kontakte/${t.contact.id}` } : { label: "Öffnen", href: "/admin/vertrieb/aufgaben" },
      since: t.dueAt,
      quick: isTerminReview(t.title) ? { kind: "termin", taskId: t.id } : { kind: "task", taskId: t.id },
    });
  }
  if (tasks.length > shown.length) {
    items.push({
      key: "tasks:more",
      area: "Vertrieb",
      tone: "info",
      icon: "task",
      title: `${tasks.length - shown.length} weitere Aufgaben heute`,
      detail: overdue.length ? `${overdue.length} insgesamt überfällig` : "Alle Aufgaben in einer Liste",
      action: { label: "Alle Aufgaben", href: "/admin/vertrieb/aufgaben" },
    });
  }
  for (const o of staleOffers) {
    items.push({
      key: `offer:${o.id}`,
      area: "Vertrieb",
      tone: "info",
      icon: "offer",
      title: `Angebot nachfassen: ${o.company ?? o.contactName}`,
      detail: `Gesendet ${o.sentAt ? agoText(o.sentAt, now) : ""} · ${o.viewedAt ? "angesehen, noch nicht angenommen" : "noch nicht geöffnet"} · ${eur(Number(o.monthlyFee))}/Monat`,
      action: { label: "Öffnen", href: o.salesContactId ? `/admin/vertrieb/kontakte/${o.salesContactId}` : "/admin/vertrieb/kontakte" },
      since: o.sentAt,
      ...(o.salesContactId ? { quick: { kind: "offer" as const, offerId: o.id, contactId: o.salesContactId } } : { later: { label: "Nachgefasst", days: 5 } }),
    });
  }

  // ── Hilfe-Anfragen an das Team ────────────────────────
  if (supportRequests.length) {
    const names = new Map(
      (await prisma.customer.findMany({ where: { id: { in: [...new Set(supportRequests.map((r) => r.customerId))] } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]),
    );
    for (const r of supportRequests) {
      const m = (r.meta ?? {}) as { ref?: string; reason?: string; summary?: string; channel?: string };
      items.push({
        key: `support:${r.id}`,
        area: "Kunden",
        tone: "warn",
        icon: "chat",
        title: `Hilfe-Anfrage ${m.ref ?? ""}${m.reason ? `: ${REASON_LABEL[m.reason as EscalationReason] ?? ""}` : ""}`.trim(),
        detail: `${names.get(r.customerId) ?? "Kunde"} ${m.channel === "whatsapp" ? "schreibt per WhatsApp" : m.channel === "email" ? "schreibt per E-Mail" : "bittet um Rückmeldung"} · ${m.summary ?? ""}`,
        action: { label: "Kunde öffnen", href: `/admin/kunden/${r.customerId}` },
        since: r.at,
        later: { label: "Erledigt", days: 30 },
      });
    }
  }

  // ── Rückmeldungen ─────────────────────────────────────
  if (feedback.length || helpDown) {
    items.push({
      // Neue Rückmeldungen ändern den Schlüssel → „Gelesen“ gilt nur für das Gesehene
      key: `feedback:${feedback.at(-1)?.at.getTime() ?? 0}-${helpDown}`,
      area: "Kunden",
      tone: "info",
      icon: "star",
      title: [feedback.length ? plural(feedback.length, "neue Rückmeldung", "neue Rückmeldungen") : "", helpDown ? `${plural(helpDown, "KI-Antwort", "KI-Antworten")} schlecht bewertet` : ""].filter(Boolean).join(" · "),
      detail: "Was Vertreter suchen oder nicht verstehen, steht unter Nutzung",
      action: { label: "Ansehen", href: "/admin/nutzung" },
      since: feedback[0]?.at,
      later: { label: "Gelesen", days: 30 },
    });
  }

  const dismissed = userId ? await activeDismissals(userId, now) : [];
  return { items: rankItems(withoutDismissed(items, dismissed)), auto: await loadAuto(now) };
}

/** Schlüssel, die dieser Admin gerade ausgeblendet hat. */
export async function activeDismissals(userId: string, now = new Date()): Promise<string[]> {
  const rows = await prisma.adminDismissal.findMany({ where: { userId, until: { gt: now } }, select: { key: true } });
  return rows.map((r) => r.key);
}

/** „Läuft von allein“: was die App in den letzten 7 Tagen ohne Zutun erledigt hat. */
async function loadAuto(now: Date): Promise<AutoRow[]> {
  const week = new Date(now.getTime() - 7 * DAY);
  const [newLeads, firstContacts, delivered, declines, sequences, dunningPauses, customerPauses, welcomes, reminders, autoStorno] = await Promise.all([
    prisma.lead.count({ where: { createdAt: { gte: week } } }),
    prisma.message.count({ where: { sentBy: "bot", direction: "outbound", createdAt: { gte: week } } }),
    prisma.poolLead.count({ where: { status: "delivered", deliveredAt: { gte: week } } }),
    prisma.salesActivity.count({ where: { type: "NOTIZ", occurredAt: { gte: week }, note: { startsWith: "Automatisch auf „Verloren“" } } }),
    prisma.leadSequence.count({ where: { stoppedAt: null } }),
    prisma.customerPause.findMany({ where: { status: "active", kind: "dunning" }, select: { customer: { select: { name: true } } } }),
    prisma.customerPause.count({ where: { status: "active", kind: "customer" } }),
    prisma.onboarding.count({ where: { welcomeSentAt: { gte: week } } }),
    prisma.onboarding.count({ where: { lastReminderAt: { gte: week } } }),
    prisma.lead.count({ where: { stornoState: "approved", stornoDecidedAt: { gte: week } } }),
  ]);
  const rows: AutoRow[] = [
    { key: "leads", icon: "inbox", title: `${plural(newLeads, "Lead", "Leads")} eingegangen und zugestellt`, detail: "Aus Meta-Formularen und Pay-per-Lead, Dubletten automatisch aussortiert", count: newLeads },
    { key: "bot", icon: "chat", title: `${plural(firstContacts, "Nachricht", "Nachrichten")} vom WhatsApp-Assistenten`, detail: "Erstkontakt, Qualifizierung und Terminbuchung ohne Zutun der Vertreter", count: firstContacts },
    { key: "ppl", icon: "inbox", title: `${plural(delivered, "Pay-per-Lead-Lead", "Pay-per-Lead-Leads")} verteilt`, detail: "Nach Kontingent an Käufer mit bezahlter Bestellung", count: delivered },
    { key: "storno", icon: "undo", title: `${plural(autoStorno, "Reklamation", "Reklamationen")} anerkannt`, detail: "Gelistete Gründe bei niedriger Quote, Gutschrift auf die nächste Bestellung", count: autoStorno },
    { key: "seq", icon: "phone", title: `${plural(sequences, "Nachfass-Abfolge läuft", "Nachfass-Abfolgen laufen")}`, detail: "Nicht erreicht, Angebot offen, nicht erschienen: die App fasst selbst nach", count: sequences },
    { key: "decline", icon: "check", title: `${plural(declines, "Absage", "Absagen")} per Mail erkannt`, detail: "Kontakt automatisch auf Verloren, keine Aufgabe angelegt", count: declines },
    {
      key: "dunning",
      icon: "euro",
      title: `Anzeigen gestoppt bei ${plural(dunningPauses.length, "Kunde", "Kunden")}`,
      detail: `${dunningPauses.map((p) => name(p.customer.name)).slice(0, 3).join(", ")} · Zahlung über 30 Tage offen, nach Zahlung starten sie automatisch wieder`,
      count: dunningPauses.length,
    },
    { key: "pause", icon: "calendar", title: `${plural(customerPauses, "Kunde", "Kunden")} in Pause oder Urlaub`, detail: "Anzeigen und Abrechnung laufen danach automatisch weiter", count: customerPauses },
    { key: "onb", icon: "check", title: `${[welcomes ? plural(welcomes, "Willkommens-Mail", "Willkommens-Mails") : "", reminders ? plural(reminders, "Onboarding-Erinnerung", "Onboarding-Erinnerungen") : ""].filter(Boolean).join(" und ")} verschickt`, detail: "Onboarding startet nach Annahme des Angebots von selbst", count: welcomes + reminders },
  ];
  return rows.filter((r) => r.count > 0);
}

/** Schnelle Zahlen für die Navigation (ohne die ganze Heute-Liste zu laden). */
export async function loadAdminNavCounts(userId?: string): Promise<{ heute: number; vertrieb: number }> {
  const { tomorrow } = dayBounds();
  try {
    const [tasks, parked, storno, forms, overdue, garantien, dismissed] = await Promise.all([
      prisma.salesTask.count({ where: { doneAt: null, dueAt: { lt: tomorrow } } }),
      prisma.poolLead.count({ where: { status: "parked" } }),
      prisma.lead.findMany({ where: { stornoState: "review" }, orderBy: { stornoRequestedAt: "asc" }, select: { id: true } }),
      prisma.unassignedLead.count({ where: { resolvedAt: null } }),
      prisma.customer.findMany({ where: { archived: false, paymentOverdueSince: { not: null } }, select: { id: true } }),
      prisma.garantieFall.findMany({ where: { status: "offen" }, select: { id: true } }),
      userId ? activeDismissals(userId) : Promise.resolve([] as string[]),
    ]);
    const hidden = new Set(dismissed);
    const visible = (key: string) => !hidden.has(key);
    const heute =
      (parked && visible("parked") ? 1 : 0) +
      storno.slice(0, STORNO_SINGLE).filter((l) => visible(`storno:${l.id}`)).length +
      (storno.length > STORNO_SINGLE && visible("storno") ? 1 : 0) +
      (forms && visible("forms") ? 1 : 0) +
      overdue.filter((c) => visible(`pay:${c.id}`)).length +
      garantien.filter((g) => visible(`garantie:${g.id}`)).length;
    return { heute, vertrieb: tasks };
  } catch {
    return { heute: 0, vertrieb: 0 };
  }
}
