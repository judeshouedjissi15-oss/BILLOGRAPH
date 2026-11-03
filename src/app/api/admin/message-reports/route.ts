import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { HttpError, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function GET() {
  try {
    await requireRole("ADMIN");
    const reports = await db.messageReport.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        message: {
          select: {
            id: true,
            content: true,
            deletedAt: true,
            createdAt: true,
            sender: { select: { id: true, name: true } },
          },
        },
        reporter: { select: { id: true, name: true } },
      },
    });
    return jsonOk({
      reports: reports.map((report) => ({
        id: report.id,
        reason: report.reason,
        status: report.status,
        adminNote: report.adminNote,
        createdAt: report.createdAt.toISOString(),
        reviewedAt: report.reviewedAt?.toISOString() ?? null,
        reporter: report.reporter,
        message: {
          id: report.message.id,
          content: report.message.deletedAt ? "[Message supprimé]" : report.message.content,
          deleted: Boolean(report.message.deletedAt),
          createdAt: report.message.createdAt.toISOString(),
          sender: report.message.sender,
        },
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

const updateSchema = z.object({
  reportId: z.string().min(1).max(64),
  action: z.enum(["dismiss", "review", "remove_message"]),
  adminNote: z.string().trim().max(500).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireRole("ADMIN");
    const body = updateSchema.parse(await readJson(req));
    const existing = await db.messageReport.findUnique({
      where: { id: body.reportId },
      select: { id: true, status: true, messageId: true },
    });
    if (!existing) throw new HttpError(404, "Signalement introuvable.");

    await db.$transaction(async (tx) => {
      if (body.action === "remove_message") {
        await tx.chatMessage.update({
          where: { id: existing.messageId },
          data: { deletedAt: new Date(), content: "" },
        });
      }
      await tx.messageReport.update({
        where: { id: existing.id },
        data: {
          status: body.action === "dismiss" ? "DISMISSED" : "REVIEWED",
          adminNote: body.adminNote ?? null,
          reviewedById: admin.id,
          reviewedAt: new Date(),
        },
      });
    });

    await logAudit({
      actorUserId: admin.id,
      action: "MESSAGE_REPORT_REVIEWED",
      entity: "MessageReport",
      entityId: existing.id,
      metadata: { action: body.action, previousStatus: existing.status },
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
