// Kleiner ZIP-Leser ohne Abhängigkeit (für Beleg-ZIPs aus Portalen wie Meta). Liest das zentrale Verzeichnis,
// Methoden „stored“ (0) und „deflate“ (8). Ordner, versteckte Dateien und __MACOSX werden übersprungen. Getestet.

import { inflateRawSync } from "node:zlib";

export type ZipDatei = { name: string; daten: Buffer };

export function istZip(buf: Uint8Array): boolean {
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

export function entpackeZip(input: Uint8Array, maxDateien = 500, maxBytes = 50 * 1024 * 1024): ZipDatei[] {
  return [...zipEintraege(input, maxDateien, maxBytes, true)];
}

/**
 * Wie entpackeZip, aber Datei für Datei (Ole, 23.11.2026: Meta-ZIP eines Jahres war entpackt über 50 MB und wurde als
 * „keine lesbare Datei“ abgelehnt). maxBytes gilt hier je Datei, nicht für alle zusammen; so bleibt nur eine Datei im
 * Speicher.
 */
export function* entpackeZipEinzeln(input: Uint8Array, maxDateien = 3000, maxBytes = 15 * 1024 * 1024): Generator<ZipDatei> {
  for (const d of zipEintraege(input, maxDateien, maxBytes, false)) yield d;
}

function* zipEintraege(input: Uint8Array, maxDateien: number, maxBytes: number, summeBegrenzen: boolean): Generator<ZipDatei> {
  const buf = Buffer.from(input);
  // Ende des zentralen Verzeichnisses suchen (von hinten)
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip_ungueltig");
  const anzahl = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  let summe = 0;
  let zahl = 0;
  for (let n = 0; n < anzahl && zahl < maxDateien; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("zip_ungueltig");
    const methode = buf.readUInt16LE(p + 10);
    const komprimiert = buf.readUInt32LE(p + 20);
    const groesse = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const kommentarLen = buf.readUInt16LE(p + 32);
    const lokal = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extraLen + kommentarLen;
    const basis = name.split("/").pop() ?? "";
    if (!basis || name.endsWith("/") || basis.startsWith(".") || name.startsWith("__MACOSX")) continue;
    if (buf.readUInt32LE(lokal) !== 0x04034b50) throw new Error("zip_ungueltig");
    const start = lokal + 30 + buf.readUInt16LE(lokal + 26) + buf.readUInt16LE(lokal + 28);
    const roh = buf.subarray(start, start + komprimiert);
    let daten: Buffer;
    if (methode === 0) daten = Buffer.from(roh);
    else if (methode === 8) {
      // Einzeln: zu große Datei überspringen statt das ganze ZIP abzulehnen
      try {
        daten = inflateRawSync(roh, { maxOutputLength: maxBytes });
      } catch (e) {
        if (summeBegrenzen) throw e;
        continue;
      }
    }
    else continue;
    if (groesse && daten.length !== groesse) throw new Error("zip_ungueltig");
    summe += daten.length;
    if (summeBegrenzen && summe > maxBytes) throw new Error("zip_zu_gross");
    zahl++;
    yield { name: basis, daten };
  }
}
