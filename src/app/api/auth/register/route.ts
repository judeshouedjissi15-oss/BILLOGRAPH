// POST /api/auth/register — Inscription (rate-limit 5/min par IP).
// CONFIRMATION D'EMAIL RÉELLE ET OBLIGATOIRE :
// - Le compte est créé NON vérifié (emailVerified = false) : la connexion
//   reste bloquée jusqu'à la confirmation du lien reçu par email.
// - Un email de confirmation RÉEL est envoyé automatiquement via le service
//   d'envoi configuré par l'administrateur (Brevo API ou SMTP — aucun envoi
//   simulé).
// - Si l'envoi est impossible (service absent ou en erreur), le compte est
//   supprimé et l'inscription échoue avec un message clair : la plateforme
//   n'ouvre JAMAIS de compte qu'il serait impossible de confirmer.
// - Aucune session n'est ouverte ici : l'utilisateur doit confirmer puis se
//   connecter (voir /api/auth/login — 403 emailVerificationRequired).
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { hashPassword, HttpError } from "@/lib/auth";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { registerSchema } from "@/lib/validation";
import { isOwnerEmail, normalizeIdentifier } from "@/lib/owner";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { createEmailVerificationCode, createEmailVerificationToken } from "@/lib/email-verification";
import {
  buildOrigin,
  sendRealEmail,
  verificationEmailContent,
  getEmailConfig,
} from "@/lib/smtp";

export async function POST(req: NextRequest) {
  let createdUserId: string | null = null;
  try {
    rateLimit(`register:ip:${clientIp(req)}`, 5, 60_000);

    const data = registerSchema.parse(await readJson(req));
    const email = normalizeIdentifier(data.email);

    // Protection du compte propriétaire : les identifiants administrateur ne
    // peuvent JAMAIS être enregistrés via l'inscription publique (message
    // générique, sans révéler l'existence du compte).
    if (isOwnerEmail(email)) {
      throw new HttpError(409, "Cet email est déjà utilisé. Connectez-vous ou choisissez un autre email.");
    }

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      throw new HttpError(409, "Cet email est déjà utilisé. Connectez-vous ou choisissez un autre email.");
    }

    // Le service d'emails doit être réellement configuré pour accepter une
    // inscription (le compte ne peut être activé sans email de confirmation).
    const emailService = await getEmailConfig();
    if (!emailService) {
      throw new HttpError(
        503,
        "L'inscription est temporairement indisponible : l'envoi d'emails n'est pas encore configuré par la plateforme. Réessayez plus tard.",
      );
    }

    let user;
    try {
      user = await db.user.create({
        data: {
          name: data.name,
          email,
          passwordHash: hashPassword(data.password), // scrypt + sel aléatoire — jamais renvoyé
          emailVerified: false, // verrou : connexion bloquée jusqu'à confirmation
        },
      });
      createdUserId = user.id;
    } catch (err) {
      // Course concurrente sur l'unicité de l'email (index unique en base).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new HttpError(409, "Cet email est déjà utilisé. Connectez-vous ou choisissez un autre email.");
      }
      throw err;
    }

    // Jeton (lien de secours) + CODE À 6 CHIFFRES (principal) + ENVOI RÉEL.
    const token = await createEmailVerificationToken(user.id);
    const code = await createEmailVerificationCode(user.id);
    const settings = await db.platformSettings.findUnique({ where: { id: "main" } });
    const origin = buildOrigin(req, settings?.siteUrl ?? null);
    const verifyUrl = `${origin}/#/verifier-email/${token}`;
    const content = verificationEmailContent(user.name, verifyUrl, code);

    try {
      await sendRealEmail({ to: user.email, subject: content.subject, html: content.html, text: content.text });
    } catch (sendErr) {
      // Aucun compte impossible à confirmer : on supprime et on explique.
      await db.user.delete({ where: { id: user.id } }).catch(() => {});
      createdUserId = null;
      await logAudit({
        actorUserId: null,
        action: "EMAIL_SEND_FAILED",
        entity: "User",
        entityId: null,
        metadata: { email: user.email, ip: clientIp(req), raison: sendErr instanceof Error ? sendErr.message : "inconnue" },
      });
      throw new HttpError(
        503,
        "Nous n'avons pas pu envoyer l'email de confirmation. Vérifiez votre adresse ou réessayez dans quelques minutes.",
      );
    }

    await logAudit({
      actorUserId: user.id,
      action: "USER_REGISTERED",
      entity: "User",
      entityId: user.id,
      metadata: { email: user.email, confirmation: "envoyée" },
    });

    // Aucune session ici : le compte doit être confirmé d'abord (code à 6
    // chiffres ou lien) — la confirmation ouvre automatiquement la session.
    return jsonOk(
      {
        emailVerificationRequired: true,
        email: user.email,
        name: user.name,
      },
      201,
    );
  } catch (err) {
    // Filet de sécurité : si une erreur survient après création du compte mais
    // avant l'envoi confirmé, on ne laisse pas un compte non confirmable.
    if (createdUserId && !(err instanceof HttpError && err.status === 409)) {
      await db.user.delete({ where: { id: createdUserId } }).catch(() => {});
    }
    return handleApiError(err);
  }
}
