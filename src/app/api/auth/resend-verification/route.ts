// POST /api/auth/resend-verification — Renvoi RÉEL de l'email de confirmation
// (bouton « Renvoyer l'email » de la page de connexion / de vérification).
// ANTI-ÉNUMÉRATION : la réponse est TOUJOURS générique 200, que l'email
// existe, soit déjà confirmé ou inconnu — sauf si le service SMTP n'est pas
// configuré (503, message unique, sans indice sur l'existence du compte).
// Rate-limit strict : 3 requêtes / 10 min / IP.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { jsonOk, handleApiError, readJson } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { resendVerificationSchema } from "@/lib/validation";
import { createEmailVerificationCode, createEmailVerificationToken } from "@/lib/email-verification";
import { buildOrigin, sendRealEmail, verificationEmailContent } from "@/lib/smtp";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    rateLimit(`resend-verification:ip:${ip}`, 3, 10 * 60_000);

    const { email } = resendVerificationSchema.parse(await readJson(req));

    const settings = await db.platformSettings.findUnique({ where: { id: "main" } });
    if (!settings?.smtpConfig) {
      throw new HttpError(
        503,
        "L'envoi d'emails n'est pas encore configuré par la plateforme. Réessayez plus tard.",
      );
    }

    const user = await db.user.findUnique({ where: { email } });

    if (user && !user.emailVerified && user.status === "ACTIVE" && user.role !== "ADMIN") {
      // Nouveau code (le précédent est invalidé) + nouveau jeton de lien.
      const token = await createEmailVerificationToken(user.id);
      const code = await createEmailVerificationCode(user.id);
      const origin = buildOrigin(req, settings.siteUrl ?? null);
      const verifyUrl = `${origin}/#/verifier-email/${token}`;
      const content = verificationEmailContent(user.name, verifyUrl, code);

      await sendRealEmail({
        to: user.email,
        subject: content.subject,
        html: content.html,
        text: content.text,
      });

      await logAudit({
        actorUserId: user.id,
        action: "EMAIL_VERIFICATION_RESENT",
        entity: "User",
        entityId: user.id,
        metadata: { email: user.email, ip },
      });
    }

    // Réponse générique (aucune information sur l'existence du compte).
    return jsonOk({
      ok: true,
      message:
        "Si un compte non confirmé existe pour cette adresse, un nouvel email de confirmation vient d'être envoyé. Vérifiez votre boîte de réception et vos spams.",
    });
  } catch (err) {
    return handleApiError(err);
  }
}
