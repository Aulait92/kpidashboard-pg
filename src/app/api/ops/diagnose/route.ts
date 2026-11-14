import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

// Diagnose-API (Ole, 14.11.2026): feste, nur lesende Abfragen für die Fehlersuche in Produktion,
// damit Claude Zustände prüfen kann, ohne Datenbank-Zugang. Kein freies SQL, keine Geheimnisse,
// Lead-Daten nur so weit nötig (Name statt Telefon/E-Mail).
// Absicherung: eigener Lese-Schlüssel OPS_READ_TOKEN (≥ 32 Zeichen) als Bearer-Token.
//   GET /api/ops/diagnose?q=uebersicht|stripe|followups|vorlagen|demo|kunden|whatsapp|gedankenstriche
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const expected = (process.env.OPS_READ_TOKEN ?? "").trim();
  if (expected.length < 32) return false;
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const keyMode = (k: string | undefined) => {
  const v = (k ?? "").trim();
  if (!v) return "fehlt";
  if (/^(sk|rk)_live_/.test(v)) return "live";
  if (/^(sk|rk)_test_/.test(v)) return "test";
  return "unbekannt";
};

async function stripe() {
  const [kunden, mitStripe] = await Promise.all([
    prisma.customer.count({ where: { archived: false } }),
    prisma.customer.count({ where: { archived: false, stripeCustomerId: { not: null } } }),
  ]);
  return {
    schluessel: keyMode(process.env.STRIPE_SECRET_KEY),
    webhookSignatur: process.env.STRIPE_WEBHOOK_SECRET ? "gesetzt" : "fehlt",
    kunden,
    kundenMitStripeId: mitStripe,
  };
}

async function followups() {
  const rows = await prisma.salesFollowup.findMany({
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      step: true,
      nextAt: true,
      mail1SentAt: true,
      lastError: true,
      source: true,
      timing: true,
      updatedAt: true,
      contact: { select: { id: true, name: true, stage: true } },
    },
  });
  return { anzahl: rows.length, autoSync: process.env.INSTANTLY_AUTO_SYNC === "1", instantlyKey: !!process.env.INSTANTLY_API_KEY, rows };
}

async function vorlagen() {
  const rows = await prisma.messageTemplate.findMany({
    orderBy: [{ customerId: "asc" }, { purpose: "asc" }],
    select: { customerId: true, purpose: true, name: true, status: true, updatedAt: true, customer: { select: { name: true, leadAddress: true } } },
  });
  return { anzahl: rows.length, rows };
}

async function demo() {
  const u = await prisma.user.findUnique({
    where: { email: "google-review-demo@performancegrowth.de" },
    select: { id: true, role: true, teamRole: true, customerId: true, lastLoginAt: true, customer: { select: { id: true, name: true, plan: true } } },
  });
  const c = await prisma.customer.findUnique({ where: { id: "cust_google_review_demo" }, select: { id: true, name: true, plan: true, newUi: true } });
  const leads = await prisma.lead.count({ where: { customerId: "cust_google_review_demo" } });
  const kalender = await prisma.calendarConnection.findUnique({ where: { customerId: "cust_google_review_demo" }, select: { status: true, provider: true, bookingSlug: true } });
  return { login: u, kunde: c, leads, kalender };
}

/** WhatsApp-Nummern und wo sie angebunden sind (ohne Schlüssel) */
async function whatsapp() {
  const rows = await prisma.whatsAppAccount.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      phoneNumber: true,
      displayName: true,
      provider: true,
      status: true,
      phoneNumberId: true,
      updatedAt: true,
      customer: { select: { id: true, name: true } },
      _count: { select: { conversations: true } },
    },
  });
  const last = await prisma.conversation.groupBy({ by: ["whatsAppAccountId"], _max: { lastMessageAt: true } });
  return { anzahl: rows.length, rows, letzteNachricht: last };
}

/** Gespeicherte Texte mit Gedankenstrichen (Regel AGENTS.md): nur Anzahlen und Namen, keine Inhalte */
async function gedankenstriche() {
  const has = { contains: "–" } as const;
  const has2 = { contains: "—" } as const;
  const [neuigkeiten, vorlagen, signaturen, whatsapp] = await Promise.all([
    prisma.productUpdate.count({ where: { OR: [{ title: has }, { body: has }, { title: has2 }, { body: has2 }] } }),
    prisma.mailTemplate.count({ where: { OR: [{ subject: has }, { body: has }, { subject: has2 }, { body: has2 }] } }),
    prisma.user.count({ where: { OR: [{ mailSignature: has }, { mailSignature: has2 }] } }),
    prisma.messageTemplate.findMany({ where: { OR: [{ body: has }, { body: has2 }] }, select: { name: true, status: true, customer: { select: { name: true } } } }),
  ]);
  return { neuigkeiten, vorlagen, signaturen, whatsappVorlagen: whatsapp };
}

async function kunden() {
  return prisma.customer.findMany({
    where: { archived: false },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      plan: true,
      newUi: true,
      leadAddress: true,
      seatsIncluded: true,
      seatsBilled: true,
      existingCustomersEnabled: true,
      empfehlungEnabled: true,
      createdAt: true,
      _count: { select: { leads: true, users: true } },
    },
  });
}

async function uebersicht() {
  const [kundenAnz, leads, vertraege, logins, followupsAnz, vorlagenAnz] = await Promise.all([
    prisma.customer.count({ where: { archived: false } }),
    prisma.lead.count(),
    prisma.leadContract.count(),
    prisma.user.count(),
    prisma.salesFollowup.count(),
    prisma.messageTemplate.count(),
  ]);
  return { kunden: kundenAnz, leads, vertraege, logins, followups: followupsAnz, vorlagen: vorlagenAnz, abfragen: Object.keys(QUERIES) };
}

const QUERIES: Record<string, () => Promise<unknown>> = { uebersicht, stripe, followups, vorlagen, demo, kunden, whatsapp, gedankenstriche };

export async function GET(req: Request): Promise<Response> {
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") ?? "uebersicht";
  const fn = QUERIES[q];
  if (!fn) return Response.json({ error: "Unbekannte Abfrage", abfragen: Object.keys(QUERIES) }, { status: 400 });
  try {
    return Response.json({ q, at: new Date().toISOString(), data: await fn() });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Fehler" }, { status: 500 });
  }
}
