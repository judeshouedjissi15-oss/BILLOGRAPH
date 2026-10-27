// POST /api/ai/chat — Rechmial IA : conversation réelle avec le modèle (SDK serveur).
// SÉCURITÉ :
// - Session ACTIVE obligatoire (tous rôles) ; sinon 401.
// - Rate limit par utilisateur (20 messages / 10 min) — protège le quota et le service.
// - Validation stricte du message (1 à 2000 caractères, nettoyage des caractères de contrôle).
// - Contexte injecté au modèle : agrégats du SEUL compte connecté (voir src/lib/ai.ts).
// - Historique chargé depuis la base (propriété vérifiée), 12 derniers tours.
// - Audit AI_CHAT sans contenu (ni message, ni réponse — confidentialité).
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { jsonOk, jsonError, readJson, handleApiError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import {
  AI_RATE_MAX,
  AI_RATE_WINDOW_MS,
  AI_MODEL_MAX_MESSAGE,
  buildRechmialContext,
  callRechmial,
  normalizeUserMessage,
} from "@/lib/ai";
import { z } from "zod";

const bodySchema = z.object({
  message: z.string().min(1, "Message vide").max(AI_MODEL_MAX_MESSAGE, "Message trop long"),
  conversationId: z.string().min(1).max(64).optional(),
});

function deriveTitle(message: string): string {
  const clean = message.replace(/\s+/g, " ").trim();
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean || "Nouvelle conversation";
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    rateLimit(`ai:${user.id}`, AI_RATE_MAX, AI_RATE_WINDOW_MS);

    const parsed = bodySchema.safeParse(await readJson(req));
    if (!parsed.success) {
      return jsonError(422, "Message invalide (1 à 2000 caractères attendus)");
    }
    const message = normalizeUserMessage(parsed.data.message);
    if (!message) return jsonError(422, "Message invalide après nettoyage");

    // Conversation existante (propriété stricte) ou nouvelle.
    let conversationId = parsed.data.conversationId ?? null;
    if (conversationId) {
      const existing = await db.aiConversation.findFirst({
        where: { id: conversationId, userId: user.id },
      });
      if (!existing) return jsonError(404, "Conversation introuvable");
    } else {
      const created = await db.aiConversation.create({
        data: { userId: user.id, title: deriveTitle(message) },
      });
      conversationId = created.id;
    }

    // Historique récent (avant le nouveau message) — lu depuis la base.
    const historyRows = await db.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: 12,
    });
    const history = historyRows
      .reverse()
      .map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("assistant" as const),
        content: m.content,
      }));

    // Contexte réel par rôle + appel au modèle.
    const contextBlock = await buildRechmialContext(user);
    const reply = await callRechmial(history, message, contextBlock);

    // Persistance : message utilisateur puis réponse.
    await db.aiMessage.createMany({
      data: [
        { conversationId, role: "user", content: message },
        { conversationId, role: "assistant", content: reply },
      ],
    });
    await db.aiConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    await logAudit({
      actorUserId: user.id,
      action: "AI_CHAT",
      entity: "AiConversation",
      entityId: conversationId,
      metadata: { messageChars: message.length }, // jamais le contenu
    });

    return jsonOk({ conversationId, reply });
  } catch (err) {
    if (err instanceof Error && err.message === "Délai dépassé") {
      return jsonError(504, "Rechmial IA met trop de temps à répondre. Réessayez dans un instant.");
    }
    if (err instanceof Error && /réponse vide|upstream|model/i.test(err.message)) {
      console.error("[rechmial] erreur modèle:", err.message);
      return jsonError(502, "Rechmial IA est momentanément indisponible. Réessayez dans un instant.");
    }
    return handleApiError(err);
  }
}
