// OBJECTIFS ET PLAN DE TRAVAIL DE L'OFFICIER (module « Magnifier son appel »).
// GET  /api/office/objectives — objectifs réels + statistiques réelles de
//        tâches terminées par période (aucun chiffre inventé).
// POST /api/office/objectives — création d'un objectif mesurable.
// Le PROPRIÉTAIRE agissant dans un office (?officeRole=) désigne le membre
// auquel l'objectif est confié (membre actif réel, via body.memberId).
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import {
  requireOfficeRequest,
  assertAssignableInOffice,
  logOfficeActivity,
  logOfficeAudit,
} from "@/lib/office-server";
import { OBJECTIVE_PERIODS, TASK_PRIORITIES } from "@/lib/offices";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireOfficeRequest(req);
    const objectiveScope = ctx.asOwner ? { officeRole: ctx.role } : { officerId: ctx.user.id };
    const doneScope = ctx.asOwner
      ? { officeRole: ctx.role, status: "DONE" as const, deletedAt: null }
      : { assigneeId: ctx.user.id, status: "DONE" as const, deletedAt: null };
    const [objectives, doneTasks] = await Promise.all([
      db.officeObjective.findMany({
        where: objectiveScope,
        orderBy: [{ deadline: "asc" }, { createdAt: "desc" }],
        take: 100,
      }),
      db.officeTask.findMany({
        where: doneScope,
        select: { reviewedAt: true },
      }),
    ]);

    // Statistiques RÉELLES de réalisations (tâches validées) par période.
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfWeek = (startOfDay.getDay() + 6) % 7; // lundi = 0
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const doneAt = doneTasks.map((t) => t.reviewedAt).filter((d): d is Date => d !== null);
    const countSince = (from: Date) => doneAt.filter((d) => d >= from).length;

    return jsonOk({
      objectives: objectives.map((o) => ({
        id: o.id,
        title: o.title,
        description: o.description,
        metric: o.metric,
        target: o.target,
        achieved: o.achieved,
        unit: o.unit,
        period: o.period,
        priority: o.priority,
        deadline: o.deadline?.toISOString() ?? null,
        status: o.status,
        progressNote: o.progressNote,
        createdAt: o.createdAt.toISOString(),
      })),
      realStats: {
        doneToday: countSince(startOfDay),
        doneThisWeek: countSince(startOfWeek),
        doneThisMonth: countSince(startOfMonth),
        doneTotal: doneAt.length,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

type CreateBody = {
  title?: unknown;
  description?: unknown;
  metric?: unknown;
  target?: unknown;
  unit?: unknown;
  period?: unknown;
  priority?: unknown;
  deadline?: unknown;
  memberId?: unknown;
};

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireOfficeRequest(req);
    const body = (await readJson(req)) as CreateBody;

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (title.length < 3 || title.length > 200) {
      throw new HttpError(422, "L'intitulé de l'objectif doit contenir entre 3 et 200 caractères.");
    }
    const period =
      typeof body.period === "string" && (OBJECTIVE_PERIODS as readonly string[]).includes(body.period)
        ? body.period
        : "MENSUEL";
    const priority =
      typeof body.priority === "string" && (TASK_PRIORITIES as readonly string[]).includes(body.priority)
        ? body.priority
        : "NORMALE";
    const target =
      typeof body.target === "number" && Number.isInteger(body.target) && body.target >= 0
        ? body.target
        : null;
    const deadline =
      typeof body.deadline === "string" && body.deadline.trim() !== "" ? new Date(body.deadline) : null;
    if (deadline && Number.isNaN(deadline.getTime())) {
      throw new HttpError(422, "Échéance invalide.");
    }

    // Officier : l'objectif lui appartient. Propriétaire agissant dans
    // l'office : il désigne le membre auquel l'objectif est confié.
    let officerIdForObjective = ctx.user.id;
    if (ctx.asOwner) {
      const memberId = typeof body.memberId === "string" ? body.memberId.trim() : "";
      if (memberId === "") {
        throw new HttpError(422, "Sélectionnez le membre de l'office auquel l'objectif est confié.");
      }
      officerIdForObjective = (await assertAssignableInOffice(ctx.role, memberId)).officerId;
    }

    const objective = await db.officeObjective.create({
      data: {
        officeRole: ctx.role,
        officerId: officerIdForObjective,
        title,
        description:
          typeof body.description === "string" && body.description.trim() !== ""
            ? body.description.trim().slice(0, 2000)
            : null,
        metric:
          typeof body.metric === "string" && body.metric.trim() !== ""
            ? body.metric.trim().slice(0, 300)
            : null,
        target,
        unit:
          typeof body.unit === "string" && body.unit.trim() !== ""
            ? body.unit.trim().slice(0, 60)
            : null,
        period,
        priority,
        deadline,
        createdById: ctx.user.id,
      },
    });

    await logOfficeActivity({
      userId: ctx.user.id,
      officeRole: ctx.role,
      action: "OBJECTIVE_CREATED",
      entityType: "OfficeObjective",
      entityId: objective.id,
      details: `Objectif « ${title} » (${period}${deadline ? `, échéance ${deadline.toLocaleDateString("fr-FR")}` : ""}).`,
    });
    await logOfficeAudit({
      actorUserId: ctx.user.id,
      action: "OFFICE_OBJECTIVE_CREATED",
      entity: "OfficeObjective",
      entityId: objective.id,
      metadata: { officeRole: ctx.role, titre: title, period },
    });

    return jsonOk({ objective: { id: objective.id } }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
