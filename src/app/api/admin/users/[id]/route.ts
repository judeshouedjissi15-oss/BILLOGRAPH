// PATCH /api/admin/users/[id] — modification rôle / statut (ADMIN requis).
// RÈGLES DE SÉCURITÉ :
// - Le rôle ADMIN n'est PAS attribuable via l'API (validation Zod) : le compte
//   propriétaire est le seul administrateur de la plateforme.
// - Le compte propriétaire (OWNER_EMAIL) ne peut être ni modifié, ni suspendu.
// - Auto-protection : un administrateur ne peut ni se suspendre lui-même.
// Toute mutation est auditée.
import { db } from "@/lib/db";
import { jsonOk, handleApiError, readJson } from "@/lib/api";
import { requireRole, HttpError } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/owner";
import { adminUserUpdateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    const admin = await requireRole("ADMIN");
    const { id } = await ctx.params;
    const body = adminUserUpdateSchema.parse(await readJson(req));
    if (!body.role && !body.status) {
      throw new HttpError(422, "Aucune modification fournie (rôle ou statut attendu)");
    }

    const target = await db.user.findUnique({ where: { id } });
    if (!target) throw new HttpError(404, "Utilisateur introuvable");

    // Le compte propriétaire (unique administrateur) est intouchable via l'API.
    if (isOwnerEmail(target.email)) {
      throw new HttpError(409, "Le compte propriétaire de la plateforme ne peut pas être modifié");
    }

    if (target.id === admin.id && body.status === "SUSPENDED") {
      throw new HttpError(409, "Impossible de suspendre votre propre compte");
    }

    const user = await db.user.update({
      where: { id },
      data: {
        ...(body.role ? { role: body.role } : {}),
        ...(body.status ? { status: body.status } : {}),
      },
    });

    await logAudit({
      actorUserId: admin.id,
      action: "ADMIN_USER_UPDATED",
      entity: "User",
      entityId: user.id,
      metadata: { email: user.email, role: user.role, status: user.status },
    });

    return jsonOk({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
