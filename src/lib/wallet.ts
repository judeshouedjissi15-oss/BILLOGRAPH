// BILLOGRAPH — Portefeuille vendeur (solde, commissions, retraits).
//
// Modèle économique : chaque commande payée rapporte au vendeur son montant
// net = totalXOF − commissionXOF (la commission plateforme est figée par
// commande au moment du checkout). Le solde disponible est donc :
//
//   disponible = Σ (total − commission) des commandes PAID/DELIVERED
//                − Σ des retraits non rejetés (PENDING + APPROVED + PAID)
//
// Un retrait PENDING bloque son montant (anti double-dépense) ; un rejet
// le libère. Calculs 100 % dérivés de la base — aucune contre-partie cachée.
import "server-only";
import { db } from "@/lib/db";
import type { Prisma, PrismaClient } from "@prisma/client";

export type DbClient = PrismaClient | Prisma.TransactionClient;

export type StoreWallet = {
  grossXOF: number; // volume de ventes encaissé (PAID + DELIVERED)
  commissionXOF: number; // commissions plateforme prélevées
  netXOF: number; // revenus nets du vendeur
  pendingXOF: number; // retraits en cours (PENDING + APPROVED)
  paidOutXOF: number; // retraits déjà versés (PAID)
  availableXOF: number; // solde disponible au retrait
};

export async function getStoreWallet(
  storeId: string,
  client: DbClient = db,
): Promise<StoreWallet> {
  const orders = await client.order.aggregate({
    where: { storeId, status: { in: ["PAID", "DELIVERED"] } },
    _sum: { totalXOF: true, commissionXOF: true },
  });
  const grossXOF = orders._sum.totalXOF ?? 0;
  const commissionXOF = orders._sum.commissionXOF ?? 0;
  const netXOF = grossXOF - commissionXOF;

  const withdrawals = await client.withdrawal.groupBy({
    by: ["status"],
    where: { storeId, status: { in: ["PENDING", "APPROVED", "PAID"] } },
    _sum: { amountXOF: true },
  });
  const sumFor = (...statuses: string[]) =>
    withdrawals
      .filter((row) => statuses.includes(row.status))
      .reduce((total, row) => total + (row._sum.amountXOF ?? 0), 0);

  const paidOutXOF = sumFor("PAID");
  const pendingXOF = sumFor("PENDING", "APPROVED");

  return {
    grossXOF,
    commissionXOF,
    netXOF,
    pendingXOF,
    paidOutXOF,
    availableXOF: netXOF - pendingXOF - paidOutXOF,
  };
}
