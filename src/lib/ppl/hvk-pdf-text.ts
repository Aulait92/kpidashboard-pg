// Text aus einem PDF lesen (HvK-Abrechnung). unpdf bringt pdf.js ohne Canvas mit und läuft serverseitig in Node.
// Als serverExternalPackages eingetragen (next.config.ts), damit pdf.js nicht gebündelt wird.

export async function pdfText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  // pdf.js übernimmt den Puffer (detached) → Kopie übergeben, das Original wird noch gespeichert
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  try {
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  } finally {
    await pdf.loadingTask.destroy().catch(() => {});
  }
}

/** Beginnt mit „%PDF-“? (Schutz vor falschen Anhängen/Uploads) */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length > 5 && Buffer.from(bytes.subarray(0, 5)).toString("latin1") === "%PDF-";
}
