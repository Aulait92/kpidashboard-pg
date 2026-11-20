import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentSession } from "@/lib/auth";

// Wirtschaftlichkeits-Matrix Bestandskunden vs. Mitarbeiter als PDF (Ole, 20.11.2026), nur für Admins,
// das PDF liegt außerhalb von public/ (assets/unterlagen/), damit es nicht öffentlich abrufbar ist.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return new Response("Nicht erlaubt.", { status: 403 });
  let data: Buffer;
  try {
    data = await readFile(path.join(process.cwd(), "assets/unterlagen/wirtschaftlichkeits-matrix.pdf"));
  } catch {
    return new Response("Nicht gefunden.", { status: 404 });
  }
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(data.length),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent("Wirtschaftlichkeits-Matrix.pdf")}`,
      "Cache-Control": "private, no-store",
    },
  });
}
