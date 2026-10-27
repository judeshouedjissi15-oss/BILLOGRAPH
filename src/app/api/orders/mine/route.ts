// GET /api/orders/mine — commandes de la boutique du vendeur connecté.
// ⚠️ Route STATIQUE : créée volontairement en parallèle de [reference] —
// Next.js résout toujours le segment statique avant le segment dynamique.
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { jsonOk, handleApiError } from "@/lib/api";
import { requireRole, HttpError } from "@/lib/auth";
import { ORDER_STATUSES } from "@/lib/constants";

export async function GET(req: Request) {
  try {
    const user = await requireRole("VENDEUR");

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const q = url.searchParams.get("q")?.trim() || null;
    const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
    const limit = Math.min(Math.max(Number.isNaN(limitRaw) ? 50 : limitRaw, 1), 200);

    const store = await db.store.findFirst({ where: { ownerId: user.id } });
    if (!store) return jsonOk({ orders: [] });

    const where: Prisma.OrderWhereInput = { storeId: store.id };
    if (status) {
      if (!(ORDER_STATUSES as readonly string[]).includes(status)) {
        throw new HttpError(422, "Statut de commande invalide");
      }
      where.status = status;
    }
    if (q) {
      // PostgreSQL est sensible à la casse par défaut ; on conserve la recherche sans casse.
      where.OR = [
        { reference: { contains: q, mode: "insensitive" } },
        { customer: { email: { contains: q, mode: "insensitive" } } },
        { customer: { name: { contains: q, mode: "insensitive" } } },
      ];
    }

    const orders = await db.order.findMany({
      where,
      include: { customer: true, items: true, downloadTokens: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return jsonOk({
      orders: orders.map((o) => ({
        reference: o.reference,
        status: o.status,
        totalXOF: o.totalXOF,
        commissionXOF: o.commissionXOF,
        paymentMethod: o.paymentMethod,
        createdAt: o.createdAt,
        paidAt: o.paidAt,
        customer: {
          name: o.customer.name,
          email: o.customer.email,
          phone: o.customer.phone,
        },
        items: o.items.map((i) => ({
          titleSnapshot: i.titleSnapshot,
          quantity: i.quantity,
          unitPriceXOF: i.unitPriceXOF,
        })),
        downloadTokens: o.downloadTokens.map((t) => ({
          token: t.token,
          expiresAt: t.expiresAt,
          downloadCount: t.downloadCount,
          maxDownloads: t.maxDownloads,
        })),
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
