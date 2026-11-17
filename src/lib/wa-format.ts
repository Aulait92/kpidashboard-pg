// WhatsApp-Formatierung für die Anzeige von Chattexten (Kundenbereich, Admin, Support-Postfach).
// *fett*, _kursiv_, ~durchgestrichen~, ```mono``` nach den WhatsApp-Regeln:
// - Marker nur an Wortgrenzen: vor dem öffnenden Zeichen kein Buchstabe/keine Ziffer, nach dem schließenden auch nicht
//   (3*4*5, snake_case_name, max_muster@x.de bleiben unverändert).
// - Direkt innerhalb der Marker kein Leerzeichen („* nicht fett *“), Inhalt nicht leer.
// - Nie über Zeilenumbrüche hinweg; nie innerhalb von Links (https://…, www.…).
// - Verschachteln geht (*_fett und kursiv_*), in ```mono``` wird nichts weiter formatiert.
// waFormatKnoten liefert React-Knoten (kein dangerouslySetInnerHTML), waOhneMarker reinen Text für Vorschauen und Push.

import { createElement, Fragment, type ReactNode } from "react";

type Art = "fett" | "kursiv" | "durch" | "mono";
type Knoten = string | { art: Art; kinder: Knoten[] };

const MARKER: Record<string, Art> = { "*": "fett", _: "kursiv", "~": "durch" };
const WORTZEICHEN = /[\p{L}\p{N}]/u;
const LINK = /(?:https?:\/\/|www\.)[^\s]+/gi;
const LINK_ENDE = /[.,;:!?)\]}"'*_~»«“”„]+$/;

const istWortzeichen = (z: string | undefined) => z !== undefined && WORTZEICHEN.test(z);
const istLeer = (z: string | undefined) => z === undefined || /\s/.test(z);

/** Bereiche [start, ende) der Links in einer Zeile, ohne Satzzeichen und Marker am Ende. */
function linkBereiche(zeile: string): [number, number][] {
  const out: [number, number][] = [];
  for (const m of zeile.matchAll(LINK)) {
    const text = m[0].replace(LINK_ENDE, "");
    if (text.length > 0) out.push([m.index, m.index + text.length]);
  }
  return out;
}

function zerlegeZeile(zeile: string): Knoten[] {
  const links = linkBereiche(zeile);
  const imLink = (i: number) => links.some(([a, b]) => i >= a && i < b);
  const out: Knoten[] = [];
  let text = "";
  const flush = () => {
    if (text) out.push(text);
    text = "";
  };
  let i = 0;
  while (i < zeile.length) {
    const z = zeile[i];
    const linksFrei = !istWortzeichen(zeile[i - 1]);
    if (!imLink(i) && linksFrei && zeile.startsWith("```", i)) {
      const ende = zeile.indexOf("```", i + 3);
      if (ende > i + 3 && !imLink(ende) && !istWortzeichen(zeile[ende + 3])) {
        flush();
        out.push({ art: "mono", kinder: [zeile.slice(i + 3, ende)] });
        i = ende + 3;
        continue;
      }
    }
    const art = MARKER[z];
    if (art && !imLink(i) && linksFrei && !istLeer(zeile[i + 1]) && zeile[i + 1] !== z) {
      let ende = -1;
      for (let j = i + 2; j < zeile.length; j++) {
        if (zeile[j] === z && !istLeer(zeile[j - 1]) && !istWortzeichen(zeile[j + 1]) && !imLink(j)) {
          ende = j;
          break;
        }
      }
      if (ende > 0) {
        flush();
        out.push({ art, kinder: zerlegeZeile(zeile.slice(i + 1, ende)) });
        i = ende + 1;
        continue;
      }
    }
    text += z;
    i++;
  }
  flush();
  return out;
}

function zerlege(text: string): Knoten[][] {
  return text.split("\n").map(zerlegeZeile);
}

const TAG: Record<Art, string> = { fett: "strong", kursiv: "em", durch: "s", mono: "code" };

function alsReact(k: Knoten, key: number): ReactNode {
  if (typeof k === "string") return k;
  return createElement(TAG[k.art], { key }, ...k.kinder.map(alsReact));
}

function alsText(k: Knoten): string {
  return typeof k === "string" ? k : k.kinder.map(alsText).join("");
}

/** Chattext mit WhatsApp-Formatierung als React-Knoten (für whitespace-pre-wrap-Blasen). */
export function waFormatKnoten(text: string | null | undefined): ReactNode {
  if (!text) return text ?? null;
  if (!/[*_~`]/.test(text)) return text;
  const zeilen = zerlege(text);
  const kinder: ReactNode[] = [];
  zeilen.forEach((zeile, n) => {
    if (n > 0) kinder.push("\n");
    zeile.forEach((k) => kinder.push(alsReact(k, kinder.length)));
  });
  return createElement(Fragment, null, ...kinder);
}

/** Chattext ohne WhatsApp-Marker (Listen-Vorschau, Push, Benachrichtigung). */
export function waOhneMarker(text: string): string;
export function waOhneMarker(text: string | null | undefined): string | null | undefined;
export function waOhneMarker(text: string | null | undefined): string | null | undefined {
  if (!text || !/[*_~`]/.test(text)) return text;
  return zerlege(text)
    .map((zeile) => zeile.map(alsText).join(""))
    .join("\n");
}
