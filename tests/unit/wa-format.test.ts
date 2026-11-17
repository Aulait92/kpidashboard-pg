import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, Fragment } from "react";
import { waFormatKnoten, waOhneMarker } from "@/lib/wa-format";

const html = (text: string | null | undefined) => renderToStaticMarkup(createElement(Fragment, null, waFormatKnoten(text)));

describe("waFormatKnoten", () => {
  it("formatiert fett, kursiv, durchgestrichen und mono", () => {
    expect(html("*Haben Sie sich den Termin schon im Kalender eingetragen?*")).toBe(
      "<strong>Haben Sie sich den Termin schon im Kalender eingetragen?</strong>",
    );
    expect(html("Das ist _wichtig_.")).toBe("Das ist <em>wichtig</em>.");
    expect(html("~alt~ neu")).toBe("<s>alt</s> neu");
    expect(html("Code: ```a *b* c```!")).toBe("Code: <code>a *b* c</code>!");
  });

  it("verschachtelt und mehrere Spannen in einer Zeile", () => {
    expect(html("*_beides_*")).toBe("<strong><em>beides</em></strong>");
    expect(html("*eins* und *zwei*")).toBe("<strong>eins</strong> und <strong>zwei</strong>");
    expect(html("(*Klammer*)")).toBe("(<strong>Klammer</strong>)");
  });

  it("lässt Marker mitten im Wort, Rechnungen und Variablennamen unverändert", () => {
    expect(html("3*4*5")).toBe("3*4*5");
    expect(html("snake_case_name")).toBe("snake_case_name");
    expect(html("max_muster@beispiel.de und anna_b@x.de")).toBe("max_muster@beispiel.de und anna_b@x.de");
    expect(html("a*fett*")).toBe("a*fett*");
    expect(html("*fett*a")).toBe("*fett*a");
    expect(html("Größe*fett*")).toBe("Größe*fett*");
  });

  it("verlangt Text direkt an den Markern und einen nicht leeren Inhalt", () => {
    expect(html("a * b * c")).toBe("a * b * c");
    expect(html("* nicht fett*")).toBe("* nicht fett*");
    expect(html("*nicht fett *")).toBe("*nicht fett *");
    expect(html("**")).toBe("**");
    expect(html("***")).toBe("***");
    expect(html("``````")).toBe("``````");
  });

  it("formatiert nicht über Zeilenumbrüche hinweg und behält die Umbrüche", () => {
    expect(html("*Zeile eins\nZeile zwei*")).toBe("*Zeile eins\nZeile zwei*");
    expect(html("*eins*\n_zwei_")).toBe("<strong>eins</strong>\n<em>zwei</em>");
  });

  it("formatiert nichts in Links", () => {
    expect(html("https://example.com/a_b_c_d")).toBe("https://example.com/a_b_c_d");
    expect(html("Hier: https://x.de/*foo*/bar")).toBe("Hier: https://x.de/*foo*/bar");
    expect(html("www.seite.de/_pfad_")).toBe("www.seite.de/_pfad_");
    expect(html("*https://x.de/termin*")).toBe("<strong>https://x.de/termin</strong>");
    expect(html("_Termin: https://x.de/buchen hier_")).toBe("<em>Termin: https://x.de/buchen hier</em>");
  });

  it("escapt HTML als Text", () => {
    expect(html("*<b>x</b>*")).toBe("<strong>&lt;b&gt;x&lt;/b&gt;</strong>");
  });

  it("gibt leere Werte und Text ohne Marker unverändert zurück", () => {
    expect(waFormatKnoten(null)).toBeNull();
    expect(waFormatKnoten(undefined)).toBeNull();
    expect(waFormatKnoten("")).toBe("");
    expect(waFormatKnoten("Hallo")).toBe("Hallo");
  });
});

describe("waOhneMarker", () => {
  it("entfernt nur echte Marker", () => {
    expect(waOhneMarker("*Haben Sie sich den Termin schon eingetragen?*")).toBe("Haben Sie sich den Termin schon eingetragen?");
    expect(waOhneMarker("*_fett kursiv_* ~alt~ ```mono```")).toBe("fett kursiv alt mono");
    expect(waOhneMarker("3*4*5 snake_case https://x.de/_a_")).toBe("3*4*5 snake_case https://x.de/_a_");
    expect(waOhneMarker("*eins\nzwei*")).toBe("*eins\nzwei*");
    expect(waOhneMarker("Sie: *Hallo* Herr Muster")).toBe("Sie: Hallo Herr Muster");
  });

  it("lässt null, leer und Text ohne Marker durch", () => {
    expect(waOhneMarker(null)).toBeNull();
    expect(waOhneMarker(undefined)).toBeUndefined();
    expect(waOhneMarker("")).toBe("");
    expect(waOhneMarker("Hallo")).toBe("Hallo");
  });
});
