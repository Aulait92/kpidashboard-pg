import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { ChatsAnsicht, type ChatsSuche } from "./chats-ansicht";

export const dynamic = "force-dynamic";

export const metadata = { title: "Chats | performancegrowth Admin" };

// Inhalt in chats-ansicht.tsx (gemeinsam mit dem neuen Admin unter /admin/neu/leads/chats).
export default async function AdminWhatsAppPage({ searchParams }: { searchParams: Promise<ChatsSuche> }) {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") redirect("/login");
  return <ChatsAnsicht sp={await searchParams} />;
}
