import { prisma } from "@/lib/prisma";
import { FUNNELS } from "@/lib/funnel/definition";
import { anteilEigen, weichenArm, weichenZiel } from "@/lib/funnel/weiche";
import { parseFunnelHosts } from "@/lib/funnel/host";

// Weiche eigener Funnel gegen Perspective (lib/funnel/weiche.ts). Auf beitrag.pkv-tarife.com unter /go erreichbar.
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ funnel: string }> }): Promise<Response> {
  const { funnel } = await ctx.params;
  if (!FUNNELS[funnel]) return new Response("Nicht gefunden", { status: 404 });
  const url = new URL(req.url);
  const arm = weichenArm(Math.random(), anteilEigen(process.env.WEICHE_ANTEIL_EIGEN));
  await prisma.funnelEreignis
    .create({ data: { besuchId: crypto.randomUUID(), funnel, schritt: "weiche", art: "zuteilung", variante: arm } })
    .catch((err) => console.error("[funnel weiche]", err instanceof Error ? err.message : err));
  const ziel = weichenZiel(arm, url.search, { perspectiveUrl: process.env.PERSPECTIVE_URL });
  // Eigen: auf der Funnel-Domain „/“ (dort zum Funnel umgeschrieben), sonst /f/<funnel> auf der App-Domain
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host).split(",")[0].trim();
  const proto = (req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")).split(",")[0].trim() || "https";
  const aufFunnelDomain = parseFunnelHosts(process.env.FUNNEL_HOSTS).get(host.toLowerCase().replace(/:\d+$/, "")) === funnel;
  const pfad = aufFunnelDomain ? ziel : ziel.replace(/^\//, `/f/${funnel}`);
  const location = arm === "eigen" ? `${proto}://${host}${pfad}` : ziel;
  return new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store" } });
}
