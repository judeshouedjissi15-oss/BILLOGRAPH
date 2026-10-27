// FORMATION DES OFFICES — administration (propriétaire uniquement).
// GET  /api/admin/office/training — toutes les ressources (actives et inactive).
// POST /api/admin/office/training — publication d'une nouvelle ressource
//        (instruction d'office, procédure, guide ou document autorisé).
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { requireAdmin, logOfficeActivity, notifyUser } from "@/lib/office-server";
import { requireAdminViewer } from "@/lib/auth";
import { getOfficeDef, TRAINING_CATEGORIES } from "@/lib/offices";
import { logAudit } from "@/lib/audit";

export async function GET() {
  try {
    await requireAdminViewer();
    const resources = await db.officeTrainingResource.findMany({
      where: { deletedAt: null }, // la corbeille est vue dans l'onglet dédié
      orderBy: { updatedAt: "desc" },
      include: { publishedBy: { select: { name: true } } },
      take: 200,
    });
    return jsonOk({
      resources: resources.map((r) => ({
        id: r.id,
        officeRole: r.officeRole,
        title: r.title,
        category: r.category,
        body: r.body,
        externalUrl: r.externalUrl,
        active: r.active,
        publishedByName: r.publishedBy.name,
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

type PostBody = {
  officeRole?: unknown;
  title?: unknown;
  category?: unknown;
  body?: unknown;
  externalUrl?: unknown;
};

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const payload = (await readJson(req)) as PostBody;

    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    if (title.length < 3 || title.length > 200) {
      throw new HttpError(422, "Le titre doit contenir entre 3 et 200 caractères.");
    }
    const category =
      typeof payload.category === "string" && (TRAINING_CATEGORIES as readonly string[]).includes(payload.category)
        ? payload.category
        : "PROCEDURE";
    const officeRole =
      typeof payload.officeRole === "string" && payload.officeRole !== "" && payload.officeRole !== "TOUS"
        ? payload.officeRole
        : null;
    if (officeRole && !getOfficeDef(officeRole)) {
      throw new HttpError(422, "Office inconnu.");
    }
    const body =
      typeof payload.body === "string" && payload.body.trim() !== ""
        ? payload.body.trim().slice(0, 8000)
        : null;
    const externalUrl =
      typeof payload.externalUrl === "string" && payload.externalUrl.trim() !== ""
        ? payload.externalUrl.trim().slice(0, 500)
        : null;
    if (!body && !externalUrl) {
      throw new HttpError(422, "Fournissez un contenu (texte) ou un lien externe.");
    }

    const resource = await db.officeTrainingResource.create({
      data: {
        officeRole,
        title,
        category,
        body,
        externalUrl,
        active: true,
        publishedById: admin.id,
      },
    });

    await logAudit({
      actorUserId: admin.id,
      action: "OFFICE_TRAINING_PUBLISHED",
      entity: "OfficeTrainingResource",
      entityId: resource.id,
      metadata: { office: officeRole, titre: title, categorie: category },
    });
    await logOfficeActivity({
      userId: admin.id,
      officeRole: officeRole ?? "TOUS",
      action: "TRAINING_UPDATED",
      entityType: "OfficeTrainingResource",
      entityId: resource.id,
      details: `Ressource de formation « ${title} » publiée par le propriétaire.`,
    });

    // Notification réelle aux membres actifs de l'office ciblé.
    const members = await db.user.findMany({
      where: { officeRole, officeStatus: "ACTIVE" },
      select: { id: true },
    });
    for (const m of members) {
      await notifyUser({
        userId: m.id,
        type: "SYSTEM",
        title: "Nouvelle ressource de formation",
        body: `« ${title} » a été publiée pour votre office (${officeRole ? getOfficeDef(officeRole)?.label : "tous les offices"}).`,
        link: "#/professionnel",
      });
    }

    return jsonOk({ resource: { id: resource.id } }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
