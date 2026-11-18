// Attrappe eines clamd-Dienstes (ClamAV) über TCP für Tests der Virenprüfung (lib/sicherheit/virenpruefung.ts):
// versteht zPING und zINSTREAM (4-Byte-Längen, Ende mit 0) und meldet den EICAR-Teststring als Fund.
import net from "node:net";

// EICAR-Teststring (harmlos, von allen Virenscannern als Test erkannt), zusammengesetzt, damit die Quelldatei selbst
// nicht als Fund gilt.
export const EICAR = Buffer.from(["X5O!P%@AP[4\\PZX54(P^)7CC)7}$", "EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"].join(""), "latin1");

export type ClamdAttrappe = { port: number; befehle: string[]; geprueftBytes: number[]; stop(): Promise<void> };

export async function starteClamd(): Promise<ClamdAttrappe> {
  const befehle: string[] = [];
  const geprueftBytes: number[] = [];
  const server = net.createServer((sock) => {
    let puffer = Buffer.alloc(0);
    let befehl: string | null = null;
    const daten: Buffer[] = [];
    sock.on("data", (d) => {
      puffer = Buffer.concat([puffer, d]);
      if (befehl === null) {
        const ende = puffer.indexOf(0);
        if (ende < 0) return;
        befehl = puffer.subarray(0, ende).toString("utf8");
        befehle.push(befehl);
        puffer = puffer.subarray(ende + 1);
        if (befehl === "zPING") {
          sock.end("PONG\0");
          return;
        }
        if (befehl !== "zINSTREAM") {
          sock.end("UNKNOWN COMMAND\0");
          return;
        }
      }
      if (befehl !== "zINSTREAM") return;
      while (puffer.length >= 4) {
        const len = puffer.readUInt32BE(0);
        if (len === 0) {
          const alles = Buffer.concat(daten);
          geprueftBytes.push(alles.length);
          sock.end(alles.includes(EICAR) ? "stream: Eicar-Test-Signature FOUND\0" : "stream: OK\0");
          puffer = Buffer.alloc(0);
          return;
        }
        if (puffer.length < 4 + len) return;
        daten.push(Buffer.from(puffer.subarray(4, 4 + len)));
        puffer = puffer.subarray(4 + len);
      }
    });
    sock.on("error", () => {});
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as net.AddressInfo).port;
  return { port, befehle, geprueftBytes, stop: () => new Promise<void>((r) => server.close(() => r())) };
}
