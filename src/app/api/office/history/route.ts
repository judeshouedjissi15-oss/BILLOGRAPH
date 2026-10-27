// MON HISTORIQUE DE TRAVAIL (module « Magnifier son appel »).
// GET /api/office/history — journal professionnel réel de l'officier connecté.
// Le propriétaire agissant dans un office voit l'historique complet de l'office.
import { db } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";
import { requireOfficeRequest } from "@/lib/office-server";
import { ACTIVITY_ACTION_LABELS } from "@/lib/offices";

export async function GET(req: Request) {
  try {
    const ctx = await requireOfficeRequest(req);
    const url = new URL(req.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? "80");
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 && limitRaw <= 200 ? limitRaw : 80;

    if (ctx.asOwner) {
      const officeActivities = await db.officeActivity.findMany({
        where: { officeRole: ctx.role },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: { user: { select: { name: true } } },
      });
      return jsonOk({
        entries: officeActivities.map((a) => ({
          id: a.id,
          action: a.action,
          actionLabel: ACTIVITY_ACTION_LABELS[a.action] ?? a.action,
          entityType: a.entityType,
          details: a.details,
          authorName: a.user.name,
          fromAdjoint: false,
          createdAt: a.createdAt.toISOString(),
        })),
      });
    }

    const [own, supervised] = await Promise.all([
      db.officeActivity.findMany({
        where: { userId: ctx.user.id },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      db.officeActivity.findMany({
        where: {
          entityType: "OfficeTask",
          userId: { not: ctx.user.id },
          user: { supervisorId: ctx.user.id },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: { user: { select: { name: true } } },
      }),
    ]);

    const entries = [
      ...own.map((a) => ({
        id: a.id,
        action: a.action,
        actionLabel: ACTIVITY_ACTION_LABELS[a.action] ?? a.action,
        entityType: a.entityType,
        details: a.details,
        authorName: ctx.user.name,
        fromAdjoint: false,
        createdAt: a.createdAt.toISOString(),
      })),
      ...supervised.map((a) => ({
        id: a.id,
        action: a.action,
        actionLabel: ACTIVITY_ACTION_LABELS[a.action] ?? a.action,
        entityType: a.entityType,
        details: a.details,
        authorName: a.user.name,
        fromAdjoint: true,
        createdAt: a.createdAt.toISOString(),
      })),
    ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    return jsonOk({ entries: entries.slice(0, limit) });
  } catch (err) {
    return handleApiError(err);
  }
}
