// Geschützter Upload der Vertriebsunterlagen (Ole, 15.11.2026): nur mit eigenem Upload-Schlüssel,
// nur Präsentationen, Lese-Schlüssel der Diagnose reicht nicht, Upload wird protokolliert.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/ops/unterlagen/route";
import { prisma } from "@/lib/prisma";
import { requireTestDb } from "./db";

const TOKEN = "test-upload-token-0123456789-0123456789-xyz";
const PDF = new TextEncoder().encode("%PDF-1.4\n% Testdatei\n%%EOF\n");
const post = (q: string, body: Uint8Array, headers: Record<string, string> = {}) =>
  POST(new Request(`https://app.test/api/ops/unterlagen?${q}`, { method: "POST", body, headers: { "x-file-name": "Test-Vertreter.pdf", ...headers } }));

describe("Ops-Upload Vertriebsunterlagen", () => {
  const before = { up: process.env.OPS_UPLOAD_TOKEN, read: process.env.OPS_READ_TOKEN };
  let saved: Awaited<ReturnType<typeof prisma.salesPresentation.findUnique>> = null;
  beforeAll(async () => {
    requireTestDb();
    saved = await prisma.salesPresentation.findUnique({ where: { audience_format: { audience: "vertreter", format: "pdf" } } });
    process.env.OPS_UPLOAD_TOKEN = TOKEN;
    process.env.OPS_READ_TOKEN = "test-read-token-0123456789-0123456789-abcdef";
  });
  afterAll(async () => {
    process.env.OPS_UPLOAD_TOKEN = before.up;
    process.env.OPS_READ_TOKEN = before.read;
    await prisma.salesPresentation.deleteMany({ where: { audience: "vertreter", format: "pdf" } });
    if (saved) await prisma.salesPresentation.create({ data: saved });
  });

  it("ohne, mit falschem oder mit dem Lese-Schlüssel: 403", async () => {
    expect((await post("audience=vertreter&format=pdf", PDF)).status).toBe(403);
    expect((await post("audience=vertreter&format=pdf", PDF, { "x-ops-upload-token": "falsch" })).status).toBe(403);
    expect((await post("audience=vertreter&format=pdf", PDF, { "x-ops-upload-token": process.env.OPS_READ_TOKEN! })).status).toBe(403);
    expect((await post("audience=vertreter&format=pdf", PDF, { authorization: `Bearer ${TOKEN}` })).status).toBe(403);
  });

  it("ohne gesetzten oder mit zu kurzem Schlüssel ist der Upload aus", async () => {
    process.env.OPS_UPLOAD_TOKEN = "kurz";
    expect((await post("audience=vertreter&format=pdf", PDF, { "x-ops-upload-token": "kurz" })).status).toBe(403);
    process.env.OPS_UPLOAD_TOKEN = TOKEN;
  });

  it("lädt eine PDF hoch, prüft Format und Auswahl, protokolliert", async () => {
    const h = { "x-ops-upload-token": TOKEN };
    expect((await post("audience=kunde&format=pdf", PDF, h)).status).toBe(400);
    expect((await post("audience=vertreter&format=pdf", new TextEncoder().encode("keine pdf"), h)).status).toBe(400);
    const r = await post("audience=vertreter&format=pdf", PDF, h);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, audience: "vertreter", format: "pdf", fileName: "Test-Vertreter.pdf" });
    const row = await prisma.salesPresentation.findUniqueOrThrow({ where: { audience_format: { audience: "vertreter", format: "pdf" } } });
    expect(row.fileName).toBe("Test-Vertreter.pdf");
    expect(row.size).toBe(PDF.length);
    expect(await prisma.auditLog.count({ where: { action: "presentation.upload", entityId: "vertreter:pdf" } })).toBeGreaterThan(0);

    const list = await GET(new Request("https://app.test/api/ops/unterlagen", { headers: h }));
    const j = (await list.json()) as { slots: { audience: string; format: string; fileName: string | null }[] };
    expect(j.slots).toHaveLength(4);
    expect(j.slots.find((s) => s.audience === "vertreter" && s.format === "pdf")?.fileName).toBe("Test-Vertreter.pdf");
    expect((await GET(new Request("https://app.test/api/ops/unterlagen"))).status).toBe(403);
  });
});
