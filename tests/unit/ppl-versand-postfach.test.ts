// Versand an Pivacom über das Microsoft-365-Postfach (Ole, 17.11.2026): Resend schreibt den Zeichensatz auf utf-8 um,
// deshalb MIME-Mail in ISO-8859-1 per Graph sendMail (base64, text/plain).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { box, prismaMock, sendPlainMailLatin1, sendPlainMail, sendToAdmins } = vi.hoisted(() => {
  const box: { current: Record<string, unknown> | null } = { current: null };
  return {
    box,
    prismaMock: {
      adminMailbox: {
        findUnique: vi.fn(async () => box.current),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(box.current ?? {}, data)),
        updateMany: vi.fn(async () => ({ count: 1 })),
        upsert: vi.fn(async () => ({})),
      },
    },
    sendPlainMailLatin1: vi.fn(async () => ({ ok: true, id: "smtp" })),
    sendPlainMail: vi.fn(async () => ({ ok: true, id: "resend" })),
    sendToAdmins: vi.fn(async () => {}),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/encryption", () => ({
  encryptNullable: (v: string | null | undefined) => (v == null ? null : `enc:${v}`),
  decryptNullable: (v: string | null | undefined) => (v == null ? null : v.replace(/^enc:/, "")),
  decryptSecret: (v: string) => v,
}));
vi.mock("@/lib/email", () => ({ sendPlainMailLatin1, sendPlainMail, sendCustomerMail: vi.fn() }));
vi.mock("@/lib/push", () => ({ sendToAdmins }));

import { isVersandState, sendMailRequest, sendViaVersandPostfach, userFromVersandState, versandExchange, versandState } from "@/lib/ppl/versand-postfach";
import { deliverTo } from "@/lib/ppl/delivery";

const fetchMock = vi.fn();
const verbunden = (over: Record<string, unknown> = {}) => {
  box.current = { id: "mb1", purpose: "ppl-versand", email: "leads@performancegrowth.de", accessTokenEnc: "enc:AT", refreshTokenEnc: "enc:RT", expiresAt: new Date(Date.now() + 3_600_000), ...over };
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("MICROSOFT_CLIENT_ID", "cid");
  vi.stubEnv("MICROSOFT_CLIENT_SECRET", "csecret");
  vi.stubEnv("MICROSOFT_REDIRECT_URI", "https://app.example/api/microsoft/callback");
  vi.stubEnv("MAIL_NUR_AN", "");
  vi.stubEnv("PPL_VERSAND_POSTFACH", "");
  vi.stubEnv("PPL_VERSAND_FORMAT", "");
  box.current = null;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("Versand-Postfach: Anfrage", () => {
  it("MIME-Mail als base64, text/plain, From = Postfach, Inhalt ISO-8859-1", () => {
    const r = sendMailRequest({ to: "leads@pivacom.com", subject: "Neuer Lead – Prüfung", text: "Geprüft: ja\nGröße: 5\nStraße: Hauptstraße 1" }, { date: new Date("2026-11-17T08:00:00Z"), messageId: "<x@performancegrowth.de>" });
    expect(r.url).toBe("https://graph.microsoft.com/v1.0/users/leads%40performancegrowth.de/sendMail");
    expect(r.contentType).toBe("text/plain");
    expect(r.body).toMatch(/^[A-Za-z0-9+/=]+$/);
    const raw = Buffer.from(r.body, "base64");
    const sep = raw.indexOf("\r\n\r\n");
    const head = raw.subarray(0, sep).toString("ascii");
    expect(head).toContain("From: performancegrowth <leads@performancegrowth.de>");
    expect(head).toContain("To: leads@pivacom.com");
    expect(head).toContain("Content-Type: text/plain; charset=ISO-8859-1");
    expect(head).toMatch(/^Subject: =\?ISO-8859-1\?Q\?Neuer_Lead_-_Pr=FCfung\?=$/m);
    const body = raw.subarray(sep + 4);
    expect(body.includes(Buffer.from([0xfc]))).toBe(true); // ü als ein Byte
    expect(body.includes(Buffer.from([0xc3, 0xbc]))).toBe(false); // kein UTF-8
    expect(body.toString("latin1")).toBe("Geprüft: ja\r\nGröße: 5\r\nStraße: Hauptstraße 1\r\n");
  });

  it("Postfach per PPL_VERSAND_POSTFACH, Ausweg JSON-Nachricht per PPL_VERSAND_FORMAT=json", () => {
    vi.stubEnv("PPL_VERSAND_POSTFACH", "Versand@Example.de");
    vi.stubEnv("PPL_VERSAND_FORMAT", "json");
    const r = sendMailRequest({ to: "leads@pivacom.com", subject: "Lead 5 €", text: "Größe" });
    expect(r.url).toContain("/users/versand%40example.de/sendMail");
    expect(r.contentType).toBe("application/json");
    const j = JSON.parse(r.body);
    expect(j.message.from.emailAddress.address).toBe("versand@example.de");
    expect(j.message.toRecipients[0].emailAddress.address).toBe("leads@pivacom.com");
    expect(j.message.subject).toBe("Lead 5 EUR");
    expect(j.message.body).toEqual({ contentType: "Text", content: "Größe" });
  });

  it("Verbinden: leads@ selbst reicht Mail.Send, fremdes Konto braucht Mail.Send.Shared", async () => {
    const token = (scope: string) => Response.json({ access_token: "AT", refresh_token: "RT", expires_in: 3600, scope });
    const me = (mail: string) => Response.json({ mail });
    fetchMock.mockResolvedValueOnce(token("User.Read https://graph.microsoft.com/Mail.Send")).mockResolvedValueOnce(me("Leads@performancegrowth.de"));
    await versandExchange("code", "u1");
    expect(prismaMock.adminMailbox.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { purpose: "ppl-versand" }, create: expect.objectContaining({ email: "leads@performancegrowth.de", accessTokenEnc: "enc:AT", refreshTokenEnc: "enc:RT" }) }));

    fetchMock.mockResolvedValueOnce(token("User.Read Mail.Send")).mockResolvedValueOnce(me("ole@performancegrowth.de"));
    await expect(versandExchange("code", "u1")).rejects.toThrow(/Mail\.Send\.Shared/);
    fetchMock.mockResolvedValueOnce(token("User.Read Mail.Send.Shared")).mockResolvedValueOnce(me("leads@performancegrowth.de"));
    await expect(versandExchange("code", "u1")).rejects.toThrow(/\(Mail\.Send\)/);
    fetchMock.mockResolvedValueOnce(token("User.Read Mail.Send Mail.Send.Shared")).mockResolvedValueOnce(me("ole@performancegrowth.de"));
    await versandExchange("code", "u1");
    expect(prismaMock.adminMailbox.upsert).toHaveBeenCalledTimes(2);
  });

  it("state ist signiert und an den Admin gebunden", () => {
    const s = versandState("u1");
    expect(isVersandState(s)).toBe(true);
    expect(isVersandState("hvkmail:u1.x")).toBe(false);
    expect(userFromVersandState(s)).toBe("u1");
    expect(userFromVersandState(s.replace("u1", "u2"))).toBeNull();
  });
});

describe("Versand-Postfach: senden", () => {
  it("sendet mit gültigem Token an Graph und merkt „zuletzt gesendet“", async () => {
    verbunden();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }));
    const r = await sendViaVersandPostfach({ to: "leads@pivacom.com", subject: "Neuer Lead", text: "Geprüft: ja" });
    expect(r).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://graph.microsoft.com/v1.0/users/leads%40performancegrowth.de/sendMail");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer AT", "Content-Type": "text/plain" });
    expect(Buffer.from(init.body, "base64").toString("latin1")).toContain("Geprüft: ja");
    expect(prismaMock.adminMailbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { purpose: "ppl-versand" }, data: expect.objectContaining({ status: "ok", lastError: null, lastCheckAt: expect.any(Date) }) }));
  });

  it("abgelaufenes Token: erst erneuern (refresh_token), dann senden", async () => {
    verbunden({ expiresAt: new Date(Date.now() - 1000) });
    fetchMock.mockResolvedValueOnce(Response.json({ access_token: "AT2", refresh_token: "RT2", expires_in: 3600 })).mockResolvedValueOnce(new Response(null, { status: 202 }));
    const r = await sendViaVersandPostfach({ to: "leads@pivacom.com", subject: "S", text: "T" });
    expect(r.ok).toBe(true);
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/token");
    const form = new URLSearchParams(tokenInit.body as URLSearchParams);
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("refresh_token")).toBe("RT");
    expect(form.get("scope")).toBe("offline_access User.Read Mail.Send Mail.Send.Shared");
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer AT2");
    expect(prismaMock.adminMailbox.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ accessTokenEnc: "enc:AT2", refreshTokenEnc: "enc:RT2" }) }));
  });

  it("401: einmal mit frischem Token wiederholen", async () => {
    verbunden();
    fetchMock
      .mockResolvedValueOnce(new Response("expired", { status: 401 }))
      .mockResolvedValueOnce(Response.json({ access_token: "AT3", expires_in: 3600 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    expect((await sendViaVersandPostfach({ to: "leads@pivacom.com", subject: "S", text: "T" })).ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe("Bearer AT3");
  });

  it("Fehler von Graph: nicht ok, Fehler am Postfach gemerkt", async () => {
    verbunden();
    fetchMock.mockResolvedValueOnce(new Response('{"error":{"code":"ErrorSendAsDenied"}}', { status: 403 }));
    const r = await sendViaVersandPostfach({ to: "leads@pivacom.com", subject: "S", text: "T" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/^Versand-Postfach leads@performancegrowth.de: 403 .*ErrorSendAsDenied/);
    expect(prismaMock.adminMailbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "error" }) }));
  });

  it("MAIL_NUR_AN sperrt: nichts geht raus", async () => {
    verbunden();
    vi.stubEnv("MAIL_NUR_AN", "@performancegrowth.de");
    const r = await sendViaVersandPostfach({ to: "leads@pivacom.com", subject: "S", text: "T" });
    expect(r).toEqual({ ok: true, blocked: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Auslieferung (Vorlage) an Pivacom", () => {
  const sub = {
    id: "sub1",
    label: "HvK",
    productKey: "PKV",
    delivery: "email",
    deliveryEmail: "leads@pivacom.com, x@kunde.de",
    emailFormat: null,
    emailTemplate: "Name: {{name}}",
    emailSubject: "Neuer Lead",
  } as unknown as Parameters<typeof deliverTo>[0];
  const lead = { id: "l1", product: "PKV", name: "Jörg Müller", phone: null, email: null, answers: [], date: new Date(), consentAt: null };

  it("verbunden: Pivacom über das Versand-Postfach, andere Adressen wie bisher über Resend", async () => {
    verbunden();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }));
    const r = await deliverTo(sub, lead);
    expect(r.ok).toBe(true);
    expect(r.hinweis).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(Buffer.from(fetchMock.mock.calls[0][1].body, "base64").toString("latin1")).toContain("Jörg Müller");
    expect(sendPlainMailLatin1).not.toHaveBeenCalled();
    expect(sendPlainMail).toHaveBeenCalledWith(expect.objectContaining({ to: "x@kunde.de" }));
  });

  it("nicht verbunden: wie bisher über Resend-SMTP, mit Hinweis „Versand-Postfach nicht verbunden“", async () => {
    const r = await deliverTo(sub, lead);
    expect(sendPlainMailLatin1).toHaveBeenCalledWith(expect.objectContaining({ to: "leads@pivacom.com" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.ok).toBe(true);
    expect(r.hinweis).toMatch(/^leads@pivacom\.com: Versand-Postfach nicht verbunden/);
    expect(r.targets.find((t) => t.target === "leads@pivacom.com")?.hinweis).toMatch(/Versand-Postfach nicht verbunden/);
  });

  it("nicht verbunden und Resend-Fehler: Fehlertext nennt das fehlende Versand-Postfach", async () => {
    sendPlainMailLatin1.mockResolvedValueOnce({ ok: false, error: "SMTP kaputt" } as never);
    const r = await deliverTo(sub, lead);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("leads@pivacom.com: Versand-Postfach nicht verbunden, Ersatzweg Resend: SMTP kaputt");
  });
});
