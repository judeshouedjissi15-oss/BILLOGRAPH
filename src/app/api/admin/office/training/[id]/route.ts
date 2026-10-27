// PATCH  /api/admin/office/training/[id] — actualisation d'une ressource de
//         formation (titre, contenu, catégorie, office cible, activation).
// DELETE /api/admin/office/training/[id] — MISE À LA CORBEILLE (restaurable).
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { requireAdmin, logOfficeActivity } from "@/lib/office-server";
import { getOfficeDef, TRAINING_CATEGORIES } from "@/lib/offices";
import { trashItem } from "@/lib/trash";
import { logAudit } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const payload = (await readJson(req)) as Record<string, unknown>;

    const resource = await db.officeTrainingResource.findUnique({ where: { id } });
    if (!resource || resource.deletedAt) throw new HttpError(404, "Ressource de formation introuvable.");

    const data: Record<string, unknown> = {};
    if (typeof payload.title === "string" && payload.title.trim().length >= 3) {
      data.title = payload.title.trim().slice(0, 200);
    }
    if (typeof payload.body === "string") {
      data.body = payload.body.trim().slice(0, 8000) || null;
    }
    if (typeof payload.externalUrl === "string") {
      data.externalUrl = payload.externalUrl.trim().slice(0, 500) || null;
    }
    if (typeof payload.category === "string" && (TRAINING_CATEGORIES as readonly string[]).includes(payload.category)) {
      data.category = payload.category;
    }
    if (payload.officeRole !== undefined) {
      if (payload.officeRole === null || payload.officeRole === "" || payload.officeRole === "TOUS") {
        data.officeRole = null;
      } else if (typeof payload.officeRole === "string") {
        if (!getOfficeDef(payload.officeRole)) throw new HttpError(422, "Office inconnu.");
        data.officeRole = payload.officeRole;
      }
    }
    if (typeof payload.active === "boolean") {
      data.active = payload.active;
    }
    if (Object.keys(data).length === 0) {
      throw new HttpError(422, "Aucune modification fournie.");
    }

    const updated = await db.officeTrainingResource.update({ where: { id }, data });

    await logAudit({
      actorUserId: admin.id,
      action: "OFFICE_TRAINING_UPDATED",
      entity: "OfficeTrainingResource",
      entityId: id,
      metadata: { office: updated.officeRole, titre: updated.title },
    });
    if (updated.officeRole) {
      await logOfficeActivity({
        userId: admin.id,
        officeRole: updated.officeRole,
        action: "TRAINING_UPDATED",
        entityType: "OfficeTrainingResource",
        entityId: id,
        details: `Ressource de formation « ${updated.title} » actualisée par le propriétaire.`,
      });
    }

    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const resource = await db.officeTrainingResource.findUnique({ where: { id } });
    if (!resource || resource.deletedAt) throw new HttpError(404, "Ressource de formation introuvable.");
    // Corbeille : la ressource reste en base, restaurable et prouvable.
    await trashItem({ entity: "TRAINING", id, actorId: admin.id });
    await logAudit({
      actorUserId: admin.id,
      action: "OFFICE_TRAINING_DELETED",
      entity: "OfficeTrainingResource",
      entityId: id,
      metadata: { office: resource.officeRole, titre: resource.title, corbeille: true },
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
