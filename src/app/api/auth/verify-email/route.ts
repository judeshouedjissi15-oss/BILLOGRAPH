// POST /api/auth/verify-email — Consommation du lien de confirmation reçu
// par email (#/verifier-email/{token} → appel API avec le jeton). Voie de
// secours de la confirmation (la voie principale étant le code à 6 chiffres).
// - Jeton valide → emailVerified = true (usage unique, jeton consommé)
//   + SESSION OUVERTE automatiquement → le client est redirigé directement
//   vers le tableau de bord (le lien reçu par email prouve la possession de
//   l'adresse — mécanisme du « lien magique »).
// - Jeton DÉJÀ utilisé (re-clic, double onglet, actualisation) → réponse de
//   SUCCÈS « déjà confirmée » + session — le clic n'est JAMAIS sanctionné par
//   une erreur ; si le compte n'était pas encore marqué confirmé (coupure
//   entre les deux écritures), la confirmation est complétée.
// - Jeton inconnu/expiré → 400 avec message clair (le frontend propose alors
//   un renvoi).
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { jsonOk, handleApiError, readJson } from "@/lib/api";
import { HttpError, createSession } from "@/lib/auth";
import { verifyEmailSchema } from "@/lib/validation";
import { consumeEmailVerificationToken } from "@/lib/email-verification";
import { logAudit } from "@/lib/audit";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    rateLimit(`verify-email:ip:${clientIp(req)}`, 10, 60_000);

    const { token } = verifyEmailSchema.parse(await readJson(req));

    const result = await consumeEmailVerificationToken(token);

    // ── Re-clic sur un lien déjà consommé : toujours bienveillant ───────────
    if (result.outcome === "already-used") {
      const existing = await db.user.findUnique({ where: { id: result.userId } });
      if (!existing) {
        throw new HttpError(
          400,
          "Ce lien de confirmation est invalide ou le compte n'existe plus. Demandez un nouvel email de confirmation.",
        );
      }

      if (!existing.emailVerified) {
        // Le compte devait être confirmé (le jeton avait été consommé) mais la
        // confirmation n'a pas été enregistrée : on la complète (idempotent).
        const completed = await db.user.update({
          where: { id: existing.id },
          data: { emailVerified: true, emailVerifiedAt: new Date() },
        });
        await createSession(completed.id);
        await logAudit({
          actorUserId: completed.id,
          action: "EMAIL_VERIFIED",
          entity: "User",
          entityId: completed.id,
          metadata: { email: completed.email, cas: "confirmation complétée (re-clic)" },
        });
        return jsonOk({
          verified: true,
          email: completed.email,
          name: completed.name,
          user: { id: completed.id, name: completed.name, email: completed.email, role: completed.role, status: completed.status },
        });
      }

      await createSession(existing.id);
      return jsonOk({
        verified: true,
        alreadyConfirmed: true,
        email: existing.email,
        name: existing.name,
        user: { id: existing.id, name: existing.name, email: existing.email, role: existing.role, status: existing.status },
      });
    }

    // ── Jeton inconnu ou expiré : erreur claire + renvoi possible ───────────
    if (result.outcome === "invalid") {
      throw new HttpError(
        400,
        "Ce lien de confirmation est invalide, expiré (24 h) ou déjà utilisé. Demandez un nouvel email de confirmation.",
      );
    }

    // ── Premier clic sur un jeton valide : confirmation + SESSION ───────────
    const user = await db.user.update({
      where: { id: result.userId },
      data: { emailVerified: true, emailVerifiedAt: new Date() },
    });

    await createSession(user.id);

    await logAudit({
      actorUserId: user.id,
      action: "EMAIL_VERIFIED",
      entity: "User",
      entityId: user.id,
      metadata: { email: user.email, cas: "lien de confirmation" },
    });

    return jsonOk({
      verified: true,
      email: user.email,
      name: user.name,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
