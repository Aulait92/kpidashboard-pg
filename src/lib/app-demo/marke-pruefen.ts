// Synchrone Prüfung des Demo-Kennzeichens (src/lib/app-demo/marke.ts), für die Prisma-Weiche und den Buyer-Kontext.
// Nur auf dem Server (node:crypto).

import { createHmac, timingSafeEqual } from "node:crypto";
import { APP_DEMO_MAX_AGE_MS, markeText } from "./marke";

export function pruefeDemoMarke(wert: string | null | undefined, secret: string | undefined = process.env.AUTH_SECRET, now = Date.now()): boolean {
  if (!wert || !secret || secret.length < 16 || wert.length > 200) return false;
  const m = /^(\d{10,16})\.([0-9a-f]{64})$/.exec(wert);
  if (!m) return false;
  const ts = Number(m[1]);
  if (!Number.isFinite(ts) || ts > now + 60_000 || now - ts > APP_DEMO_MAX_AGE_MS) return false;
  const soll = createHmac("sha256", secret).update(markeText(ts)).digest();
  const ist = Buffer.from(m[2], "hex");
  return ist.length === soll.length && timingSafeEqual(ist, soll);
}
