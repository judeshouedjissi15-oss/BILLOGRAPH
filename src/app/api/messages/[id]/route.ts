import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { assertFriends, requireMessagingUser } from "@/lib/messaging";
import { createNotification } from "@/lib/notifications";
import { rateLimit } from "@/lib/rate-limit";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireMessagingUser();
    const { id } = await params;
    const conversation = await db.conversation.findFirst({
      where: { id, OR: [{ userAId: user.id }, { userBId: user.id }] },
      select: { id: true, userAId: true, userBId: true },
    });
    if (!conversation) throw new HttpError(404, "Conversation introuvable.");

    const otherUserId = conversation.userAId === user.id ? conversation.userBId : conversation.userAId;
    await assertFriends(user.id, otherUserId);

    const beforeId = _req.nextUrl.searchParams.get("before");
    if (beforeId && beforeId.length > 64) {
      throw new HttpError(400, "Curseur de pagination invalide.");
    }
    if (beforeId) {
      const cursorExists = await db.chatMessage.findFirst({
        where: { id: beforeId, conversationId: conversation.id },
        select: { id: true },
      });
      if (!cursorExists) throw new HttpError(400, "Curseur de pagination expiré. Rechargez la conversation.");
    }
    const messages = await db.chatMessage.findMany({
      where: { conversationId: conversation.id },
      ...(beforeId ? { cursor: { id: beforeId }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 51,
      include: { reports: { where: { reporterId: user.id }, select: { id: true } } },
    });
    const hasMore = messages.length > 50;
    const page = hasMore ? messages.slice(0, 50) : messages;
    await db.chatMessage.updateMany({
      where: {
        id: { in: page.map((message) => message.id) },
        senderId: { not: user.id },
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return jsonOk({
      messages: page.reverse().map((message) => ({
        id: message.id,
        senderId: message.senderId,
        content: message.deletedAt ? "Ce message a été supprimé par l’administration." : message.content,
        createdAt: message.createdAt.toISOString(),
        readAt: message.readAt?.toISOString() ?? null,
        deleted: Boolean(message.deletedAt),
        reported: message.reports.length > 0,
      })),
      hasMore,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireMessagingUser();
    const { id } = await params;
    const conversation = await db.conversation.findFirst({
      where: { id, OR: [{ userAId: user.id }, { userBId: user.id }] },
      select: { id: true, userAId: true },
    });
    if (!conversation) throw new HttpError(404, "Conversation introuvable.");
    await db.conversation.update({
      where: { id },
      data: conversation.userAId === user.id
        ? { hiddenAAt: new Date() }
        : { hiddenBAt: new Date() },
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

const messageSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireMessagingUser();
    rateLimit(`messages:send:${user.id}`, 60, 60_000);
    const { id } = await params;
    const body = messageSchema.parse(await readJson(req));
    const conversation = await db.conversation.findFirst({
      where: { id, OR: [{ userAId: user.id }, { userBId: user.id }] },
      select: { id: true, userAId: true, userBId: true },
    });
    if (!conversation) throw new HttpError(404, "Conversation introuvable.");

    const otherUserId = conversation.userAId === user.id ? conversation.userBId : conversation.userAId;
    await assertFriends(user.id, otherUserId);

    const message = await db.$transaction(async (tx) => {
      const created = await tx.chatMessage.create({
        data: { conversationId: conversation.id, senderId: user.id, content: body.content },
        select: { id: true, content: true, createdAt: true },
      });
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: created.createdAt },
      });
      return created;
    });

    await createNotification({
      userId: otherUserId,
      type: "MESSAGE",
      title: `Nouveau message de ${user.name}`,
      body: "Vous avez reçu un nouveau message.",
      link: "#/messages",
    });
    return jsonOk({
      message: {
        ...message,
        senderId: user.id,
        createdAt: message.createdAt.toISOString(),
        readAt: null,
        deleted: false,
        reported: false,
      },
    }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
