// Text-Mail in ISO-8859-1 (Ole, 17.11.2026): Pivacom (leads@pivacom.com, Lead-Import für Heinrich von Kleist)
// lehnt Mails in UTF-8 ab: „Der Zeichensatz (Charset) der E-Mail ist nicht wie vorgeschrieben! (Ihrer: utf-8)“.
// Die Resend-API sendet immer UTF-8, deshalb bauen wir die Mail selbst (MIME, quoted-printable) und schicken sie
// über den SMTP-Zugang von Resend (smtp.resend.com, Benutzer „resend“, Passwort = RESEND_API_KEY).
// Reine Funktionen zum Bauen hier, Versand in lib/email.ts (sendPlainMailLatin1).

/** Empfänger-Domains, die Latin-1 verlangen (PPL_LATIN1_DOMAINS, Komma-getrennt; Standard pivacom.com). */
export function latin1Domains(): string[] {
  const raw = process.env.PPL_LATIN1_DOMAINS?.trim();
  return (raw ? raw.split(",") : ["pivacom.com"]).map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
}

export function brauchtLatin1(address: string, domains = latin1Domains()): boolean {
  const a = address.trim().toLowerCase().replace(/^.*<([^>]+)>.*$/, "$1");
  return domains.some((d) => a.endsWith(`@${d}`) || a.endsWith(`.${d}`));
}

// Zeichen außerhalb von ISO-8859-1 sinnvoll ersetzen (statt „?“), z. B. Euro, typografische Anführungszeichen.
const ERSATZ: Record<string, string> = {
  "€": "EUR",
  "„": '"',
  "“": '"',
  "”": '"',
  "‚": "'",
  "‘": "'",
  "’": "'",
  "–": "-",
  "—": "-",
  "…": "...",
  "•": "-",
  " ": " ",
  " ": " ",
  " ": " ",
  "Ł": "L",
  "ł": "l",
  "Œ": "OE",
  "œ": "oe",
};

/** Text auf ISO-8859-1 bringen: bekannte Zeichen ersetzen, Umlaute bleiben, Rest ohne Akzent bzw. „?“. */
export function zuLatin1(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    const cp = ch.codePointAt(0)!;
    if (cp <= 0xff) out += ch;
    else if (ERSATZ[ch] !== undefined) out += ERSATZ[ch];
    else {
      const ohne = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      out += ohne && [...ohne].every((c) => c.codePointAt(0)! <= 0xff) ? ohne : "?";
    }
  }
  return out;
}

/** Quoted-printable (RFC 2045) über Latin-1-Bytes, Zeilen höchstens 76 Zeichen, CRLF. */
export function quotedPrintable(text: string): string {
  const lines = zuLatin1(text).replace(/\r\n?/g, "\n").split("\n");
  return lines
    .map((line) => {
      let enc = "";
      const bytes = Buffer.from(line, "latin1");
      bytes.forEach((b, i) => {
        const last = i === bytes.length - 1;
        const plain = (b >= 33 && b <= 126 && b !== 61) || ((b === 32 || b === 9) && !last);
        enc += plain ? String.fromCharCode(b) : `=${b.toString(16).toUpperCase().padStart(2, "0")}`;
      });
      // weiche Umbrüche bei 75 Zeichen, nie mitten in einem =XX
      const parts: string[] = [];
      while (enc.length > 75) {
        let cut = 75;
        if (enc[cut - 1] === "=") cut -= 1;
        else if (enc[cut - 2] === "=") cut -= 2;
        parts.push(`${enc.slice(0, cut)}=`);
        enc = enc.slice(cut);
      }
      parts.push(enc);
      return parts.join("\r\n");
    })
    .join("\r\n");
}

/** Kopfzeile mit Umlauten als Encoded-Word (RFC 2047, ISO-8859-1, Q); reines ASCII bleibt unverändert. */
export function kopf(text: string): string {
  const t = zuLatin1(text);
  if (/^[\x20-\x7e]*$/.test(t)) return t;
  const q = [...Buffer.from(t, "latin1")]
    .map((b) => (b === 32 ? "_" : (b >= 48 && b <= 57) || (b >= 65 && b <= 90) || (b >= 97 && b <= 122) || [33, 42, 43, 45, 47].includes(b) ? String.fromCharCode(b) : `=${b.toString(16).toUpperCase().padStart(2, "0")}`))
    .join("");
  // Encoded-Words höchstens 75 Zeichen: in Stücke teilen
  const stuecke: string[] = [];
  let rest = q;
  while (rest.length) {
    let n = Math.min(rest.length, 60);
    if (rest[n - 1] === "=") n -= 1;
    else if (rest[n - 2] === "=") n -= 2;
    stuecke.push(`=?ISO-8859-1?Q?${rest.slice(0, n)}?=`);
    rest = rest.slice(n);
  }
  return stuecke.join("\r\n ");
}

/** Absender „Name <adresse>“ mit kodiertem Namen. */
function absender(from: string): string {
  const m = /^(.*)<([^>]+)>\s*$/.exec(from);
  if (!m) return from.trim();
  const name = m[1].trim().replace(/^"|"$/g, "");
  return name ? `${kopf(name)} <${m[2].trim()}>` : `<${m[2].trim()}>`;
}

export function adresseAus(from: string): string {
  return (/<([^>]+)>/.exec(from)?.[1] ?? from).trim();
}

/**
 * Komplette Mail (RFC 5322, CRLF) als Bytes. Inhalt in ISO-8859-1, möglichst „8bit“ (Umlaute als echte Bytes, so
 * lesen auch einfache Import-Programme die Felder ohne Dekodieren); nur bei sehr langen Zeilen quoted-printable.
 */
export function latin1Mail(opts: { from: string; to: string; subject: string; text: string; replyTo?: string | null; date?: Date; messageId?: string }): Buffer {
  const date = (opts.date ?? new Date()).toUTCString().replace("GMT", "+0000");
  const domain = adresseAus(opts.from).split("@")[1] ?? "performancegrowth.de";
  const id = opts.messageId ?? `<${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 10)}@${domain}>`;
  const kopfzeilen = [
    `From: ${absender(opts.from)}`,
    `To: ${opts.to}`,
    ...(opts.replyTo ? [`Reply-To: ${opts.replyTo}`] : []),
    `Subject: ${kopf(opts.subject)}`,
    `Date: ${date}`,
    `Message-ID: ${id}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=ISO-8859-1",
  ];
  const text = zuLatin1(opts.text).replace(/\r\n?/g, "\n");
  const lang = text.split("\n").some((l) => Buffer.byteLength(l, "latin1") > 900);
  const body = lang ? quotedPrintable(text) : text.split("\n").join("\r\n");
  kopfzeilen.push(`Content-Transfer-Encoding: ${lang ? "quoted-printable" : "8bit"}`);
  return Buffer.concat([Buffer.from(`${kopfzeilen.join("\r\n")}\r\n\r\n`, "ascii"), Buffer.from(`${body}\r\n`, "latin1")]);
}
