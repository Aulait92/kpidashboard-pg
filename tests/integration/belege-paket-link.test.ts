// Belegpaket per Download-Link gegen die Datenbank (Ole, 24.11.2026): Nachtrag hält genau die Belege fest, die Mail
// enthält einen gültigen Link, der Abruf liefert ein ZIP mit Belegen und Liste.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mails: { to: string; replyTo: string | null; subject: string; text: string; attachments?: { filename: string }[] }[] = [];
vi.mock("@/lib/email", () => ({
  getAppUrl: () => "https://app.test",
  sendPlainMail: async (m: (typeof mails)[number]) => {
    mails.push(m);
    return { ok: true };
  },
}));

import { prisma } from "@/lib/prisma";
import { nachtragSenden } from "@/lib/belege/monatspaket";
import { GET } from "@/app/belege/paket/[id]/route";
import { requireTestDb } from "./db";

const tag = Math.random().toString(36).slice(2, 8);
const ids: string[] = [];

describe("Belegpaket mit Download-Link", () => {
  beforeAll(async () => {
    requireTestDb();
    process.env.AUTH_SECRET ||= "test-secret-".padEnd(40, "x");
    for (const i of [1, 2]) {
      const b = await prisma.beleg.create({
        data: { quelle: "upload", typ: "INCOMING_INVOICE", firma: `Paketfirma ${tag}`, nummer: `P-${tag}-${i}`, datum: new Date("2026-03-05T00:00:00Z"), brutto: 10 * i, netto: 10 * i, ustSatz: 0, datei: Buffer.from(`%PDF-test-${i}`), mimeType: "application/pdf" },
      });
      ids.push(b.id);
    }
  });
  afterAll(async () => {
    await prisma.belegPaket.deleteMany({ where: { titel: { contains: tag } } });
    await prisma.beleg.deleteMany({ where: { id: { in: ids } } });
  });

  it("Nachtrag: Mail mit Link, Abruf liefert ZIP, falscher Link nicht", async () => {
    const r = await nachtragSenden(ids, { titel: `Nachtrag ${tag}`, antwortAn: "ole@test.de" });
    expect(r.ok).toBe(true);
    const m = mails.at(-1)!;
    expect(m.replyTo).toBe("ole@test.de");
    expect(m.attachments?.map((a) => a.filename)).toEqual(["belege.csv", "ust-vorschau.txt"]);
    const link = m.text.match(/https:\/\/app\.test(\/belege\/paket\/\S+)/)![1];
    const paket = await prisma.belegPaket.findFirstOrThrow({ where: { titel: `Nachtrag ${tag}` } });
    expect(paket.belegIds.sort()).toEqual([...ids].sort());
    expect(paket.gesendetAm).not.toBeNull();
    const ok = await GET(new Request(`https://app.test${link}`), { params: Promise.resolve({ id: paket.id }) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Content-Type")).toBe("application/zip");
    const zip = Buffer.from(await ok.arrayBuffer());
    expect(zip.subarray(0, 2).toString()).toBe("PK");
    expect(zip.toString("latin1")).toContain("belege.csv");
    const falsch = await GET(new Request(`https://app.test${link.replace(/t=[^&]+/, "t=falsch")}`), { params: Promise.resolve({ id: paket.id }) });
    expect(falsch.status).toBe(403);
  });
});
