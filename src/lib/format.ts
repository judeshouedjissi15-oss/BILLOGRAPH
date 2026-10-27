// Formatage des montants FCFA et des dates — utilisable côté client.

export function formatXOF(amount: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(amount)} FCFA`;
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

const ORDER_LABELS: Record<string, string> = {
  PENDING: "En attente",
  PAID: "Payée",
  FAILED: "Échouée",
  CANCELLED: "Annulée",
  REFUNDED: "Remboursée",
  DELIVERED: "Livrée",
};

export function orderStatusLabel(status: string): string {
  return ORDER_LABELS[status] ?? status;
}

const PRODUCT_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  PUBLISHED: "Publié",
  ARCHIVED: "Archivé",
};

export function productStatusLabel(status: string): string {
  return PRODUCT_LABELS[status] ?? status;
}

// Statuts de retrait — PAID/PENDING partagent le libellé des commandes.
const WITHDRAWAL_LABELS: Record<string, string> = {
  APPROVED: "Pré-validé",
  REJECTED: "Rejeté",
};

export function withdrawalStatusLabel(status: string): string {
  return WITHDRAWAL_LABELS[status] ?? orderStatusLabel(status);
}
