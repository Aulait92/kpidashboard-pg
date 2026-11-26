// Ops-Creatives (Ole, 26.11.2026): Sicherheitsnetz (nur pausiert, nur Werbekonto des Kunden), link_data-Aufbau (Bild,
// Texte, Formular), Textprüfung (keine Zusagen, Prozente, Sterne, Gedankenstriche) und Vorlagen.
import { describe, expect, it, vi } from "vitest";
import { bildUrlErlaubt, creativeHtml, neuesLinkData, pruefeAnzeige, pruefeText, texteFuer } from "@/lib/kampagnen/anzeige-creative";
import type { MetaApi } from "@/lib/kampagnen/builder";
import { GESPERRTE_QUELLEN } from "@/lib/html-to-png";
import { anzeigeCreativeSetzen } from "@/lib/kampagnen/anzeige-creative-server";

const ALT = {
  link: "https://fb.me/",
  message: "Alter Text",
  name: "Alte Überschrift",
  image_hash: "alt123",
  picture: "https://scontent.xx.fbcdn.net/alt.jpg",
  image_url: "https://scontent.xx.fbcdn.net/alt.jpg",
  image_crops: { "100x100": [[0, 0], [10, 10]] },
  call_to_action: { type: "SIGN_UP", value: { lead_gen_form_id: "111", link: "https://fb.me/" } },
};

describe("pruefeAnzeige", () => {
  const ad = { account_id: "2711724662596278", status: "PAUSED", name: "A", creative: { id: "c1" } };
  it("erlaubt pausierte Anzeige im eigenen Konto", () => {
    expect(pruefeAnzeige(ad, "act_2711724662596278")).toEqual({ ok: true, creativeId: "c1" });
    expect(pruefeAnzeige(ad, "2711724662596278").ok).toBe(true);
  });
  it("lehnt fremdes Konto, aktive Anzeige und fehlendes Creative ab", () => {
    expect(pruefeAnzeige(ad, "act_999").ok).toBe(false);
    expect(pruefeAnzeige({ ...ad, status: "ACTIVE" }, "act_2711724662596278")).toEqual({ ok: false, error: "Anzeige ist nicht pausiert (ACTIVE)." });
    expect(pruefeAnzeige({ ...ad, creative: undefined }, "act_2711724662596278").ok).toBe(false);
  });
});

describe("neuesLinkData", () => {
  it("nur erlaubte Felder (Meta 1443051): Hash, Link, Texte, Knopf mit Formular", () => {
    expect(neuesLinkData(ALT, {})).toEqual({
      image_hash: "alt123",
      link: "https://fb.me/",
      message: "Alter Text",
      name: "Alte Überschrift",
      call_to_action: { type: "SIGN_UP", value: { lead_gen_form_id: "111" } },
    });
  });
  it("tauscht Bild (Hash), Texte und Formular", () => {
    const ld = neuesLinkData(ALT, { bildRef: "neu456", message: "Neu", headline: "Kopf", description: "Beschr", formId: "222" });
    expect(ld).toEqual({ image_hash: "neu456", link: "https://fb.me/", message: "Neu", name: "Kopf", description: "Beschr", call_to_action: { type: "SIGN_UP", value: { lead_gen_form_id: "222" } } });
    expect(ALT.call_to_action.value.lead_gen_form_id).toBe("111");
  });
  it("Bild per Adresse (picture) ohne Hash; Hash des Creatives als Ersatz", () => {
    const ld = neuesLinkData(ALT, { bildRef: "url:https://r2.example/x.jpg" });
    expect(ld.picture).toBe("https://r2.example/x.jpg");
    expect(ld.image_hash).toBeUndefined();
    expect(neuesLinkData({ link: "x", picture: "https://p" }, {}, "ch1")).toEqual({ image_hash: "ch1", link: "x" });
  });
  it("Formular ohne bisherigen Knopf", () => {
    expect(neuesLinkData({ link: "x" }, { formId: "9" }).call_to_action).toEqual({ type: "SIGN_UP", value: { lead_gen_form_id: "9" } });
  });
});

describe("Texte", () => {
  it("blockt Zusagen, Prozente, Sterne, Garantie", () => {
    for (const t of ["Wir zahlen garantiert", "Zahlt immer", "Bis zu 100 % erstattet", "30% günstiger", "★★★★★", "Testsieger 2026"]) expect(pruefeText(t).ok).toBe(false);
  });
  it("ersetzt Gedankenstriche, Standardtexte gültig", () => {
    expect(pruefeText("Schutz – jetzt prüfen")).toEqual({ ok: true, text: "Schutz, jetzt prüfen" });
    for (const l of ["frage", "balken", "leo", "ohne"] as const) expect(texteFuer(l).ok).toBe(true);
    const t = texteFuer("leo", { titel: "Das ist Mia.", blasen: "Eins|Zwei|Drei" });
    expect(t.ok && t.texte).toMatchObject({ titel: "Das ist Mia.", blasen: ["Eins", "Zwei", "Drei"] });
    expect(texteFuer("frage", { badge: "100 % Schutz" }).ok).toBe(false);
  });
});

describe("Bild-Adressen und Vorlage", () => {
  it("nur https, nie Meta", () => {
    expect(bildUrlErlaubt("https://images.pexels.com/a.jpg", GESPERRTE_QUELLEN)).toBe(true);
    expect(bildUrlErlaubt("http://x.de/a.jpg", GESPERRTE_QUELLEN)).toBe(false);
    expect(bildUrlErlaubt("https://scontent.xx.fbcdn.net/a.jpg", GESPERRTE_QUELLEN)).toBe(false);
  });
  it("escaped Texte, setzt Marke und Farbe", () => {
    const t = texteFuer("balken", { balken: "<b>Hallo</b>" });
    const html = creativeHtml({ layout: "balken", fotoSrc: "data:image/png;base64,AA", texte: t.ok ? t.texte : {}, marke: "Tierfairgleich", farbe: "#123456" });
    expect(html).toContain("&lt;b&gt;Hallo&lt;/b&gt;");
    expect(html).toContain("Tierfairgleich");
    expect(html).toContain("--akzent:#123456");
    expect(creativeHtml({ layout: "ohne", fotoSrc: "x", texte: {}, farbe: "red;}" })).toContain("--akzent:#E8742A");
  });
});

describe("anzeigeCreativeSetzen", () => {
  function fakeApi(status = "PAUSED", konto = "2711724662596278") {
    const post = vi.fn(async (path: string, _body: Record<string, unknown>) => (void _body, path.endsWith("/adimages") ? { images: { x: { hash: "h1" } } } : { id: "neu1" }));
    const api: MetaApi = {
      get: vi.fn(async (path: string) => {
        if (path === "ad1") return { account_id: konto, status, name: "Anzeige 1", creative: { id: "c1" } };
        if (path === "c1") return { name: "Creative", object_story_spec: { page_id: "p1", link_data: ALT } };
        if (path === "p1") return { access_token: "pt" };
        if (path === "f1") return { id: "f1", status: "ACTIVE", page: { id: "p1" } };
        if (path === "f2") return { id: "f2", status: "ACTIVE", page: { id: "andere" } };
        throw new Error(path);
      }) as MetaApi["get"],
      post: post as MetaApi["post"],
      del: vi.fn(),
    };
    return { api, post };
  }
  it("lädt Bild hoch, legt Creative an und verknüpft die Anzeige, ohne Status", async () => {
    const { api, post } = fakeApi();
    const r = await anzeigeCreativeSetzen({ act: "act_2711724662596278", adId: "ad1", imageUrl: "https://r2.example/a.jpg", formId: "f1", headline: "Kopf" }, api);
    expect(r).toEqual({ adName: "Anzeige 1", creativeId: "neu1", geaendert: ["Bild", "Überschrift", "Formular"] });
    expect(post.mock.calls[0]).toEqual(["act_2711724662596278/adimages", { url: "https://r2.example/a.jpg" }]);
    const creative = post.mock.calls[1][1] as unknown as { object_story_spec: { link_data: Record<string, unknown> } };
    expect(creative.object_story_spec.link_data).toEqual({ image_hash: "h1", link: "https://fb.me/", message: "Alter Text", name: "Kopf", call_to_action: { type: "SIGN_UP", value: { lead_gen_form_id: "f1" } } });
    expect(post.mock.calls[2]).toEqual(["ad1", { creative: { creative_id: "neu1" } }]);
    for (const [, body] of post.mock.calls) expect(body).not.toHaveProperty("status");
  });
  it("bricht bei aktiver Anzeige, fremdem Konto und fremdem Formular ab, ohne etwas anzulegen", async () => {
    for (const [status, konto, formId] of [["ACTIVE", "2711724662596278", undefined], ["PAUSED", "1", undefined], ["PAUSED", "2711724662596278", "f2"]] as const) {
      const { api, post } = fakeApi(status, konto);
      await expect(anzeigeCreativeSetzen({ act: "act_2711724662596278", adId: "ad1", imageUrl: "https://r2.example/a.jpg", formId }, api)).rejects.toThrow();
      expect(post).not.toHaveBeenCalled();
    }
  });
});
