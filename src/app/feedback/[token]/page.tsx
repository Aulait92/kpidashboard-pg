import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { FeedbackForm } from "./feedback-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ihr Feedback | performancegrowth", robots: { index: false } };

export default async function FeedbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ s?: string }>;
}) {
  const { token } = await params;
  const { s } = await searchParams;
  if (!token || token.length < 16) notFound();
  const fb = await prisma.customerFeedback.findUnique({ where: { token }, select: { kind: true, score: true } });
  if (!fb) notFound();
  const pre = Number(s);
  const initial = Number.isInteger(pre) && pre >= 1 && pre <= 5 ? pre : fb.score;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-2 text-[17px] font-semibold">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--brand)] text-[13px] text-white">↗</span>
        <span>
          performance<span className="text-[color:var(--brand)]">growth</span>
        </span>
      </div>
      <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-6 shadow-[var(--shadow-md)]">
        <h1 className="text-xl font-semibold tracking-tight">
          {fb.kind === "day7" ? "Wie lief Ihr Start?" : "Wie zufrieden sind Sie nach dem ersten Monat?"}
        </h1>
        <p className="mb-5 mt-1 text-sm text-[color:var(--muted)]">Ihre Antwort geht direkt an Ole Kannapinn.</p>
        <FeedbackForm token={token} initialScore={initial ?? null} />
      </div>
    </main>
  );
}
