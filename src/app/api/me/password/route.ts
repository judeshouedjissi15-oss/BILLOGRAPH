// PATCH /api/me/password — changement de mot de passe réel : mot de passe
// actuel requis (preuve d'identité), TOUTES LES AUTRES SESSIONS du compte
// sont fermées par le serveur, notification in-app + audit complet.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { HttpError, requireUser, verifyPassword, hashPassword, destroyOtherSessions } from "@/lib/auth";
import { passwordChangeSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { notifyUser } from "@/lib/office-server";

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser();
    rateLimit(`password-change:${user.id}`, 5, 60_000);

    const data = passwordChangeSchema.parse(await readJson(req));

    const dbUser = await db.user.findUnique({ where: { id: user.id } });
    if (!dbUser) throw new HttpError(401, "Connexion requise");

    if (!verifyPassword(data.currentPassword, dbUser.passwordHash)) {
      await logAudit({
        actorUserId: user.id,
        action: "PASSWORD_CHANGE_FAILED",
        entity: "User",
        entityId: user.id,
        metadata: { ip: clientIp(req), raison: "mot de passe actuel incorrect" },
      });
      throw new HttpError(422, "Mot de passe actuel incorrect.");
    }

    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(data.newPassword) },
    });

    // Sécurité : ferme toutes les AUTRES sessions (celle-ci reste ouverte).
    const closed = await destroyOtherSessions(user.id);

    await logAudit({
      actorUserId: user.id,
      action: "PASSWORD_CHANGED",
      entity: "User",
      entityId: user.id,
      metadata: { ip: clientIp(req), autresSessionsFermees: closed },
    });
    await notifyUser({
      userId: user.id,
      type: "SYSTEM",
      title: "Mot de passe modifié",
      body: closed > 0
        ? `Votre mot de passe a été changé. ${closed} autre(s) session(s) ont été fermée(s) par sécurité.`
        : "Votre mot de passe a été changé.",
      link: "#/profil",
    });

    return jsonOk({ ok: true, autresSessionsFermees: closed });
  } catch (err) {
    return handleApiError(err);
  }
}
