import "server-only";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/auth";

let lastRetentionCleanupAt = 0;

export async function requireMessagingUser() {
  const user = await requireUser();
  if (!user.emailVerified) {
    throw new HttpError(403, "Confirmez votre adresse email pour utiliser la messagerie.");
  }
  const [settings, account] = await Promise.all([
    db.platformSettings.findUnique({
      where: { id: "main" },
      select: { messagingEnabled: true, messageRetentionDays: true },
    }),
    db.user.findUnique({
      where: { id: user.id },
      select: { messagingSuspendedUntil: true },
    }),
  ]);
  if (settings?.messagingEnabled === false) {
    throw new HttpError(503, "La messagerie est temporairement désactivée.");
  }
  if (account?.messagingSuspendedUntil && account.messagingSuspendedUntil > new Date()) {
    throw new HttpError(403, "Votre accès à la messagerie est temporairement suspendu.");
  }
  if (Date.now() - lastRetentionCleanupAt >= 60 * 60_000) {
    const expiresBefore = new Date(Date.now() - (settings?.messageRetentionDays ?? 365) * 24 * 60 * 60_000);
    await db.chatMessage.deleteMany({
      where: {
        createdAt: { lt: expiresBefore },
        deletedAt: null,
        reports: { none: { status: "OPEN" } },
      },
    });
    lastRetentionCleanupAt = Date.now();
  }
  return user;
}

export function orderedUserPair(firstId: string, secondId: string) {
  return firstId < secondId
    ? { userAId: firstId, userBId: secondId }
    : { userAId: secondId, userBId: firstId };
}

export async function assertNotBlocked(firstId: string, secondId: string) {
  const block = await db.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: firstId, blockedId: secondId },
        { blockerId: secondId, blockedId: firstId },
      ],
    },
    select: { id: true },
  });
  if (block) throw new HttpError(403, "Cette interaction n'est pas disponible.");
}

export async function assertFriends(firstId: string, secondId: string) {
  await assertNotBlocked(firstId, secondId);
  const [friendship, otherUser] = await Promise.all([
    db.friendship.findUnique({
      where: { userAId_userBId: orderedUserPair(firstId, secondId) },
      select: { status: true },
    }),
    db.user.findFirst({
      where: { id: secondId, status: "ACTIVE", emailVerified: true },
      select: { id: true },
    }),
  ]);
  if (friendship?.status !== "ACCEPTED" || !otherUser) {
    throw new HttpError(403, "Vous devez être amis pour accéder à cette conversation.");
  }
}
