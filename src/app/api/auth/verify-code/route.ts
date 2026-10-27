// POST /api/auth/verify-code — Vérification du CODE À 6 CHIFFRES reçu par
// email. C'est la voie principale de confirmation d'adresse :
//   - Code correct → compte confirmé (emailVerified = true) + SESSION OUVERTE
//     automatiquement → le client est redirigé directement vers le tableau de
//     bord (aucune nouvelle saisie de mot de passe : le code reçu par email
//     prouve la possession de l'adresse).
//   - Code erroné → compteur de tentatives (max 5, puis code invalidé : il
//     faut en demander un nouveau).
//   - Code expiré (15 min) → invitation à en demander un nouveau.
// ANTI BRUTE-FORCE (un code n'a que 1 000 000 combinaisons) :
//   - max 5 tentatives par code côté base (invalidation définitive) ;
//   - rate-limit par email : 6 tentatives / 15 min, toutes IP confondues ;
//   - rate-limit par IP : 10 tentatives / min.
// Message d'erreur générique pour un email inconnu (aucune énumération).
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { jsonOk, handleApiError, readJson } from "@/lib/api";
import { HttpError, createSession } from "@/lib/auth";
import { verifyCodeSchema } from "@/lib/validation";
import { checkEmailVerificationCode } from "@/lib/email-verification";
import { logAudit } from "@/lib/audit";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    rateLimit(`verify-code:ip:${ip}`, 10, 60_000);

    const { email, code } = verifyCodeSchema.parse(await readJson(req));

    // Anti brute-force principal : plafond par EMAIL (indépendant de l'IP).
    rateLimit(`verify-code:email:${email}`, 6, 15 * 60_000);

    const user = await db.user.findUnique({ where: { email } });

    if (!user) {
      // Générique : ne révèle pas si l'email existe.
      throw new HttpError(
        400,
        "Ce code de confirmation est invalide ou a expiré. Demandez un nouvel email de confirmation.",
      );
    }

    if (user.status !== "ACTIVE") {
      throw new HttpError(403, "Ce compte est suspendu. Contactez le support de la plateforme.");
    }

    const result = await checkEmailVerificationCode(user.id, code);

    switch (result.outcome) {
      case "too-many-attempts": {
        await logAudit({
          actorUserId: user.id,
          action: "EMAIL_CODE_INVALIDATED",
          entity: "User",
          entityId: user.id,
          metadata: { email: user.email, ip, raison: "trop de tentatives" },
        });
        throw new HttpError(
          400,
          "Trop de tentatives : ce code a été invalidé. Demandez un nouvel email de confirmation.",
        );
      }
      case "expired-or-missing":
        throw new HttpError(
          400,
          "Ce code de confirmation a expiré (15 minutes). Demandez un nouvel email de confirmation.",
        );
      case "wrong-code":
        throw new HttpError(
          400,
          `Code incorrect. ${result.attemptsLeft} tentative${result.attemptsLeft > 1 ? "s" : ""} avant invalidation du code.`,
        );
      case "already-used":
        // Double soumission (réseau instable, double clic) : si le compte est
        // confirmé, on ouvre la session sans erreur — le code prouve la
        // possession de l'adresse.
        if (user.emailVerified) {
          await createSession(user.id);
          return jsonOk({
            verified: true,
            alreadyConfirmed: true,
            user: { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status },
          });
        }
        // Code consommé mais compte toujours non confirmé (coupure entre les
        // deux écritures) : on complète la confirmation de façon idempotente.
        break;
      case "confirmed":
        break;
    }

    // ── Confirmation du compte + OUVERTURE DE SESSION AUTOMATIQUE ───────────
    const confirmed = await db.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifiedAt: new Date() },
    });

    await createSession(confirmed.id);

    await logAudit({
      actorUserId: confirmed.id,
      action: "EMAIL_VERIFIED",
      entity: "User",
      entityId: confirmed.id,
      metadata: {
        email: confirmed.email,
        cas: result.outcome === "already-used" ? "confirmation complétée (code déjà consommé)" : "code à 6 chiffres",
        ip,
      },
    });

    return jsonOk({
      verified: true,
      alreadyConfirmed: result.outcome === "already-used",
      user: {
        id: confirmed.id,
        name: confirmed.name,
        email: confirmed.email,
        role: confirmed.role,
        status: confirmed.status,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
