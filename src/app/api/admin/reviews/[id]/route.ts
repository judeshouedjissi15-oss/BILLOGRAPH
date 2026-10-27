// PATCH  /api/admin/reviews/:id — modération d'un avis (ADMIN requis).
//   Body: { status: "APPROVED" | "REJECTED" } → horodate moderatedAt + audit.
// DELETE /api/admin/reviews/:id — suppression définitive (ADMIN requis) + audit.
// Un avis approuvé apparaît automatiquement sur la page d'accueil (le
// frontend interroge /api/reviews en continu).
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { HttpError, requireRole } from "@/lib/auth";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { adminReviewUpdateSchema } from "@/lib/validation";
import { clientIp } from "@/lib/rate-limit";
import { trashItem } from "@/lib/trash";
import { logAudit } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const admin = await requireRole("ADMIN");
    const { id } = await ctx.params;

    const body = adminReviewUpdateSchema.parse(await readJson(req));

    const existing = await db.review.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!existing) throw new HttpError(404, "Avis introuvable");

    const review = await db.review.update({
      where: { id },
      data: { status: body.status, moderatedAt: new Date() },
      select: { id: true, status: true, moderatedAt: true },
    });

    const ip = clientIp(req);
    await logAudit({
      actorUserId: admin.id,
      action: "REVIEW_MODERATED",
      entity: "Review",
      entityId: id,
      metadata: { ip, nouveauStatut: body.status, ancienStatut: existing.status },
    });

    return jsonOk({ review });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  try {
    const admin = await requireRole("ADMIN");
    const { id } = await ctx.params;

    const existing = await db.review.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
    if (!existing || existing.deletedAt) throw new HttpError(404, "Avis introuvable");

    // Corbeille : l'avis reste en base, restaurable et prouvable.
    await trashItem({ entity: "REVIEW", id, actorId: admin.id, note: "Supprimé par l'administration" });

    await logAudit({
      actorUserId: admin.id,
      action: "REVIEW_DELETED",
      entity: "Review",
      entityId: id,
      metadata: { ip: clientIp(req), corbeille: true },
    });

    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
