// GET    /api/ai/conversations/[id] — messages d'une conversation du compte connecté.
// DELETE /api/ai/conversations/[id] — suppression d'une conversation du compte connecté.
// SÉCURITÉ : session obligatoire ; propriété stricte (userId) — toute autre
// conversation renvoie 404 sans confirmer l'existence (anti-énumération).
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { jsonOk, jsonError, handleApiError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;

    const conversation = await db.aiConversation.findFirst({
      where: { id, userId: user.id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          select: { id: true, role: true, content: true, createdAt: true },
        },
      },
    });
    if (!conversation) return jsonError(404, "Conversation introuvable");

    return jsonOk({
      id: conversation.id,
      title: conversation.title,
      messages: conversation.messages.map((m) => ({
        id: m.id,
        role: m.role === "user" ? "user" : "assistant",
        content: m.content,
        createdAt: m.createdAt,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await ctx.params;

    const conversation = await db.aiConversation.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!conversation) return jsonError(404, "Conversation introuvable");

    await db.aiConversation.delete({ where: { id: conversation.id } });
    await logAudit({
      actorUserId: user.id,
      action: "AI_CONVERSATION_DELETED",
      entity: "AiConversation",
      entityId: conversation.id,
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
