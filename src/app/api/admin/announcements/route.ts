// GET  /api/admin/announcements — historique des annonces (ADMIN requis).
// POST /api/admin/announcements — publier une annonce. Contrat : une seule
// annonce active à la fois — la publication désactive automatiquement les
// précédentes. Toutes les mutations sont auditées.
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonOk, handleApiError, readJson } from "@/lib/api";
import { requireRole, requireAdminViewer, HttpError } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Lien sûr : route hash interne (« #/… »), chemin interne (« /… ») ou URL
// https explicite. Jamais de schéma arbitraire (javascript:, data:, …).
const linkSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine(
    (value) => /^(#\/|\/)[\w\-./]*$/.test(value) || /^https:\/\/\S+$/.test(value),
    "Le lien doit être une page interne (#/…) ou une URL https",
  );

const createSchema = z.object({
  message: z.string().trim().min(3, "Message trop court").max(300, "Message trop long"),
  link: linkSchema.nullish(),
  linkLabel: z.string().trim().min(2).max(40).nullish(),
});

const toShape = (a: {
  id: string;
  message: string;
  link: string | null;
  linkLabel: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: a.id,
  message: a.message,
  link: a.link,
  linkLabel: a.linkLabel,
  active: a.active,
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
});

export async function GET() {
  try {
    await requireAdminViewer();

    const announcements = await db.announcement.findMany({
      where: { deletedAt: null }, // les annonces supprimées vivent dans la corbeille
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return jsonOk({ announcements: announcements.map(toShape) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireRole("ADMIN");
    const body = createSchema.parse(await readJson(req));

    const link = body.link?.trim() || null;
    if (link && !body.linkLabel) {
      throw new HttpError(422, "Un libellé de lien est requis lorsqu'un lien est fourni");
    }

    const count = await db.announcement.count();
    if (count >= 200) {
      // Garde-fou anti-accumulation : l'historique se purge via la suppression.
      throw new HttpError(422, "Trop d'annonces enregistrées — supprimez les anciennes");
    }

    const announcement = await db.$transaction(async (tx) => {
      // Une seule annonce active à la fois.
      await tx.announcement.updateMany({ where: { active: true }, data: { active: false } });
      return tx.announcement.create({
        data: {
          message: body.message,
          link,
          linkLabel: body.linkLabel?.trim() || null,
          active: true,
        },
      });
    });

    await logAudit({
      actorUserId: admin.id,
      action: "ADMIN_ANNOUNCEMENT_PUBLISHED",
      entity: "Announcement",
      entityId: announcement.id,
      metadata: { message: announcement.message, link: announcement.link },
    });

    return jsonOk({ announcement: toShape(announcement) }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
