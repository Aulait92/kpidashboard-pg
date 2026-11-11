import { loadLoginInfoImage } from "@/lib/login-info-server";

// Bild der Infokarte auf der Login-Seite (öffentlich, keine Personendaten).
// Die Login-Seite hängt ?v=<Änderungszeitpunkt> an, daher darf lange gecacht werden.
export async function GET() {
  const img = await loadLoginInfoImage();
  if (!img) return new Response("Nicht gefunden", { status: 404 });
  return new Response(new Uint8Array(img.bytes), {
    headers: {
      "Content-Type": img.type,
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
