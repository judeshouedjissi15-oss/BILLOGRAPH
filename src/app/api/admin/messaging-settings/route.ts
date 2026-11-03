import { z } from "zod";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { requireAdminViewer, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

async function getSettings() {
  return db.platformSettings.upsert({
    where: { id: "main" },
    update: {},
    create: { id: "main" },
  });
}

export async function GET() {
  try {
    await requireAdminViewer();
    const [settings, users, friendships, conversations, messages, openReports, suspendedUsers] = await Promise.all([
      getSettings(),
      db.user.count({ where: { status: "ACTIVE" } }),
      db.friendship.count({ where: { status: "ACCEPTED" } }),
      db.conversation.count(),
      db.chatMessage.count({ where: { deletedAt: null } }),
      db.messageReport.count({ where: { status: "OPEN" } }),
      db.user.count({ where: { messagingSuspendedUntil: { gt: new Date() } } }),
    ]);
    return jsonOk({
      enabled: settings.messagingEnabled,
      retentionDays: settings.messageRetentionDays,
      stats: { users, friendships, conversations, messages, openReports, suspendedUsers },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

const schema = z.object({
  enabled: z.boolean().optional(),
  retentionDays: z.number().int().min(30).max(3650).optional(),
}).refine((value) => Object.keys(value).length > 0, "Aucun réglage à modifier.");

export async function PATCH(req: Request) {
  try {
    const admin = await requireRole("ADMIN");
    const body = schema.parse(await readJson(req));
    const settings = await getSettings();
    const updated = await db.platformSettings.update({
      where: { id: settings.id },
      data: {
        ...(body.enabled !== undefined ? { messagingEnabled: body.enabled } : {}),
        ...(body.retentionDays !== undefined ? { messageRetentionDays: body.retentionDays } : {}),
      },
    });
    await logAudit({
      actorUserId: admin.id,
      action: "MESSAGING_SETTINGS_UPDATED",
      entity: "PlatformSettings",
      entityId: settings.id,
      metadata: body,
    });
    return jsonOk({ enabled: updated.messagingEnabled, retentionDays: updated.messageRetentionDays });
  } catch (err) {
    return handleApiError(err);
  }
}
