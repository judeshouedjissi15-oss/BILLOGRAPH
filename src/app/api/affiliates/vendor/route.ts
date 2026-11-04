import { db } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";
import { requireRole } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireRole("VENDEUR", "ADMIN");
    const products = await db.product.findMany({
      where: { store: { ownerId: user.id }, deletedAt: null },
      select: {
        id: true,
        title: true,
        status: true,
        priceXOF: true,
        affiliateEnabled: true,
        affiliatePercent: true,
        affiliateLinks: {
          select: {
            id: true,
            user: { select: { name: true } },
            clicks: { select: { id: true, clickCount: true } },
            commissions: {
              where: { status: { not: "CANCELLED" } },
              select: { amountXOF: true, status: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const summaries = products.map((product) => ({
      id: product.id,
      title: product.title,
      status: product.status,
      priceXOF: product.priceXOF,
      affiliateEnabled: product.affiliateEnabled,
      affiliatePercent: product.affiliatePercent,
      affiliates: product.affiliateLinks.map((link) => ({
        id: link.id,
        name: link.user.name,
        clicks: link.clicks.reduce((sum, click) => sum + click.clickCount, 0),
        uniqueVisitors: link.clicks.length,
        sales: link.commissions.length,
        commissionXOF: link.commissions.reduce((sum, commission) => sum + commission.amountXOF, 0),
        pendingXOF: link.commissions
          .filter((commission) => commission.status === "PENDING" || commission.status === "VALIDATED")
          .reduce((sum, commission) => sum + commission.amountXOF, 0),
      })),
    }));

    return jsonOk({
      products: summaries,
      totals: {
        products: summaries.length,
        activeProducts: summaries.filter((product) => product.affiliateEnabled && product.status === "PUBLISHED").length,
        affiliates: summaries.reduce((sum, product) => sum + product.affiliates.length, 0),
        clicks: summaries.reduce((sum, product) =>
          sum + product.affiliates.reduce((productSum, affiliate) => productSum + affiliate.clicks, 0), 0),
        sales: summaries.reduce((sum, product) =>
          sum + product.affiliates.reduce((productSum, affiliate) => productSum + affiliate.sales, 0), 0),
        commissionXOF: summaries.reduce((sum, product) =>
          sum + product.affiliates.reduce((productSum, affiliate) => productSum + affiliate.commissionXOF, 0), 0),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
