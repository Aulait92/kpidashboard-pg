// E-Mails aus der Kontaktakte (Ole, 23.11.2026): Vorlagen füllen, Prüfungen vor dem Senden, Postfach je Admin
// (Tokens verschlüsselt, Erneuern, Senden über Graph bzw. Gmail).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { box, kontakt, prismaMock } = vi.hoisted(() => {
  const box: { current: Record<string, unknown> | null } = { current: null };
  const kontakt: { current: Record<string, unknown> | null } = { current: null };
  return {
    box,
    kontakt,
    prismaMock: {
      adminMailbox: {
        findUnique: vi.fn(async () => box.current),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(box.current ?? {}, data)),
        upsert: vi.fn(async () => ({})),
        deleteMany: vi.fn(async () => ({ count: 1 })),
      },
      salesContact: {
        findUnique: vi.fn(async () => kontakt.current),
        update: vi.fn((x: unknown) => x),
      },
      salesActivity: { create: vi.fn((x: unknown) => x) },
      $transaction: vi.fn(async (ops: unknown[]) => ops),
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/encryption", () => ({
  encryptNullable: (v: string | null | undefined) => (v == null ? null : `enc:${v}`),
  decryptNullable: (v: string | null | undefined) => (v == null ? null : v.replace(/^enc:/, "")),
}));

import { absenderName, crmAnrede, crmWerte, empfaengerListe, fuelleCrm, offenePlatzhalter, pruefeMail, pruefeVorlage, verlaufEintrag, vorlageFuellen } from "@/lib/vertrieb/crm-vorlagen";
import { crmAccessToken, crmExchange, crmState, isCrmState, sendViaCrmPostfach, sendenErlaubt, userFromCrmState } from "@/lib/vertrieb/crm-postfach";
import { sendeKontaktMail } from "@/lib/vertrieb/crm-mail-server";
import { resetRateLimits } from "@/lib/rate-limit";

const weber = { name: "Versicherungsbüro Weber", salutation: "herr", firstName: "Max", lastName: "Weber" };
const VORLAGE = {
  id: "v1",
  name: "Nachfassen",
  subject: "Kurze Frage, {firma}",
  body: "{anrede},\n\nwie ist es?\n\nHier ist es: {angebotslink}\n\nViele Grüße\n{ole}",
  bodyDu: "{anrede},\n\nwie geht's dir?\n\nHier ist es: {angebotslink}\n\nViele Grüße\n{ole}",
};

describe("Vorlagen füllen", () => {
  it("Anrede Sie mit Herr/Frau und Nachname, sonst Guten Tag; Du mit Vorname", () => {
    expect(crmAnrede(weber, false)).toBe("Hallo Herr Weber");
    expect(crmAnrede({ ...weber, salutation: null }, false)).toBe("Guten Tag");
    expect(crmAnrede(weber, true)).toBe("Hallo Max");
    expect(crmAnrede({ ...weber, firstName: null }, true)).toBe("Hallo");
  });

  it("Absender aus Anzeigename oder Adresse", () => {
    expect(absenderName(null, "ole.kannapinn@performancegrowth.de")).toBe("Ole Kannapinn\nperformancegrowth");
    expect(absenderName("Ole K.", "x@y.de")).toBe("Ole K.\nperformancegrowth");
  });

  it("füllt alle Platzhalter (Sie) mit Angebotslink", () => {
    const w = crmWerte(weber, { du: false, angebotslink: "https://app/angebot/t1", absender: "Ole\nperformancegrowth" });
    const f = vorlageFuellen(VORLAGE, w, false);
    expect(f.subject).toBe("Kurze Frage, Versicherungsbüro Weber");
    expect(f.body).toBe("Hallo Herr Weber,\n\nwie ist es?\n\nHier ist es: https://app/angebot/t1\n\nViele Grüße\nOle\nperformancegrowth");
    expect(offenePlatzhalter(f.body)).toEqual([]);
  });

  it("ohne Angebot entfällt die Zeile mit {angebotslink} samt Leerzeile", () => {
    const w = crmWerte(weber, { du: false, angebotslink: null, absender: "Ole" });
    expect(vorlageFuellen(VORLAGE, w, false).body).toBe("Hallo Herr Weber,\n\nwie ist es?\n\nViele Grüße\nOle");
  });

  it("Du-Fassung bei Du, ohne Du-Fassung der Sie-Text", () => {
    const w = crmWerte(weber, { du: true, angebotslink: null, absender: "Ole" });
    expect(vorlageFuellen(VORLAGE, w, true).body.startsWith("Hallo Max,\n\nwie geht's dir?")).toBe(true);
    expect(vorlageFuellen({ ...VORLAGE, bodyDu: null }, w, true).body.startsWith("Hallo Max,\n\nwie ist es?")).toBe(true);
  });

  it("unbekannte Klammern bleiben stehen", () => {
    expect(fuelleCrm("{foo} {vorname}", crmWerte(weber, { du: false, angebotslink: null, absender: "" }))).toBe("{foo} Max");
  });

  it("Empfänger: Hauptadresse zuerst, ohne Dubletten, ungültige und .invalid", () => {
    expect(empfaengerListe({ email: "A@b.de", altEmails: ["a@b.de", "c@d.de", "kaputt", "geloescht-1@art17.invalid"] })).toEqual(["a@b.de", "c@d.de"]);
  });

  it("Verlauf: Betreff als Titel, Text gekürzt", () => {
    const e = verlaufEintrag({ to: "a@b.de", subject: "Hallo", body: "x".repeat(700) }, "ole@pg.de");
    expect(e.outcome).toBe("E-Mail: Hallo");
    expect(e.note.startsWith("An: a@b.de\nVon: ole@pg.de\n\n")).toBe(true);
    expect(e.note.endsWith(" …")).toBe(true);
  });

  it("Vorlage prüfen: Name, Betreff, Text nötig; leere Du-Fassung wird null", () => {
    expect(pruefeVorlage({ name: "", subject: "a", body: "b" }).ok).toBe(false);
    expect(pruefeVorlage({ name: "a", subject: "", body: "b" }).ok).toBe(false);
    const ok = pruefeVorlage({ name: " a ", subject: "s", body: "b", bodyDu: "  " });
    expect(ok).toEqual({ ok: true, v: { name: "a", subject: "s", body: "b", bodyDu: null } });
  });
});

describe("Prüfung vor dem Senden", () => {
  const erlaubt = ["max@weber.de"];
  it("ungültige oder fremde Adresse wird abgelehnt", () => {
    expect(pruefeMail({ to: "kein-at", subject: "s", body: "b" }, erlaubt)).toEqual({ ok: false, error: "Bitte eine gültige E-Mail-Adresse wählen." });
    expect(pruefeMail({ to: "fremd@x.de", subject: "s", body: "b" }, erlaubt)).toEqual({ ok: false, error: "Diese Adresse gehört nicht zum Kontakt." });
  });
  it("Betreff ohne Zeilenumbruch (keine Kopfzeilen-Injektion), Text nötig, offene Platzhalter", () => {
    const r = pruefeMail({ to: "MAX@weber.de", subject: "a\r\nBcc: x@y.de", body: "b" }, erlaubt);
    expect(r).toEqual({ ok: true, mail: { to: "max@weber.de", subject: "a Bcc: x@y.de", body: "b" } });
    expect(pruefeMail({ to: "max@weber.de", subject: "s", body: "  " }, erlaubt).ok).toBe(false);
    expect(pruefeMail({ to: "max@weber.de", subject: "s", body: "{anrede}, hi" }, erlaubt)).toEqual({ ok: false, error: "Noch nicht ausgefüllt: {anrede}" });
  });
});

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const verbunden = (over: Record<string, unknown> = {}) => {
  box.current = { id: "mb1", purpose: "crm:u1", provider: "microsoft", email: "ole@pg.de", accessTokenEnc: "enc:AT", refreshTokenEnc: "enc:RT", expiresAt: new Date(Date.now() + 3_600_000), status: "ok", ...over };
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("MICROSOFT_CLIENT_ID", "cid");
  vi.stubEnv("MICROSOFT_CLIENT_SECRET", "csecret");
  vi.stubEnv("MICROSOFT_REDIRECT_URI", "https://app.example/api/microsoft/callback");
  vi.stubEnv("GOOGLE_CLIENT_ID", "gid");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "gsecret");
  vi.stubEnv("GOOGLE_REDIRECT_URI", "https://app.example/api/google/callback");
  vi.stubEnv("MAIL_NUR_AN", "");
  box.current = null;
  kontakt.current = { id: "k1", email: "max@weber.de", altEmails: ["info@weber.de"], nieKontaktierenAt: null, art17GeloeschtAt: null };
  resetRateLimits();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("Postfach je Admin: state und Tokens", () => {
  it("state ist signiert und an den Login gebunden", () => {
    const s = crmState("u1");
    expect(isCrmState(s)).toBe(true);
    expect(isCrmState("mail:u1.x")).toBe(false);
    expect(userFromCrmState(s)).toBe("u1");
    expect(userFromCrmState(s.replace("u1", "u2"))).toBeNull();
  });

  it("Senderecht erkennen (Microsoft mit Präfix, Google gmail.send)", () => {
    expect(sendenErlaubt("microsoft", "https://graph.microsoft.com/Mail.Send User.Read")).toBe(true);
    expect(sendenErlaubt("microsoft", "User.Read")).toBe(false);
    expect(sendenErlaubt("google", "openid https://www.googleapis.com/auth/gmail.send")).toBe(true);
  });

  it("Code tauschen speichert Tokens verschlüsselt unter purpose crm:<userId>", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "AT1", refresh_token: "RT1", expires_in: 3600, scope: "Mail.Send User.Read" }))
      .mockResolvedValueOnce(json({ mail: "Ole.Kannapinn@performancegrowth.de" }));
    await expect(crmExchange("microsoft", "code", "u1")).resolves.toBe("ole.kannapinn@performancegrowth.de");
    const arg = (prismaMock.adminMailbox.upsert.mock.calls as unknown as unknown[][])[0][0] as { where: { purpose: string }; create: Record<string, unknown> };
    expect(arg.where.purpose).toBe("crm:u1");
    expect(arg.create.accessTokenEnc).toBe("enc:AT1");
    expect(arg.create.refreshTokenEnc).toBe("enc:RT1");
    expect(arg.create.connectedById).toBe("u1");
  });

  it("ohne Senderecht (Google) wird nichts gespeichert", async () => {
    fetchMock.mockResolvedValueOnce(json({ access_token: "AT1", scope: "openid email" })).mockResolvedValueOnce(json({ email: "o@gmail.com" }));
    await expect(crmExchange("google", "code", "u1")).rejects.toThrow(/erlauben/);
    expect(prismaMock.adminMailbox.upsert).not.toHaveBeenCalled();
  });

  it("abgelaufenes Token wird erneuert und verschlüsselt gespeichert", async () => {
    verbunden({ expiresAt: new Date(Date.now() - 1000) });
    fetchMock.mockResolvedValueOnce(json({ access_token: "AT2", refresh_token: "RT2", expires_in: 3600 }));
    const t = await crmAccessToken(box.current as never);
    expect(t).toBe("AT2");
    const body = String((fetchMock.mock.calls[0][1] as RequestInit).body);
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain("refresh_token=RT");
    expect(box.current).toMatchObject({ accessTokenEnc: "enc:AT2", refreshTokenEnc: "enc:RT2" });
  });

  it("gültiges Token wird ohne Anfrage genutzt", async () => {
    verbunden();
    await expect(crmAccessToken(box.current as never)).resolves.toBe("AT");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Senden über das Postfach", () => {
  it("ohne Postfach: keinPostfach", async () => {
    const r = await sendViaCrmPostfach("u1", { to: "max@weber.de", subject: "s", text: "t" });
    expect(r).toMatchObject({ ok: false, keinPostfach: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Microsoft: /me/sendMail, Text, in Gesendete; Gedankenstriche raus", async () => {
    verbunden();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }));
    const r = await sendViaCrmPostfach("u1", { to: "max@weber.de", subject: "Frage – kurz", text: "Hallo – Max" });
    expect(r).toEqual({ ok: true, from: "ole@pg.de" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://graph.microsoft.com/v1.0/me/sendMail");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer AT");
    const payload = JSON.parse(String(init.body));
    expect(payload.saveToSentItems).toBe(true);
    expect(payload.message.toRecipients[0].emailAddress.address).toBe("max@weber.de");
    expect(payload.message.subject).not.toMatch(/[–—]/);
    expect(payload.message.body.content).not.toMatch(/[–—]/);
  });

  it("bei 401 einmal mit frischem Token wiederholen", async () => {
    verbunden();
    fetchMock
      .mockResolvedValueOnce(new Response("unauth", { status: 401 }))
      .mockResolvedValueOnce(json({ access_token: "AT3", expires_in: 3600 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    const r = await sendViaCrmPostfach("u1", { to: "max@weber.de", subject: "s", text: "t" });
    expect(r.ok).toBe(true);
    expect((fetchMock.mock.calls[2][1] as { headers: Record<string, string> }).headers.Authorization).toBe("Bearer AT3");
  });

  it("Fehler wird am Postfach vermerkt und verständlich gemeldet", async () => {
    verbunden();
    fetchMock.mockResolvedValueOnce(new Response("ErrorAccessDenied", { status: 403 }));
    const r = await sendViaCrmPostfach("u1", { to: "max@weber.de", subject: "s", text: "t" });
    expect(r.ok).toBe(false);
    expect(box.current).toMatchObject({ status: "error" });
  });

  it("Testumgebung (MAIL_NUR_AN): fremde Adressen werden nicht gesendet", async () => {
    vi.stubEnv("MAIL_NUR_AN", "@performancegrowth.de");
    verbunden();
    const r = await sendViaCrmPostfach("u1", { to: "max@weber.de", subject: "s", text: "t" });
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Google: Gmail-API mit MIME", async () => {
    verbunden({ provider: "google", email: "o@gmail.com" });
    fetchMock.mockResolvedValueOnce(json({ id: "m1" }));
    const r = await sendViaCrmPostfach("u1", { to: "max@weber.de", subject: "Grüße", text: "Hallo" });
    expect(r.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("gmail.googleapis.com");
    const mime = Buffer.from(JSON.parse(String(init.body)).raw, "base64url").toString();
    expect(mime).toContain("To: max@weber.de");
  });
});

describe("Senden aus der Kontaktakte (Wächter)", () => {
  const eingabe = { to: "info@weber.de", subject: "Kurze Frage", body: "Hallo Max" };

  it("ohne Postfach: Hinweis zum Verbinden, kein Verlauf", async () => {
    const r = await sendeKontaktMail({ userId: "u1" }, "k1", eingabe);
    expect(r).toMatchObject({ ok: false, keinPostfach: true });
    expect(prismaMock.salesActivity.create).not.toHaveBeenCalled();
  });

  it("fremde Adresse wird abgelehnt, bevor gesendet wird", async () => {
    verbunden();
    const r = await sendeKontaktMail({ userId: "u1" }, "k1", { ...eingabe, to: "jemand@anders.de" });
    expect(r).toEqual({ ok: false, error: "Diese Adresse gehört nicht zum Kontakt." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("„Nie kontaktieren“ sperrt", async () => {
    verbunden();
    kontakt.current = { ...kontakt.current!, nieKontaktierenAt: new Date() };
    const r = await sendeKontaktMail({ userId: "u1" }, "k1", eingabe);
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("unbekannter Kontakt", async () => {
    kontakt.current = null;
    expect(await sendeKontaktMail({ userId: "u1" }, "kx", eingabe)).toEqual({ ok: false, error: "Kontakt nicht gefunden." });
  });

  it("Erfolg: Eintrag im Verlauf (E-Mail) und letzter Kontakt", async () => {
    verbunden();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }));
    const r = await sendeKontaktMail({ userId: "u1" }, "k1", eingabe);
    expect(r).toEqual({ ok: true, hinweis: "E-Mail an info@weber.de gesendet." });
    const akt = prismaMock.salesActivity.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(akt.data).toMatchObject({ contactId: "k1", type: "EMAIL", outcome: "E-Mail: Kurze Frage" });
    expect(String(akt.data.note)).toContain("An: info@weber.de\nVon: ole@pg.de");
  });

  it("Grenze je Admin: nach 30 Mails pro Stunde ist Schluss", async () => {
    verbunden();
    fetchMock.mockImplementation(async () => new Response(null, { status: 202 }));
    for (let i = 0; i < 30; i++) expect((await sendeKontaktMail({ userId: "u1" }, "k1", eingabe)).ok).toBe(true);
    const r = await sendeKontaktMail({ userId: "u1" }, "k1", eingabe);
    expect(r).toMatchObject({ ok: false });
    expect(fetchMock).toHaveBeenCalledTimes(30);
  });
});
