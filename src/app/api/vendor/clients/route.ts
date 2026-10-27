// GET /api/vendor/clients — clients réels du vendeur connecté, dérivés des
// commandes de sa boutique (regroupement par compte client). Le total dépensé
// ne compte que les commandes PAID/DELIVERED — jamais les paniers abandonnés.
import { db } from "@/lib/db";
import { jsonOk, handleApiError } from "@/lib/api";
import { requireRole } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireRole("VENDEUR");

    const store = await db.store.findFirst({ where: { ownerId: user.id } });
    if (!store) return jsonOk({ clients: [] });

    const orders = await db.order.findMany({
      where: { storeId: store.id },
      include: { customer: true },
      orderBy: { createdAt: "desc" },
    });

    const byCustomer = new Map<
      string,
      {
        id: string;
        name: string;
        email: string;
        phone: string | null;
        ordersCount: number;
        paidCount: number;
        totalSpentXOF: number;
        lastOrderAt: Date;
      }
    >();

    for (const order of orders) {
      const existing = byCustomer.get(order.customerId);
      const isPaid = order.status === "PAID" || order.status === "DELIVERED";
      if (existing) {
        existing.ordersCount += 1;
        if (isPaid) {
          existing.paidCount += 1;
          existing.totalSpentXOF += order.totalXOF;
        }
      } else {
        byCustomer.set(order.customerId, {
          id: order.customerId,
          name: order.customer.name,
          email: order.customer.email,
          phone: order.customer.phone,
          ordersCount: 1,
          paidCount: isPaid ? 1 : 0,
          totalSpentXOF: isPaid ? order.totalXOF : 0,
          lastOrderAt: order.createdAt,
        });
      }
    }

    const clients = [...byCustomer.values()].sort(
      (a, b) => b.lastOrderAt.getTime() - a.lastOrderAt.getTime(),
    );

    return jsonOk({ clients });
  } catch (err) {
    return handleApiError(err);
  }
}
