import crypto from "node:crypto";
import { hashPassword, issuePasswordResetToken } from "@/lib/auth";
import { buildResetUrl, sendBuyerInviteEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

// Betriebs-API: Buyer-Logins (Kunden-CRM) anlegen — ohne Admin-Session.
// Absicherung: Bearer-Token = ADMIN_API_TOKEN (≥ 32 Zeichen, konstante
// Laufzeit beim Vergleich). Fehlt die Variable, ist der Endpunkt komplett aus.
// Bewusst minimal: nur Kunden auflisten + Buyer anlegen. Kein Passwort im
// Request/Response — der neue Buyer bekommt eine Einladungsmail und legt sein
// Passwort selbst fest (Link 7 Tage gültig).
//
//   GET  /api/ops/buyers?q=<name>          → Kunden + vorhandene Buyer-Logins
//   POST /api/ops/buyers {email, customerId} → Login anlegen + Einladung senden
export const dynamic = "force-dynamic";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function authorized(req: Request): boolean {
  const expected = process.env.ADMIN_API_TOKEN ?? "";
  if (expected.length < 32) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

export async function GET(req: Request): Promise<Response> {
  if (!authorized(req)) return unauthorized();
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  const customers = await prisma.customer.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : {},
    orderBy: { name: "asc" },
    take: 50,
    select: {
      id: true,
      name: true,
      users: { where: { role: "BUYER" }, select: { email: true, lastLoginAt: true } },
    },
  });
  return Response.json({ customers });
}

export async function POST(req: Request): Promise<Response> {
  if (!authorized(req)) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as {
    email?: unknown;
    customerId?: unknown;
  };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const customerId = typeof body.customerId === "string" ? body.customerId : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !customerId) {
    return Response.json(
      { error: "email (gültig) und customerId sind Pflicht." },
      { status: 400 },
    );
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true },
  });
  if (!customer) return Response.json({ error: "Kunde existiert nicht." }, { status: 404 });

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return Response.json({ error: "E-Mail ist bereits vergeben." }, { status: 409 });
  }

  // Zufallspasswort, das niemand kennt — der Buyer setzt sein eigenes über
  // den Einladungslink.
  await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(crypto.randomBytes(32).toString("base64url")),
      role: "BUYER",
      customerId: customer.id,
    },
  });
  console.log(`[ops] Buyer-Login angelegt: ${email} → ${customer.name}`);

  const issued = await issuePasswordResetToken(email, INVITE_TTL_MS);
  const mail = issued
    ? await sendBuyerInviteEmail({
        to: email,
        customerName: customer.name,
        setPasswordUrl: buildResetUrl(issued.rawToken),
      })
    : { ok: false as const, error: "Token konnte nicht erstellt werden." };

  return Response.json({
    ok: true,
    email,
    customer: customer.name,
    inviteSent: mail.ok,
    ...(mail.ok ? {} : { inviteError: mail.error }),
  });
}
