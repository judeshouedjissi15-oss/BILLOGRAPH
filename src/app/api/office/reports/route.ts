// MES RAPPORTS (module « Magnifier son appel »).
// GET  /api/office/reports — historique complet des rapports de l'officier.
// POST /api/office/reports — publication d'un rapport RÉEL : les réalisations
//        s'appuient sur les tâches terminées en base (comptage réel figé au
//        moment de la rédaction) ; le rapport est ensuite immuable.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { requireOfficeRequest, logOfficeActivity, logOfficeAudit, notifyUser } from "@/lib/office-server";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireOfficeRequest(req);
    const reportScope = ctx.asOwner ? { officeRole: ctx.role } : { officerId: ctx.user.id };
    const doneScope = ctx.asOwner
      ? { officeRole: ctx.role, status: "DONE" as const, deletedAt: null }
      : { assigneeId: ctx.user.id, status: "DONE" as const, deletedAt: null };
    const [reports, doneTasks] = await Promise.all([
      db.officeReport.findMany({
        where: reportScope,
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      db.officeTask.findMany({
        where: doneScope,
        orderBy: { reviewedAt: "desc" },
        take: 30,
        select: { id: true, title: true, reviewedAt: true, assignee: { select: { name: true } } },
      }),
    ]);

    return jsonOk({
      reports: reports.map((r) => ({
        id: r.id,
        periodLabel: r.periodLabel,
        realizations: r.realizations,
        difficulties: r.difficulties,
        unresolved: r.unresolved,
        needs: r.needs,
        tasksDoneCount: r.tasksDoneCount,
        createdAt: r.createdAt.toISOString(),
      })),
      doneTasks: doneTasks.map((t) => ({
        id: t.id,
        title: t.title,
        reviewedAt: t.reviewedAt?.toISOString() ?? null,
        assigneeName: t.assignee?.name ?? null,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

type CreateBody = {
  periodLabel?: unknown;
  realizations?: unknown;
  difficulties?: unknown;
  unresolved?: unknown;
  needs?: unknown;
};

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireOfficeRequest(req);
    const body = (await readJson(req)) as CreateBody;

    const periodLabel = typeof body.periodLabel === "string" ? body.periodLabel.trim() : "";
    if (periodLabel.length < 3 || periodLabel.length > 120) {
      throw new HttpError(422, "Précisez la période couverte (ex. « Semaine du 03 au 09 février »).");
    }
    const realizations = typeof body.realizations === "string" ? body.realizations.trim() : "";
    if (realizations.length < 10) {
      throw new HttpError(422, "Décrivez vos réalisations réelles (10 caractères minimum).");
    }

    // Comptage RÉEL des tâches terminées au moment de la rédaction.
    const tasksDoneCount = await db.officeTask.count({
      where: {
        deletedAt: null,
        status: "DONE",
        ...(ctx.asOwner ? { officeRole: ctx.role } : { assigneeId: ctx.user.id }),
      },
    });

    const report = await db.officeReport.create({
      data: {
        officerId: ctx.user.id,
        officeRole: ctx.role,
        periodLabel: periodLabel.slice(0, 120),
        realizations: realizations.slice(0, 6000),
        difficulties:
          typeof body.difficulties === "string" && body.difficulties.trim() !== ""
            ? body.difficulties.trim().slice(0, 3000)
            : null,
        unresolved:
          typeof body.unresolved === "string" && body.unresolved.trim() !== ""
            ? body.unresolved.trim().slice(0, 3000)
            : null,
        needs:
          typeof body.needs === "string" && body.needs.trim() !== ""
            ? body.needs.trim().slice(0, 3000)
            : null,
        tasksDoneCount,
      },
    });

    await logOfficeActivity({
      userId: ctx.user.id,
      officeRole: ctx.role,
      action: "REPORT_SUBMITTED",
      entityType: "OfficeReport",
      entityId: report.id,
      details: `Rapport « ${periodLabel} » publié (${tasksDoneCount} tâche(s) terminée(s) au total).`,
    });
    await logOfficeAudit({
      actorUserId: ctx.user.id,
      action: "OFFICE_REPORT_SUBMITTED",
      entity: "OfficeReport",
      entityId: report.id,
      metadata: { officeRole: ctx.role, periode: periodLabel, tachesTerminees: tasksDoneCount },
    });

    // Le propriétaire est réellement informé qu'un rapport est disponible.
    if (!ctx.asOwner) {
      const admins = await db.user.findMany({
        where: { role: "ADMIN", status: "ACTIVE" },
        select: { id: true },
      });
      for (const admin of admins) {
        await notifyUser({
          userId: admin.id,
          type: "OFFICE_REPORT",
          title: "Nouveau rapport d'officier",
          body: `${ctx.user.name} (${ctx.office.label}) a publié le rapport « ${periodLabel} » — ${tasksDoneCount} tâche(s) terminée(s).`,
          link: "#/admin",
        });
      }
    }

    return jsonOk({ report: { id: report.id } }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
