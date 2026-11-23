import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getRedirectUrl } from "next/experimental/testing/server";
import { middleware } from "@/middleware";
import { signSession } from "@/lib/auth";

// Ole, 23.11.2026: Das Einwand-Merkblatt (public/anleitung) war für angemeldete Vermittler nicht abrufbar, die
// Rollenweiche leitete auf /buyer um. Gilt auch für die Bilder der WhatsApp-Anleitung.

const SECRET = "localtestsecret_localtestsecret_0123456789";
const saved = { ...process.env };

async function req(path: string) {
  const token = await signSession({ userId: "u1", email: "v@test.local", role: "BUYER", customerId: "c1", sv: 0 } as never);
  const headers = new Headers({ host: "app.performancegrowth.de", cookie: `kpi_session=${token}`, "x-real-ip": "203.0.113.9" });
  return new NextRequest(`http://localhost:8080${path}`, { headers });
}

beforeEach(() => {
  process.env.AUTH_SECRET = SECRET;
  delete process.env.PUBLIC_BOOKING_URL;
  delete process.env.LEGACY_HOSTS;
});
afterEach(() => {
  for (const k of ["AUTH_SECRET", "PUBLIC_BOOKING_URL", "LEGACY_HOSTS"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("Middleware: Anleitungen für Vermittler", () => {
  it("Merkblatt und WhatsApp-Anleitung ohne Umleitung", async () => {
    for (const p of ["/anleitung/einwand-merkblatt.pdf", "/anleitung/whatsapp/01-einladung.webp"]) {
      expect(getRedirectUrl(await middleware(await req(p))), p).toBeNull();
    }
  });
  it("andere Bereiche weiter auf /buyer", async () => {
    expect(new URL(getRedirectUrl(await middleware(await req("/admin")))!).pathname).not.toBe("/admin");
    expect(new URL(getRedirectUrl(await middleware(await req("/videos-intern")))!).pathname).toBe("/buyer");
  });
});
