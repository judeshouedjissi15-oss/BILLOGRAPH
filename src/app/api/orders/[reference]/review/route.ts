import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { handleApiError, jsonOk, readJson } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

type RouteContext = { params: Promise<{ reference: string }> };

const reviewSchema = z.object({
  email: z.string().trim().email().max(254),
  productId: z.string().min(1).max(64),
  rating: z.number().int().min(1).max(5),
  content: z.string().trim().min(10).max(600),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    rateLimit(`verified-review:${clientIp(request)}`, 5, 10 * 60_000);
    const { reference } = await context.params;
    const input = reviewSchema.parse(await readJson(request));
    const order = await db.order.findUnique({
      where: { reference },
      include: { customer: true, payment: true, items: true },
    });
    if (!order || order.customer.email.toLowerCase() !== input.email.toLowerCase()) {
      throw new HttpError(404, "Commande introuvable pour cette adresse email.");
    }
    if (
      !["PAID", "DELIVERED"].includes(order.status) ||
      order.payment?.status !== "SUCCESS" ||
      !order.items.some((item) => item.productId === input.productId)
    ) {
      throw new HttpError(403, "Un avis vérifié est disponible après l'achat confirmé du produit.");
    }
    if (await db.review.findUnique({ where: { verifiedOrderId: order.id }, select: { id: true } })) {
      throw new HttpError(409, "Un avis a déjà été envoyé pour cette commande.");
    }

    const settings = await db.platformSettings.findUnique({ where: { id: "main" } });
    const autoPublish = settings?.reviewsAutoPublish ?? false;
    let review;
    try {
      review = await db.review.create({
        data: {
          authorName: order.customer.name,
          authorRole: "Acheteur vérifié",
          rating: input.rating,
          content: input.content,
          productId: input.productId,
          verifiedOrderId: order.id,
          status: autoPublish ? "APPROVED" : "PENDING",
          moderatedAt: autoPublish ? new Date() : null,
        },
        select: { id: true, status: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new HttpError(409, "Un avis a déjà été envoyé pour cette commande.");
      }
      throw error;
    }
    await logAudit({
      action: "VERIFIED_REVIEW_SUBMITTED",
      entity: "Review",
      entityId: review.id,
      metadata: { productId: input.productId, orderReference: reference },
    });
    return jsonOk({
      review,
      message: autoPublish
        ? "Votre avis vérifié a été publié."
        : "Votre avis vérifié a été reçu et sera publié après modération.",
    }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
