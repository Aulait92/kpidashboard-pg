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
    // Standard „Sie“: voller Name in der Anrede, ohne Terminlink fällt der Satz weg, keine Gedankenstriche
    expect(fuelle(v[0].body, w)).toContain("Guten Tag Anna Schmitt,");
    expect(fuelle(v[0].body, w)).not.toContain("{terminlink}");
    expect(fuelle(v[0].body, w)).not.toMatch(/[\u2013\u2014]/);
    expect(fuelle(v[0].body, w)).toContain("Susanne Meier");
    expect(fuelle(v[0].subject, w)).toBe("Ihre Anfrage: TKV-Katze");
    await prisma.mailTemplate.deleteMany({ where: { customerId: c.id } });
  });
});

describe("E-Mail-Signatur", () => {
  it("steht unter dem Text oder an der Stelle von {signatur}", async () => {
    const { fuelleMitSignatur, werteFuer } = await import("@/lib/mail/platzhalter");
    const w = { ...werteFuer({ name: "Eva Pohl", source: "Privatschutz" }, "Jana Becker"), signatur: "Jana Becker\nAgentur Becker\nTel. 0201 123456" };
    expect(fuelleMitSignatur("Hallo {vorname},\n\nanbei.\n\nViele Grüße\n", w)).toBe("Hallo Eva,\n\nanbei.\n\nViele Grüße\n\nJana Becker\nAgentur Becker\nTel. 0201 123456");
    expect(fuelleMitSignatur("Hallo {vorname},\n{signatur}\n\nPS: Danke", w)).toBe("Hallo Eva,\nJana Becker\nAgentur Becker\nTel. 0201 123456\n\nPS: Danke");
    expect(fuelleMitSignatur("Hallo {vorname}", { ...w, signatur: "  " })).toBe("Hallo Eva");
  });

  it("Standardvorlagen enden mit {signatur}; ohne Signatur steht dort „Viele Grüße“ und der eigene Name", async () => {
    const { fuelleMitSignatur, werteFuer } = await import("@/lib/mail/platzhalter");
    const body = STANDARD_VORLAGEN[0].body;
    expect(body.endsWith("\n\n{signatur}")).toBe(true);
    const w = werteFuer({ name: "Eva Pohl", source: "TKV" }, "Jana Becker");
    const mit = fuelleMitSignatur(body, { ...w, signatur: "Herzliche Grüße\nJana Becker\nTel. 0201 123456 $1" });
    expect(mit.endsWith("\n\nHerzliche Grüße\nJana Becker\nTel. 0201 123456 $1")).toBe(true);
    expect(mit).not.toContain("Viele Grüße");
    expect(fuelleMitSignatur(body, w).endsWith("\n\nViele Grüße\nJana Becker")).toBe(true);
  });

  it("Migration: alte Standardvorlagen bekommen {signatur}, eigene Texte ohne Standard-Gruß bleiben", async () => {
    const c = await makeCustomer();
    const alt = await prisma.mailTemplate.create({ data: { customerId: c.id, name: "Alt", subject: "x", body: "Hallo {vorname},\n\nTest.\n\nViele Grüße\n{meinname}" } });
    const eigen = await prisma.mailTemplate.create({ data: { customerId: c.id, name: "Eigen", subject: "x", body: "Hallo,\n\nBis bald\nJana" } });
    const fs = await import("node:fs");
    const sql = fs.readFileSync("prisma/migrations/20261118430000_vorlagen_signatur/migration.sql", "utf8");
    await prisma.$executeRawUnsafe(sql.split("\n").filter((l) => !l.startsWith("--")).join("\n"));
    expect((await prisma.mailTemplate.findUniqueOrThrow({ where: { id: alt.id } })).body).toBe("Hallo {vorname},\n\nTest.\n\n{signatur}");
    expect((await prisma.mailTemplate.findUniqueOrThrow({ where: { id: eigen.id } })).body).toBe("Hallo,\n\nBis bald\nJana");
    await prisma.mailTemplate.deleteMany({ where: { customerId: c.id } });
    await cleanupCustomer(c.id);
  });
});

describe("Fehlermeldungen beim Senden", () => {
  it("übersetzt technische Fehler", async () => {
    const { friendlySendError } = await import("@/lib/mail/postfach");
    expect(friendlySendError('Gmail: { "error": { "code": 403, "message": "Gmail API has not been used in project 1 before or it is disabled.')).toMatch(/noch nicht freigeschaltet/);
    expect(friendlySendError("Invalid login: 535 Authentication failed")).toMatch(/Passwort/);
    expect(friendlySendError("etwas anderes")).toBe("etwas anderes");
  });
});

describe("Ansprache, Terminlink und Erinnerung (14.11.2026)", () => {
  it("Anrede je Ansprache, Terminlink eingesetzt oder Satz entfernt", async () => {
    const { werteFuer, fuelle } = await import("@/lib/mail/platzhalter");
    const { STANDARD_VORLAGEN_JE } = await import("@/lib/mail/vorlagen");
    const link = "https://app.example/book/abc?lead=l1";
    const sie = fuelle(STANDARD_VORLAGEN_JE.sie[0].body, werteFuer({ name: "Eva Pohl", source: "TKV" }, "Jana", { ansprache: "sie", terminlink: link }));
    expect(sie.startsWith("Guten Tag Eva Pohl,")).toBe(true);
    // Anrede aus dem Formular: „Guten Tag Frau Pohl,“
    const mitAnrede = fuelle(STANDARD_VORLAGEN_JE.sie[0].body, werteFuer({ name: "Eva Pohl", source: "TKV", salutation: "Frau" }, "Jana", { ansprache: "sie" }));
    expect(mitAnrede.startsWith("Guten Tag Frau Pohl,")).toBe(true);
    expect(sie).toContain(`Termin aussuchen: ${link}`);
    const ohneNachname = fuelle(STANDARD_VORLAGEN_JE.sie[0].body, werteFuer({ name: "Eva", source: "TKV" }, "Jana", { ansprache: "sie" }));
    expect(ohneNachname.startsWith("Guten Tag,")).toBe(true);
    expect(ohneNachname).not.toContain("aussuchen");
    expect(ohneNachname).toContain("Wann passt es Ihnen für ein kurzes Telefonat?");
    const du = fuelle(STANDARD_VORLAGEN_JE.du[0].body, werteFuer({ name: "Eva Pohl", source: "TKV" }, "Jana", { ansprache: "du", terminlink: link }));
    expect(du.startsWith("Hallo Eva,")).toBe(true);
    expect(du).toContain("kannst du dir");
  });

  it("Ansprache wechseln stellt nur unveränderte Standardvorlagen um", async () => {
    const { loadVorlagen, vorlagenAufAnsprache, STANDARD_VORLAGEN_JE } = await import("@/lib/mail/vorlagen");
    const c = await makeCustomer();
    try {
      await loadVorlagen(c.id);
      const eigen = await prisma.mailTemplate.findFirstOrThrow({ where: { customerId: c.id, name: "Angebot" } });
      await prisma.mailTemplate.update({ where: { id: eigen.id }, data: { body: "Mein eigener Text" } });
      await vorlagenAufAnsprache(c.id, "du");
      const after = await prisma.mailTemplate.findMany({ where: { customerId: c.id } });
      expect(after.find((t) => t.name === "Nicht erreicht")!.body).toBe(STANDARD_VORLAGEN_JE.du[0].body);
      expect(after.find((t) => t.name === "Angebot")!.body).toBe("Mein eigener Text");
    } finally {
      await prisma.mailTemplate.deleteMany({ where: { customerId: c.id } });
      await cleanupCustomer(c.id);
    }
  });

  it("Erinnerung „Kein Termin gebucht“: angelegt, keine Doppelung, bei Buchung entfernt", async () => {
    const { planTerminErinnerung, clearTerminErinnerung, TERMIN_ERINNERUNG_NOTE } = await import("@/lib/mail/termin-erinnerung");
    const c = await makeCustomer();
    try {
      const lead = await prisma.lead.create({ data: { customerId: c.id, name: "Eva Pohl" } });
      const now = new Date("2026-11-16T10:00:00Z"); // Montag
      expect(await planTerminErinnerung(lead.id, 2, { customerId: c.id, now })).toContain("Erinnerung am");
      const l1 = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(l1.followUpNote).toBe(TERMIN_ERINNERUNG_NOTE);
      expect(l1.followUpAt!.toISOString().slice(0, 10)).toBe("2026-11-18");
      // Zweite Mail: bestehende Wiedervorlage bleibt, keine zweite
      expect(await planTerminErinnerung(lead.id, 1, { customerId: c.id, now })).toBe("Die bestehende Wiedervorlage bleibt.");
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).followUpAt!.toISOString().slice(0, 10)).toBe("2026-11-18");
      // Buchung entfernt nur unsere Erinnerung
      await clearTerminErinnerung(lead.id);
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).followUpAt).toBeNull();
      await prisma.lead.update({ where: { id: lead.id }, data: { followUpAt: now, followUpNote: "Eigene Notiz" } });
      await clearTerminErinnerung(lead.id);
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).followUpNote).toBe("Eigene Notiz");
    } finally {
      await cleanupCustomer(c.id);
    }
  });
});
