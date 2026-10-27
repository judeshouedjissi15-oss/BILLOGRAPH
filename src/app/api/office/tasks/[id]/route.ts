// PATCH /api/office/tasks/[id] — actions sur une tâche d'office :
//   { action: "UPDATE" }     — édition (créateur/officier/propriétaire).
//   { action: "SET_STATUS" } — TODO ↔ IN_PROGRESS ↔ ON_HOLD (exécutant seul).
//   { action: "SUBMIT" }     — soumission à validation (exécutant seul).
//   { action: "REVIEW" }     — validation ou renvoi par l'autorité compétente :
//                              l'officier pour un adjoint, le propriétaire pour
//                              l'officier ; le propriétaire opérant dans
//                              l'office peut valider tout travail en attente.
// DELETE — mise à la corbeille (par l'officier ou le propriétaire) d'une tâche
//          non terminée de l'office : restaurable par l'administration.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import {
  requireOfficeRequest,
  assertValidStatusTransition,
  notifyUser,
  logOfficeActivity,
  logOfficeAudit,
} from "@/lib/office-server";
import {
  TASK_PRIORITIES,
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
} from "@/lib/offices";
import { trashItem } from "@/lib/trash";

type RouteContext = { params: Promise<{ id: string }> };

async function loadTask(id: string, officeRole: string) {
  const task = await db.officeTask.findUnique({
    where: { id },
    include: {
      assignee: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  if (!task || task.officeRole !== officeRole) {
    throw new HttpError(404, "Tâche introuvable dans votre office.");
  }
  return task;
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const ctx = await requireOfficeRequest(req);
    const { id } = await context.params;
    const body = (await readJson(req)) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const task = await loadTask(id, ctx.role);
    if (task.deletedAt) throw new HttpError(404, "Tâche introuvable dans votre office.");

    const isAssignee = task.assigneeId === ctx.user.id;
    const isOfficer = task.officerId === ctx.user.id;
    const isCreator = task.createdById === ctx.user.id;

    switch (action) {
      case "UPDATE": {
        if (!isOfficer && !isCreator && !ctx.asOwner) {
          throw new HttpError(403, "Seul l'officier (ou l'auteur de la tâche) peut la modifier.");
        }
        const data: Record<string, unknown> = {};
        if (typeof body.title === "string" && body.title.trim().length >= 3) {
          data.title = body.title.trim().slice(0, 200);
        }
        if (typeof body.description === "string") {
          data.description = body.description.trim().slice(0, 4000) || null;
        }
        if (typeof body.dueDate === "string" || body.dueDate === null) {
          const raw = body.dueDate;
          if (raw === null || raw === "") data.dueDate = null;
          else {
            const d = new Date(String(raw));
            if (Number.isNaN(d.getTime())) throw new HttpError(422, "Échéance invalide.");
            data.dueDate = d;
          }
        }
        let priorityChanged = false;
        if (typeof body.priority === "string" && (TASK_PRIORITIES as readonly string[]).includes(body.priority) && body.priority !== task.priority) {
          data.priority = body.priority;
          priorityChanged = true;
        }
        if (Object.keys(data).length === 0) {
          throw new HttpError(422, "Aucune modification fournie.");
        }
        const updated = await db.officeTask.update({ where: { id: task.id }, data });
        await logOfficeActivity({
          userId: ctx.user.id,
          officeRole: ctx.role,
          action: priorityChanged ? "TASK_PRIORITY_CHANGED" : "TASK_UPDATED",
          entityType: "OfficeTask",
          entityId: task.id,
          details: `Tâche « ${updated.title} » modifiée${priorityChanged ? ` — priorité ${TASK_PRIORITY_LABELS[updated.priority as keyof typeof TASK_PRIORITY_LABELS]}` : ""}.`,
        });
        if (priorityChanged && task.assigneeId !== ctx.user.id) {
          await notifyUser({
            userId: task.assigneeId,
            type: "OFFICE_TASK_PRIORITY",
            title: "Priorité de tâche modifiée",
            body: `La priorité de « ${updated.title} » est passée à ${TASK_PRIORITY_LABELS[updated.priority as keyof typeof TASK_PRIORITY_LABELS]}.`,
            link: "#/professionnel",
          });
        }
        return jsonOk({ ok: true });
      }

      case "SET_STATUS": {
        if (!isAssignee) {
          throw new HttpError(403, "Seul l'exécutant de la tâche peut faire évoluer son statut de travail.");
        }
        const to = typeof body.status === "string" ? body.status : "";
        assertValidStatusTransition(task.status, to);
        const updated = await db.officeTask.update({ where: { id: task.id }, data: { status: to } });
        await logOfficeActivity({
          userId: ctx.user.id,
          officeRole: ctx.role,
          action: "TASK_STATUS_CHANGED",
          entityType: "OfficeTask",
          entityId: task.id,
          details: `« ${updated.title} » : ${TASK_STATUS_LABELS[task.status as keyof typeof TASK_STATUS_LABELS]} → ${TASK_STATUS_LABELS[to as keyof typeof TASK_STATUS_LABELS]}.`,
        });
        return jsonOk({ ok: true });
      }

      case "SUBMIT": {
        if (!isAssignee) {
          throw new HttpError(403, "Seul l'exécutant peut soumettre son travail à validation.");
        }
        if (!["IN_PROGRESS", "TODO", "ON_HOLD"].includes(task.status)) {
          throw new HttpError(422, "Ce travail est déjà soumis ou déjà terminé.");
        }
        const updated = await db.officeTask.update({
          where: { id: task.id },
          data: { status: "AWAITING_VALIDATION", submittedAt: new Date() },
        });
        await logOfficeActivity({
          userId: ctx.user.id,
          officeRole: ctx.role,
          action: "TASK_SUBMITTED",
          entityType: "OfficeTask",
          entityId: task.id,
          details: `« ${updated.title} » soumis à validation.`,
        });
        if (task.assigneeId !== task.officerId) {
          await notifyUser({
            userId: task.officerId,
            type: "OFFICE_TASK_VALIDATION",
            title: "Demande de validation",
            body: `${task.assignee.name} a soumis « ${updated.title} » à votre validation.`,
            link: "#/professionnel",
          });
        } else {
          const admins = await db.user.findMany({
            where: { role: "ADMIN", status: "ACTIVE" },
            select: { id: true },
          });
          for (const admin of admins) {
            await notifyUser({
              userId: admin.id,
              type: "OFFICE_TASK_VALIDATION",
              title: "Demande de validation d'officier",
              body: `${task.assignee.name} (${task.officeRole}) a soumis « ${updated.title} » à validation — à traiter depuis l'espace administrateur.`,
              link: "#/admin",
            });
          }
        }
        return jsonOk({ ok: true });
      }

      case "REVIEW": {
        const approve = body.approve === true;
        const note =
          typeof body.note === "string" && body.note.trim() !== ""
            ? body.note.trim().slice(0, 1000)
            : null;
        if (task.status !== "AWAITING_VALIDATION") {
          throw new HttpError(422, "Ce travail n'est pas en attente de validation.");
        }
        // Autorité réelle : adjoint → son officier ; officier → propriétaire.
        // Le propriétaire opérant dans l'office peut valider tout travail en
        // attente de cet office.
        const reviewerIsOfficer =
          task.assigneeId !== task.officerId && ctx.user.id === task.officerId;
        const reviewerIsAdmin = task.assigneeId === task.officerId && ctx.user.role === "ADMIN";
        if (!reviewerIsOfficer && !reviewerIsAdmin && !ctx.asOwner) {
          throw new HttpError(403, "Vous n'êtes pas l'autorité de validation de ce travail.");
        }
        if (!approve && !note) {
          throw new HttpError(422, "Un motif est obligatoire pour renvoyer un travail.");
        }
        const updated = await db.officeTask.update({
          where: { id: task.id },
          data: {
            status: approve ? "DONE" : "IN_PROGRESS",
            reviewedAt: new Date(),
            reviewedById: ctx.user.id,
            reviewNote: note,
          },
        });
        await logOfficeActivity({
          userId: ctx.user.id,
          officeRole: ctx.role,
          action: approve ? "TASK_VALIDATED" : "TASK_RETURNED",
          entityType: "OfficeTask",
          entityId: task.id,
          details: approve
            ? `« ${updated.title} » validé${note ? ` — ${note}` : ""}.`
            : `« ${updated.title} » renvoyé pour reprise${note ? ` — ${note}` : ""}.`,
        });
        await logOfficeAudit({
          actorUserId: ctx.user.id,
          action: approve ? "OFFICE_TASK_VALIDATED" : "OFFICE_TASK_RETURNED",
          entity: "OfficeTask",
          entityId: task.id,
          metadata: { officeRole: ctx.role, titre: updated.title },
        });
        await notifyUser({
          userId: task.assigneeId,
          type: approve ? "OFFICE_TASK_VALIDATED" : "OFFICE_TASK_RETURNED",
          title: approve ? "Travail validé" : "Travail renvoyé",
          body: approve
            ? `Votre travail « ${updated.title} » a été validé${note ? ` : ${note}` : "."}`
            : `« ${updated.title} » vous est renvoyé pour reprise${note ? ` : ${note}` : "."}`,
          link: "#/professionnel",
        });
        return jsonOk({ ok: true, status: approve ? "DONE" : "IN_PROGRESS" });
      }

      default:
        throw new HttpError(422, "Action inconnue.");
    }
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const ctx = await requireOfficeRequest(req);
    const { id } = await context.params;
    const task = await loadTask(id, ctx.role);
    if (task.deletedAt) throw new HttpError(404, "Tâche introuvable dans votre office.");
    if (task.officerId !== ctx.user.id && !ctx.asOwner) {
      throw new HttpError(403, "Seul l'officier titulaire peut supprimer une tâche de son office.");
    }
    if (task.status === "DONE") {
      throw new HttpError(422, "Une tâche terminée est conservée dans l'historique : elle ne peut être supprimée.");
    }
    // Corbeille : la tâche reste en base, restaurable par l'administration.
    await trashItem({ entity: "TASK", id: task.id, actorId: ctx.user.id });
    await logOfficeActivity({
      userId: ctx.user.id,
      officeRole: ctx.role,
      action: "TASK_UPDATED",
      entityType: "OfficeTask",
      entityId: null,
      details: `Tâche « ${task.title} » supprimée par ${ctx.asOwner ? "le propriétaire" : "l'officier"} (mise à la corbeille).`,
    });
    await logOfficeAudit({
      actorUserId: ctx.user.id,
      action: "OFFICE_TASK_DELETED",
      entity: "OfficeTask",
      entityId: task.id,
      metadata: { officeRole: ctx.role, titre: task.title, corbeille: true },
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
