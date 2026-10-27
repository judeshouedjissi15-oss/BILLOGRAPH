// PATCH /api/admin/office/help/[id] — répondre à une demande d'aide
// (propriétaire uniquement). Corps : { response, status? }.
// La demande confidentielle reste confidentielle : la réponse est notifiée à
// l'auteur sans jamais révéler le contenu dans les listes d'autres comptes.
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
    const body = (await readJson(req)) as { response?: unknown; status?: unknown };

    const request = await db.officeHelpRequest.findUnique({ where: { id } });
    if (!request) throw new HttpError(404, "Demande d'aide introuvable.");

    const response = typeof body.response === "string" ? body.response.trim().slice(0, 4000) : "";
    if (response.length < 2) throw new HttpError(422, "Rédigez une réponse réelle (2 caractères minimum).");
    const status =
      body.status === "PRISE_EN_CHARGE" || body.status === "RESOLUE"
        ? body.status
        : "RESOLUE";

    const updated = await db.officeHelpRequest.update({
      where: { id },
      data: {
        response,
        status,
        respondedById: admin.id,
        respondedAt: new Date(),
      },
    });

    await logOfficeActivity({
      userId: admin.id,
      officeRole: updated.officeRole ?? "—",
      action: "HELP_RESPONDED",
      entityType: "OfficeHelpRequest",
      entityId: id,
      details: `Réponse apportée à « ${updated.subject} » (${status.toLowerCase()}).`,
    });
    const { logAudit } = await import("@/lib/audit");
    await logAudit({
      actorUserId: admin.id,
      action: "OFFICE_HELP_RESPONDED",
      entity: "OfficeHelpRequest",
      entityId: id,
      metadata: { statut: status },
    });
    await notifyUser({
      userId: updated.requesterId,
      type: "SYSTEM",
      title: "Le propriétaire a répondu à votre demande",
      body: `« ${updated.subject} » : ${response.slice(0, 160)}${response.length > 160 ? "…" : ""}`,
      link: "#/professionnel",
    });

    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
