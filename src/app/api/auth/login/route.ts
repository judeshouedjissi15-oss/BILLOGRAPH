// POST /api/auth/login — Connexion (rate-limit 8/min par IP + 6/min par
// identifiant, anti brute-force). Message d'échec volontairement générique pour
// ne pas révéler si l'identifiant existe.
// AUTHENTIFICATION UNIFIÉE ET MASQUÉE : l'administrateur (propriétaire) utilise
// exactement le même formulaire que les utilisateurs (#/auth). Quand le serveur
// reconnaît ses identifiants, il n'ouvre PAS encore de session : il délivre un
// challenge à DEUX CODES SECRETS (vérification serveur, étape 1 puis étape 2).
// La session ADMIN n'est créée qu'après le second code valide
// (POST /api/auth/admin-challenge) — le frontend redirige alors vers #/admin.
// Aucun élément admin n'est visible sur la page de connexion : un utilisateur
// normal reçoit sa session directement et ne voit jamais ce flux.
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { createSession, hashPassword, HttpError, verifyPassword } from "@/lib/auth";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { loginSchema } from "@/lib/validation";
import {
  ADMIN_CHALLENGE_STEPS,
  ADMIN_CHALLENGE_TTL_MS,
  isOwnerEmail,
  normalizeIdentifier,
} from "@/lib/owner";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { randomBytes } from "crypto";

// Hash factice : quand l'email est inconnu, on calcule quand même un scrypt
// pour égaliser le temps de réponse (anti-énumération d'emails par timing).
let dummyHash: string | null = null;
function burnPasswordTiming(password: string): void {
  if (!dummyHash) dummyHash = hashPassword("billograph-factice-anti-enumeration");
  verifyPassword(password, dummyHash);
}

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    rateLimit(`login:ip:${ip}`, 8, 60_000);

    const data = loginSchema.parse(await readJson(req));
    const identifier = normalizeIdentifier(data.email);

    // Anti brute-force ciblé : limite supplémentaire PAR IDENTIFIANT.
    rateLimit(`login:id:${identifier}`, 6, 60_000);

    const user = await db.user.findUnique({ where: { email: identifier } });
    if (!user) burnPasswordTiming(data.password);

    if (!user || !verifyPassword(data.password, user.passwordHash)) {
      await logAudit({
        actorUserId: user?.id ?? null,
        action: "USER_LOGIN_FAILED",
        entity: "User",
        entityId: user?.id ?? null,
        metadata: { email: data.email, ip, raison: "identifiants invalides" },
      });
      throw new HttpError(401, "Email ou mot de passe incorrect");
    }

    if (user.status !== "ACTIVE") {
      await logAudit({
        actorUserId: user.id,
        action: "USER_LOGIN_FAILED",
        entity: "User",
        entityId: user.id,
        metadata: { email: data.email, ip, raison: "compte suspendu" },
      });
      throw new HttpError(403, "Ce compte est suspendu. Contactez le support.");
    }

    // VERROU DE CONFIRMATION D'EMAIL : la connexion est refusée tant que
    // l'adresse n'a pas été confirmée via le lien réel envoyé à l'inscription.
    // (Les comptes propriétaires créés par le script d'amorçage sont
    // pré-confirmés ; bypass ADMIN par défense en profondeur.)
    if (!user.emailVerified && user.role !== "ADMIN") {
      await logAudit({
        actorUserId: user.id,
        action: "USER_LOGIN_FAILED",
        entity: "User",
        entityId: user.id,
        metadata: { email: data.email, ip, raison: "email non confirmé" },
      });
      return NextResponse.json(
        {
          error:
            "Votre adresse email n'est pas encore confirmée. Consultez votre boîte de réception (et vos spams) puis cliquez sur le lien de confirmation reçu à l'inscription.",
          emailVerificationRequired: true,
        },
        { status: 403 },
      );
    }

    // ADMIN (propriétaire uniquement en pratique) → challenge à deux codes
    // secrets. AUCUNE session n'est ouverte à ce stade : les codes doivent
    // être validés par /api/auth/admin-challenge.
    if (user.role === "ADMIN" || isOwnerEmail(identifier)) {
      // Nettoyage : supprime les challenges expirés ou antérieurs du compte.
      await db.adminChallenge.deleteMany({
        where: {
          userId: user.id,
          OR: [{ expiresAt: { lt: new Date() } }],
        },
      });

      const token = randomBytes(32).toString("hex");
      await db.adminChallenge.create({
        data: {
          tokenHash: createHash("sha256").update(token).digest("hex"),
          userId: user.id,
          step: 1,
          attempts: 0,
          expiresAt: new Date(Date.now() + ADMIN_CHALLENGE_TTL_MS),
        },
      });

      await logAudit({
        actorUserId: user.id,
        action: "ADMIN_CHALLENGE_ISSUED",
        entity: "User",
        entityId: user.id,
        metadata: { ip, etapes: ADMIN_CHALLENGE_STEPS },
      });

      return jsonOk({
        challengeRequired: true,
        challengeToken: token,
        step: 1,
        steps: ADMIN_CHALLENGE_STEPS,
      });
    }

    // Utilisateur normal → session immédiate (flux inchangé, invisible).
    await createSession(user.id);

    await logAudit({
      actorUserId: user.id,
      action: "USER_LOGIN",
      entity: "User",
      entityId: user.id,
      metadata: { email: user.email, ip },
    });

    return jsonOk({
      user: { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
