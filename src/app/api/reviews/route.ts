// GET  /api/reviews — PUBLIC : les avis APPROVED, les plus récents d'abord
//      (interrogé en continu par la page d'accueil → un avis approuvé par
//      l'admin apparaît automatiquement, sans rechargement).
// POST /api/reviews — PUBLIC : dépôt d'un avis par un visiteur ou un
//      utilisateur connecté. L'avis passe en PENDING (modération admin) sauf
//      si « Publication automatique » est activée dans Paramètres.
// SÉCURITÉ : rate-limit anti-spam (5 dépôts / 10 min / IP), validation Zod,
// aucune donnée personnelle au-delà du nom/rôle/ville fournis volontairement.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { reviewCreateSchema } from "@/lib/validation";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

const PUBLIC_SELECT = {
  id: true,
  authorName: true,
  authorRole: true,
  authorCity: true,
  rating: true,
  content: true,
  createdAt: true,
} as const;

export async function GET() {
  try {
    const reviews = await db.review.findMany({
      where: { status: "APPROVED", deletedAt: null },
      orderBy: [{ moderatedAt: "desc" }, { createdAt: "desc" }],
      take: 24,
      select: PUBLIC_SELECT,
    });
    return jsonOk({ reviews });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    rateLimit(`reviews:ip:${ip}`, 5, 10 * 60_000);

    const data = reviewCreateSchema.parse(await readJson(req));

    // Auteur connecté (optionnel) : l'avis est lié au compte et le nom affiché
    // reste celui fourni dans le formulaire.
    const user = await getSessionUser().catch(() => null);

    // Le mode de publication dépend du réglage admin (synchronisé).
    const settings = await db.platformSettings.findUnique({ where: { id: "main" } });
    const autoPublish = settings?.reviewsAutoPublish ?? false;

    const review = await db.review.create({
      data: {
        userId: user?.id ?? null,
        authorName: data.name,
        authorRole: data.role || null,
        authorCity: data.city || null,
        rating: data.rating,
        content: data.content,
        status: autoPublish ? "APPROVED" : "PENDING",
        moderatedAt: autoPublish ? new Date() : null,
      },
      select: { id: true, status: true },
    });

    await logAudit({
      actorUserId: user?.id ?? null,
      action: autoPublish ? "REVIEW_PUBLISHED" : "REVIEW_SUBMITTED",
      entity: "Review",
      entityId: review.id,
      metadata: { ip, note: data.rating, lieAuCompte: Boolean(user) },
    });

    if (!autoPublish && review.status === "PENDING") {
      return jsonOk(
        {
          review,
          message:
            "Merci ! Votre avis a été reçu — il sera publié après validation par l'administrateur.",
        },
        201,
      );
    }
    return jsonOk(
      { review, message: "Merci ! Votre avis est publié sur la page d'accueil." },
      201,
    );
  } catch (err) {
    return handleApiError(err);
  }
}
