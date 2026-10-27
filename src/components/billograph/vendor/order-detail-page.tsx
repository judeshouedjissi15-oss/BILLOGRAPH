"use client";

// PAGE DÉTAIL COMMANDE VENDEUR (#/dashboard/commande/{reference}) — vraie page,
// pas de dialogue : client, articles, jetons de téléchargement, actions.

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Copy, Download, Loader2, ShoppingBasket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "../lib/api-client";
import { navigateTo } from "../lib/use-hash-route";
import { StatusBadge } from "../status-badge";
import { InlineConfirm } from "../inline-confirm";
import { formatDate, formatXOF } from "@/lib/format";
import type { VendorOrder } from "@/types/api";

/** Libellé lisible du moyen de paiement stocké sur la commande. */
function paymentMethodLabel(method: string): string {
  if (method === "FEDAPAY") return "Mobile Money & Carte (FedaPay)";
  if (method === "FREE") return "Gratuit";
  return "Paiement en ligne";
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      return true;
    } catch {
      return false;
    }
  }
}

type PageState =
  | { status: "loading" }
  | { status: "ready"; order: VendorOrder }
  | { status: "not-found" }
  | { status: "error"; message: string };

export function VendorOrderPage({ reference }: { reference: string }) {
  const { toast } = useToast();
  const [state, setState] = useState<PageState>({ status: "loading" });
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      // Recherche par référence via le filtre q de la liste du vendeur.
      const data = await apiFetch<{ orders: VendorOrder[] }>(
        `/api/orders/mine?q=${encodeURIComponent(reference)}`,
      );
      const order = data.orders.find((o) => o.reference === reference) ?? null;
      if (!order) {
        setState({ status: "not-found" });
        return;
      }
      setState({ status: "ready", order });
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 401) {
        navigateTo("#/auth");
        return;
      }
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Erreur de chargement.",
      });
    }
  }, [reference]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  const runAction = async (action: "MARK_DELIVERED" | "CANCEL") => {
    setActionBusy(true);
    try {
      const data = await apiFetch<{ order: VendorOrder }>(`/api/orders/${reference}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      toast({
        title: action === "MARK_DELIVERED" ? "Commande livrée" : "Commande annulée",
        description:
          action === "MARK_DELIVERED"
            ? "La livraison physique est confirmée."
            : "Le stock a été remis à jour.",
      });
      if (data.order) setState({ status: "ready", order: data.order });
      else void load();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Action impossible",
        description: error instanceof Error ? error.message : "Réessayez dans un instant.",
      });
    } finally {
      setActionBusy(false);
    }
  };

  const handleCopyLink = async (token: string) => {
    const link = `${window.location.origin}/api/downloads?token=${token}`;
    const ok = await copyToClipboard(link);
    if (ok) {
      toast({ title: "Lien copié", description: "Collez-le dans un message pour votre client." });
    } else {
      toast({
        variant: "destructive",
        title: "Copie impossible",
        description: "Copiez manuellement le lien affiché.",
      });
    }
  };

  if (state.status === "loading") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10" aria-busy="true">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-8 h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (state.status === "not-found") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <ShoppingBasket className="size-7" aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">Commande introuvable</h1>
        <p className="mt-2 text-muted-foreground">
          Cette commande n&apos;existe pas ou n&apos;appartient pas à votre boutique.
        </p>
        <Button className="mt-6 h-11" onClick={() => navigateTo("#/dashboard/commandes")}>
          Retour aux commandes
        </Button>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <p className="text-sm text-destructive">{state.message}</p>
            <Button variant="outline" onClick={() => void load()}>
              Réessayer
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const order = state.order;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-10">
      {/* Fil d'Ariane */}
      <nav
        aria-label="Fil d'Ariane"
        className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
      >
        <button type="button" className="hover:text-primary" onClick={() => navigateTo("#/dashboard")}>
          Tableau de bord
        </button>
        <span aria-hidden="true">/</span>
        <button
          type="button"
          className="hover:text-primary"
          onClick={() => navigateTo("#/dashboard/commandes")}
        >
          Commandes
        </button>
        <span aria-hidden="true">/</span>
        <span className="font-mono text-foreground">{order.reference}</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-bold tracking-tight">
          <span className="font-mono">{order.reference}</span>
          <StatusBadge status={order.status} />
        </h1>
        <Button
          variant="ghost"
          className="h-10 hidden gap-1.5 px-2 text-sm sm:inline-flex"
          onClick={() => navigateTo("#/dashboard/commandes")}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Retour
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Passée le {formatDate(order.createdAt)} · Paiement : {paymentMethodLabel(order.paymentMethod)}
      </p>

      <div className="mt-6 space-y-4">
        {/* Client */}
        <Card>
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold">Client</h2>
            <dl className="mt-2 grid gap-1 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Nom</dt>
                <dd className="font-medium">{order.customer.name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="truncate font-medium">{order.customer.email}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Téléphone</dt>
                <dd className="font-medium">{order.customer.phone || "—"}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Articles */}
        <Card>
          <CardContent className="p-5">
            <h2 className="text-sm font-semibold">Articles</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {order.items.map((item, index) => (
                <li
                  key={`${item.titleSnapshot}-${index}`}
                  className="flex items-start justify-between gap-3"
                >
                  <div>
                    <p className="font-medium">{item.titleSnapshot}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.quantity} × {formatXOF(item.unitPriceXOF)}
                    </p>
                  </div>
                  <p className="shrink-0 font-medium">
                    {formatXOF(item.quantity * item.unitPriceXOF)}
                  </p>
                </li>
              ))}
            </ul>
            <Separator className="my-3" />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="font-semibold">{formatXOF(order.totalXOF)}</span>
            </div>
            <div className="mt-1 flex justify-between text-sm">
              <span className="text-muted-foreground">Commission plateforme</span>
              <span className="font-medium text-muted-foreground">
                − {formatXOF(order.commissionXOF)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Jetons de téléchargement */}
        {order.downloadTokens.length > 0 && (
          <Card>
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold">Liens de téléchargement</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Fichiers numériques de la commande. Chaque lien est valable 30 jours et limité en
                nombre de téléchargements.
              </p>
              <ul className="mt-3 space-y-2">
                {order.downloadTokens.map((token, index) => (
                  <li
                    key={token.token}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 p-3"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        <Download className="size-4 shrink-0 text-primary" aria-hidden="true" />
                        Fichier #{index + 1}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {token.downloadCount}/{token.maxDownloads} téléchargement(s) · expire le{" "}
                        {formatDate(token.expiresAt)}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9"
                      onClick={() => void handleCopyLink(token.token)}
                    >
                      <Copy className="size-3.5" aria-hidden="true" />
                      Copier le lien
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
          {order.status === "PAID" && (
            <Button className="h-11" disabled={actionBusy} onClick={() => void runAction("MARK_DELIVERED")}>
              {actionBusy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Traitement…
                </>
              ) : (
                "Marquer comme livrée"
              )}
            </Button>
          )}
          {order.status === "PENDING" && (
            <InlineConfirm
              trigger="Annuler la commande"
              triggerClassName="h-11 text-destructive hover:text-destructive"
              confirmLabel="Confirmer l'annulation"
              pendingLabel="Annulation…"
              busy={actionBusy}
              warnText="La quantité sera remise en stock."
              onConfirm={() => runAction("CANCEL")}
            />
          )}
        </div>
      </div>
    </div>
  );
}
