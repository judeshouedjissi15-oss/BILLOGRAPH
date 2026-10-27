import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { orderStatusLabel, productStatusLabel, withdrawalStatusLabel } from "@/lib/format";

// Badge coloré unique pour les statuts de commande, produit ET retrait.
// PENDING ambre · PAID vert · FAILED rouge · CANCELLED gris · REFUNDED orange · DELIVERED teal
// DRAFT gris · PUBLISHED vert · ARCHIVED orange
// APPROVED teal · REJECTED rouge

const STATUS_STYLES: Record<string, string> = {
  PENDING:
    "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  PAID: "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  DELIVERED:
    "border-teal-300 bg-teal-100 text-teal-800 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-300",
  FAILED:
    "border-red-300 bg-red-100 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
  CANCELLED:
    "border-border bg-muted text-muted-foreground",
  REFUNDED:
    "border-orange-300 bg-orange-100 text-orange-800 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300",
  DRAFT: "border-border bg-muted text-muted-foreground",
  PUBLISHED:
    "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  ARCHIVED:
    "border-orange-300 bg-orange-100 text-orange-800 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300",
  APPROVED:
    "border-teal-300 bg-teal-100 text-teal-800 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-300",
  REJECTED:
    "border-red-300 bg-red-100 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
};

export function statusLabel(status: string): string {
  const order = orderStatusLabel(status);
  if (order !== status) return order;
  const product = productStatusLabel(status);
  if (product !== status) return product;
  const withdrawal = withdrawalStatusLabel(status);
  if (withdrawal !== status) return withdrawal;
  return status;
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", STATUS_STYLES[status] ?? "border-border bg-muted text-muted-foreground", className)}
    >
      {statusLabel(status)}
    </Badge>
  );
}
