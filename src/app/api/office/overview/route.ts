// GET /api/office/overview — Aperçu de l'espace professionnel de l'officier
// connecté (module « Magnifier son appel »). Toutes les données proviennent
// réellement de la base : aucun chiffre n'est inventé.
// Le PROPRIÉTAIRE (ADMIN) hérite des capacités des officiers : avec
// ?officeRole=X il voit l'aperçu complet de l'office X et peut y agir.
import { db } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";
import { requireOfficeRequest } from "@/lib/office-server";

export async function GET(req: Request) {
  try {
    const ctx = await requireOfficeRequest(req);
    const userId = ctx.user.id;

    // Portée réelle : l'officier voit SON travail ; le propriétaire agissant
    // dans un office voit le travail de TOUT l'office (aucun chiffre inventé).
    const scope = ctx.asOwner ? { officeRole: ctx.role } : { assigneeId: userId };
    const scopeObjectives = ctx.asOwner ? { officeRole: ctx.role } : { officerId: userId };

    const [tasksByStatus, myDoneRecent, objectivesTotal, objectivesDone, adjoints, pendingValidations, unreadNotifications, trainingCount, doneTasksForReports] =
      await Promise.all([
        db.officeTask.groupBy({
          by: ["status"],
          where: { ...scope, deletedAt: null },
          _count: { _all: true },
        }),
        db.officeTask.findMany({
          where: { ...scope, status: "DONE", deletedAt: null },
          orderBy: { reviewedAt: "desc" },
          take: 5,
          select: { id: true, title: true, reviewedAt: true, assignee: { select: { name: true } } },
        }),
        db.officeObjective.count({ where: scopeObjectives }),
        db.officeObjective.count({ where: { ...scopeObjectives, status: "ATTEINT" } }),
        db.user.count({ where: { officeRole: ctx.role, officeStatus: "ACTIVE" } }),
        db.officeTask.count({
          where: { status: "AWAITING_VALIDATION", officeRole: ctx.role, deletedAt: null },
        }),
        db.notification.count({ where: { userId, readAt: null } }),
        db.officeTrainingResource.count({
          where: { active: true, deletedAt: null, OR: [{ officeRole: ctx.role }, { officeRole: null }] },
        }),
        db.officeTask.count({ where: { ...scope, status: "DONE", deletedAt: null } }),
      ]);

    const statusMap: Record<string, number> = {
      TODO: 0,
      IN_PROGRESS: 0,
      ON_HOLD: 0,
      AWAITING_VALIDATION: 0,
      DONE: 0,
    };
    for (const group of tasksByStatus) statusMap[group.status] = group._count._all;

    return jsonOk({
      office: ctx.office,
      asOwner: ctx.asOwner,
      account: {
        role: ctx.user.role,
        name: ctx.user.name,
        email: ctx.user.email,
      },
      counts: {
        tasks: statusMap,
        tasksDoneTotal: doneTasksForReports,
        objectives: objectivesTotal,
        objectivesReached: objectivesDone,
        adjoints,
        pendingValidations,
        unreadNotifications,
        trainingResources: trainingCount,
      },
      recentDoneTasks: myDoneRecent.map((t) => ({
        id: t.id,
        title: t.title,
        reviewedAt: t.reviewedAt,
        assigneeName: t.assignee?.name ?? null,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
