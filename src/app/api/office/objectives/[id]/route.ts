// PATCH /api/office/objectives/[id] — mise à jour RÉELLE d'un objectif :
// avancement déclaré (avec justification obligatoire), statut, échéance.
// L'officier ne peut modifier que ses propres objectifs ; le propriétaire
// opérant dans l'office peut ajuster les objectifs de l'office.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { requireOfficeRequest, logOfficeActivity } from "@/lib/office-server";
import { OBJECTIVE_STATUSES, TASK_PRIORITIES } from "@/lib/offices";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const ctx = await requireOfficeRequest(req);
    const { id } = await context.params;
    const body = (await readJson(req)) as Record<string, unknown>;

    const objective = await db.officeObjective.findUnique({ where: { id } });
    if (
      !objective ||
      objective.officeRole !== ctx.role ||
      (objective.officerId !== ctx.user.id && !ctx.asOwner)
    ) {
      throw new HttpError(404, "Objectif introuvable dans votre plan de travail.");
    }

    const data: Record<string, unknown> = {};
    let activity: string | null = null;

    if (typeof body.achieved === "number" && Number.isInteger(body.achieved) && body.achieved >= 0) {
      if (objective.target !== null && body.achieved > objective.target) {
        throw new HttpError(
          422,
          `La valeur constatée (${body.achieved}) dépasse la cible (${objective.target}). Ajustez d'abord la cible — aucun résultat inventé n'est accepté.`,
        );
      }
      const note = typeof body.progressNote === "string" ? body.progressNote.trim() : "";
      if (body.achieved !== objective.achieved && note.length < 5) {
        throw new HttpError(
          422,
          "Déclarez un avancement avec sa justification (réalisations réelles, pièces ou travaux à l'appui).",
        );
      }
      data.achieved = body.achieved;
      if (note.length > 0) data.progressNote = note.slice(0, 1000);
      if (objective.target !== null && body.achieved >= objective.target && objective.target > 0) {
        data.status = "ATTEINT";
      }
      activity = "OBJECTIVE_UPDATED";
    }

    if (typeof body.status === "string" && (OBJECTIVE_STATUSES as readonly string[]).includes(body.status)) {
      data.status = body.status;
      activity = "OBJECTIVE_UPDATED";
    }

    if (typeof body.priority === "string" && (TASK_PRIORITIES as readonly string[]).includes(body.priority)) {
      data.priority = body.priority;
      activity = "OBJECTIVE_UPDATED";
    }

    if (body.deadline !== undefined) {
      if (body.deadline === null || body.deadline === "") data.deadline = null;
      else if (typeof body.deadline === "string") {
        const d = new Date(body.deadline);
        if (Number.isNaN(d.getTime())) throw new HttpError(422, "Échéance invalide.");
        data.deadline = d;
      }
      activity = "OBJECTIVE_UPDATED";
    }

    if (!activity || Object.keys(data).length === 0) {
      throw new HttpError(422, "Aucune modification valide fournie.");
    }

    const updated = await db.officeObjective.update({ where: { id }, data });
    await logOfficeActivity({
      userId: ctx.user.id,
      officeRole: ctx.role,
      action: activity,
      entityType: "OfficeObjective",
      entityId: id,
      details: `Objectif « ${updated.title} » mis à jour (constaté : ${updated.achieved}${updated.unit ? ` ${updated.unit}` : ""}).`,
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
