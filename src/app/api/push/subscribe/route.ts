import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type SubscribeBody = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

export async function POST(req: Request) {
  const userAgent = req.headers.get("user-agent") ?? null;

  let body: SubscribeBody;
  try {
    body = (await req.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON" }, { status: 400 });
  }

  const { endpoint, keys } = body;
  if (!endpoint || !keys?.p256dh || !keys.auth) {
    return NextResponse.json(
      { error: "Subscription unvollständig" },
      { status: 400 },
    );
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent,
    },
    update: {
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent,
      lastUsedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  let body: { endpoint?: string };
  try {
    body = (await req.json()) as { endpoint?: string };
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON" }, { status: 400 });
  }
  if (!body.endpoint) {
    return NextResponse.json({ error: "endpoint fehlt" }, { status: 400 });
  }

  await prisma.pushSubscription.deleteMany({
    where: { endpoint: body.endpoint },
  });

  return NextResponse.json({ ok: true });
}
