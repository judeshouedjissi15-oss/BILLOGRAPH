// GET /api/ai/conversations — liste des conversations Rechmial IA du compte connecté.
// SÉCURITÉ : session obligatoire ; seules SES conversations sont renvoyées.
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { jsonOk, handleApiError } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    const conversations = await db.aiConversation.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: { id: true, title: true, updatedAt: true },
    });
    return jsonOk({ conversations });
  } catch (err) {
    return handleApiError(err);
  }
}
