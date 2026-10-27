// DELETE /api/office/calendar/[id] — mise à la corbeille d'un événement du
// calendrier d'office (l'officier : les siens ; le propriétaire agissant dans
// l'office : tout événement de l'office). Récupérable par l'administration.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { requireOfficeRequest, logOfficeActivity } from "@/lib/office-server";
import { trashItem } from "@/lib/trash";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const ctx = await requireOfficeRequest(req);
    const { id } = await context.params;
    const event = await db.officeCalendarEvent.findUnique({ where: { id } });
    const ownEvent = Boolean(event && event.ownerId === ctx.user.id && event.officeRole === ctx.role);
    const officeEvent = Boolean(ctx.asOwner && event && event.officeRole === ctx.role);
    if (!event || event.deletedAt || (!ownEvent && !officeEvent)) {
      throw new HttpError(404, "Événement introuvable dans votre calendrier.");
    }
    // Corbeille : l'événement reste en base, restaurable par l'administration.
    await trashItem({ entity: "CALENDAR", id, actorId: ctx.user.id });
    await logOfficeActivity({
      userId: ctx.user.id,
      officeRole: ctx.role,
      action: "EVENT_DELETED",
      entityType: "OfficeCalendarEvent",
      entityId: id,
      details: `Événement « ${event.title} » supprimé (mis à la corbeille).`,
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
