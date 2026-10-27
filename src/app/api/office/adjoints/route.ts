// MES ADJOINTS (module « Magnifier son appel »).
// GET /api/office/adjoints — les adjoints actifs rattachés à l'officier
// connecté (supervisorId), avec leur charge de travail RÉELLE. L'officier ne
// leur transfère AUCUNE permission : ils exécutent les tâches reçues.
// Le PROPRIÉTAIRE agissant dans l'office voit tous les membres (lecture).
import { db } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";
import { requireOfficeRequest } from "@/lib/office-server";
import { MAX_ADJOINTS_PER_ROLE } from "@/lib/offices";

export async function GET(req: Request) {
  try {
    const ctx = await requireOfficeRequest(req);

    const members = await db.user.findMany({
      where: ctx.asOwner
        ? { officeRole: ctx.role }
        : { supervisorId: ctx.user.id, officeRole: ctx.role },
      select: {
        id: true,
        name: true,
        email: true,
        officeStatus: true,
        supervisorId: true,
        supervisor: { select: { name: true } },
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const ids = members.map((s) => s.id);
    const taskGroups = ids.length
      ? await db.officeTask.groupBy({
          by: ["assigneeId", "status"],
          where: { assigneeId: { in: ids }, deletedAt: null },
          _count: { _all: true },
        })
      : [];

    const statsByUser = new Map<string, { open: number; done: number; awaiting: number }>();
    for (const g of taskGroups) {
      const cur = statsByUser.get(g.assigneeId) ?? { open: 0, done: 0, awaiting: 0 };
      if (g.status === "DONE") cur.done += g._count._all;
      else if (g.status === "AWAITING_VALIDATION") cur.awaiting += g._count._all;
      else cur.open += g._count._all;
      statsByUser.set(g.assigneeId, cur);
    }

    const pendingValidations = await db.officeTask.count({
      where: {
        status: "AWAITING_VALIDATION",
        deletedAt: null,
        ...(ctx.asOwner
          ? { officeRole: ctx.role }
          : { officerId: ctx.user.id, assigneeId: { not: ctx.user.id } }),
      },
    });

    return jsonOk({
      canManageAdjoints: ctx.asOwner ? false : ctx.office.canHaveAdjoints,
      asOwner: ctx.asOwner,
      maxAdjoints: MAX_ADJOINTS_PER_ROLE,
      activeAdjoints: members.filter((s) => s.officeStatus === "ACTIVE").length,
      pendingValidations,
      adjoints: members.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        active: s.officeStatus === "ACTIVE",
        isTitulaire: !s.supervisorId,
        supervisorName: s.supervisor?.name ?? null,
        attributedAt: s.createdAt.toISOString(),
        tasks: statsByUser.get(s.id) ?? { open: 0, done: 0, awaiting: 0 },
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
