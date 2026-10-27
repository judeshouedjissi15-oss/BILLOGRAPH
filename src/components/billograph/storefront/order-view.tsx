"use client";

// CONFIRMATION DE COMMANDE (#/commande/{reference}) : statut, articles,
// téléchargements (produits numériques), suivi du paiement en temps réel.
// GET /api/orders/{reference} + POST /api/payments/verify (polling 5 s tant que PENDING).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Download,
  Loader2,
  Package,
  RefreshCw,
  Truck,
  XCircle,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, apiUrl } from "../lib/api-client";
import { navigateTo } from "../lib/use-hash-route";
import { StatusBadge } from "../status-badge";
import { formatDate, formatXOF } from "@/lib/format";
import type { MyPurchases, OrderStatus, PublicOrder } from "@/types/api";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 5000; // vérification toutes les 5 s
const MAX_POLL_ATTEMPTS = 36; // 36 × 5 s = 3 min avant message manuel
const LAST_PRODUCT_KEY = "blg:last-product";

/** Libellé lisible du moyen de paiement stocké sur la commande. */
function paymentMethodLabel(method: string): string {
  if (method === "FEDAPAY") return "Mobile Money & Carte (FedaPay)";
  if (method === "FREE") return "Gratuit";
  return "Paiement en ligne";
}

type OrderState =
  | { status: "loading" }
  | { status: "ready"; order: PublicOrder }
  | { status: "error"; message: string };

export function OrderView({ reference }: { reference: string }) {
  const [state, setState] = useState<OrderState>({ status: "loading" });
  const [purchases, setPurchases] = useState<MyPurchases["orders"]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [pollAttempts, setPollAttempts] = useState(0);
  const [pollExhausted, setPollExhausted] = useState(false);

  const mountedRef = useRef(true);
  const attemptsRef = useRef(0);
  const cycleInFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async (): Promise<PublicOrder | null> => {
    if (!mountedRef.current) return null;
    setRefreshing(true);
    try {
      const data = await apiFetch<{ order: PublicOrder }>(`/api/orders/${reference}`);
      if (!mountedRef.current) return null;
      setState({ status: "ready", order: data.order });

      // Récupérer les jetons de téléchargement (commandes payées uniquement).
      const order = data.order;
      if ((order.status === "PAID" || order.status === "DELIVERED") && order.customerEmail) {
        try {
          const mine = await apiFetch<MyPurchases>(
            apiUrl("/api/downloads/my", { email: order.customerEmail }),
          );
          if (mountedRef.current) setPurchases(mine.orders);
        } catch {
          if (mountedRef.current) setPurchases([]);
        }
      }
      return order;
    } catch (error) {
      if (!mountedRef.current) return null;
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Commande introuvable.",
      });
      return null;
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, [reference]);

  // Un cycle de vérification : re-vérification serveur chez FedaPay puis refresh local.
  // Garde anti-concurrence : un cycle manuel et un cycle programmé ne se chevauchent jamais.
  const runVerifyCycle = useCallback(async () => {
    if (!mountedRef.current || cycleInFlightRef.current) return;
    cycleInFlightRef.current = true;
    setVerifying(true);
    try {
      try {
        await apiFetch<{ order: { reference: string; status: OrderStatus } }>(
          "/api/payments/verify",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reference }),
          },
        );
      } catch {
        // Vérification momentanément indisponible : le simple rafraîchissement suffit.
      }
      const order = await load();
      attemptsRef.current += 1;
      if (mountedRef.current) {
        setPollAttempts(attemptsRef.current);
        if (order?.status === "PENDING" && attemptsRef.current >= MAX_POLL_ATTEMPTS) {
          setPollExhausted(true);
        }
      }
    } finally {
      cycleInFlightRef.current = false;
      if (mountedRef.current) setVerifying(false);
    }
  }, [reference, load]);

  // Chargement initial.
  useEffect(() => {
    setPurchases([]);
    attemptsRef.current = 0;
    setPollAttempts(0);
    setPollExhausted(false);
    void load();
  }, [load]);

  // Polling tant que la commande est en attente de confirmation.
  const isPending = state.status === "ready" && state.order.status === "PENDING";

  useEffect(() => {
    if (!isPending || pollExhausted) return;
    const timer = setTimeout(() => {
      void runVerifyCycle();
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [isPending, pollExhausted, pollAttempts, runVerifyCycle]);

  // Relance manuelle du cycle après épuisement des tentatives automatiques.
  const handleManualVerify = () => {
    attemptsRef.current = 0;
    setPollAttempts(0);
    setPollExhausted(false);
    void runVerifyCycle();
  };

  const handleRetryPayment = () => {
    // Retour vers le produit d'origine (mémorisé par la page produit) pour repasser commande.
    let hash = "#/";
    try {
      hash = window.sessionStorage.getItem(LAST_PRODUCT_KEY) ?? "#/";
    } catch {
      // Stockage indisponible : retour à l'accueil.
    }
    navigateTo(hash);
  };

  if (state.status === "loading") {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-12" aria-busy="true">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <XCircle className="size-7" aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">Commande introuvable</h1>
        <p className="mt-2 text-muted-foreground">{state.message}</p>
        <Button className="mt-6 h-11" onClick={() => navigateTo("#/")}>
          Retour à l&apos;accueil
        </Button>
      </div>
    );
  }

  const { order } = state;
  const myOrder = purchases.find((o) => o.reference === order.reference);
  const isPaid = order.status === "PAID" || order.status === "DELIVERED";

  const downloadForItem = (titleSnapshot: string) =>
    myOrder?.items.find((item) => item.title === titleSnapshot)?.download ?? null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <Card>
        <CardContent className="p-6 sm:p-8">
          {/* En-tête selon statut */}
          <div className="flex flex-col items-center text-center">
            {isPaid ? (
              <>
                <span className="flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <CheckCircle2 className="size-9" aria-hidden="true" />
                </span>
                <h1 className="mt-5 text-2xl font-bold tracking-tight sm:text-3xl">
                  Merci pour votre achat !
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Votre paiement a bien été reçu. Conservez la référence de votre commande.
                </p>
              </>
            ) : order.status === "PENDING" ? (
              <>
                <span className="flex size-16 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  <Loader2 className="size-9 animate-spin" aria-hidden="true" />
                </span>
                <h1 className="mt-5 text-2xl font-bold tracking-tight sm:text-3xl">
                  Confirmation du paiement en cours…
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Cette page se met à jour automatiquement dès confirmation du paiement. Vous
                  pouvez aussi revenir plus tard.
                </p>
              </>
            ) : order.status === "FAILED" ? (
              <>
                <span className="flex size-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                  <XCircle className="size-9" aria-hidden="true" />
                </span>
                <h1 className="mt-5 text-2xl font-bold tracking-tight sm:text-3xl">
                  Le paiement n&apos;a pas abouti
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Le paiement n&apos;a pas abouti ou a été annulé. Aucun montant ne devrait être
                  prélevé en cas d&apos;échec.
                </p>
              </>
            ) : (
              <>
                <span className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Package className="size-9" aria-hidden="true" />
                </span>
                <h1 className="mt-5 text-2xl font-bold tracking-tight sm:text-3xl">
                  Suivi de votre commande
                </h1>
              </>
            )}

            <p className="mt-4 font-mono text-sm font-semibold">{order.reference}</p>
            <div className="mt-2 flex items-center gap-2">
              <StatusBadge status={order.status} />
              <span className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</span>
            </div>
          </div>

          <Separator className="my-6" />

          {/* Articles */}
          <section aria-label="Articles de la commande">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Articles
            </h2>
            <ul className="mt-3 space-y-3">
              {order.items.map((item, index) => {
                const download = downloadForItem(item.titleSnapshot);
                const remaining = download
                  ? Math.max(0, download.maxDownloads - download.downloadCount)
                  : 0;
                return (
                  <li key={`${item.titleSnapshot}-${index}`} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{item.titleSnapshot}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {item.quantity} × {formatXOF(item.unitPriceXOF)}
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold">
                        {formatXOF(item.quantity * item.unitPriceXOF)}
                      </p>
                    </div>

                    {/* Téléchargement produit numérique */}
                    {isPaid && download && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/60 p-3">
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Download className="size-3.5 text-primary" aria-hidden="true" />
                          Téléchargements restants : {remaining}/{download.maxDownloads}
                          {download.expiresAt
                            ? ` · expire le ${formatDate(download.expiresAt)}`
                            : ""}
                        </p>
                        <a
                          href={`/api/downloads?token=${download.token}`}
                          download
                          className={cn(buttonVariants({ size: "sm" }), "h-9")}
                        >
                          <Download className="size-4" aria-hidden="true" />
                          Télécharger
                        </a>
                      </div>
                    )}
                    {isPaid && !download && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Lien de téléchargement indisponible pour cet article.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>

            <Separator className="my-4" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {isPaid ? "Total payé" : "Total"}
              </span>
              <span className="text-lg font-bold">{formatXOF(order.totalXOF)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Moyen de paiement : {paymentMethodLabel(order.paymentMethod)}
              {order.paidAt ? ` · Payée le ${formatDate(order.paidAt)}` : ""}
            </p>
          </section>

          {/* Messages contextuels */}
          {isPaid && (
            <p className="mt-6 flex items-start gap-2 rounded-lg bg-accent p-4 text-sm text-accent-foreground">
              <Truck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Pour un produit physique : le vendeur va préparer votre livraison. Il vous
              contactera si nécessaire.
            </p>
          )}

          {/* Paiement en attente : polling automatique + relance manuelle après 3 min */}
          {order.status === "PENDING" && (
            <div className="mt-6 space-y-3">
              {pollExhausted ? (
                <>
                  <p className="rounded-lg border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    La confirmation prend plus de temps que prévu. Votre paiement est
                    probablement encore en cours de traitement côté opérateur — la commande sera
                    mise à jour dès la confirmation, sans action de votre part.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      className="h-11 flex-1"
                      disabled={verifying || refreshing}
                      onClick={handleManualVerify}
                    >
                      <RefreshCw
                        className={cn("size-4", (verifying || refreshing) && "animate-spin")}
                        aria-hidden="true"
                      />
                      Vérifier à nouveau
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11 flex-1"
                      onClick={() => navigateTo("#/")}
                    >
                      Retour à la boutique
                    </Button>
                  </div>
                </>
              ) : (
                <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2
                    className={cn("size-3.5 animate-spin", !verifying && "opacity-40")}
                    aria-hidden="true"
                  />
                  Vérification automatique toutes les 5 secondes…
                </p>
              )}
            </div>
          )}

          {/* Paiement échoué : nouvelle tentative depuis la page produit */}
          {order.status === "FAILED" && (
            <div className="mt-6 space-y-3">
              <Button className="h-11 w-full" onClick={handleRetryPayment}>
                <RefreshCw className="size-4" aria-hidden="true" />
                Réessayer le paiement
              </Button>
              <p className="text-xs text-muted-foreground">
                Si le montant a malgré tout été débité par erreur, contactez le vendeur en
                indiquant la référence de votre commande.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 flex justify-center">
        <Button variant="ghost" className="h-11" onClick={() => navigateTo("#/")}>
          Retour à l&apos;accueil
        </Button>
      </div>
    </div>
  );
}
