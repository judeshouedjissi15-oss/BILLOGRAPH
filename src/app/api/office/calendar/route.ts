// CALENDRIER D'OFFICE (module « Magnifier son appel »).
// GET  /api/office/calendar — événements réels de l'officier + échéances de
//        tâches à venir. Le propriétaire agissant dans l'office voit tout
//        l'office.
// POST /api/office/calendar — création d'un événement réel.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { requireOfficeRequest, logOfficeActivity } from "@/lib/office-server";
import { EVENT_TYPES } from "@/lib/offices";

export async function GET(req: Request) {
  try {
    const ctx = await requireOfficeRequest(req);
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

    const [events, taskDeadlines] = await Promise.all([
      db.officeCalendarEvent.findMany({
        where: {
          deletedAt: null,
          startsAt: { gte: from },
          ...(ctx.asOwner ? { officeRole: ctx.role } : { ownerId: ctx.user.id }),
        },
        orderBy: { startsAt: "asc" },
        take: 100,
      }),
      db.officeTask.findMany({
        where: {
          deletedAt: null,
          status: { in: ["TODO", "IN_PROGRESS", "ON_HOLD", "AWAITING_VALIDATION"] },
          dueDate: { gte: now },
          ...(ctx.asOwner ? { officeRole: ctx.role } : { assigneeId: ctx.user.id }),
        },
        orderBy: { dueDate: "asc" },
        take: 50,
        select: { id: true, title: true, dueDate: true, priority: true },
      }),
    ]);

    return jsonOk({
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        type: e.type,
        startsAt: e.startsAt.toISOString(),
        location: e.location,
      })),
      taskDeadlines: taskDeadlines.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate?.toISOString() ?? null,
        priority: t.priority,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

type CreateBody = {
  title?: unknown;
  description?: unknown;
  type?: unknown;
  startsAt?: unknown;
  location?: unknown;
};

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireOfficeRequest(req);
    const body = (await readJson(req)) as CreateBody;

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (title.length < 2 || title.length > 200) {
      throw new HttpError(422, "L'intitulé doit contenir entre 2 et 200 caractères.");
    }
    const type =
      typeof body.type === "string" && (EVENT_TYPES as readonly string[]).includes(body.type)
        ? body.type
        : "ACTIVITE";
    if (typeof body.startsAt !== "string" || body.startsAt.trim() === "") {
      throw new HttpError(422, "La date et l'heure de l'événement sont obligatoires.");
    }
    const startsAt = new Date(body.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw new HttpError(422, "Date ou heure invalide.");
    }

    const event = await db.officeCalendarEvent.create({
      data: {
        ownerId: ctx.user.id,
        officeRole: ctx.role,
        title,
        description:
          typeof body.description === "string" && body.description.trim() !== ""
            ? body.description.trim().slice(0, 1000)
            : null,
        type,
        startsAt,
        location:
          typeof body.location === "string" && body.location.trim() !== ""
            ? body.location.trim().slice(0, 200)
            : null,
      },
    });

    await logOfficeActivity({
      userId: ctx.user.id,
      officeRole: ctx.role,
      action: "EVENT_CREATED",
      entityType: "OfficeCalendarEvent",
      entityId: event.id,
      details: `Événement « ${title} » ajouté au calendrier.`,
    });

    return jsonOk({ event: { id: event.id } }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
