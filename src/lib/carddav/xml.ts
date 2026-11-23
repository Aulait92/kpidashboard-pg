// WebDAV/CardDAV-XML (RFC 4918, RFC 6352, RFC 6578) für das Adressbuch „Vertrieb performancegrowth“, ohne Datenbank
// und testbar. Kein XML-Paket: Die Anfragen der Kontakte-App sind klein; ein kleiner Leser mit Namensräumen reicht
// (Elemente, Attribute ignoriert, Text, Entities). Antworten bauen wir als Text mit festen Präfixen.

export const NS = {
  DAV: "DAV:",
  CARDDAV: "urn:ietf:params:xml:ns:carddav",
  CS: "http://calendarserver.org/ns/",
} as const;

const PREFIX: Record<string, string> = { [NS.DAV]: "d", [NS.CARDDAV]: "card", [NS.CS]: "cs" };

export type QName = { ns: string; name: string };
export type XmlNode = QName & { children: XmlNode[]; text: string };

export function escapeXml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function decodeEntities(v: string): string {
  return v.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k === "amp") return "&";
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    const code = k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });
}

/** Liest ein XML-Dokument in einen kleinen Baum (Namensräume aufgelöst). Null bei leerem oder kaputtem Text. */
export function parseXml(xml: string): XmlNode | null {
  const src = xml
    .replace(/^﻿/, "")
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_m, t: string) => escapeXml(t));
  const tag = /<(\/?)([A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  type Frame = { node: XmlNode; scope: Map<string, string>; prefix: string };
  const stack: Frame[] = [];
  let root: XmlNode | null = null;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(src))) {
    const between = src.slice(last, m.index);
    if (stack.length && between) stack[stack.length - 1].node.text += decodeEntities(between);
    last = tag.lastIndex;
    const [, closing, rawPrefix, local, attrs, selfClosing] = m;
    const prefix = rawPrefix ? rawPrefix.slice(0, -1) : "";
    if (closing) {
      const top = stack.pop();
      if (!top || top.node.name !== local || top.prefix !== prefix) return null;
      continue;
    }
    const parentScope = stack.length ? stack[stack.length - 1].scope : new Map<string, string>([["xml", "http://www.w3.org/XML/1998/namespace"]]);
    const scope = new Map(parentScope);
    for (const a of attrs.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      const [, key, v1, v2] = a;
      const value = decodeEntities(v1 ?? v2 ?? "");
      if (key === "xmlns") scope.set("", value);
      else if (key.startsWith("xmlns:")) scope.set(key.slice(6), value);
    }
    const ns = scope.get(prefix);
    if (ns === undefined && prefix) return null;
    const node: XmlNode = { ns: ns ?? "", name: local, children: [], text: "" };
    if (stack.length) stack[stack.length - 1].node.children.push(node);
    else if (root) return null;
    else root = node;
    if (!selfClosing) stack.push({ node, scope, prefix });
  }
  if (stack.length) return null;
  return root;
}

const is = (n: XmlNode, ns: string, name: string) => n.ns === ns && n.name === name;
const child = (n: XmlNode, ns: string, name: string) => n.children.find((c) => is(c, ns, name));

export type DavAnfrage = {
  /** Wurzelelement, z. B. propfind, addressbook-multiget, addressbook-query, sync-collection */
  root: QName | null;
  /** Gewünschte Eigenschaften; "allprop" auch bei leerem PROPFIND (RFC 4918 9.1) */
  props: QName[] | "allprop" | "propname";
  /** hrefs (addressbook-multiget) */
  hrefs: string[];
  /** sync-token (sync-collection), "" = erste Abfrage */
  syncToken: string | null;
};

/** Liest PROPFIND/REPORT-Text. Null bei kaputtem XML. */
export function parseDavRequest(body: string): DavAnfrage | null {
  if (!body.trim()) return { root: null, props: "allprop", hrefs: [], syncToken: null };
  const root = parseXml(body);
  if (!root) return null;
  const prop = child(root, NS.DAV, "prop");
  const props: DavAnfrage["props"] = prop
    ? prop.children.map((c) => ({ ns: c.ns, name: c.name }))
    : child(root, NS.DAV, "propname")
      ? "propname"
      : "allprop";
  const hrefs = root.children.filter((c) => is(c, NS.DAV, "href")).map((c) => c.text.trim()).filter(Boolean);
  const st = child(root, NS.DAV, "sync-token");
  return { root: { ns: root.ns, name: root.name }, props, hrefs, syncToken: st ? st.text.trim() : null };
}

/** Element-Name mit festem Präfix; fremde Namensräume mit eigener Deklaration. */
function tagName(q: QName, i: number): { open: string; name: string } {
  const p = PREFIX[q.ns];
  if (p) return { open: `${p}:${q.name}`, name: `${p}:${q.name}` };
  if (!q.ns) return { open: `${q.name} xmlns=""`, name: q.name };
  return { open: `x${i}:${q.name} xmlns:x${i}="${escapeXml(q.ns)}"`, name: `x${i}:${q.name}` };
}

/** Eine gefundene Eigenschaft als XML (Inhalt schon fertiges XML, leer = leeres Element). */
export function propXml(q: QName, inner = ""): string {
  const t = tagName(q, 0);
  return inner ? `<${t.open}>${inner}</${t.name}>` : `<${t.open}/>`;
}

export const STATUS = {
  200: "HTTP/1.1 200 OK",
  403: "HTTP/1.1 403 Forbidden",
  404: "HTTP/1.1 404 Not Found",
} as const;

/** <d:response> mit propstat für gefundene (200) und unbekannte (404) Eigenschaften. */
export function responseXml(href: string, found: string[], missing: QName[] = []): string {
  let out = `<d:response><d:href>${escapeXml(href)}</d:href>`;
  if (found.length) out += `<d:propstat><d:prop>${found.join("")}</d:prop><d:status>${STATUS[200]}</d:status></d:propstat>`;
  if (missing.length) {
    const inner = missing.map((q, i) => `<${tagName(q, i).open}/>`).join("");
    out += `<d:propstat><d:prop>${inner}</d:prop><d:status>${STATUS[404]}</d:status></d:propstat>`;
  }
  if (!found.length && !missing.length) out += `<d:propstat><d:prop/><d:status>${STATUS[200]}</d:status></d:propstat>`;
  return out + "</d:response>";
}

/** <d:response> nur mit Status (z. B. 404 für eine unbekannte Karte im multiget). */
export function statusResponseXml(href: string, status: keyof typeof STATUS): string {
  return `<d:response><d:href>${escapeXml(href)}</d:href><d:status>${STATUS[status]}</d:status></d:response>`;
}

/** 207 Multi-Status-Dokument mit allen Namensräumen. */
export function multistatus(responses: string[], extra = ""): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<d:multistatus xmlns:d="DAV:" xmlns:card="${NS.CARDDAV}" xmlns:cs="${NS.CS}">` +
    responses.join("") +
    extra +
    `</d:multistatus>`
  );
}

/** DAV-Fehlerdokument (RFC 4918 16), z. B. <d:valid-sync-token/> oder <d:need-privileges/>. */
export function davError(inner: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>\n<d:error xmlns:d="DAV:" xmlns:card="${NS.CARDDAV}">${inner}</d:error>`;
}

/** href (absolut oder Pfad, ggf. prozentkodiert) → Pfad ohne abschließenden Schrägstrich. */
export function hrefPfad(href: string): string {
  let p = href.trim();
  if (/^https?:\/\//i.test(p)) {
    try {
      p = new URL(p).pathname;
    } catch {
      return "";
    }
  }
  try {
    p = decodeURIComponent(p);
  } catch {
    // unverändert lassen
  }
  return p.length > 1 ? p.replace(/\/+$/, "") : p;
}
