import { z } from "zod";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

const preferencesSchema = z.object({
  profileDiscoverable: z.boolean().optional(),
  friendRequestsEnabled: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, "Sélectionnez un réglage.");

export async function GET() {
  try {
    const user = await requireUser();
    const [account, sessions] = await Promise.all([
      db.user.findUniqueOrThrow({
        where: { id: user.id },
        select: {
          profileDiscoverable: true,
          friendRequestsEnabled: true,
          messagingSuspendedUntil: true,
          deletionRequestedAt: true,
        },
      }),
      db.session.count({ where: { userId: user.id, expiresAt: { gt: new Date() } } }),
    ]);
    return jsonOk({ ...account, activeSessions: sessions });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    rateLimit(`account-preferences:${user.id}`, 10, 60_000);
    const data = preferencesSchema.parse(await readJson(req));
    const updated = await db.user.update({
      where: { id: user.id },
      data,
      select: { profileDiscoverable: true, friendRequestsEnabled: true },
    });
    await logAudit({
      actorUserId: user.id,
      action: "ACCOUNT_PRIVACY_UPDATED",
      entity: "User",
      entityId: user.id,
      metadata: data,
    });
    return jsonOk(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
