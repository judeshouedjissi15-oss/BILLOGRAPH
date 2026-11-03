import { createHash, randomBytes } from "crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { hashPassword, HttpError } from "@/lib/auth";
import { buildOrigin, brandedEmail, getEmailConfig, sendRealEmail } from "@/lib/smtp";
import { logAudit } from "@/lib/audit";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const requestSchema = z.object({
  action: z.literal("request"),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
});
const completeSchema = z.object({
  action: z.literal("complete"),
  token: z.string().trim().min(32).max(128),
  newPassword: z.string().min(8).max(128),
});
const bodySchema = z.discriminatedUnion("action", [requestSchema, completeSchema]);

export async function POST(req: NextRequest) {
  try {
    rateLimit(`password-reset:${clientIp(req)}`, 5, 10 * 60_000);
    const body = bodySchema.parse(await readJson(req));

    if (body.action === "request") {
      rateLimit(`password-reset-email:${createHash("sha256").update(body.email).digest("hex")}`, 3, 60 * 60_000);
      const user = await db.user.findUnique({ where: { email: body.email } });
      const settings = await db.platformSettings.findUnique({ where: { id: "main" } });
      const emailConfig = await getEmailConfig();
      const eligibleUser = user?.status === "ACTIVE" && user.role !== "ADMIN" ? user : null;
      let resetUrl: string | null = null;
      if (eligibleUser && emailConfig) {
        const token = randomBytes(32).toString("hex");
        const tokenHash = createHash("sha256").update(token).digest("hex");
        await db.accountActionToken.upsert({
          where: { userId_action: { userId: eligibleUser.id, action: "PASSWORD_RESET" } },
          create: {
            userId: eligibleUser.id,
            tokenHash,
            action: "PASSWORD_RESET",
            expiresAt: new Date(Date.now() + 30 * 60_000),
          },
          update: {
            tokenHash,
            expiresAt: new Date(Date.now() + 30 * 60_000),
            usedAt: null,
            createdAt: new Date(),
          },
        });
        resetUrl = `${buildOrigin(req, settings?.siteUrl ?? null)}/#/reinitialiser-mot-de-passe/${token}`;
        await logAudit({ actorUserId: eligibleUser.id, action: "PASSWORD_RESET_REQUESTED", entity: "User", entityId: eligibleUser.id });
      }
      if (emailConfig) {
        const content = brandedEmail(
          "Demande liée à votre compte",
          `<p>Une demande d'assistance au compte BILLOGRAPH a été faite pour cette adresse.</p>${resetUrl
            ? `<p><a href="${resetUrl}">Choisir un nouveau mot de passe</a></p><p>Ce lien expire dans 30 minutes et ne peut être utilisé qu'une seule fois.</p>`
            : "<p>Si cette adresse est associée à un compte éligible, les instructions nécessaires vous seront envoyées séparément.</p>"}`,
        );
        await sendRealEmail({ to: body.email, subject: "Demande liée à votre compte BILLOGRAPH", ...content });
      }
      return jsonOk({
        ok: true,
        message: "Si un compte éligible existe pour cette adresse, un lien de réinitialisation vient d'être envoyé.",
      });
    }

    const tokenHash = createHash("sha256").update(body.token).digest("hex");
    const record = await db.accountActionToken.findUnique({ where: { tokenHash } });
    if (!record || record.action !== "PASSWORD_RESET" || record.usedAt || record.expiresAt <= new Date()) {
      throw new HttpError(400, "Lien invalide ou expiré. Demandez une nouvelle réinitialisation.");
    }
    await db.$transaction(async (tx) => {
      const consumed = await tx.accountActionToken.updateMany({
        where: {
          id: record.id,
          action: "PASSWORD_RESET",
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new HttpError(400, "Lien invalide ou expiré. Demandez une nouvelle réinitialisation.");
      }
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash: hashPassword(body.newPassword) },
      });
      await tx.session.deleteMany({ where: { userId: record.userId } });
      await tx.accountActionToken.deleteMany({
        where: { userId: record.userId, action: "PASSWORD_RESET", id: { not: record.id } },
      });
    });
    await logAudit({
      actorUserId: record.userId,
      action: "PASSWORD_RESET_COMPLETED",
      entity: "User",
      entityId: record.userId,
    });
    return jsonOk({ ok: true, message: "Mot de passe modifié. Vous pouvez vous connecter." });
  } catch (err) {
    return handleApiError(err);
  }
}
