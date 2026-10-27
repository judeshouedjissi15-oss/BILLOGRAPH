// PATCH /api/admin/office/tasks/[id] — le PROPRIÉTAIRE valide ou renvoie le
// travail soumis par un OFFICIER (l'autorité de validation finale).
// Corps : { approve: boolean, note?: string }.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { requireAdmin, notifyUser, logOfficeActivity } from "@/lib/office-server";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const body = (await readJson(req)) as { approve?: unknown; note?: unknown };

    const task = await db.officeTask.findUnique({
      where: { id },
      include: { assignee: { select: { id: true, name: true } } },
    });
    if (!task || task.deletedAt) throw new HttpError(404, "Tâche introuvable.");
    if (task.status !== "AWAITING_VALIDATION") {
      throw new HttpError(422, "Ce travail n'est pas en attente de validation.");
    }
    const approve = body.approve === true;
    const note =
      typeof body.note === "string" && body.note.trim() !== "" ? body.note.trim().slice(0, 1000) : null;
    if (!approve && !note) {
      throw new HttpError(422, "Un motif est obligatoire pour renvoyer un travail.");
    }

    const updated = await db.officeTask.update({
      where: { id },
      data: {
        status: approve ? "DONE" : "IN_PROGRESS",
        reviewedAt: new Date(),
        reviewedById: admin.id,
        reviewNote: note,
      },
    });

    await logOfficeActivity({
      userId: admin.id,
      officeRole: updated.officeRole,
      action: approve ? "TASK_VALIDATED" : "TASK_RETURNED",
      entityType: "OfficeTask",
      entityId: id,
      details: approve
        ? `« ${updated.title} » validé par le propriétaire${note ? ` — ${note}` : ""}.`
        : `« ${updated.title} » renvoyé par le propriétaire${note ? ` — ${note}` : ""}.`,
    });
    const { logAudit } = await import("@/lib/audit");
    await logAudit({
      actorUserId: admin.id,
      action: approve ? "OFFICE_TASK_VALIDATED" : "OFFICE_TASK_RETURNED",
      entity: "OfficeTask",
      entityId: id,
      metadata: { officeRole: updated.officeRole, titre: updated.title },
    });
    await notifyUser({
      userId: updated.assigneeId,
      type: approve ? "OFFICE_TASK_VALIDATED" : "OFFICE_TASK_RETURNED",
      title: approve ? "Travail validé par le propriétaire" : "Travail renvoyé par le propriétaire",
      body: approve
        ? `Votre travail « ${updated.title} » a été validé${note ? ` : ${note}` : "."}`
        : `« ${updated.title} » vous est renvoyé pour reprise${note ? ` : ${note}` : "."}`,
      link: "#/professionnel",
    });

    return jsonOk({ ok: true, status: approve ? "DONE" : "IN_PROGRESS" });
  } catch (err) {
    return handleApiError(err);
  }
}
