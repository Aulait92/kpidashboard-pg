import { describe, expect, it } from "vitest";
import { Client, createTransport, getCurrentScope, setCurrentClient, type ClientOptions } from "@sentry/core";
import {
  REDACTED_TOKEN,
  TOKEN_PATH_PREFIXES,
  isReplayBlockedPath,
  isTokenPath,
  redactTokenPaths,
  redactUrl,
  scrubBreadcrumb,
  scrubSentryEvent,
} from "@/lib/sentry-redact";

const SECRET = "abcGeheim123";

describe("redactTokenPaths: jedes Präfix", () => {
  for (const prefix of [...TOKEN_PATH_PREFIXES]) {
    it(`${prefix}/<token>`, () => {
      expect(redactTokenPaths(`${prefix}/${SECRET}`)).toBe(`${prefix}/${REDACTED_TOKEN}`);
      expect(redactTokenPaths(`${prefix}/${SECRET}/pdf`)).toBe(`${prefix}/${REDACTED_TOKEN}/pdf`);
      expect(redactTokenPaths(`https://app.example.de${prefix}/${SECRET}?x=1`)).toBe(
        `https://app.example.de${prefix}/${REDACTED_TOKEN}?x=1`,
      );
      expect(redactTokenPaths(`GET ${prefix}/${SECRET} fehlgeschlagen`)).toBe(`GET ${prefix}/${REDACTED_TOKEN} fehlgeschlagen`);
      expect(isTokenPath(`${prefix}/${SECRET}`)).toBe(true);
      expect(isReplayBlockedPath(`https://app.example.de${prefix}/${SECRET}`)).toBe(true);
    });
  }

  it("verschachtelte Präfixe behalten den festen Teil", () => {
    expect(redactTokenPaths(`/book/manage/${SECRET}/ics`)).toBe("/book/manage/[token]/ics");
    expect(redactTokenPaths(`/einwilligung/bestaetigen/${SECRET}`)).toBe("/einwilligung/bestaetigen/[token]");
    expect(redactTokenPaths(`/empfehlung/g/${SECRET}`)).toBe("/empfehlung/g/[token]");
    expect(redactTokenPaths(`/empfehlung/${SECRET}/kontakt`)).toBe("/empfehlung/[token]/kontakt");
  });

  it("öffentliche Adressen und Dateipfade bleiben", () => {
    expect(redactTokenPaths("/book/max-muster")).toBe("/book/max-muster");
    expect(redactTokenPaths("/buyer/leads/123")).toBe("/buyer/leads/123");
    expect(redactTokenPaths("/demo/beratung")).toBe("/demo/beratung");
    expect(redactTokenPaths("webpack-internal:///./src/app/beratung/[token]/page.tsx")).toBe(
      "webpack-internal:///./src/app/beratung/[token]/page.tsx",
    );
    expect(redactUrl(`/beratung/${SECRET}?lead=1#x`)).toBe("/beratung/[token]");
  });

  it("Replay: Endkundenseiten gesperrt, App erlaubt", () => {
    expect(isReplayBlockedPath("/book/max-muster")).toBe(true);
    expect(isReplayBlockedPath("/demo/beratung")).toBe(true);
    expect(isReplayBlockedPath("/buyer")).toBe(false);
    expect(isReplayBlockedPath("/admin/leads")).toBe(false);
  });
});

describe("Sentry-Ereignis auf /beratung/<token>", () => {
  const rawEvent = () => ({
    message: `Fehler auf https://app.example.de/beratung/${SECRET}`,
    transaction: `/beratung/${SECRET}`,
    request: {
      url: `https://app.example.de/beratung/${SECRET}?lead=7`,
      query_string: "lead=7",
      headers: { Referer: `https://app.example.de/praesentation/${SECRET}` },
      cookies: { kpi_session: "x" },
    },
    user: { ip_address: "1.2.3.4" },
    tags: { url: `/beratung/${SECRET}` },
    breadcrumbs: [{ category: "navigation", data: { from: `/beratung/${SECRET}`, to: `/beratung/${SECRET}/pdf` } }],
    exception: { values: [{ type: "Error", value: `fetch /api/abmelden/${SECRET} failed` }] },
  });

  it("scrubSentryEvent (Browser und Server) entfernt das Token überall", () => {
    for (const server of [false, true]) {
      const out = scrubSentryEvent(rawEvent(), { server });
      expect(JSON.stringify(out)).not.toContain(SECRET);
      expect(out.request.url).toBe("https://app.example.de/beratung/[token]");
      expect(out.user).toBeUndefined();
    }
  });

  it("scrubBreadcrumb: fetch-URL ohne Token und Query", () => {
    const c = scrubBreadcrumb({ category: "fetch", data: { url: `/beratung/${SECRET}?_rsc=1`, method: "GET" } });
    expect(c.data?.url).toBe("/beratung/[token]");
  });

  it("echter Sentry-Client: gesendeter Umschlag enthält kein Token", async () => {
    const sent: string[] = [];
    const transport = () =>
      createTransport({ recordDroppedEvent: () => {} }, async (req) => {
        sent.push(typeof req.body === "string" ? req.body : new TextDecoder().decode(req.body as Uint8Array));
        return { statusCode: 200 };
      });
    class TestClient extends Client<ClientOptions> {
      constructor(options: ClientOptions) {
        super(options);
      }
      eventFromException(e: unknown) {
        return Promise.resolve({ exception: { values: [{ type: "Error", value: String((e as Error).message) }] } });
      }
      eventFromMessage(m: string) {
        return Promise.resolve({ message: m });
      }
    }
    const client = new TestClient({
      dsn: "https://public@o1.ingest.de.sentry.io/1",
      integrations: [],
      stackParser: () => [],
      transport,
      beforeSend: (e) => scrubSentryEvent(e, { server: true }),
      beforeBreadcrumb: (b) => scrubBreadcrumb(b),
    });
    setCurrentClient(client);
    client.init();
    const scope = getCurrentScope();
    scope.addBreadcrumb({ category: "navigation", data: { from: "/buyer", to: `/beratung/${SECRET}` } });
    scope.setSDKProcessingMetadata({ normalizedRequest: { url: `https://app.example.de/beratung/${SECRET}` } });
    client.captureException(new Error(`Seite /beratung/${SECRET} kaputt`), undefined, scope);
    await client.flush(2000);
    expect(sent.length).toBeGreaterThan(0);
    const body = sent.join("\n");
    expect(body).toContain("/beratung/[token]");
    expect(body).not.toContain(SECRET);
  });
});
