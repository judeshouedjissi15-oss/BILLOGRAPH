import { z } from "zod";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { HttpError, requireUser, verifyPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

const requestSchema = z.object({ password: z.string().min(1).max(128) });

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (user.role === "ADMIN") {
      throw new HttpError(403, "La suppression d’un compte administrateur doit être traitée hors plateforme.");
    }
    rateLimit(`deletion-request:${user.id}`, 3, 60 * 60_000);
    const { password } = requestSchema.parse(await readJson(req));
    const account = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (!verifyPassword(password, account.passwordHash)) {
      throw new HttpError(422, "Mot de passe incorrect.");
    }

    const existing = await db.userDeletionRequest.findFirst({
      where: { userId: user.id, status: "OPEN" },
      select: { id: true },
    });
    if (existing) throw new HttpError(409, "Une demande de suppression est déjà en cours.");
    const request = await db.$transaction(async (tx) => {
      const alreadyOpen = await tx.userDeletionRequest.findFirst({
        where: { userId: user.id, status: "OPEN" },
        select: { id: true },
      });
      if (alreadyOpen) throw new HttpError(409, "Une demande de suppression est déjà en cours.");
      const marked = await tx.user.updateMany({
        where: { id: user.id, deletionRequestedAt: null },
        data: { deletionRequestedAt: new Date() },
      });
      if (marked.count !== 1) throw new HttpError(409, "Une demande de suppression est déjà en cours.");
      const created = await tx.userDeletionRequest.create({
        data: { userId: user.id },
        select: { id: true, createdAt: true },
      });
      return created;
    });
    await logAudit({
      actorUserId: user.id,
      action: "ACCOUNT_DELETION_REQUESTED",
      entity: "UserDeletionRequest",
      entityId: request.id,
    });
    return jsonOk({ ...request, createdAt: request.createdAt.toISOString() }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE() {
  try {
    const user = await requireUser();
    const openRequest = await db.userDeletionRequest.findFirst({
      where: { userId: user.id, status: "OPEN" },
      select: { id: true },
    });
    if (!openRequest) throw new HttpError(404, "Aucune demande en attente.");
    await db.$transaction([
      db.userDeletionRequest.update({
        where: { id: openRequest.id },
        data: { status: "CANCELLED", reviewedAt: new Date() },
      }),
      db.user.update({ where: { id: user.id }, data: { deletionRequestedAt: null } }),
    ]);
    await logAudit({
      actorUserId: user.id,
      action: "ACCOUNT_DELETION_CANCELLED",
      entity: "UserDeletionRequest",
      entityId: openRequest.id,
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
