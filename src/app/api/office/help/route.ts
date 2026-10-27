// DEMANDER DE L'AIDE (module « Magnifier son appel »).
// GET  /api/office/help — demandes de l'officier (réponses du propriétaire
//        incluses). Le propriétaire agissant dans l'office voit toutes les
//        demandes de l'office (y compris confidentielles : destinataire réel).
// POST /api/office/help — nouvelle demande réellement enregistrée ; le
//        propriétaire est notifié.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { requireOfficeRequest, logOfficeActivity, logOfficeAudit, notifyUser } from "@/lib/office-server";
import { HELP_CATEGORIES } from "@/lib/offices";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireOfficeRequest(req);
    const requests = await db.officeHelpRequest.findMany({
      where: ctx.asOwner ? { officeRole: ctx.role } : { requesterId: ctx.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        respondedBy: { select: { name: true } },
        requester: { select: { name: true } },
      },
    });
    return jsonOk({
      requests: requests.map((r) => ({
        id: r.id,
        category: r.category,
        subject: r.subject,
        message: r.message,
        confidential: r.confidential,
        status: r.status,
        response: r.response,
        requesterName: r.requester.name,
        requesterIsMe: r.requesterId === ctx.user.id,
        respondedByName: r.respondedBy?.name ?? null,
        respondedAt: r.respondedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

type CreateBody = {
  category?: unknown;
  subject?: unknown;
  message?: unknown;
  confidential?: unknown;
};

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireOfficeRequest(req);
    if (ctx.asOwner) {
      throw new HttpError(
        422,
        "Le propriétaire n'a pas besoin de demander de l'aide à lui-même : répondez aux demandes des officiers depuis l'administration (Équipe & Offices).",
      );
    }
    const body = (await readJson(req)) as CreateBody;

    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    if (subject.length < 4 || subject.length > 150) {
      throw new HttpError(422, "Le sujet doit contenir entre 4 et 150 caractères.");
    }
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (message.length < 10 || message.length > 4000) {
      throw new HttpError(422, "Décrivez votre difficulté ou besoin (10 à 4000 caractères).");
    }
    const category =
      typeof body.category === "string" && (HELP_CATEGORIES as readonly string[]).includes(body.category)
        ? body.category
        : "AUTRE";
    const confidential = body.confidential === true || category === "CONFIDENTIEL";

    const request = await db.officeHelpRequest.create({
      data: {
        requesterId: ctx.user.id,
        officeRole: ctx.role,
        category,
        subject: subject.slice(0, 150),
        message: message.slice(0, 4000),
        confidential,
      },
    });

    await logOfficeActivity({
      userId: ctx.user.id,
      officeRole: ctx.role,
      action: "HELP_REQUESTED",
      entityType: "OfficeHelpRequest",
      entityId: request.id,
      details: confidential
        ? "Demande confidentielle envoyée au propriétaire."
        : `Demande « ${subject} » envoyée au propriétaire.`,
    });
    await logOfficeAudit({
      actorUserId: ctx.user.id,
      action: "OFFICE_HELP_REQUESTED",
      entity: "OfficeHelpRequest",
      entityId: request.id,
      metadata: { officeRole: ctx.role, categorie: category, confidentiel: confidential },
    });

    const admins = await db.user.findMany({
      where: { role: "ADMIN", status: "ACTIVE" },
      select: { id: true },
    });
    for (const admin of admins) {
      await notifyUser({
        userId: admin.id,
        type: "OFFICE_HELP_REQUEST",
        title: confidential ? "Demande d'aide confidentielle" : "Demande d'aide d'officier",
        body: `${ctx.user.name} (${ctx.office.label}) : « ${subject} ».`,
        link: "#/admin",
      });
    }

    return jsonOk({ request: { id: request.id } }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
