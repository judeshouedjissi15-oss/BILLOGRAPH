// POST /api/auth/admin-challenge — Seconde vérification de l'accès admin.
// Appelée uniquement après une connexion propriétaire réussie (le serveur a
// alors délivré un challenge). Deux étapes :
//   étape 1 → premier code secret (le surnom du site) ;
//   étape 2 → second code (le prénom du site) → la session ADMIN est ouverte.
// SÉCURITÉ :
// - Vérification 100 % serveur (hachages scrypt, timing constant) — les codes
//   n'apparaissent jamais dans le client, jamais dans les journaux.
// - Le token du challenge est opaque (32 octets aléatoires) ; la base ne
//   stocke que son sha256. Il est ROTATÉ à chaque étape validée.
// - Maximum 5 tentatives échouées cumulées : le challenge est invalidé et il
//   faut se reconnecter. Rate-limit IP en complément.
// - Durée de vie 10 minutes : au-delà, il faut se reconnecter.
import { NextRequest } from "next/server";
import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { createSession, HttpError } from "@/lib/auth";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { adminChallengeSchema } from "@/lib/validation";
import {
  ADMIN_CHALLENGE_MAX_ATTEMPTS,
  ADMIN_CHALLENGE_STEPS,
  ADMIN_CHALLENGE_TTL_MS,
  verifyOwnerCode,
} from "@/lib/owner";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

function tokenToHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    // Anti brute-force du point d'entrée lui-même (les tentatives sur un
    // challenge sont de toute façon plafonnées à 5 par le compteur en base).
    rateLimit(`admin-challenge:ip:${ip}`, 12, 60_000);

    const data = adminChallengeSchema.parse(await readJson(req));

    const challenge = await db.adminChallenge.findUnique({
      where: { tokenHash: tokenToHash(data.token) },
      include: { user: true },
    });

    // Token inconnu ou expiré → message générique (pas d'indice sur l'état).
    if (!challenge || challenge.expiresAt < new Date()) {
      if (challenge) {
        await db.adminChallenge.delete({ where: { id: challenge.id } }).catch(() => {});
      }
      throw new HttpError(401, "Vérification expirée ou invalide. Veuillez vous reconnecter.");
    }

    // Plafond de tentatives déjà atteint → invalidation définitive.
    if (challenge.attempts >= ADMIN_CHALLENGE_MAX_ATTEMPTS) {
      await db.adminChallenge.delete({ where: { id: challenge.id } }).catch(() => {});
      await logAudit({
        actorUserId: challenge.userId,
        action: "ADMIN_CHALLENGE_INVALIDATED",
        entity: "User",
        entityId: challenge.userId,
        metadata: { ip, raison: "trop de tentatives" },
      });
      throw new HttpError(401, "Trop de tentatives. Veuillez vous reconnecter.");
    }

    // Le compte doit toujours être actif.
    if (challenge.user.status !== "ACTIVE") {
      await db.adminChallenge.delete({ where: { id: challenge.id } }).catch(() => {});
      throw new HttpError(403, "Ce compte est suspendu. Contactez le support.");
    }

    const ok = verifyOwnerCode(challenge.step, data.code);

    if (!ok) {
      const attempts = challenge.attempts + 1;
      const invalidated = attempts >= ADMIN_CHALLENGE_MAX_ATTEMPTS;

      if (invalidated) {
        await db.adminChallenge.delete({ where: { id: challenge.id } }).catch(() => {});
      } else {
        await db.adminChallenge.update({
          where: { id: challenge.id },
          data: { attempts },
        });
      }

      await logAudit({
        actorUserId: challenge.userId,
        action: "ADMIN_CHALLENGE_FAILED",
        entity: "User",
        entityId: challenge.userId,
        metadata: { ip, etape: challenge.step, tentative: attempts, invalide: invalidated },
        // NB : le code saisi n'est JAMAIS journalisé.
      });

      if (invalidated) {
        throw new HttpError(401, "Trop de tentatives. Veuillez vous reconnecter.");
      }
      throw new HttpError(
        401,
        `Code incorrect. Tentatives restantes : ${ADMIN_CHALLENGE_MAX_ATTEMPTS - attempts}.`,
      );
    }

    // Code validé pour l'étape courante.
    if (challenge.step < ADMIN_CHALLENGE_STEPS) {
      // Étape 1 validée → rotation du token, passage à l'étape 2, compteur
      // d'échecs conservé (cumul sur tout le challenge), délai prolongé.
      const nextToken = randomBytes(32).toString("hex");
      await db.adminChallenge.update({
        where: { id: challenge.id },
        data: {
          step: challenge.step + 1,
          tokenHash: tokenToHash(nextToken),
          expiresAt: new Date(Date.now() + ADMIN_CHALLENGE_TTL_MS),
        },
      });

      await logAudit({
        actorUserId: challenge.userId,
        action: "ADMIN_CHALLENGE_STEP_PASSED",
        entity: "User",
        entityId: challenge.userId,
        metadata: { ip, etape: challenge.step },
      });

      return jsonOk({
        verified: true,
        step: challenge.step + 1,
        steps: ADMIN_CHALLENGE_STEPS,
        challengeToken: nextToken,
      });
    }

    // Étape 2 validée → ouverture de la session ADMIN.
    await db.adminChallenge.delete({ where: { id: challenge.id } }).catch(() => {});
    await createSession(challenge.user.id);

    await logAudit({
      actorUserId: challenge.userId,
      action: "ADMIN_LOGIN",
      entity: "User",
      entityId: challenge.userId,
      metadata: { ip, email: challenge.user.email },
    });

    return jsonOk({
      verified: true,
      user: {
        id: challenge.user.id,
        name: challenge.user.name,
        email: challenge.user.email,
        role: challenge.user.role,
        status: challenge.user.status,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
