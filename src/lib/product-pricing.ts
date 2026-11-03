type ProductPricing = {
  priceXOF: number;
  salePriceXOF?: number | null;
  saleStartsAt?: string | Date | null;
  saleEndsAt?: string | Date | null;
};

export function getActiveProductPrice(product: ProductPricing, now = Date.now()): number {
  const startsAt = product.saleStartsAt ? new Date(product.saleStartsAt).getTime() : null;
  const endsAt = product.saleEndsAt ? new Date(product.saleEndsAt).getTime() : null;
  const saleIsActive =
    product.salePriceXOF !== null &&
    product.salePriceXOF !== undefined &&
    product.salePriceXOF < product.priceXOF &&
    (startsAt === null || startsAt <= now) &&
    (endsAt === null || endsAt >= now);
  return saleIsActive ? product.salePriceXOF! : product.priceXOF;
}
