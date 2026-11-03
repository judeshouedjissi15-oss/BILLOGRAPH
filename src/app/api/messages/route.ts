import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { assertFriends, assertNotBlocked, orderedUserPair, requireMessagingUser } from "@/lib/messaging";
import { rateLimit } from "@/lib/rate-limit";

const publicUserSelect = {
  id: true,
  name: true,
  avatarUrl: true,
  headline: true,
  city: true,
} as const;

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request"), targetUserId: z.string().min(1).max(64) }),
  z.object({ action: z.literal("open"), targetUserId: z.string().min(1).max(64) }),
  z.object({ action: z.literal("accept"), requestId: z.string().min(1).max(64) }),
  z.object({ action: z.literal("reject"), requestId: z.string().min(1).max(64) }),
  z.object({ action: z.literal("remove"), targetUserId: z.string().min(1).max(64) }),
  z.object({ action: z.literal("block"), targetUserId: z.string().min(1).max(64) }),
  z.object({ action: z.literal("unblock"), targetUserId: z.string().min(1).max(64) }),
]);

export async function GET(req: NextRequest) {
  try {
    const user = await requireMessagingUser();
    const query = z.string().trim().max(80).parse(req.nextUrl.searchParams.get("q") ?? "");
    if (query.length >= 2) rateLimit(`messages:search:${user.id}`, 30, 60_000);

    const [friendships, incoming, outgoing, blocks] = await Promise.all([
      db.friendship.findMany({
        where: {
          status: "ACCEPTED",
          OR: [
            { userAId: user.id, userB: { is: { status: "ACTIVE", emailVerified: true } } },
            { userBId: user.id, userA: { is: { status: "ACTIVE", emailVerified: true } } },
          ],
        },
        include: { userA: { select: publicUserSelect }, userB: { select: publicUserSelect } },
        orderBy: { updatedAt: "desc" },
        take: 100,
      }),
      db.friendship.findMany({
        where: {
          status: "PENDING",
          requestedById: { not: user.id },
          OR: [
            { userAId: user.id, userB: { is: { status: "ACTIVE", emailVerified: true } } },
            { userBId: user.id, userA: { is: { status: "ACTIVE", emailVerified: true } } },
          ],
        },
        include: { userA: { select: publicUserSelect }, userB: { select: publicUserSelect } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      db.friendship.findMany({
        where: {
          status: "PENDING",
          requestedById: user.id,
          OR: [
            { userAId: user.id, userB: { is: { status: "ACTIVE", emailVerified: true } } },
            { userBId: user.id, userA: { is: { status: "ACTIVE", emailVerified: true } } },
          ],
        },
        include: { userA: { select: publicUserSelect }, userB: { select: publicUserSelect } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      db.userBlock.findMany({
        where: { blockerId: user.id },
        include: { blocked: { select: publicUserSelect } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);

    const mutualBlocks = await db.userBlock.findMany({
      where: { OR: [{ blockerId: user.id }, { blockedId: user.id }] },
      select: { blockerId: true, blockedId: true },
    });
    const blockedOtherIds = new Set(
      mutualBlocks.map((block) => block.blockerId === user.id ? block.blockedId : block.blockerId),
    );
    const visibleFriendships = friendships.filter((friendship) =>
      !blockedOtherIds.has(friendship.userAId === user.id ? friendship.userBId : friendship.userAId),
    );

    const friendIds = visibleFriendships.map((friendship) =>
      friendship.userAId === user.id ? friendship.userBId : friendship.userAId,
    );
    const allConversationRows = friendIds.length
      ? await db.conversation.findMany({
          where: {
            OR: [
              { userAId: user.id, userBId: { in: friendIds } },
              { userBId: user.id, userAId: { in: friendIds } },
            ],
          },
          include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
          orderBy: { lastMessageAt: "desc" },
          take: 100,
        })
      : [];
    const conversationRows = allConversationRows.filter((conversation) => {
      const hiddenAt = conversation.userAId === user.id ? conversation.hiddenAAt : conversation.hiddenBAt;
      return !hiddenAt || conversation.lastMessageAt > hiddenAt;
    });
    const allConversationByOtherId = new Map(
      allConversationRows.map((conversation) => [
        conversation.userAId === user.id ? conversation.userBId : conversation.userAId,
        conversation,
      ]),
    );
    const conversationByOtherId = new Map(
      conversationRows.map((conversation) => [
        conversation.userAId === user.id ? conversation.userBId : conversation.userAId,
        conversation,
      ]),
    );
    const unreadGroups = conversationRows.length
      ? await db.chatMessage.groupBy({
          by: ["conversationId"],
          where: {
            conversationId: { in: conversationRows.map((conversation) => conversation.id) },
            senderId: { not: user.id },
            readAt: null,
            deletedAt: null,
          },
          _count: { _all: true },
        })
      : [];
    const unreadByConversation = new Map(unreadGroups.map((group) => [group.conversationId, group._count._all]));

    const asRequest = (friendship: (typeof incoming)[number]) => ({
      id: friendship.id,
      createdAt: friendship.createdAt.toISOString(),
      user: friendship.userAId === user.id ? friendship.userB : friendship.userA,
    });

    const friends = visibleFriendships.map((friendship) => {
      const friend = friendship.userAId === user.id ? friendship.userB : friendship.userA;
      const conversation = conversationByOtherId.get(friend.id);
      const anyConversation = allConversationByOtherId.get(friend.id);
      const lastMessage = conversation?.messages[0];
      return {
        user: friend,
        conversationId: conversation?.id ?? null,
        hidden: !conversation && Boolean(anyConversation),
        unreadCount: conversation ? unreadByConversation.get(conversation.id) ?? 0 : 0,
        lastMessage: lastMessage
          ? {
              content: lastMessage.deletedAt ? "Message supprimé" : lastMessage.content,
              createdAt: lastMessage.createdAt.toISOString(),
              senderId: lastMessage.senderId,
            }
          : null,
      };
    }).sort((a, b) => {
      const aTime = conversationByOtherId.get(a.user.id)?.lastMessageAt.getTime() ?? 0;
      const bTime = conversationByOtherId.get(b.user.id)?.lastMessageAt.getTime() ?? 0;
      return bTime - aTime;
    });

    let searchResults: Array<{
      id: string;
      name: string;
      avatarUrl: string | null;
      headline: string | null;
      city: string | null;
    }> = [];
    if (query.length >= 2) {
      const blockedIds = await db.userBlock.findMany({
        where: { OR: [{ blockerId: user.id }, { blockedId: user.id }] },
        select: { blockerId: true, blockedId: true },
      });
      const excludedIds = new Set([
        user.id,
        ...blockedIds.map((block) => block.blockerId === user.id ? block.blockedId : block.blockerId),
        ...friendships.flatMap((friendship) => [friendship.userAId, friendship.userBId]),
        ...incoming.flatMap((friendship) => [friendship.userAId, friendship.userBId]),
        ...outgoing.flatMap((friendship) => [friendship.userAId, friendship.userBId]),
      ]);
      searchResults = await db.user.findMany({
        where: {
          status: "ACTIVE",
          emailVerified: true,
          id: { notIn: [...excludedIds] },
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { headline: { contains: query, mode: "insensitive" } },
            { city: { contains: query, mode: "insensitive" } },
          ],
          profileDiscoverable: true,
          friendRequestsEnabled: true,
        },
        select: publicUserSelect,
        orderBy: { name: "asc" },
        take: 20,
      });
    }

    return jsonOk({
      friends,
      incomingRequests: incoming.map(asRequest),
      outgoingRequests: outgoing.map(asRequest),
      blockedUsers: blocks.map((block) => block.blocked),
      searchResults,
      unreadCount: unreadGroups.reduce((total, group) => total + group._count._all, 0),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireMessagingUser();
    const body = actionSchema.parse(await readJson(req));

    if (body.action === "request") {
      rateLimit(`messages:request:${user.id}`, 10, 10 * 60_000);
      if (body.targetUserId === user.id) throw new HttpError(400, "Vous ne pouvez pas vous ajouter vous-même.");

      const target = await db.user.findFirst({
        where: {
          id: body.targetUserId,
          status: "ACTIVE",
          emailVerified: true,
          profileDiscoverable: true,
          friendRequestsEnabled: true,
        },
        select: { id: true, name: true },
      });
      if (!target) throw new HttpError(404, "Utilisateur introuvable.");
      await assertNotBlocked(user.id, target.id);

      const pair = orderedUserPair(user.id, target.id);
      const current = await db.friendship.findUnique({ where: { userAId_userBId: pair } });
      if (current?.status === "ACCEPTED") throw new HttpError(409, "Vous êtes déjà amis.");
      if (current?.status === "PENDING") {
        throw new HttpError(409, current.requestedById === user.id
          ? "Une invitation est déjà en attente."
          : "Cette personne vous a déjà envoyé une invitation.");
      }

      const request = await db.friendship.upsert({
        where: { userAId_userBId: pair },
        update: { status: "PENDING", requestedById: user.id },
        create: { ...pair, requestedById: user.id, status: "PENDING" },
      });
      await createNotification({
        userId: target.id,
        type: "MESSAGE",
        title: "Nouvelle demande d’ami",
        body: `${user.name} souhaite vous ajouter comme ami.`,
        link: "#/messages",
      });
      return jsonOk({ requestId: request.id }, 201);
    }

    if (body.action === "open") {
      if (body.targetUserId === user.id) throw new HttpError(422, "Action invalide.");
      await assertNotBlocked(user.id, body.targetUserId);
      await assertFriends(user.id, body.targetUserId);
      const pair = orderedUserPair(user.id, body.targetUserId);
      const conversation = await db.conversation.upsert({
        where: { userAId_userBId: pair },
        create: pair,
        update: user.id === pair.userAId ? { hiddenAAt: null } : { hiddenBAt: null },
        select: { id: true },
      });
      return jsonOk({ conversationId: conversation.id });
    }

    if (body.action === "accept" || body.action === "reject") {
      const request = await db.friendship.findUnique({
        where: { id: body.requestId },
        select: { id: true, userAId: true, userBId: true, requestedById: true, status: true },
      });
      if (!request || (request.userAId !== user.id && request.userBId !== user.id)) {
        throw new HttpError(404, "Demande d’ami introuvable.");
      }
      if (request.status !== "PENDING" || request.requestedById === user.id) {
        throw new HttpError(409, "Cette demande ne peut plus être traitée.");
      }
      await assertNotBlocked(user.id, request.requestedById);
      const requester = await db.user.findFirst({
        where: { id: request.requestedById, status: "ACTIVE", emailVerified: true },
        select: { id: true },
      });
      if (!requester) throw new HttpError(404, "Demande d’ami introuvable.");

      if (body.action === "accept") {
        await db.$transaction([
          db.friendship.update({ where: { id: request.id }, data: { status: "ACCEPTED" } }),
          db.conversation.upsert({
            where: { userAId_userBId: { userAId: request.userAId, userBId: request.userBId } },
            update: {},
            create: { userAId: request.userAId, userBId: request.userBId },
          }),
        ]);
        await createNotification({
          userId: request.requestedById,
          type: "MESSAGE",
          title: "Demande d’ami acceptée",
          body: `${user.name} a accepté votre demande. Vous pouvez maintenant discuter.`,
          link: "#/messages",
        });
      } else {
        await db.friendship.update({ where: { id: request.id }, data: { status: "REJECTED" } });
      }
      return jsonOk({ ok: true });
    }

    if (body.action === "remove") {
      if (body.targetUserId === user.id) throw new HttpError(400, "Action invalide.");
      const pair = orderedUserPair(user.id, body.targetUserId);
      await db.friendship.updateMany({
        where: { ...pair, status: "ACCEPTED" },
        data: { status: "REJECTED" },
      });
      return jsonOk({ ok: true });
    }

    if (body.targetUserId === user.id) throw new HttpError(400, "Action invalide.");
    if (body.action === "block") {
      const target = await db.user.findUnique({ where: { id: body.targetUserId }, select: { id: true } });
      if (!target) throw new HttpError(404, "Utilisateur introuvable.");
      await db.$transaction([
        db.userBlock.upsert({
          where: { blockerId_blockedId: { blockerId: user.id, blockedId: target.id } },
          update: {},
          create: { blockerId: user.id, blockedId: target.id },
        }),
        db.friendship.updateMany({
          where: { ...orderedUserPair(user.id, target.id), status: { in: ["PENDING", "ACCEPTED"] } },
          data: { status: "REJECTED" },
        }),
      ]);
    } else {
      await db.userBlock.deleteMany({ where: { blockerId: user.id, blockedId: body.targetUserId } });
    }
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
