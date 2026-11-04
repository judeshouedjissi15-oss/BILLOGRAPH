import { db } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";
import { requireRole } from "@/lib/auth";

export async function GET() {
  try {
    await requireRole("ADMIN");
    const commissions = await db.affiliateCommission.findMany({
      include: {
        order: {
          select: {
            reference: true,
            totalXOF: true,
            status: true,
            createdAt: true,
            store: { select: { owner: { select: { name: true } } } },
          },
        },
        affiliateUser: { select: { name: true } },
        affiliateLink: { select: { product: { select: { title: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return jsonOk({
      commissions: commissions.map((commission) => ({
        id: commission.id,
        orderReference: commission.order.reference,
        orderTotalXOF: commission.order.totalXOF,
        orderStatus: commission.order.status,
        affiliateName: commission.affiliateUser.name,
        sellerName: commission.order.store.owner.name,
        productTitle: commission.affiliateLink.product.title,
        amountXOF: commission.amountXOF,
        ratePercent: commission.ratePercent,
        status: commission.status,
        createdAt: commission.createdAt,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
