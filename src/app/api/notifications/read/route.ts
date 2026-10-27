// POST /api/notifications/read — marque les notifications de l'utilisateur
// comme lues : soit toutes ({ "all": true }), soit une liste d'identifiants
// ({ "ids": [...] } — seules les notifications APPARTENANT à l'utilisateur
// sont touchées). Auth requise.
import { db } from "@/lib/db";
import { jsonOk, handleApiError, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { z } from "zod";

const bodySchema = z
  .object({
    all: z.boolean().optional(),
    ids: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
  })
  .refine((data) => data.all === true || (data.ids?.length ?? 0) > 0, {
    message: "Précisez « all » ou une liste d'identifiants",
  });

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = bodySchema.parse(await readJson(req));

    const where =
      body.all === true
        ? { userId: user.id, readAt: null }
        : { userId: user.id, id: { in: body.ids ?? [] }, readAt: null };

    const result = await db.notification.updateMany({
      where,
      data: { readAt: new Date() },
    });

    return jsonOk({ ok: true, marked: result.count });
  } catch (err) {
    return handleApiError(err);
  }
}
