// PATCH  /api/admin/announcements/[id] — modifier message/lien/actif (ADMIN).
// DELETE /api/admin/announcements/[id] — supprimer une annonce (ADMIN).
// Mutations auditées.
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonOk, handleApiError, readJson } from "@/lib/api";
import { requireRole, HttpError } from "@/lib/auth";
import { trashItem } from "@/lib/trash";
import { logAudit } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

const linkSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine(
    (value) => /^(#\/|\/)[\w\-./]*$/.test(value) || /^https:\/\/\S+$/.test(value),
    "Le lien doit être une page interne (#/…) ou une URL https",
  );

const patchSchema = z.object({
  message: z.string().trim().min(3).max(300).optional(),
  link: linkSchema.nullish(),
  linkLabel: z.string().trim().min(2).max(40).nullish(),
  active: z.boolean().optional(),
});

const toShape = (a: {
  id: string;
  message: string;
  link: string | null;
  linkLabel: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: a.id,
  message: a.message,
  link: a.link,
  linkLabel: a.linkLabel,
  active: a.active,
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
});

export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    const admin = await requireRole("ADMIN");
    const { id } = await ctx.params;
    const body = patchSchema.parse(await readJson(req));

    const existing = await db.announcement.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "Annonce introuvable");

    const announcement = await db.$transaction(async (tx) => {
      if (body.active === true) {
        // Activation explicite : désactive toutes les autres (unicité de la barre).
        await tx.announcement.updateMany({
          where: { active: true, id: { not: id } },
          data: { active: false },
        });
      }
      return tx.announcement.update({
        where: { id },
        data: {
          ...(body.message !== undefined ? { message: body.message } : {}),
          ...(body.link !== undefined ? { link: body.link?.trim() || null } : {}),
          ...(body.linkLabel !== undefined ? { linkLabel: body.linkLabel?.trim() || null } : {}),
          ...(body.active !== undefined ? { active: body.active } : {}),
        },
      });
    });

    await logAudit({
      actorUserId: admin.id,
      action: "ADMIN_ANNOUNCEMENT_UPDATED",
      entity: "Announcement",
      entityId: announcement.id,
      metadata: { active: announcement.active },
    });

    return jsonOk({ announcement: toShape(announcement) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  try {
    const admin = await requireRole("ADMIN");
    const { id } = await ctx.params;

    const existing = await db.announcement.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new HttpError(404, "Annonce introuvable");

    // Corbeille : l'annonce reste en base, restaurable et prouvable.
    await trashItem({ entity: "ANNOUNCEMENT", id, actorId: admin.id });

    await logAudit({
      actorUserId: admin.id,
      action: "ADMIN_ANNOUNCEMENT_DELETED",
      entity: "Announcement",
      entityId: id,
      metadata: { message: existing.message, corbeille: true },
    });

    return jsonOk({ deleted: true });
  } catch (err) {
    return handleApiError(err);
  }
}
