// GET /api/announcements/active — annonce active pour la barre d'annonce
// publique (aucune authentification requise, lecture seule).
// Renvoie { announcement: null } si aucune annonce n'est active.
import { db } from "@/lib/db";
import { jsonOk, handleApiError } from "@/lib/api";

export async function GET() {
  try {
    const announcement = await db.announcement.findFirst({
      where: { active: true, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, message: true, link: true, linkLabel: true },
    });

    return jsonOk({ announcement });
  } catch (err) {
    return handleApiError(err);
  }
}
