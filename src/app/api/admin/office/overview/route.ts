// GET /api/admin/office/overview — SUPERVISION DES OFFICES par le propriétaire
// (et consultation en LECTURE SEULE par le greffier) :
//   · effectifs par office (x/5) ;
//   · tâches réelles par office et par statut ;
//   · travaux en attente de validation du propriétaire (soumis par officiers) ;
//   · demandes d'aide ouvertes (confidentielles incluses : seul le propriétaire
//     y accède) ;
//   · rapports récents et activités récentes des équipes.
import { db } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";
import { requireAdmin } from "@/lib/office-server";
import { requireAdminViewer } from "@/lib/auth";
import { OFFICE_DEFS, MAX_ADJOINTS_PER_ROLE } from "@/lib/offices";

export async function GET() {
  try {
    await requireAdminViewer();

    const [members, taskGroups, tasksPending, helpRequests, recentReports, recentActivities, trainingCount] =
      await Promise.all([
        db.user.findMany({
          where: { officeRole: { not: null } },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
            officeRole: true,
            officeStatus: true,
            officeActivatedAt: true,
            supervisorId: true,
            supervisor: { select: { name: true } },
          },
        }),
        db.officeTask.groupBy({
          by: ["officeRole", "status"],
          where: { deletedAt: null },
          _count: { _all: true },
        }),
        db.officeTask.findMany({
          where: { status: "AWAITING_VALIDATION", deletedAt: null },
          take: 40,
          include: {
            assignee: { select: { id: true, name: true, officeRole: true } },
          },
        }),
        db.officeHelpRequest.findMany({
          orderBy: { createdAt: "desc" },
          take: 30,
          include: { requester: { select: { id: true, name: true, officeRole: true } }, respondedBy: { select: { name: true } } },
        }),
        db.officeReport.findMany({
          orderBy: { createdAt: "desc" },
          take: 15,
          include: { officer: { select: { id: true, name: true, officeRole: true } } },
        }),
        db.officeActivity.findMany({
          orderBy: { createdAt: "desc" },
          take: 40,
          include: { user: { select: { name: true, officeRole: true } } },
        }),
        db.officeTrainingResource.count({ where: { deletedAt: null } }),
      ]);

    const activeByRole: Record<string, number> = {};
    for (const m of members) {
      if (m.officeRole && m.officeStatus === "ACTIVE") {
        activeByRole[m.officeRole] = (activeByRole[m.officeRole] ?? 0) + 1;
      }
    }

    // Travaux soumis par des OFFICIERS (l'exécutant est le titulaire lui-même) :
    // seule autorité de validation = le propriétaire.
    const pendingOwnerValidations = tasksPending.filter((t) => t.assigneeId === t.officerId);

    const effectifs = OFFICE_DEFS.map((def) => {
      const statusCounts: Record<string, number> = {};
      for (const g of taskGroups) {
        if (g.officeRole === def.key) statusCounts[g.status] = g._count._all;
      }
      return {
        key: def.key,
        label: def.label,
        officeName: def.officeName,
        canHaveAdjoints: def.canHaveAdjoints,
        active: activeByRole[def.key] ?? 0,
        max: MAX_ADJOINTS_PER_ROLE,
        statusCounts,
      };
    });

    return jsonOk({
      effectifs,
      members: members.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
        status: m.status,
        officeRole: m.officeRole,
        officeStatus: m.officeStatus,
        officeActivatedAt: m.officeActivatedAt,
        supervisorId: m.supervisorId,
        supervisorName: m.supervisor?.name ?? null,
      })),
      pendingOwnerValidations: pendingOwnerValidations.map((t) => ({
        id: t.id,
        title: t.title,
        officeRole: t.officeRole,
        priority: t.priority,
        submittedAt: t.submittedAt,
        assigneeName: t.assignee.name,
      })),
      helpRequests: helpRequests.map((h) => ({
        id: h.id,
        subject: h.subject,
        message: h.message,
        category: h.category,
        confidential: h.confidential,
        status: h.status,
        response: h.response,
        respondedByName: h.respondedBy?.name ?? null,
        respondedAt: h.respondedAt,
        createdAt: h.createdAt,
        requesterName: h.requester.name,
        requesterOfficeRole: h.requester.officeRole,
      })),
      recentReports: recentReports.map((r) => ({
        id: r.id,
        periodLabel: r.periodLabel,
        realizations: r.realizations.slice(0, 400),
        tasksDoneCount: r.tasksDoneCount,
        createdAt: r.createdAt,
        officerName: r.officer.name,
        officerOfficeRole: r.officer.officeRole,
      })),
      recentActivities: recentActivities.map((a) => ({
        id: a.id,
        action: a.action,
        entityType: a.entityType,
        details: a.details,
        createdAt: a.createdAt,
        authorName: a.user.name,
        authorOfficeRole: a.user.officeRole,
      })),
      trainingCount,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

// requireAdmin est réexporté pour cohérence du module (supervision).
void requireAdmin;
