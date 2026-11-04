import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/auth";
import { handleApiError, jsonOk, readJson } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    const [products, links] = await Promise.all([
      db.product.findMany({
        where: {
          status: "PUBLISHED",
          affiliateEnabled: true,
          deletedAt: null,
          store: { status: "ACTIVE", ownerId: { not: user.id } },
        },
        include: {
          store: { select: { name: true, slug: true } },
          affiliateLinks: {
            where: { userId: user.id },
            include: {
              commissions: {
                where: { status: { in: ["AVAILABLE", "PAID"] } },
                select: { amountXOF: true },
              },
              clicks: { select: { clickCount: true, id: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      db.affiliateLink.findMany({
        where: { userId: user.id },
        include: {
          product: { select: { title: true, slug: true, priceXOF: true } },
          commissions: {
            where: { status: { in: ["AVAILABLE", "PAID"] } },
            select: { amountXOF: true },
          },
          clicks: { select: { clickCount: true, id: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return jsonOk({
      products: products.map((product) => {
        const link = product.affiliateLinks[0];
        return {
          id: product.id,
          title: product.title,
          slug: product.slug,
          description: product.description,
          category: product.category,
          imageUrl: product.imageUrl,
          affiliateInstructions: product.affiliateInstructions,
          affiliateTerms: product.affiliateTerms,
          priceXOF: product.priceXOF,
          salePriceXOF: product.salePriceXOF,
          saleStartsAt: product.saleStartsAt,
          saleEndsAt: product.saleEndsAt,
          createdAt: product.createdAt,
          affiliatePercent: product.affiliatePercent,
          store: product.store,
          link: link
            ? {
                code: link.code,
                conversions: link.commissions.length,
                earnedXOF: link.commissions.reduce((sum, commission) => sum + commission.amountXOF, 0),
                clicks: link.clicks.reduce((sum, click) => sum + click.clickCount, 0),
                uniqueVisitors: link.clicks.length,
              }
            : null,
        };
      }),
      links: links.map((link) => ({
        code: link.code,
        createdAt: link.createdAt,
        product: link.product,
        conversions: link.commissions.length,
        earnedXOF: link.commissions.reduce((sum, commission) => sum + commission.amountXOF, 0),
        clicks: link.clicks.reduce((sum, click) => sum + click.clickCount, 0),
        uniqueVisitors: link.clicks.length,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await readJson(request);
    if (!body || typeof body !== "object" || !("productId" in body) || typeof body.productId !== "string") {
      throw new HttpError(422, "Produit invalide");
    }

    const product = await db.product.findFirst({
      where: {
        id: body.productId,
        status: "PUBLISHED",
        affiliateEnabled: true,
        deletedAt: null,
        store: { status: "ACTIVE", ownerId: { not: user.id } },
      },
      select: { id: true },
    });
    if (!product) throw new HttpError(404, "Produit indisponible pour l'affiliation");

    const existing = await db.affiliateLink.findUnique({
      where: { userId_productId: { userId: user.id, productId: product.id } },
    });
    if (existing) return jsonOk({ code: existing.code });

    const code = randomBytes(9).toString("base64url");
    try {
      const link = await db.affiliateLink.create({
        data: { code, userId: user.id, productId: product.id },
      });
      return jsonOk({ code: link.code }, 201);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "P2002") {
        const link = await db.affiliateLink.findUnique({
          where: { userId_productId: { userId: user.id, productId: product.id } },
        });
        if (link) return jsonOk({ code: link.code });
      }
      throw error;
    }
  } catch (error) {
    return handleApiError(error);
  }
}
