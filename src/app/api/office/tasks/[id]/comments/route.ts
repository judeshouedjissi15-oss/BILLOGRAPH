// POST /api/office/tasks/[id]/comments — commentaire réel sur une tâche
// d'office (officier, exécutant, auteur ou propriétaire agissant dans
// l'office uniquement).
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { requireOfficeRequest, logOfficeActivity, notifyUser } from "@/lib/office-server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const ctx = await requireOfficeRequest(req);
    const { id } = await context.params;
    const body = (await readJson(req)) as { body?: unknown };
    const text = typeof body.body === "string" ? body.body.trim() : "";
    if (text.length < 1 || text.length > 2000) {
      throw new HttpError(422, "Le commentaire doit contenir entre 1 et 2000 caractères.");
    }

    const task = await db.officeTask.findUnique({
      where: { id },
      select: { id: true, title: true, officeRole: true, assigneeId: true, officerId: true, createdById: true, deletedAt: true, assignee: { select: { id: true, name: true } } },
    });
    if (!task || task.officeRole !== ctx.role || task.deletedAt) {
      throw new HttpError(404, "Tâche introuvable dans votre office.");
    }
    const involved =
      ctx.asOwner ||
      ctx.user.id === task.assigneeId ||
      ctx.user.id === task.officerId ||
      ctx.user.id === task.createdById;
    if (!involved) {
      throw new HttpError(403, "Seuls l'exécutant et l'officier de cette tâche peuvent commenter.");
    }

    const comment = await db.officeTaskComment.create({
      data: { taskId: task.id, authorId: ctx.user.id, body: text },
    });

    await logOfficeActivity({
      userId: ctx.user.id,
      officeRole: ctx.role,
      action: "TASK_COMMENTED",
      entityType: "OfficeTask",
      entityId: task.id,
      details: `Commentaire sur « ${task.title} ».`,
    });

    const others = new Set<string>([task.assigneeId, task.officerId, task.createdById]);
    others.delete(ctx.user.id);
    for (const userId of others) {
      await notifyUser({
        userId,
        type: "OFFICE_TASK_COMMENT",
        title: "Nouveau commentaire",
        body: `${ctx.user.name} a commenté « ${task.title} » : ${text.slice(0, 120)}${text.length > 120 ? "…" : ""}`,
        link: "#/professionnel",
      });
    }

    return jsonOk(
      {
        comment: {
          id: comment.id,
          body: comment.body,
          authorName: ctx.user.name,
          createdAt: comment.createdAt.toISOString(),
        },
      },
      201,
    );
  } catch (err) {
    return handleApiError(err);
  }
}
