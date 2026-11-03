import { randomBytes } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { HttpError, hashPassword, requireAdminViewer, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET() {
  try {
    await requireAdminViewer();
    const requests = await db.userDeletionRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        user: { select: { id: true, name: true, email: true, role: true, createdAt: true } },
      },
    });
    return jsonOk({
      requests: requests.map((request) => ({
        id: request.id,
        status: request.status,
        userNote: request.userNote,
        adminNote: request.adminNote,
        createdAt: request.createdAt.toISOString(),
        reviewedAt: request.reviewedAt?.toISOString() ?? null,
        user: {
          ...request.user,
          createdAt: request.user.createdAt.toISOString(),
        },
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

const updateSchema = z.object({
  requestId: z.string().min(1).max(64),
  action: z.enum(["approve", "reject"]),
  adminNote: z.string().trim().max(500).optional(),
});

export async function PATCH(req: Request) {
  try {
    const admin = await requireRole("ADMIN");
    const body = updateSchema.parse(await readJson(req));
    const deletion = await db.userDeletionRequest.findUnique({
      where: { id: body.requestId },
      select: { id: true, userId: true, status: true, user: { select: { role: true } } },
    });
    if (!deletion || deletion.status !== "OPEN") {
      throw new HttpError(404, "Demande ouverte introuvable.");
    }
    if (deletion.user.role === "ADMIN") {
      throw new HttpError(403, "La suppression d’un compte administrateur doit être traitée hors plateforme.");
    }

    await db.$transaction(async (tx) => {
      const reviewed = await tx.userDeletionRequest.updateMany({
        where: { id: deletion.id, status: "OPEN" },
        data: {
          status: body.action === "approve" ? "APPROVED" : "REJECTED",
          adminNote: body.adminNote ?? null,
          reviewedById: admin.id,
          reviewedAt: new Date(),
        },
      });
      if (reviewed.count !== 1) throw new HttpError(409, "Cette demande a déjà été traitée.");
      if (body.action === "approve") {
        await tx.user.update({
          where: { id: deletion.userId },
          data: {
            email: `deleted+${deletion.userId}@accounts.invalid`,
            name: "Compte supprimé",
            passwordHash: hashPassword(randomBytes(32).toString("hex")),
            status: "SUSPENDED",
            emailVerified: false,
            emailVerifiedAt: null,
            avatarUrl: null,
            phone: null,
            headline: null,
            bio: null,
            city: null,
            profileDiscoverable: false,
            friendRequestsEnabled: false,
            messagingSuspendedUntil: new Date("9999-12-31T23:59:59.999Z"),
            deletionRequestedAt: null,
          },
        });
        await tx.session.deleteMany({ where: { userId: deletion.userId } });
        await tx.accountActionToken.deleteMany({ where: { userId: deletion.userId } });
        await tx.friendship.updateMany({
          where: { status: "PENDING", OR: [{ userAId: deletion.userId }, { userBId: deletion.userId }] },
          data: { status: "REJECTED" },
        });
      } else {
        await tx.user.update({
          where: { id: deletion.userId },
          data: { deletionRequestedAt: null },
        });
      }
    });
    await logAudit({
      actorUserId: admin.id,
      action: body.action === "approve" ? "ACCOUNT_DELETION_APPROVED" : "ACCOUNT_DELETION_REJECTED",
      entity: "UserDeletionRequest",
      entityId: deletion.id,
      metadata: { userId: deletion.userId, adminNote: body.adminNote ?? null },
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
