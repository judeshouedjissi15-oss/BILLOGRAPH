// MA FORMATION (module « Magnifier son appel »).
// GET /api/office/training — ressources de formation réellement publiées par
// le propriétaire pour cet office (instructions, procédures, guides,
// documents autorisés) + ressources communes. Lecture seule pour l'officier.
import { db } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";
import { requireOfficeRequest } from "@/lib/office-server";

export async function GET(req: Request) {
  try {
    const ctx = await requireOfficeRequest(req);
    const resources = await db.officeTrainingResource.findMany({
      where: { active: true, deletedAt: null, OR: [{ officeRole: ctx.role }, { officeRole: null }] },
      orderBy: { updatedAt: "desc" },
      include: { publishedBy: { select: { name: true } } },
      take: 100,
    });
    return jsonOk({
      resources: resources.map((r) => ({
        id: r.id,
        officeRole: r.officeRole,
        title: r.title,
        category: r.category,
        body: r.body,
        externalUrl: r.externalUrl,
        publishedByName: r.publishedBy.name,
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
