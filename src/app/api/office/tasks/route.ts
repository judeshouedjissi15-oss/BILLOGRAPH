// TÂCHES D'OFFICE (module « Magnifier son appel »).
// GET  /api/office/tasks — tâches de l'officier (les siennes + celles de son
//        office qu'il a créées ou supervise), filtre statut optionnel.
// POST /api/office/tasks — création RÉELLE en base, par l'officier, pour
//        lui-même ou l'un de ses adjoints actifs (jamais au-delà).
// Le PROPRIÉTAIRE agissant dans un office (?officeRole=) peut confier des
// tâches à tout membre actif — l'autorité de validation reste l'officier réel.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import {
  requireOfficeRequest,
  assertAssignableByOfficer,
  assertAssignableInOffice,
  notifyUser,
  logOfficeActivity,
  logOfficeAudit,
} from "@/lib/office-server";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  officeLabel,
} from "@/lib/offices";

// Ordre réel d'urgence des priorités (tri côté serveur).
const PRIORITY_RANK: Record<string, number> = { URGENTE: 3, HAUTE: 2, NORMALE: 1, BASSE: 0 };

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireOfficeRequest(req);
    const url = new URL(req.url);
    const statusFilter = url.searchParams.get("status");
    const scope = url.searchParams.get("scope"); // "mine" (défaut) | "office"

    const where = {
      officeRole: ctx.role,
      deletedAt: null, // la corbeille est gérée côté administration
      ...(ctx.asOwner
        ? {} // le propriétaire voit toutes les tâches de l'office choisi
        : scope === "office"
          ? { officerId: ctx.user.id }
          : { OR: [{ assigneeId: ctx.user.id }, { officerId: ctx.user.id }] }),
      ...(statusFilter && (TASK_STATUSES as readonly string[]).includes(statusFilter)
        ? { status: statusFilter }
        : {}),
    };

    const tasks = await db.officeTask.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        assignee: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        comments: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { name: true } } },
        },
      },
      take: 200,
    });
    // Tri priorité métier puis date — le rang n'est pas une valeur numérique.
    tasks.sort((a, b) => {
      const pa = PRIORITY_RANK[a.priority] ?? 0;
      const pb = PRIORITY_RANK[b.priority] ?? 0;
      if (pa !== pb) return pb - pa;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    return jsonOk({
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate?.toISOString() ?? null,
        source: t.source,
        submittedAt: t.submittedAt?.toISOString() ?? null,
        reviewedAt: t.reviewedAt?.toISOString() ?? null,
        reviewNote: t.reviewNote,
        createdAt: t.createdAt.toISOString(),
        assignee: { id: t.assignee.id, name: t.assignee.name, isMe: t.assignee.id === ctx.user.id },
        createdByName: t.createdBy.name,
        createdByMe: t.createdById === ctx.user.id,
        canReview:
          t.status === "AWAITING_VALIDATION" &&
          (ctx.asOwner ||
            (t.assigneeId !== t.officerId ? ctx.user.id === t.officerId : ctx.user.role === "ADMIN")),
        comments: t.comments.map((c) => ({
          id: c.id,
          body: c.body,
          authorName: c.author.name,
          createdAt: c.createdAt.toISOString(),
        })),
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

type CreateBody = {
  title?: unknown;
  description?: unknown;
  priority?: unknown;
  dueDate?: unknown;
  assigneeId?: unknown;
  fromTemplate?: unknown;
};

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireOfficeRequest(req);
    const body = (await readJson(req)) as CreateBody;

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (title.length < 3 || title.length > 200) {
      throw new HttpError(422, "Le titre de la tâche doit contenir entre 3 et 200 caractères.");
    }
    const description =
      typeof body.description === "string" && body.description.trim().length > 0
        ? body.description.trim().slice(0, 4000)
        : null;
    const priority =
      typeof body.priority === "string" && (TASK_PRIORITIES as readonly string[]).includes(body.priority)
        ? body.priority
        : "NORMALE";
    const dueDate =
      typeof body.dueDate === "string" && body.dueDate.trim() !== ""
        ? new Date(body.dueDate)
        : null;
    if (dueDate && Number.isNaN(dueDate.getTime())) {
      throw new HttpError(422, "Échéance invalide.");
    }

    // Attribution : l'officier ou l'un de ses adjoints actifs (contrôle strict).
    // Le PROPRIÉTAIRE agissant dans l'office peut confier la tâche à tout
    // membre actif de l'office — l'autorité de validation reste l'officier réel.
    const requestedAssignee =
      typeof body.assigneeId === "string" && body.assigneeId.trim() !== ""
        ? body.assigneeId.trim()
        : ctx.user.id;
    const assignment: {
      isAdjoint: boolean;
      member: { id: string; name: string };
      officerId?: string;
    } = ctx.asOwner
      ? await assertAssignableInOffice(ctx.role, requestedAssignee)
      : await assertAssignableByOfficer(
          { id: ctx.user.id, officeRole: ctx.role },
          requestedAssignee,
        );
    const officerIdForTask = ctx.asOwner ? assignment.officerId ?? ctx.user.id : ctx.user.id;

    const source =
      body.fromTemplate === true
        ? "MODELE"
        : assignment.isAdjoint
          ? "OFFICIER"
          : ctx.user.role === "ADMIN"
            ? "ADMIN"
            : "OFFICIER";

    const task = await db.officeTask.create({
      data: {
        title,
        description,
        officeRole: ctx.role,
        assigneeId: assignment.member.id,
        officerId: officerIdForTask,
        priority,
        dueDate,
        source,
        createdById: ctx.user.id,
      },
    });

    await logOfficeActivity({
      userId: ctx.user.id,
      officeRole: ctx.role,
      action: "TASK_CREATED",
      entityType: "OfficeTask",
      entityId: task.id,
      details: `Tâche « ${title} » attribuée à ${assignment.isAdjoint ? assignment.member.name : "l'officier"}.`,
    });
    await logOfficeAudit({
      actorUserId: ctx.user.id,
      action: "OFFICE_TASK_CREATED",
      entity: "OfficeTask",
      entityId: task.id,
      metadata: { officeRole: ctx.role, titre: title, priorite: priority },
    });

    // Notification réelle à l'exécutant (sauf s'il s'agit de l'auteur lui-même).
    if (assignment.member.id !== ctx.user.id) {
      await notifyUser({
        userId: assignment.member.id,
        type: "OFFICE_TASK_NEW",
        title: "Nouvelle tâche reçue",
        body: `${ctx.user.name} vous a confié une tâche (${officeLabel(ctx.role)}) : « ${title} ». Priorité : ${TASK_PRIORITY_LABELS[priority as keyof typeof TASK_PRIORITY_LABELS]}.`,
        link: "#/professionnel",
      });
    }

    return jsonOk({ task: { id: task.id, title: task.title } }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
