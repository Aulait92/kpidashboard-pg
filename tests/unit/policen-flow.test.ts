// Policen-Strecke v2 (WhatsApp Flow „Policen senden“): Texte in Sie und Du wörtlich nach texte-v2.md, keine
// Gedankenstriche, Zeichengrenzen von Meta, Flow JSON gegen die bekannten Schema-Regeln, Entschlüsselung der Medien mit
// selbst erzeugten Testvektoren, Antwort lesen, Fälligkeit der Erinnerungen, Vorlagen.
import { createCipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  bestaetigung,
  BESTAETIGUNG_RE,
  chatNachricht,
  erinnerung1,
  erinnerung2,
  erinnerungFusszeile,
  FLOW_TEXT_VERSION,
  FLOW_TEXT_VERSION_SACH,
  formularDaten,
  formularWortlaut,
  istNeinDanke,
  KNOPF_NEIN_DANKE,
  KNOPF_POLICEN_SENDEN,
  KNOPF_SPAETER,
  KNOPF_WEITERE_SENDEN,
  KNOPF_ZUSTIMMEN,
  neinDankeAntwort,
  spaeterAntwort,
  tagText,
  textHash,
  uhrzeitText,
  vorlagenParameter,
  vorlagenText,
  WIDERRUF_FUSSZEILE,
  type FlowTextKontext,
} from "@/lib/policen/flow/texte";
import { einstiegsBildschirme, flowJsonHash, MAX_DATEIEN_JE_SENDEN, policenFlowJson, pruefeFlowJson, SCREEN_FOTOS, SCREEN_PDFS, type FlowJson } from "@/lib/policen/flow/flow-json";
import { entschluesseleFlowMedium, FlowMediaFehler, pruefeSha256, type EncryptionMetadata } from "@/lib/policen/flow/krypto";
import { faelligeErinnerung, leseFlowAntwort, vorlagenAntrag, vorlagenName } from "@/lib/policen/flow/server";
import { textVersionKi } from "@/lib/policen/auslesen/konfig";

const SIE: FlowTextKontext = { an: "sie", name: "Herr Kannapinn", pronomen: "er", firma: "Ole Kannapinn UG", tag: "Donnerstag", uhrzeit: "10 Uhr", video: true, kiFertig: true, gesundheit: true };
const DU: FlowTextKontext = { ...SIE, an: "du", name: "Ole" };
const GEDANKENSTRICH = /[–—]/;
const EMOJI = /\p{Extended_Pictographic}/u;

function alleTexte(k: FlowTextKontext): string[] {
  const d = formularDaten(k, "https://app.example.de/datenschutz/policen?k=abc");
  return [
    chatNachricht(k).text,
    ...Object.values(d),
    formularWortlaut(d),
    bestaetigung(k, 3, true).text,
    bestaetigung(k, 1, false).text,
    WIDERRUF_FUSSZEILE,
    spaeterAntwort(k.an, true),
    spaeterAntwort(k.an, false),
    erinnerung1(k).text,
    erinnerung2(k).text,
    erinnerungFusszeile(k.an),
    neinDankeAntwort(k),
    ...(["bitte", "erinnerung1", "erinnerung2"] as const).flatMap((a) => [vorlagenText(a, k.an).text, vorlagenText(a, k.an).fusszeile!]),
  ];
}

describe("Texte wörtlich nach texte-v2.md", () => {
  it("Chat-Nachricht Sie und Du", () => {
    expect(chatNachricht(SIE)).toEqual({
      text: "Kleiner Tipp für Donnerstag 💡\n\nWenn Herr Kannapinn Ihre Policen vorab hat, sieht er schon vor dem Termin, *ob Sie etwas doppelt zahlen, wann Sie kündigen können und was genau versichert ist.* Dabei versucht er, Ihnen Geld zu sparen. So wird der Termin kürzer und konkreter.\n\n*Meist reicht ein Foto der ersten Seite.* Dauert etwa eine Minute.\n\nIhr Termin findet auch ohne Policen statt.",
      fusszeile: null,
    });
    expect(chatNachricht(DU).text).toContain("Wenn Ole deine Policen vorab hat, sieht er schon vor dem Termin, *ob du etwas doppelt zahlst, wann du kündigen kannst und was genau versichert ist.*");
    expect(chatNachricht({ ...SIE, pronomen: null }).text).toContain("Wenn Herr Kannapinn Ihre Policen vorab hat, ist schon vor dem Termin klar, *ob Sie etwas doppelt zahlen");
    // Als letzter Absatz statt Fußzeile (Ole, 20.11.2026: zu wenig Abstand zur Fußzeile)
    expect(chatNachricht(DU).text.endsWith("\n\nDein Termin findet auch ohne Policen statt.")).toBe(true);
    // Ohne Pronomen kein „er/sie“
    expect(chatNachricht({ ...SIE, pronomen: null }).text).not.toMatch(/\ber\b|\bsie\b|er\/sie/);
  });

  it("Formular Sie: Punkte 1 bis 4, KI-Satz, Gesundheitssatz, Hinweis", () => {
    const d = formularDaten(SIE, "https://x.de/d");
    expect(d.ueberschrift).toBe("Das passiert mit Ihren Policen");
    expect(d.punkt1).toBe("1. **Nur für Ihren Termin:** Herr Kannapinn (Ole Kannapinn UG) speichert sie zur Vorbereitung.");
    expect(d.punkt2).toBe("2. **Per KI ausgelesen, damit Ihr Vergleich zum Termin schon fertig ist:** Die Vertragsdaten liest ein KI-Dienst in der EU aus, auch wenn die Policen Gesundheitsangaben enthalten.");
    expect(d.punkt3).toBe("3. **Beteiligt:** WhatsApp (Meta, Zugriff auch aus den USA) und der Dienstleister performancegrowth.");
    expect(d.punkt4).toBe("4. **Jederzeit widerrufbar:** Schreiben Sie „Widerruf“, dann wird alles gelöscht.");
    expect(d.hinweis).toBe("Mit „Zustimmen & senden“ sind Sie mit den Punkten oben einverstanden. Ihr Termin findet auch ohne Policen statt.");
  });

  it("Formular Du", () => {
    const d = formularDaten(DU, "https://x.de/d");
    expect(d.ueberschrift).toBe("Das passiert mit deinen Policen");
    expect(d.punkt1).toBe("1. **Nur für deinen Termin:** Ole (Ole Kannapinn UG) speichert sie zur Vorbereitung.");
    expect(d.punkt2).toContain("damit dein Vergleich zum Termin schon fertig ist");
    expect(d.punkt4).toBe("4. **Jederzeit widerrufbar:** Schreib „Widerruf“, dann wird alles gelöscht.");
    expect(d.hinweis).toBe("Mit „Zustimmen & senden“ bist du mit den Punkten oben einverstanden. Dein Termin findet auch ohne Policen statt.");
  });

  it("KI-Satz nur, wenn das Auslesen für die Sparte aktiv ist; sonst neutral", () => {
    const d = formularDaten({ ...SIE, kiFertig: false }, "https://x.de/d");
    expect(d.punkt2).toBe("2. **Per KI ausgelesen, damit er sich vorbereiten kann:** Die Vertragsdaten liest ein KI-Dienst in der EU aus, auch wenn die Policen Gesundheitsangaben enthalten.");
    expect(d.punkt2).not.toContain("Vergleich");
    expect(formularDaten({ ...SIE, kiFertig: false, pronomen: null }, "u").punkt2).toContain("damit Herr Kannapinn sich vorbereiten kann");
  });

  it("TKV bzw. ohne Freigabe Kranken/BU/Leben: ohne Gesundheitssatz, eigene Textversion", () => {
    const d = formularDaten({ ...SIE, gesundheit: false }, "u");
    expect(d.punkt2).not.toContain("Gesundheitsangaben");
    expect(d.punkt2.endsWith("in der EU aus.")).toBe(true);
    expect(FLOW_TEXT_VERSION).not.toBe(FLOW_TEXT_VERSION_SACH);
    // Das Auslesen erkennt beide Versionen (K1), Gesundheit nur bei .g
    expect(textVersionKi(FLOW_TEXT_VERSION)).toEqual({ gesundheit: true });
    expect(textVersionKi(FLOW_TEXT_VERSION_SACH)).toEqual({ gesundheit: false });
  });

  it("Firma nur, wenn sie etwas anderes sagt", () => {
    expect(formularDaten({ ...SIE, name: "Ole Kannapinn", firma: "Ole Kannapinn" }, "u").punkt1).toBe("1. **Nur für Ihren Termin:** Ole Kannapinn speichert sie zur Vorbereitung.");
  });

  it("Bestätigung mit Anzahl, Fußzeile Widerruf, bei ki = false der Zusatzsatz", () => {
    const b = bestaetigung(SIE, 3, true);
    expect(b.text).toBe(
      "✅ Danke, *3 Dateien sind angekommen.*\n\nHerr Kannapinn sieht sie sich vor Donnerstag an und versucht, Ihnen Geld zu sparen. Bis dahin müssen Sie nichts weiter tun.\n\nNoch eine Police, etwa Kfz oder Hausrat? Einfach nachsenden.",
    );
    expect(b.fusszeile).toBe("Widerruf jederzeit: einfach „Widerruf“ schreiben.");
    expect(BESTAETIGUNG_RE.test(b.text)).toBe(true);
    expect(bestaetigung(SIE, 1, true).text).toContain("*1 Datei ist angekommen.*");
    expect(bestaetigung(SIE, 2, false).text).toContain("Alles klar, wir lesen nichts automatisch aus.");
    expect(bestaetigung(SIE, 2, true).text).not.toContain("nichts automatisch");
    expect(bestaetigung(DU, 2, true).text).toContain("Ole sieht sie sich vor Donnerstag an und versucht, dir Geld zu sparen. Bis dahin musst du nichts weiter tun.");
    // Ohne KI: Bestätigung der Wahl direkt nach dem Dank, dann der Ansehen-Satz
    expect(bestaetigung(DU, 1, false).text).toBe(
      "✅ Danke, *1 Datei ist angekommen.*\n\nAlles klar, wir lesen nichts automatisch aus.\n\nOle sieht sie sich vor Donnerstag an und versucht, dir Geld zu sparen. Bis dahin musst du nichts weiter tun.\n\nNoch eine Police, etwa Kfz oder Hausrat? Einfach nachsenden.",
    );
    expect(BESTAETIGUNG_RE.test(bestaetigung(DU, 1, false).text)).toBe(true);
  });

  it("Später, Erinnerungen, Nein danke (Sie und Du)", () => {
    expect(spaeterAntwort("sie", true)).toBe("Alles klar, kein Problem. Ihr Termin findet so oder so statt. Ich erinnere Sie höchstens zweimal daran.");
    expect(spaeterAntwort("du", true)).toBe("Alles klar, kein Problem. Dein Termin findet so oder so statt. Ich erinnere dich höchstens zweimal daran.");
    // Ohne Opt-in keine Ankündigung von Erinnerungen
    expect(spaeterAntwort("sie", false)).toBe("Alles klar, kein Problem. Ihr Termin findet so oder so statt.");
    expect(erinnerung1(SIE).text).toBe("Kurze Frage zu Ihrem Termin am Donnerstag: Haben Sie Ihre Policen gerade zur Hand? Meist reicht ein Foto der ersten Seite. Dann sieht Herr Kannapinn vorab, wann Sie kündigen können und ob Sie etwas doppelt zahlen.");
    expect(erinnerung1(DU).text).toBe("Kurze Frage zu deinem Termin am Donnerstag: Hast du deine Policen gerade zur Hand? Meist reicht ein Foto der ersten Seite. Dann sieht Ole vorab, wann du kündigen kannst und ob du etwas doppelt zahlst.");
    expect(erinnerung2(SIE).text).toBe("Morgen um 10 Uhr ist Ihr Videotermin. Noch schnell ein Foto Ihrer Policen? Dann kann sich Herr Kannapinn gezielt vorbereiten. Sonst einfach im Termin zeigen.");
    expect(erinnerung2(DU).text).toBe("Morgen um 10 Uhr ist dein Videotermin. Noch schnell ein Foto deiner Policen? Dann kann sich Ole gezielt vorbereiten. Sonst einfach im Termin zeigen.");
    expect(erinnerung2({ ...SIE, video: false }).text).toContain("ist Ihr Termin.");
    expect(erinnerung1(SIE).fusszeile).toBe("Kein Interesse? Tippen Sie „Nein, danke“ oder STOP.");
    expect(erinnerung1(DU).fusszeile).toBe("Kein Interesse? Tipp „Nein, danke“ oder STOP.");
    expect(neinDankeAntwort(SIE)).toBe("Alles klar, keine Erinnerungen mehr. Bis Donnerstag um 10 Uhr!");
  });

  it("getipptes „Nein, danke“", () => {
    for (const t of ["Nein, danke", "nein danke", "Nein", "nein.", "Kein Interesse", "„Nein, danke“"]) expect(istNeinDanke(t), t).toBe(true);
    for (const t of ["Nein, morgen passt nicht", "ja", "Danke!", "Später"]) expect(istNeinDanke(t), t).toBe(false);
  });

  it("keine Gedankenstriche, nie das Wort „Garantie“, kein Löschversprechen", () => {
    for (const k of [SIE, DU, { ...SIE, kiFertig: false, gesundheit: false, pronomen: null }]) {
      for (const t of alleTexte(k)) {
        expect(GEDANKENSTRICH.test(t), t).toBe(false);
        expect(t).not.toMatch(/garantie/i);
        expect(t).not.toMatch(/automatisch gelöscht|nach 90 Tagen/);
      }
    }
  });

  it("„ohne KI“ wird nicht schlechtgeredet (kein Dark Pattern)", () => {
    const t = [formularWortlaut(formularDaten(SIE, "u")), bestaetigung(SIE, 2, false).text].join(" ");
    expect(t).not.toMatch(/ohne KI.{0,40}(schlechter|langsamer|dauert länger|nicht fertig)/i);
  });
});

describe("Paket 4: Lead-Texte ohne Ersparnisversprechen (§ 5 UWG, K8)", () => {
  const VARIANTEN: FlowTextKontext[] = [SIE, DU, { ...SIE, kiFertig: false, gesundheit: false, pronomen: null }, { ...DU, tag: null, video: false }];

  it("kein Lead-Text verspricht Ersparnis, Preise, Geschwindigkeit oder Lücken", () => {
    // Erlaubt ist nur das Bemühen (Ole, 20.11.2026): „versucht, dir/Ihnen (dabei) Geld zu sparen“
    const BEMUEHEN = /versucht(?: [^,]{1,40})?, (dir|Ihnen) Geld zu sparen/g;
    const VERBOTEN = /sparen|spar(st|t)\b|ersparnis|günstiger|zu teuer|teure|garantie|deutlich schneller|fehlt|fehlender|lücke|unterversichert|empfehl|lohnt/i;
    for (const k of VARIANTEN) {
      for (const t of alleTexte(k)) expect(t.replace(BEMUEHEN, ""), t).not.toMatch(VERBOTEN);
    }
  });

  it("Chat-Nachricht, Bestätigung und Erinnerungen gibt es in beiden Ansprachen", () => {
    for (const f of [(k: FlowTextKontext) => chatNachricht(k).text, (k: FlowTextKontext) => bestaetigung(k, 2, true).text, (k: FlowTextKontext) => bestaetigung(k, 2, false).text, (k: FlowTextKontext) => erinnerung1(k).text, (k: FlowTextKontext) => erinnerung2(k).text]) {
      const sie = f(SIE);
      const du = f(DU);
      expect(sie).toMatch(/\b(Sie|Ihre[nmr]?)\b/);
      expect(sie).not.toMatch(/\b(du|dein(e[nmr]?)?|dich|dir)\b/);
      expect(du).toMatch(/\b(du|dein(e[nmr]?)?)\b/);
      expect(du).not.toMatch(/\b(Sie|Ihre[nmr]?|Ihnen)\b/);
    }
  });

  it("Formular-Wortlaut (Nachweis A3) und Textversionen sind unverändert", () => {
    // Hashes des Formular-Wortlauts vor Paket 4 (Stand b13c3f8). Ändert sich einer, ist das eine neue Einwilligung
    // (neue FLOW_TEXT_VERSION, textVersionKi, Stufe A), keine Textpflege.
    const u = "https://x.de/d";
    expect(textHash(formularWortlaut(formularDaten(SIE, u)))).toBe("d7d946b40d5fb5968f0530eee27759ffd699172bc0c5e0f59f6a6ca5a791b470");
    expect(textHash(formularWortlaut(formularDaten(DU, u)))).toBe("ef69b86159ca91568d1891f00efd28130abcd14ae120e87bd45eced8bdc77970");
    expect(textHash(formularWortlaut(formularDaten({ ...SIE, kiFertig: false, gesundheit: false, pronomen: null }, u)))).toBe("69a236db7f1ddb8765d44c5a8c4e33742048731f9af9ddb4d799ce7fc7b87ee2");
    // Flow JSON unverändert (Ole, 22.11.2026: kein neuer Flow, keine neuen Vorlagen bei Meta, Titel „Policen senden“)
    expect(flowJsonHash()).toBe("e19b92080615af92b80f453defec461979210cc33cb0cb67a43ee1fbc9f97c48");
    expect(FLOW_TEXT_VERSION).toBe("2026-11-19.g1");
    expect(FLOW_TEXT_VERSION_SACH).toBe("2026-11-19.s1");
  });

  it("Abmeldehinweis „Nein, danke“ oder STOP wörtlich in beiden Erinnerungen und ihren Vorlagen", () => {
    for (const k of [SIE, DU]) {
      for (const n of [erinnerung1(k), erinnerung2(k), vorlagenText("erinnerung1", k.an), vorlagenText("erinnerung2", k.an)]) {
        expect(n.fusszeile).toContain("„Nein, danke“ oder STOP");
        expect(n.fusszeile).toBe(erinnerungFusszeile(k.an));
      }
    }
    expect(vorlagenText("erinnerung1", "sie").knopf2).toBe(KNOPF_NEIN_DANKE);
    expect(vorlagenText("erinnerung2", "du").knopf2).toBe(KNOPF_NEIN_DANKE);
  });

  it("Freiwilligkeit und Widerruf bleiben: letzter Absatz der Chat-Nachricht und Fußzeile der Bestätigung", () => {
    // Seit 20.11.2026 als letzter Absatz statt Fußzeile (Ole)
    expect(chatNachricht(SIE).text.endsWith("\n\nIhr Termin findet auch ohne Policen statt.")).toBe(true);
    expect(chatNachricht(DU).text.endsWith("\n\nDein Termin findet auch ohne Policen statt.")).toBe(true);
    expect(bestaetigung(SIE, 1, false).fusszeile).toBe(WIDERRUF_FUSSZEILE);
  });

  it("Vorlagennamen hängen am Text: alle 6 verschieden, stabil, mit Hash des Textes", () => {
    const namen = (["bitte", "erinnerung1", "erinnerung2"] as const).flatMap((art) => (["sie", "du"] as const).map((an) => vorlagenName(art, an, "abcdef123456")));
    expect(new Set(namen).size).toBe(6);
    expect(namen).toEqual((["bitte", "erinnerung1", "erinnerung2"] as const).flatMap((art) => (["sie", "du"] as const).map((an) => vorlagenName(art, an, "abcdef123456"))));
    for (const n of namen) expect(n).toMatch(/^pg_policen_(bitte|erinn1|erinn2)_abcdef_[0-9a-f]{4}_(sie|du)$/);
    // Gerendert entsprechen die Erinnerungs-Vorlagen den Nachrichten im Fenster
    for (const k of [SIE, DU]) {
      for (const art of ["erinnerung1", "erinnerung2"] as const) {
        const p = vorlagenParameter(art, k);
        const t = vorlagenText(art, k.an).text.replace(/\{\{(\d+)\}\}/g, (_, i) => p[Number(i) - 1]);
        expect(t).toBe((art === "erinnerung1" ? erinnerung1(k) : erinnerung2(k)).text);
      }
    }
  });
});

describe("Zeichengrenzen (Meta)", () => {
  it("Nachrichten: Text 1.024, Fußzeile 60", () => {
    const lang: FlowTextKontext = { ...SIE, name: "Frau Mustermann-Langenscheidt", firma: "Versicherungsmakler Mustermann-Langenscheidt und Partner GmbH & Co. KG", tag: "Donnerstag, 26.11." };
    for (const k of [SIE, DU, lang]) {
      for (const n of [chatNachricht(k), bestaetigung(k, 10, false), erinnerung1(k), erinnerung2(k)]) {
        expect(n.text.length).toBeLessThanOrEqual(1024);
        expect((n.fusszeile ?? "").length).toBeLessThanOrEqual(60);
      }
      expect(spaeterAntwort(k.an, true).length).toBeLessThanOrEqual(1024);
    }
  });

  it("Knöpfe: Antwort 20, Vorlage 25, flow_cta 30 ohne Emoji, Footer im Formular 35", () => {
    for (const t of [KNOPF_SPAETER, KNOPF_NEIN_DANKE]) expect(t.length).toBeLessThanOrEqual(20);
    for (const t of [KNOPF_POLICEN_SENDEN, KNOPF_SPAETER, KNOPF_NEIN_DANKE]) expect(t.length).toBeLessThanOrEqual(25);
    for (const t of [KNOPF_POLICEN_SENDEN, KNOPF_WEITERE_SENDEN]) {
      expect(t.length).toBeLessThanOrEqual(30);
      expect(EMOJI.test(t)).toBe(false);
    }
    expect(KNOPF_ZUSTIMMEN.length).toBeLessThanOrEqual(35);
  });

  it("Vorlagen: Text 1.024, Fußzeile 60, kein Platzhalter am Anfang oder Ende, Parameter passen", () => {
    for (const an of ["sie", "du"] as const) {
      for (const art of ["bitte", "erinnerung1", "erinnerung2"] as const) {
        const t = vorlagenText(art, an);
        expect(t.text.length).toBeLessThanOrEqual(1024);
        expect((t.fusszeile ?? "").length).toBeLessThanOrEqual(60);
        expect(t.text).not.toMatch(/^\s*\{\{|\}\}\s*$/);
        const n = new Set([...t.text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1])).size;
        expect(t.beispiele.length, `${art} ${an}`).toBe(n);
        expect(vorlagenParameter(art, an === "du" ? DU : SIE).length).toBe(n);
        const name = vorlagenName(art, an, "abcdef123456");
        expect(name).toMatch(/^[a-z0-9_]{1,512}$/);
        const req = vorlagenAntrag(art, an, { flowId: "123", jsonHash: "abcdef123456" });
        expect(req.category).toBe("UTILITY");
        const buttons = (req.components.find((c) => c.type === "BUTTONS") as { buttons: { type: string; text: string }[] }).buttons;
        // Gruppenregel: erst der Flow-Knopf, dann die Quick Replies
        expect(buttons.map((b) => b.type)).toEqual(["FLOW", "QUICK_REPLY"]);
        expect(buttons.every((b) => b.text.length <= 25)).toBe(true);
      }
    }
    // Gerendert entspricht die Vorlage der Chat-Nachricht; der Satz „… auch ohne Policen statt“ steht in der Vorlage
    // als Fußzeile, in der freien Nachricht als letzter Absatz (Ole, 20.11.2026)
    const p = vorlagenParameter("bitte", SIE);
    const v = vorlagenText("bitte", "sie");
    const gerendert = v.text.replace(/\{\{(\d+)\}\}/g, (_, i) => p[Number(i) - 1]);
    expect(`${gerendert}\n\n${v.fusszeile}`).toBe(chatNachricht(SIE).text);
  });
});

describe("Flow JSON", () => {
  const f = policenFlowJson();
  const varianten = [SIE, DU, { ...SIE, kiFertig: false, pronomen: null, name: "Frau Mustermann-Langenscheidt", firma: "Versicherungsmakler Mustermann-Langenscheidt und Partner GmbH & Co. KG" }].map((k) =>
    formularDaten(k, "https://app.performancegrowth.de/datenschutz/policen?k=0123456789abcdef0123456789abcdef"),
  );

  it("ist gültig nach den bekannten Regeln, auch mit allen Texten eingesetzt", () => {
    expect(pruefeFlowJson(f, varianten)).toEqual([]);
  });

  it("zwei terminale Bildschirme, je ein Picker, Häkchen nicht vorbelegt, complete am Footer, kein data_exchange", () => {
    expect(f.screens.map((s) => s.id)).toEqual([SCREEN_FOTOS, SCREEN_PDFS]);
    for (const s of f.screens) {
      expect(s.terminal).toBe(true);
      const kids = s.layout.children;
      const optIn = kids.find((k) => k.type === "OptIn")!;
      expect(optIn.label).toBe("Lieber ohne KI: nur speichern");
      expect("init-value" in optIn).toBe(false);
      expect(optIn.required).toBe(false);
      // Häkchen direkt unter dem KI-Punkt
      expect(kids[kids.indexOf(optIn) - 1].text).toBe("${data.punkt2}");
      const footer = kids.at(-1)!;
      expect(footer.type).toBe("Footer");
      expect(footer.label).toBe("Zustimmen & senden");
      expect((footer["on-click-action"] as { name: string }).name).toBe("complete");
      expect(kids.filter((k) => k.type === "EmbeddedLink").map((k) => k.text)).toContain("Datenschutzhinweise");
    }
    expect(JSON.stringify(f)).not.toContain("data_exchange");
    const foto = f.screens[0].layout.children.find((k) => k.type === "PhotoPicker")!;
    expect(foto["max-uploaded-photos"]).toBeLessThanOrEqual(MAX_DATEIEN_JE_SENDEN);
    expect(foto.label).toBe("Fotos aufnehmen oder wählen");
    const pdf = f.screens[1].layout.children.find((k) => k.type === "DocumentPicker")!;
    expect(pdf["allowed-mime-types"]).toEqual(["application/pdf"]);
    expect(pdf.label).toBe("PDFs auswählen");
  });

  it("die Prüfung findet Verstöße", () => {
    const kaputt = JSON.parse(JSON.stringify(f)) as FlowJson;
    const s = kaputt.screens[0];
    s.layout.children.splice(1, 0, { type: "DocumentPicker", name: "pdfs2", label: "PDFs" });
    s.layout.children.push({ type: "EmbeddedLink", text: "Noch ein sehr langer Linktext hier", "on-click-action": { name: "data_exchange", payload: {} } });
    (s.layout.children.find((k) => k.type === "EmbeddedLink")!["on-click-action"] as { payload: Record<string, string> }).payload.foto = "${form.fotos}";
    s.data = {};
    const fehler = pruefeFlowJson(kaputt);
    expect(fehler.join("\n")).toMatch(/PhotoPicker und DocumentPicker/);
    expect(fehler.join("\n")).toMatch(/data_exchange/);
    expect(fehler.join("\n")).toMatch(/mehr als 2 EmbeddedLinks/);
    expect(fehler.join("\n")).toMatch(/länger als 25/);
    expect(fehler.join("\n")).toMatch(/Medien in navigate/);
    expect(fehler.join("\n")).toMatch(/nicht deklariert/);
    // Zu lange dynamische Texte
    expect(pruefeFlowJson(f, [{ ...varianten[0], ueberschrift: "x".repeat(81) }]).join()).toMatch(/TextSubheading.text länger als 80/);
  });

  it("Einstieg (Produktionsfehler 19.11.2026, #131009 „Allowed screen name is: <none>“): genau POLICEN, kein Kreis; ein Link zurück wird gemeldet", () => {
    expect(einstiegsBildschirme(f)).toEqual([SCREEN_FOTOS]);
    expect(pruefeFlowJson(f)).toEqual([]);
    // Nur POLICEN verlinkt auf POLICEN_PDF; zurück geht es mit dem Zurück-Pfeil
    const links = (id: string) => JSON.stringify(f.screens.find((s) => s.id === id)!.layout).match(/"navigate"/g)?.length ?? 0;
    expect(links(SCREEN_FOTOS)).toBe(1);
    expect(links(SCREEN_PDFS)).toBe(0);
    // Die erste Fassung (Links in beide Richtungen) hatte keinen Einstieg
    const kreis = JSON.parse(JSON.stringify(f)) as FlowJson;
    const zurueck = { type: "EmbeddedLink", text: "Lieber Fotos senden", "on-click-action": { name: "navigate", next: { type: "screen", name: SCREEN_FOTOS }, payload: {} } };
    kreis.screens[1].layout.children.splice(2, 0, zurueck);
    expect(einstiegsBildschirme(kreis)).toEqual([]);
    expect(pruefeFlowJson(kreis).join("\n")).toMatch(/Kreis/);
    expect(pruefeFlowJson(kreis).join("\n")).toMatch(/Einstieg muss genau POLICEN sein \(ist: keiner\)/);
  });

  it("Hash ändert sich mit dem Inhalt (neuer Flow)", () => {
    expect(flowJsonHash()).toMatch(/^[0-9a-f]{64}$/);
    expect(flowJsonHash()).toBe(flowJsonHash(policenFlowJson()));
    const g = policenFlowJson();
    g.screens[0].title = "Anders";
    expect(flowJsonHash(g)).not.toBe(flowJsonHash());
  });

  it("Wortlaut und Hash für den Nachweis", () => {
    const w = formularWortlaut(varianten[0]);
    expect(w).toContain("[ ] Lieber ohne KI: nur speichern");
    expect(w).toContain("[Zustimmen & senden]");
    expect(w).toContain("Datenschutzhinweise: https://");
    expect(w).not.toContain("**");
    expect(textHash(w)).toBe(createHash("sha256").update(w).digest("hex"));
  });
});

describe("Medien entschlüsseln (AES-256-CBC + HMAC-SHA256, Testvektoren)", () => {
  function vektor(klar: Buffer) {
    const key = randomBytes(32);
    const hmacKey = randomBytes(32);
    const iv = randomBytes(16);
    const c = createCipheriv("aes-256-cbc", key, iv);
    const ct = Buffer.concat([c.update(klar), c.final()]);
    const hmac10 = createHmac("sha256", hmacKey).update(Buffer.concat([iv, ct])).digest().subarray(0, 10);
    const cdn = Buffer.concat([ct, hmac10]);
    const meta: EncryptionMetadata = {
      encrypted_hash: createHash("sha256").update(cdn).digest("base64"),
      iv: iv.toString("base64"),
      encryption_key: key.toString("base64"),
      hmac_key: hmacKey.toString("base64"),
      plaintext_hash: createHash("sha256").update(klar).digest("base64"),
    };
    return { cdn, meta };
  }
  const grund = (fn: () => unknown) => {
    try {
      fn();
      return null;
    } catch (e) {
      return e instanceof FlowMediaFehler ? e.grund : "anderer";
    }
  };

  it("entschlüsselt und prüft alle Hashes", () => {
    for (const len of [0, 1, 15, 16, 17, 5000]) {
      const klar = randomBytes(len);
      const { cdn, meta } = vektor(klar);
      expect(entschluesseleFlowMedium(cdn, meta).equals(klar)).toBe(true);
    }
  });

  it("lehnt Manipulationen ab", () => {
    const { cdn, meta } = vektor(Buffer.from("%PDF-1.4 Police"));
    const kippe = (b: Buffer, i: number) => {
      const x = Buffer.from(b);
      x[i] ^= 1;
      return x;
    };
    expect(grund(() => entschluesseleFlowMedium(kippe(cdn, 0), meta))).toBe("enc_hash");
    // Datei und enc_hash passend verändert: HMAC schlägt an
    const x = kippe(cdn, 0);
    expect(grund(() => entschluesseleFlowMedium(x, { ...meta, encrypted_hash: createHash("sha256").update(x).digest("base64") }))).toBe("hmac");
    expect(grund(() => entschluesseleFlowMedium(cdn, { ...meta, hmac_key: randomBytes(32).toString("base64") }))).toBe("hmac");
    expect(grund(() => entschluesseleFlowMedium(cdn, { ...meta, plaintext_hash: createHash("sha256").update("anders").digest("base64") }))).toBe("plaintext_hash");
    expect(grund(() => entschluesseleFlowMedium(cdn, { ...meta, encryption_key: randomBytes(16).toString("base64") }))).toBe("format");
    expect(grund(() => entschluesseleFlowMedium(cdn.subarray(0, 12), meta))).toBe("format");
    // Falscher Schlüssel mit gültigem HMAC: Padding bzw. Klartext-Hash schlagen an
    expect(["entschluesseln", "plaintext_hash"]).toContain(grund(() => entschluesseleFlowMedium(cdn, { ...meta, encryption_key: randomBytes(32).toString("base64") })));
  });

  it("sha256 aus der Antwortnachricht (Base64 bzw. Hex)", () => {
    const d = Buffer.from("Foto");
    expect(pruefeSha256(d, createHash("sha256").update(d).digest("base64"))).toBe(true);
    expect(pruefeSha256(d, createHash("sha256").update(d).digest("hex"))).toBe(true);
    expect(pruefeSha256(d, createHash("sha256").update("anders").digest("base64"))).toBe(false);
    expect(pruefeSha256(d, null)).toBe(false);
  });
});

describe("Antwort des Formulars (nfm_reply)", () => {
  it("liest Token, Dateien aus beiden Bildschirmen und das Häkchen", () => {
    const a = leseFlowAntwort(
      JSON.stringify({ flow_token: "pf1_abcdefghijklmnop", ohne_ki: true, fotos: [{ id: "1", file_name: "a.jpg", mime_type: "image/jpeg", sha256: "x" }], pdfs: [{ id: "2", file_name: "b.pdf" }] }),
    );
    expect(a?.token).toBe("pf1_abcdefghijklmnop");
    expect(a?.ohneKi).toBe(true);
    expect(a?.dateien.map((d) => d.id)).toEqual(["1", "2"]);
    expect(leseFlowAntwort({ flow_token: "pf1_x", ohne_ki: false, fotos: [] })?.ohneKi).toBe(false);
    expect(leseFlowAntwort({ flow_token: "pf1_x", ohne_ki: "true" })?.ohneKi).toBe(true);
    expect(leseFlowAntwort("kein json")).toBeNull();
    expect(leseFlowAntwort({ fotos: [] })).toBeNull();
    // höchstens 10 Dateien
    expect(leseFlowAntwort({ flow_token: "t", fotos: Array.from({ length: 14 }, (_, i) => ({ id: String(i) })) })?.dateien).toHaveLength(MAX_DATEIEN_JE_SENDEN);
  });
  it("verträgt Text statt JSON, Zahlen-IDs und media_id; Feldnamen ohne Werte fürs Protokoll", () => {
    const em = { encrypted_hash: "a", iv: "b", encryption_key: "c", hmac_key: "d", plaintext_hash: "e" };
    const a = leseFlowAntwort({
      flow_token: "t",
      fotos: JSON.stringify([{ media_id: 42, file_name: "x.jpg" }, { cdn_url: "https://cdn/x", encryption_metadata: JSON.stringify(em) }]),
      pdfs: "987",
    });
    expect(a?.dateien.map((d) => d.id)).toEqual(["42", null, "987"]);
    expect(a?.dateien[1].encryption?.iv).toBe("b");
    expect(a?.dateien[1].felder).toBe("cdn_url,encryption_metadata[encrypted_hash,iv,encryption_key,hmac_key,plaintext_hash]");
    expect(a?.dateien[0].felder).not.toContain("x.jpg");
  });
});

describe("Erinnerungen: Fälligkeit", () => {
  const h = 60 * 60 * 1000;
  // Bitte Montag 16.11.2026 10 Uhr Berlin, Termin Freitag 20.11. 10 Uhr Berlin
  const bitteAt = new Date("2026-11-16T09:00:00Z");
  const terminAt = new Date("2026-11-20T09:00:00Z");
  it("Erinnerung 1 nach 24 Std., nur wenn der Termin dann noch 2 Tage entfernt ist", () => {
    expect(faelligeErinnerung({ bitteAt, terminAt, gesendet: [], now: new Date(bitteAt.getTime() + 23 * h) })).toBeNull();
    expect(faelligeErinnerung({ bitteAt, terminAt, gesendet: [], now: new Date(bitteAt.getTime() + 25 * h) })).toBe("erinnerung1");
    expect(faelligeErinnerung({ bitteAt, terminAt, gesendet: ["tag"], now: new Date(bitteAt.getTime() + 26 * h) })).toBeNull();
    // Termin nur 2,5 Tage nach der Bitte: nach 24 Std. sind es 1,5 Tage, also keine Erinnerung 1
    expect(faelligeErinnerung({ bitteAt, terminAt: new Date(bitteAt.getTime() + 60 * h), gesendet: [], now: new Date(bitteAt.getTime() + 25 * h) })).toBeNull();
  });
  it("Erinnerung 2 am Vortag ab 18 Uhr Berlin, höchstens 2 insgesamt", () => {
    expect(faelligeErinnerung({ bitteAt, terminAt, gesendet: ["tag"], now: new Date("2026-11-19T16:30:00Z") })).toBeNull(); // 17:30 Berlin
    expect(faelligeErinnerung({ bitteAt, terminAt, gesendet: ["tag"], now: new Date("2026-11-19T17:05:00Z") })).toBe("erinnerung2"); // 18:05 Berlin
    expect(faelligeErinnerung({ bitteAt, terminAt, gesendet: ["tag", "vortag"], now: new Date("2026-11-19T17:30:00Z") })).toBeNull();
    // Am Vortag vor 18 Uhr keine Erinnerung 1 mehr
    expect(faelligeErinnerung({ bitteAt, terminAt, gesendet: [], now: new Date("2026-11-19T10:00:00Z") })).toBeNull();
  });
});

describe("Hilfen", () => {
  it("{Tag} und {Uhrzeit}", () => {
    const now = new Date("2026-11-16T09:00:00Z");
    expect(tagText(new Date("2026-11-19T09:00:00Z"), now)).toBe("Donnerstag");
    expect(tagText(new Date("2026-11-26T09:00:00Z"), now)).toBe("Donnerstag, 26.11.");
    expect(uhrzeitText(new Date("2026-11-19T09:00:00Z"))).toBe("10 Uhr");
    expect(uhrzeitText(new Date("2026-11-19T09:30:00Z"))).toBe("10:30 Uhr");
  });
});
