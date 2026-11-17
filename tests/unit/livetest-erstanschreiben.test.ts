// Live-Test Ole (17.11.2026): Vorlagenliste seitenweise, „Name schon vergeben“, Dank nach der Kalenderfrage ohne Namen,
// weitere E-Mail-Adressen des Leads.

import { afterEach, describe, expect, it, vi } from "vitest";
import { findTemplateByName, isNameInUseError, listTemplates, TEMPLATE_PAGE_SIZE } from "@/lib/whatsapp/dialog360";
import { zusageDank } from "@/lib/whatsapp/gespraech";
import { bereinigeWeitereEmails, mitNeuerEmail, parseWeitereEmails, weitereEmailsSuche } from "@/lib/lead-emails";
import { parseStammdaten } from "@/lib/lead-stammdaten";

const vorlagen = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `pg_t_${i}`, language: "de", status: "APPROVED", category: "MARKETING" }));

afterEach(() => vi.unstubAllGlobals());

describe("Vorlagenliste von 360dialog seitenweise", () => {
  it("holt alle Seiten (limit/offset), auch wenn der Server je Abruf nur einen Teil liefert", async () => {
    const alle = vorlagen(TEMPLATE_PAGE_SIZE * 2 + 7);
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (input: string) => {
      urls.push(input);
      const u = new URL(input);
      const limit = Number(u.searchParams.get("limit"));
      const offset = Number(u.searchParams.get("offset") ?? 0);
      return new Response(JSON.stringify({ count: 0, total: alle.length, waba_templates: alle.slice(offset, offset + limit) }));
    });
    const list = await listTemplates("key");
    expect(list).toHaveLength(alle.length);
    expect(list.at(-1)!.name).toBe(`pg_t_${alle.length - 1}`);
    // 100, 100, 7, dann eine leere Seite
    expect(urls).toHaveLength(4);
  });

  it("Server liefert je Abruf weniger als „limit“ (Obergrenze 20): offset wächst um die gelieferten Zeilen, nichts fehlt", async () => {
    const alle = vorlagen(57);
    const offsets: number[] = [];
    vi.stubGlobal("fetch", async (input: string) => {
      const offset = Number(new URL(input).searchParams.get("offset") ?? 0);
      offsets.push(offset);
      return new Response(JSON.stringify({ waba_templates: alle.slice(offset, offset + 20) }));
    });
    const list = await listTemplates("key");
    expect(list.map((t) => t.name)).toEqual(alle.map((t) => t.name));
    expect(offsets).toEqual([0, 20, 40, 57]);
  });

  it("ohne „total“ und wenn der Server offset ignoriert: keine Endlosschleife, keine Dubletten", async () => {
    const alle = vorlagen(TEMPLATE_PAGE_SIZE + 5);
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      return new Response(JSON.stringify({ waba_templates: alle }));
    });
    const list = await listTemplates("key");
    expect(list).toHaveLength(alle.length);
    expect(calls).toBe(2);
  });

  it("Suche nach Namen prüft den Namen selbst; „already in use“ wird erkannt", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ waba_templates: vorlagen(3) })));
    expect(await findTemplateByName("key", "pg_t_1")).toEqual([expect.objectContaining({ name: "pg_t_1" })]);
    expect(await findTemplateByName("key", "pg_gibt_es_nicht")).toEqual([]);
    expect(isNameInUseError(new Error('360dialog 400: {"developer_message":"The template name: `pg_outreach_privatschutz_v6` you have provided is already in use."}'))).toBe(true);
    expect(isNameInUseError(new Error("360dialog 400: Invalid parameter"))).toBe(false);
  });
});

describe("Dank nach der Kalenderfrage ohne Namen des Leads", () => {
  const start = new Date("2026-11-18T09:00:00.000Z");
  it("Sie: Vermittler im Dativ, Datum lang, kein Lead-Name", () => {
    expect(zusageDank("sie", { dat: "Herrn Kannapinn" }, start)).toBe("Vielen Dank! Ihr Termin mit Herrn Kannapinn am Mittwoch, 18.11. um 10 Uhr ist vermerkt. Bis dahin!");
  });
  it("Du: Vorname des Vermittlers", () => {
    expect(zusageDank("du", { dat: "Ole" }, start)).toBe("Danke dir! Dein Termin mit Ole am Mittwoch, 18.11. um 10 Uhr ist vermerkt. Bis dahin!");
  });
});

describe("Weitere E-Mail-Adressen des Leads", () => {
  it("neue Adresse im Chat: bisherige bleibt als weitere, ohne Dubletten (Groß/Klein egal)", () => {
    expect(mitNeuerEmail({ alt: "Alt@Example.de", weitere: [], neu: "neu@example.de" })).toEqual({ email: "neu@example.de", weitereEmails: ["alt@example.de"] });
    expect(mitNeuerEmail({ alt: "b@x.de", weitere: ["A@x.de", "a@x.de"], neu: "c@x.de" })).toEqual({ email: "c@x.de", weitereEmails: ["b@x.de", "a@x.de"] });
    // zurück zur früheren Adresse: sie verschwindet aus den weiteren, die bisherige kommt dazu
    expect(mitNeuerEmail({ alt: "c@x.de", weitere: ["b@x.de", "a@x.de"], neu: "A@X.de" })).toEqual({ email: "a@x.de", weitereEmails: ["c@x.de", "b@x.de"] });
    // gleiche Adresse: nichts doppelt
    expect(mitNeuerEmail({ alt: "a@x.de", weitere: [], neu: "a@x.de" })).toEqual({ email: "a@x.de", weitereEmails: [] });
    expect(mitNeuerEmail({ alt: null, weitere: null, neu: "a@x.de" })).toEqual({ email: "a@x.de", weitereEmails: [] });
  });

  it("Bearbeiten im Kontakt: Komma, Semikolon oder Leerzeichen, ungültige Adresse mit Hinweis", () => {
    expect(parseWeitereEmails("b@x.de, C@x.de; b@x.de a@x.de", "a@x.de")).toEqual({ ok: true, list: ["b@x.de", "c@x.de"] });
    expect(parseWeitereEmails("", "a@x.de")).toEqual({ ok: true, list: [] });
    expect(parseWeitereEmails("kaputt@", null)).toMatchObject({ ok: false });
    expect(bereinigeWeitereEmails(["x@y.de", "", null, "X@Y.de"], null)).toEqual(["x@y.de"]);
    const p = parseStammdaten({ firstName: "Anna", email: "a@x.de", weitereEmails: "B@x.de, a@x.de" });
    expect(p).toMatchObject({ ok: true, data: { email: "a@x.de", weitereEmails: "b@x.de" } });
    expect(parseStammdaten({ firstName: "Anna", weitereEmails: "nein" })).toMatchObject({ ok: false });
  });

  it("Suche: vollständige Adresse auch unter den weiteren E-Mails", () => {
    expect(weitereEmailsSuche(" Alt@Example.de ")).toEqual([{ weitereEmails: { has: "alt@example.de" } }]);
    expect(weitereEmailsSuche("Müller")).toEqual([]);
  });
});
