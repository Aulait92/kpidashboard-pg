// Eigenes Postfach (Ole, 13.11.2026): state-Signatur, Nachricht für Gmail, Vorlagen.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { buildMime, isMailState, mailState, userFromMailState } from "@/lib/mail/postfach";
import { fuelle, loadVorlagen, STANDARD_VORLAGEN, werteFuer } from "@/lib/mail/vorlagen";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

describe("Postfach", () => {
  const ids: string[] = [];
  beforeAll(() => {
    requireTestDb();
    process.env.AUTH_SECRET ??= "localtestsecret_localtestsecret_0123456789";
  });
  afterAll(async () => {
    for (const id of ids) await cleanupCustomer(id);
  });

  it("state ist an den Login gebunden und nicht fälschbar", () => {
    const s = mailState("user_123");
    expect(isMailState(s)).toBe(true);
    expect(isMailState("cus_abc")).toBe(false);
    expect(userFromMailState(s)).toBe("user_123");
    expect(userFromMailState(s.replace("user_123", "user_999"))).toBeNull();
    expect(userFromMailState("mail:user_123.falsch")).toBeNull();
  });

  it("Nachricht mit Umlauten im Betreff und Anhang", () => {
    const raw = buildMime(
      { email: "info@agentur.de", name: "Agentur Müller" },
      { to: "kunde@example.com", subject: "Ihr Angebot für die Katze", text: "Hallo Jörg,\n\nanbei.", attachments: [{ fileName: "Angebot.pdf", contentType: "application/pdf", data: Buffer.from("%PDF-1.4") }] },
    );
    expect(raw).toContain("From: =?UTF-8?B?");
    expect(raw).toContain("To: kunde@example.com");
    expect(raw).toContain("Subject: Ihr Angebot für die Katze".replace("für", "für").includes("ü") ? "Subject: =?UTF-8?B?" : "Subject:");
    expect(raw).toContain("multipart/mixed");
    expect(raw).toContain('filename="Angebot.pdf"');
    const textB64 = raw.split("Content-Transfer-Encoding: base64\r\n\r\n")[1].split("\r\n--")[0].replace(/\r\n/g, "");
    expect(Buffer.from(textB64, "base64").toString("utf8")).toBe("Hallo Jörg,\n\nanbei.");
  });

  it("Vorlagen: Standard beim ersten Laden, Platzhalter gefüllt", async () => {
    const c = await makeCustomer();
    ids.push(c.id);
    const v = await loadVorlagen(c.id);
    expect(v.map((x) => x.name)).toEqual(STANDARD_VORLAGEN.map((x) => x.name));
    expect((await loadVorlagen(c.id)).length).toBe(STANDARD_VORLAGEN.length); // nicht doppelt
    const w = werteFuer({ name: "Anna Schmitt", source: "TKV-Katze" }, "Susanne Meier");
    expect(fuelle(v[0].body, w)).toContain("Hallo Anna,");
    expect(fuelle(v[0].body, w)).toContain("Susanne Meier");
    expect(fuelle(v[0].subject, w)).toBe("Ihre Anfrage: TKV-Katze");
    await prisma.mailTemplate.deleteMany({ where: { customerId: c.id } });
  });
});
