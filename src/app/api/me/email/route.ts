import { createHash, randomBytes } from "crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { HttpError, requireUser, verifyPassword } from "@/lib/auth";
import { buildOrigin, brandedEmail, getEmailConfig, sendRealEmail } from "@/lib/smtp";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

const requestSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(128),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    rateLimit(`email-change:${user.id}`, 3, 60 * 60_000);
    const { email, password } = requestSchema.parse(await readJson(req));
    if (email === user.email.toLowerCase()) throw new HttpError(422, "Cette adresse est déjà utilisée par votre compte.");

    const account = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true, name: true } });
    if (!verifyPassword(password, account.passwordHash)) {
      throw new HttpError(422, "Mot de passe incorrect.");
    }
    if (await db.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new HttpError(409, "Cette adresse email est déjà utilisée.");
    }
    const settings = await db.platformSettings.findUnique({ where: { id: "main" } });
    if (!await getEmailConfig()) {
      throw new HttpError(503, "Le service email n'est pas configuré.");
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await db.accountActionToken.upsert({
      where: { userId_action: { userId: user.id, action: "EMAIL_CHANGE" } },
      create: {
        userId: user.id,
        tokenHash,
        targetEmail: email,
        action: "EMAIL_CHANGE",
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      },
      update: {
        tokenHash,
        targetEmail: email,
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
        usedAt: null,
        createdAt: new Date(),
      },
    });

    const origin = buildOrigin(req, settings?.siteUrl ?? null);
    const confirmUrl = `${origin}/#/confirmer-email/${token}`;
    const content = brandedEmail(
      "Confirmez votre nouvelle adresse",
      `<p>Bonjour ${account.name.replace(/[&<>"']/g, "")},</p><p>Pour confirmer cette adresse email, ouvrez le lien ci-dessous dans les 24 heures :</p><p><a href="${confirmUrl}">Confirmer mon adresse email</a></p><p>${confirmUrl}</p>`,
    );
    await sendRealEmail({ to: email, subject: "Confirmez votre nouvelle adresse BILLOGRAPH", ...content });
    await logAudit({
      actorUserId: user.id,
      action: "EMAIL_CHANGE_REQUESTED",
      entity: "User",
      entityId: user.id,
    });
    return jsonOk({ ok: true, message: "Un lien de confirmation a été envoyé à la nouvelle adresse." });
  } catch (err) {
    return handleApiError(err);
  }
}
