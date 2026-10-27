// PATCH /api/me/profile — « Mon profil » : informations du compte connecté
// (nom complet, téléphone) + PROFIL PUBLIC librement personnalisable (titre,
// présentation, ville). Accessible à TOUS les rôles — chacun ne modifie QUE
// son propre compte : l'identifiant vient de la session, jamais du corps.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { HttpError, requireUser, toClientUser } from "@/lib/auth";
import { profileUpdateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export async function PATCH(req: NextRequest) {
  try {
    const sessionUser = await requireUser();
    rateLimit(`profile-update:${sessionUser.id}`, 10, 60_000);

    const data = profileUpdateSchema.parse(await readJson(req));

    const before = await db.user.findUnique({ where: { id: sessionUser.id } });
    if (!before) throw new HttpError(401, "Connexion requise");

    const user = await db.user.update({
      where: { id: sessionUser.id },
      data: {
        name: data.name,
        phone: data.phone ?? null,
        // PROFIL PUBLIC — personnalisable librement par l'utilisateur.
        headline: data.headline ?? null,
        bio: data.bio ?? null,
        city: data.city ?? null,
      },
    });

    await logAudit({
      actorUserId: user.id,
      action: "PROFILE_UPDATED",
      entity: "User",
      entityId: user.id,
      metadata: {
        ip: clientIp(req),
        nomModifie: before.name !== user.name,
        telephoneModifie: before.phone !== user.phone,
        profilPublicModifie:
          before.headline !== user.headline || before.bio !== user.bio || before.city !== user.city,
      },
    });

    return jsonOk({ user: toClientUser(user) });
  } catch (err) {
    return handleApiError(err);
  }
}
