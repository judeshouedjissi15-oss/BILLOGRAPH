import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, jsonOk } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { CATEGORIES, PRODUCT_MAX_PRICE } from "@/lib/constants";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const PAGE_SIZE = 24;
const MAX_PAGE = 10_000;

function parsePrice(value: string | null, label: string): number | undefined {
  if (value === null || value === "") return undefined;
  if (!/^\d+$/.test(value)) throw new HttpError(422, `${label} invalide`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > PRODUCT_MAX_PRICE) {
    throw new HttpError(422, `${label} invalide`);
  }
  return parsed;
}

export async function GET(request: NextRequest) {
  try {
    rateLimit(`market-products:${clientIp(request)}`, 120, 60_000);
    const params = request.nextUrl.searchParams;
    const query = params.get("q")?.trim() ?? "";
    const category = params.get("category") ?? "";
    const type = params.get("type") ?? "";
    const sort = params.get("sort") ?? "recent";
    const pageValue = params.get("page") ?? "1";
    const minPrice = parsePrice(params.get("minPrice"), "Le prix minimum");
    const maxPrice = parsePrice(params.get("maxPrice"), "Le prix maximum");

    if (query.length > 100) throw new HttpError(422, "La recherche est trop longue");
    if (category && !CATEGORIES.some((item) => item.id === category)) {
      throw new HttpError(422, "Catégorie invalide");
    }
    if (type && type !== "DIGITAL" && type !== "PHYSICAL") {
      throw new HttpError(422, "Type de produit invalide");
    }
    if (sort !== "recent" && sort !== "price-asc" && sort !== "price-desc") {
      throw new HttpError(422, "Tri invalide");
    }
    if (!/^\d+$/.test(pageValue)) throw new HttpError(422, "Page invalide");
    const page = Number(pageValue);
    if (!Number.isSafeInteger(page) || page < 1 || page > MAX_PAGE) {
      throw new HttpError(422, "Page invalide");
    }
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      throw new HttpError(422, "Le prix minimum doit être inférieur ou égal au prix maximum");
    }

    const where = {
      status: "PUBLISHED",
      deletedAt: null,
      store: { status: "ACTIVE" },
      ...(category ? { category } : {}),
      ...(type ? { type } : {}),
      ...(minPrice !== undefined || maxPrice !== undefined
        ? {
            priceXOF: {
              ...(minPrice !== undefined ? { gte: minPrice } : {}),
              ...(maxPrice !== undefined ? { lte: maxPrice } : {}),
            },
          }
        : {}),
      ...(query
        ? {
            OR: [
              { title: { contains: query, mode: "insensitive" as const } },
              { description: { contains: query, mode: "insensitive" as const } },
              { store: { name: { contains: query, mode: "insensitive" as const }, status: "ACTIVE" } },
            ],
          }
        : {}),
    };
    const orderBy =
      sort === "price-asc"
        ? [{ priceXOF: "asc" as const }, { createdAt: "desc" as const }]
        : sort === "price-desc"
          ? [{ priceXOF: "desc" as const }, { createdAt: "desc" as const }]
          : [{ createdAt: "desc" as const }];
    const [total, products] = await Promise.all([
      db.product.count({ where }),
      db.product.findMany({
        where,
        orderBy,
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          title: true,
          slug: true,
          description: true,
          type: true,
          category: true,
          priceXOF: true,
          salePriceXOF: true,
          saleStartsAt: true,
          saleEndsAt: true,
          imageUrl: true,
          stock: true,
          createdAt: true,
          store: { select: { name: true, slug: true, color: true, verifiedAt: true } },
        },
      }),
    ]);

    return jsonOk({ products, total, page, pageSize: PAGE_SIZE });
  } catch (error) {
    return handleApiError(error);
  }
}
