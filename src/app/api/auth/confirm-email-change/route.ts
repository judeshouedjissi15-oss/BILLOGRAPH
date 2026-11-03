import { createHash } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

const schema = z.object({ token: z.string().trim().min(32).max(128) });

export async function POST(req: Request) {
  try {
    rateLimit(`confirm-email-change:${clientIp(req)}`, 10, 60_000);
    const { token } = schema.parse(await readJson(req));
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const record = await db.accountActionToken.findUnique({ where: { tokenHash } });
    if (!record || record.action !== "EMAIL_CHANGE" || record.usedAt || record.expiresAt <= new Date() || !record.targetEmail) {
      throw new HttpError(400, "Lien invalide ou expiré. Demandez un nouveau lien depuis votre profil.");
    }
    const collision = await db.user.findUnique({ where: { email: record.targetEmail }, select: { id: true } });
    if (collision && collision.id !== record.userId) {
      throw new HttpError(409, "Cette adresse email est déjà associée à un compte.");
    }
    const user = await db.$transaction(async (tx) => {
      const consumed = await tx.accountActionToken.updateMany({
        where: {
          id: record.id,
          action: "EMAIL_CHANGE",
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new HttpError(400, "Lien invalide ou expiré. Demandez un nouveau lien depuis votre profil.");
      }
      await tx.accountActionToken.deleteMany({
        where: { userId: record.userId, action: "EMAIL_CHANGE", id: { not: record.id } },
      });
      return tx.user.update({
        where: { id: record.userId },
        data: { email: record.targetEmail!, emailVerified: true, emailVerifiedAt: new Date() },
        select: { id: true, email: true },
      });
    });
    await logAudit({
      actorUserId: user.id,
      action: "EMAIL_CHANGED",
      entity: "User",
      entityId: user.id,
    });
    return jsonOk({ ok: true, email: user.email });
  } catch (err) {
    return handleApiError(err);
  }
}
