"use client";

// PAGE DE COMMANDE (#/commander/{slug}) — vraie page, pas de dialogue :
// 1. Coordonnées + moyen de paiement → POST /api/orders
// 2. Redirection vers la page de paiement hébergée FedaPay (Mobile Money / carte)
// 3. L'acheteur revient vers #/commande/{reference} — la page suit le statut en temps réel.
// Produit gratuit : commande déjà payée, navigation directe vers la page de commande.

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Loader2,
  Package,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "../lib/api-client";
import { navigateTo } from "../lib/use-hash-route";
import { formatBytes, formatXOF } from "@/lib/format";
import { PAYMENT_METHODS } from "@/lib/constants";
import type { CheckoutResponse, PaymentStatusInfo, PublicProductDetail } from "@/types/api";

type ProductStore = { name: string; slug: string; color: string };

type ProductState =
  | { status: "loading" }
  | { status: "ready"; product: PublicProductDetail; store: ProductStore }
  | { status: "not-found" }
  | { status: "error"; message: string };

type Step = "form" | "redirecting";

// Option affichée par défaut : la source de vérité est PAYMENT_METHODS (constants) ;
// ce repli garantit un affichage correct même si la constante n'est pas encore à jour.
type PaymentOption = { id: string; label: string; note: string };
const FEDAPAY_OPTION: PaymentOption = {
  id: "FEDAPAY",
  label: "Mobile Money & Carte bancaire",
  note: "MTN MoMo, Moov Money, Visa / Mastercard — paiement sécurisé via FedaPay",
};

const REDIRECT_DELAY_MS = 300;

export function CheckoutPage({ slug }: { slug: string }) {
  const [state, setState] = useState<ProductState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setState({ status: "loading" });
      try {
        const data = await apiFetch<{ product: PublicProductDetail; store: ProductStore }>(
          `/api/products/slug/${slug}`,
        );
        if (!cancelled) setState({ status: "ready", product: data.product, store: data.store });
      } catch (error) {
        if (cancelled) return;
        const status = (error as { status?: number }).status;
        if (status === 404) setState({ status: "not-found" });
        else
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "Erreur de chargement.",
          });
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (state.status === "loading") {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10" aria-busy="true">
        <Skeleton className="h-6 w-48" />
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (state.status === "not-found") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Package className="size-7" aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">Produit introuvable</h1>
        <p className="mt-2 text-muted-foreground">
          Ce produit n&apos;existe plus ou a été retiré de la vente.
        </p>
        <Button className="mt-6 h-11" onClick={() => navigateTo("#/")}>
          Retour à l&apos;accueil
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
            <Button variant="outline" onClick={() => navigateTo(`#/produit/${slug}`)}>
              Retour au produit
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { product, store } = state;
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
      {/* Fil d'Ariane */}
      <nav
        aria-label="Fil d'Ariane"
        className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
      >
        <button type="button" className="hover:text-primary" onClick={() => navigateTo("#/")}>
          Accueil
        </button>
        <span aria-hidden="true">/</span>
        <button
          type="button"
          className="hover:text-primary"
          onClick={() => navigateTo(`#/boutique/${store.slug}`)}
        >
          {store.name}
        </button>
        <span aria-hidden="true">/</span>
        <button
          type="button"
          className="max-w-40 truncate hover:text-primary sm:max-w-56"
          onClick={() => navigateTo(`#/produit/${product.slug}`)}
        >
          {product.title}
        </button>
        <span aria-hidden="true">/</span>
        <span className="text-foreground">Commande</span>
      </nav>

      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
        <ShoppingCart className="size-6 text-primary" aria-hidden="true" />
        Finaliser votre commande
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Vérifiez vos informations puis procédez au paiement en FCFA.
      </p>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[1fr_360px]">
        <CheckoutForm product={product} />
        <OrderSummaryCard product={product} store={store} />
      </div>
    </div>
  );
}

function OrderSummaryCard({
  product,
  store,
}: {
  product: PublicProductDetail;
  store: ProductStore;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="w-20 shrink-0 overflow-hidden rounded-lg border">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={`Image du produit ${product.title}`}
                className="aspect-square w-full object-cover"
              />
            ) : (
              <div
                className="flex aspect-square w-full items-center justify-center"
                style={{ background: `${store.color}1f` }}
              >
                <Package className="size-8" style={{ color: store.color }} aria-hidden="true" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-semibold leading-snug">{product.title}</p>
            <button
              type="button"
              className="mt-1 text-xs text-primary hover:underline"
              onClick={() => navigateTo(`#/boutique/${store.slug}`)}
            >
              {store.name}
            </button>
            {product.type === "DIGITAL" && product.hasFile && product.fileSize ? (
              <p className="mt-1 text-xs text-muted-foreground">{formatBytes(product.fileSize)}</p>
            ) : null}
          </div>
        </div>
        <div className="mt-4 space-y-1 border-t pt-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Prix unitaire</span>
            <span className="font-medium">
              {product.priceXOF === 0 ? "Gratuit" : formatXOF(product.priceXOF)}
            </span>
          </div>
          {product.type === "PHYSICAL" && (
            <p className="text-xs text-muted-foreground">
              Les frais de livraison sont gérés directement avec le vendeur.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CheckoutForm({ product }: { product: PublicProductDetail }) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<string>("FEDAPAY");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ reference: string; totalXOF: number } | null>(null);

  // État public des paiements : bouton désactivé si non configuré.
  // Un produit GRATUIT (0 FCFA) ne passe pas par le prestataire : il reste
  // commandable même sans configuration des paiements.
  const [paymentsStatus, setPaymentsStatus] = useState<PaymentStatusInfo | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch<PaymentStatusInfo>("/api/payments/status")
      .then((data) => {
        if (!cancelled) setPaymentsStatus(data);
      })
      .catch(() => {
        // Statut indisponible : on laisse tenter la commande, l'API tranchera (422).
        if (!cancelled) setPaymentsStatus(null);
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const paymentsUnavailable =
    !statusLoading && paymentsStatus !== null && !paymentsStatus.configured && product.priceXOF > 0;

  const maxQuantity = product.type === "PHYSICAL" && product.stock !== null ? product.stock : 1;
  const total = product.priceXOF * (product.type === "PHYSICAL" ? quantity : 1);

  const fedapayOption =
    (PAYMENT_METHODS as readonly PaymentOption[]).find((method) => method.id === "FEDAPAY") ??
    FEDAPAY_OPTION;

  const handleOrder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (product.type === "PHYSICAL" && (quantity < 1 || quantity > maxQuantity)) {
      setFormError(`Quantité invalide : entre 1 et ${maxQuantity}.`);
      return;
    }

    setSubmitting(true);
    try {
      const data = await apiFetch<CheckoutResponse>("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: product.slug,
          quantity: product.type === "PHYSICAL" ? quantity : 1,
          customer: {
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim() || undefined,
          },
          paymentMethod,
        }),
      });

      // Produit gratuit : la commande est déjà payée, téléchargements disponibles.
      if (data.checkout.flow === "free") {
        setSubmitting(false);
        toast({
          title: "Commande confirmée !",
          description: `Référence ${data.order.reference} — vos téléchargements sont disponibles.`,
        });
        navigateTo(`#/commande/${data.order.reference}`);
        return;
      }

      // Paiement réel : redirection vers la page de paiement hébergée FedaPay.
      if (data.checkout.flow === "redirect" && data.checkout.redirectUrl) {
        setPending({ reference: data.order.reference, totalXOF: data.order.totalXOF });
        setStep("redirecting");
        const redirectUrl = data.checkout.redirectUrl;
        window.setTimeout(() => {
          window.location.assign(redirectUrl);
        }, REDIRECT_DELAY_MS);
        return; // la page va naviguer vers FedaPay puis revenir sur #/commande/{reference}
      }

      // Flux inattendu : on renvoie vers la page de suivi de commande.
      setSubmitting(false);
      toast({
        title: "Commande créée",
        description: `Référence ${data.order.reference} — suivez son statut ci-après.`,
      });
      navigateTo(`#/commande/${data.order.reference}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "La commande a échoué.";
      setFormError(message);
      toast({ variant: "destructive", title: "Commande impossible", description: message });
      setSubmitting(false);
    }
  };

  if (step === "redirecting") {
    return (
      <Card aria-busy="true">
        <CardContent className="flex flex-col items-center gap-4 p-12 text-center">
          <Loader2 className="size-12 animate-spin text-primary" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Redirection vers le paiement sécurisé…</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Vous allez être redirigé vers la page de paiement pour régler par Mobile Money ou
            carte bancaire. Vous reviendrez automatiquement vers votre commande.
          </p>
          {pending && (
            <p className="font-mono text-xs text-muted-foreground">
              Référence : {pending.reference} · Montant :{" "}
              {pending.totalXOF === 0 ? "Gratuit" : formatXOF(pending.totalXOF)}
            </p>
          )}
          <p className="max-w-xs text-xs text-muted-foreground">
            Ne fermez pas cette page. Si rien ne se passe dans quelques secondes, vérifiez que
            votre navigateur autorise les redirections.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <form onSubmit={handleOrder} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="checkout-name">Votre nom complet *</Label>
            <Input
              id="checkout-name"
              required
              minLength={2}
              maxLength={80}
              autoComplete="name"
              placeholder="Ex : Awa Codjo"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="checkout-email">Votre email *</Label>
            <Input
              id="checkout-email"
              type="email"
              required
              autoComplete="email"
              placeholder="vous@exemple.bj"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">
              C&apos;est sur cet email que vous retrouverez vos téléchargements.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="checkout-phone">Téléphone (optionnel)</Label>
            <Input
              id="checkout-phone"
              type="tel"
              maxLength={30}
              autoComplete="tel"
              placeholder="+229 01 97 00 00 00"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">
              Utilisé par votre opérateur Mobile Money pour valider le paiement.
            </p>
          </div>

          {product.type === "PHYSICAL" && (
            <div className="space-y-2">
              <Label htmlFor="checkout-quantity">Quantité</Label>
              <Input
                id="checkout-quantity"
                type="number"
                min={1}
                max={maxQuantity}
                step={1}
                value={quantity}
                onChange={(e) =>
                  setQuantity(Math.max(1, Math.min(maxQuantity, Number(e.target.value) || 1)))
                }
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">{maxQuantity} unité(s) disponible(s).</p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Moyen de paiement</Label>
            <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod} className="gap-2">
              <Label
                htmlFor={`payment-${fedapayOption.id}`}
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50"
              >
                <RadioGroupItem
                  id={`payment-${fedapayOption.id}`}
                  value={fedapayOption.id}
                  className="mt-0.5"
                />
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
                    {fedapayOption.label}
                  </span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {fedapayOption.note}
                  </span>
                </span>
                <Smartphone
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </Label>
            </RadioGroup>
          </div>

          {paymentsUnavailable && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-lg border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>
                Les paiements ne sont pas encore activés sur la plateforme. L&apos;administrateur
                doit connecter FedaPay dans Réglages → Paiements.
              </p>
            </div>
          )}

          {formError && (
            <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {formError}
            </p>
          )}

          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
            <span className="text-sm font-medium">Total à payer</span>
            <span className="text-lg font-bold">{total === 0 ? "Gratuit" : formatXOF(total)}</span>
          </div>

          <Button
            type="submit"
            className="h-12 w-full text-base"
            disabled={submitting || paymentsUnavailable}
          >
            {submitting ? "Création de la commande…" : "Passer au paiement"}
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <Banknote className="size-3.5" aria-hidden="true" />
            Paiement sécurisé — vous serez redirigé vers la page de paiement pour finaliser.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

// Bouton de retour réutilisable (affiché au-dessus du formulaire sur mobile).
export function BackToProductButton({ slug }: { slug: string }) {
  return (
    <Button variant="ghost" className="h-10 gap-1.5 px-2 text-sm" onClick={() => navigateTo(`#/produit/${slug}`)}>
      <ArrowLeft className="size-4" aria-hidden="true" />
      Retour au produit
    </Button>
  );
}
