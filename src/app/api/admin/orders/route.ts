// GET /api/admin/orders?status=&q=&limit= — toutes les commandes, toutes
// boutiques confondues (rôle ADMIN requis).
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { jsonOk, handleApiError } from "@/lib/api";
import { HttpError, requireAdminViewer } from "@/lib/auth";
import { ORDER_STATUSES } from "@/lib/constants";

export async function GET(req: Request) {
  try {
    await requireAdminViewer();

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const q = url.searchParams.get("q")?.trim() || null;
    const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
    const limit = Math.min(Math.max(Number.isNaN(limitRaw) ? 100 : limitRaw, 1), 500);

    const where: Prisma.OrderWhereInput = {};
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
      include: {
        store: { select: { name: true } },
        customer: { select: { name: true, email: true } },
      },
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
        store: { name: o.store.name },
        customer: { name: o.customer.name, email: o.customer.email },
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
