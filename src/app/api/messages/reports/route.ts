import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { notifyAdmins } from "@/lib/notifications";
import { requireMessagingUser } from "@/lib/messaging";

const reportSchema = z.object({
  messageId: z.string().min(1).max(64),
  reason: z.string().trim().min(5).max(500),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireMessagingUser();
    rateLimit(`messages:report:${user.id}`, 5, 10 * 60_000);
    const body = reportSchema.parse(await readJson(req));
    const message = await db.chatMessage.findUnique({
      where: { id: body.messageId },
      include: { conversation: { select: { userAId: true, userBId: true } } },
    });
    if (
      !message ||
      message.senderId === user.id ||
      (message.conversation.userAId !== user.id && message.conversation.userBId !== user.id)
    ) {
      throw new HttpError(404, "Message introuvable.");
    }

    const report = await db.messageReport.create({
      data: { messageId: message.id, reporterId: user.id, reason: body.reason },
      select: { id: true },
    }).catch((err: unknown) => {
      if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
        throw new HttpError(409, "Vous avez déjà signalé ce message.");
      }
      throw err;
    });

    await notifyAdmins({
      type: "MESSAGE",
      title: "Nouveau signalement de message",
      body: `Un utilisateur a signalé un message. Motif : ${body.reason.slice(0, 100)}`,
      link: "#/admin",
    });
    return jsonOk({ reportId: report.id }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
