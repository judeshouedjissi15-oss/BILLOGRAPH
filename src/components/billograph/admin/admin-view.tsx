"use client";

// ESPACE ADMINISTRATEUR (#/admin) — accès réservé au rôle ADMIN.
// Onglets : Vue d'ensemble, Utilisateurs, Boutiques, Commandes, Avis, Retraits,
// Audit, Paramètres.

import { useCallback, useEffect, useState } from "react";
import {
  Banknote,
  Copy,
  CreditCard,
  Info,
  KeyRound,
  Percent,
  Package,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Store as StoreIcon,
  Users,
  Webhook,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatCard } from "../stat-card";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "../lib/api-client";
import { navigateTo } from "../lib/use-hash-route";
import { InlineConfirm } from "../inline-confirm";
import { PasswordInput } from "../password-input";
import { UsersTab } from "./users-tab";
import { StoresTab } from "./stores-tab";
import { ProductsTab } from "./products-tab";
import { OrdersTab } from "./orders-tab";
import { AuditTab } from "./audit-tab";
import { ReviewsTab } from "./reviews-tab";
import { SettingsTabWithSmtp } from "./settings-tab";
import { WithdrawalsTab } from "./withdrawals-tab";
import { AnnouncementsTab } from "./announcements-tab";
import { OfficeTab } from "./office-tab";
import { TrashTab } from "./trash-tab";
import { ExportProjectCard } from "./export-project-card";
import { formatDate } from "@/lib/format";
import type { AdminPaymentsInfo, AdminStats, PlatformSettingsInfo, User } from "@/types/api";
import { cn } from "@/lib/utils";

function OverviewTab() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<AdminStats>("/api/admin/stats");
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les statistiques.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <p className="text-sm text-destructive">{error ?? "Statistiques indisponibles."}</p>
          <Button variant="outline" onClick={() => void load()}>
            Réessayer
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Utilisateurs" value={String(stats.users)} icon={Users} />
        <StatCard label="Boutiques" value={String(stats.stores)} icon={StoreIcon} />
        <StatCard label="Produits" value={String(stats.products)} icon={Package} />
        <StatCard
          label="Commandes"
          value={String(stats.orders.count)}
          icon={ShoppingCart}
          hint={`${stats.orders.pendingCount} en attente · ${stats.orders.paidCount} payée(s)`}
        />
        <StatCard label="GMV (volume d'affaires)" value={`${stats.gmvXOF.toLocaleString("fr-FR")} FCFA`} icon={Banknote} />
        <StatCard
          label="Commissions encaissées"
          value={`${stats.commissionXOF.toLocaleString("fr-FR")} FCFA`}
          icon={Percent}
        />
      </div>

      {/* Derniers événements d'audit */}
      <Card>
        <CardHeader>
          <CardTitle>10 derniers événements</CardTitle>
          <CardDescription>Journal d&apos;audit de la plateforme.</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.recentAudit.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucun événement enregistré.
            </p>
          ) : (
            <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
              {stats.recentAudit.map((entry) => (
                <div key={entry.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                  <Badge variant="outline" className="font-mono text-[11px]">
                    {entry.action}
                  </Badge>
                  <span className="text-sm">{entry.entity}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {entry.actor ? entry.actor.name : "système"} · {formatDate(entry.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
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

type FedaPayEnvironment = NonNullable<AdminPaymentsInfo["environment"]>;
type ClearTarget = "fedapaySecretKey" | "fedapayWebhookSecret";
// Choix affichés dans le Select (casse d'affichage) — convertis en minuscules à l'envoi,
// car l'API attend la valeur d'environnement en minuscules.
type FedaPayEnvChoice = "Sandbox" | "Live";

/** Convertit la valeur d'environnement renvoyée par l'API en choix du Select. */
function toEnvChoice(environment: FedaPayEnvironment | null): FedaPayEnvChoice | null {
  if (environment === null) return null;
  return environment === "live" ? "Live" : "Sandbox";
}

function PaymentsSettingsCard() {
  const { toast } = useToast();
  const [payments, setPayments] = useState<AdminPaymentsInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [envChoice, setEnvChoice] = useState<FedaPayEnvChoice | null>(null);
  const [initialEnv, setInitialEnv] = useState<FedaPayEnvironment | null>(null);

  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  const applyResponse = (data: { payments: AdminPaymentsInfo }) => {
    setPayments(data.payments);
    setEnvChoice(toEnvChoice(data.payments.environment));
    setInitialEnv(data.payments.environment);
    setSecretKey("");
    setWebhookSecret("");
  };

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<{ settings: PlatformSettingsInfo; payments: AdminPaymentsInfo }>(
        "/api/admin/settings",
      );
      setPayments(data.payments);
      setEnvChoice(toEnvChoice(data.payments.environment));
      setInitialEnv(data.payments.environment);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger la configuration.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  const handleSave = async () => {
    if (!payments) return;

    // Garde-fou immédiat : FedaPay fournit DEUX clés (publique pk_… et secrète sk_…).
    // Une clé publique collée dans ce champ ferait échouer tous les paiements —
    // on bloque l'enregistrement avec une explication claire (le serveur re-valide).
    if (secretKey.trim().startsWith("pk_")) {
      toast({
        variant: "destructive",
        title: "Clé publique détectée (pk_…)",
        description:
          "La clé publique n'est pas utilisée par BILLOGRAPH : les paiements sont entièrement traités côté serveur. Collez ici la CLÉ SECRÈTE (sk_…) depuis votre dashboard FedaPay → API.",
      });
      return;
    }

    // PATCH partiel : n'envoyer que les champs réellement modifiés (champ vide = inchangé).
    const patch: Record<string, unknown> = {};
    if (secretKey.trim() !== "") patch.fedapaySecretKey = secretKey.trim();
    if (webhookSecret.trim() !== "") patch.fedapayWebhookSecret = webhookSecret.trim();
    if (envChoice !== null && envChoice.toLowerCase() !== initialEnv) {
      // L'API attend la valeur d'environnement en minuscules.
      patch.fedapayEnvironment = envChoice.toLowerCase() as FedaPayEnvironment;
    }

    if (Object.keys(patch).length === 0) {
      toast({
        title: "Aucune modification",
        description:
          "Renseignez une clé ou modifiez l'environnement avant d'enregistrer. Pour effacer une valeur enregistrée, utilisez le bouton « Effacer ».",
      });
      return;
    }

    setSaving(true);
    try {
      const data = await apiFetch<{ settings: PlatformSettingsInfo; payments: AdminPaymentsInfo }>(
        "/api/admin/settings",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      applyResponse(data);
      toast({
        title: "Configuration enregistrée",
        description: data.payments.configured
          ? "Les paiements FedaPay sont actifs — les acheteurs peuvent payer réellement."
          : "Enregistré. Ajoutez la clé secrète API pour activer les paiements.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Enregistrement impossible",
        description: err instanceof Error ? err.message : "Réessayez dans un instant.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async (target: ClearTarget) => {
    setClearing(true);
    try {
      const data = await apiFetch<{ settings: PlatformSettingsInfo; payments: AdminPaymentsInfo }>(
        "/api/admin/settings",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [target]: null }),
        },
      );
      applyResponse(data);
      toast({
        title: "Valeur effacée",
        description: "Le champ a été réinitialisé côté serveur. Vous pourrez le re-saisir à tout moment.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Effacement impossible",
        description: err instanceof Error ? err.message : "Réessayez dans un instant.",
      });
    } finally {
      setClearing(false);
    }
  };

  const handleCopyWebhookUrl = async () => {
    if (!payments) return;
    const ok = await copyToClipboard(payments.webhookUrl);
    if (ok) {
      toast({ title: "URL copiée", description: "Collez-la dans le dashboard FedaPay → Webhooks." });
    } else {
      toast({
        variant: "destructive",
        title: "Copie impossible",
        description: "Copiez manuellement l'URL affichée.",
      });
    }
  };

  if (loading) {
    return <Skeleton className="h-96 rounded-xl" aria-busy="true" />;
  }

  if (error || !payments) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <p className="text-sm text-destructive">{error ?? "Configuration des paiements indisponible."}</p>
          <Button variant="outline" onClick={() => void load()}>
            Réessayer
          </Button>
        </CardContent>
      </Card>
    );
  }

  const configured = payments.configured;
  const envBadgeLabel =
    payments.environment === "live"
      ? "Live — encaissements réels"
      : payments.environment === null
        ? null
        : "Sandbox — tests";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <CreditCard className="size-5 text-primary" aria-hidden="true" />
          Paiements — FedaPay
          {configured ? (
            <Badge className="border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
              Configuré
            </Badge>
          ) : (
            <Badge variant="secondary">Non configuré</Badge>
          )}
          {configured && envBadgeLabel && (
            <Badge
              variant="outline"
              className={cn(
                payments.environment === "live"
                  ? "border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-300"
                  : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
              )}
            >
              {envBadgeLabel}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Encaissez en FCFA par MTN MoMo, Moov Money et cartes bancaires via l&apos;agrégateur
          FedaPay. Les paiements s&apos;activent dès que les clés sont enregistrées.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Clé publique vs clé secrète — l'erreur d'orientation la plus courante. */}
        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">
            Votre dashboard FedaPay affiche <strong className="text-foreground">deux clés</strong> :{" "}
            la <strong className="text-foreground">clé publique</strong> (pk_…) et la{" "}
            <strong className="text-foreground">clé secrète</strong> (sk_…). BILLOGRAPH n&apos;utilise
            QUE la clé secrète — la clé publique n&apos;est pas nécessaire, car les paiements sont
            entièrement traités côté serveur. Ne collez jamais la clé publique ci-dessous.
          </p>
        </div>

        {/* Clé secrète API */}
        <div className="space-y-2">
          <Label htmlFor="fedapay-secret-key">Clé secrète API (sk_…)</Label>
          <PasswordInput
            id="fedapay-secret-key"
            fieldName="clé secrète"
            autoComplete="off"
            placeholder={payments.secretKeyMasked ?? "sk_…"}
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            className="h-11"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {payments.secretKeyMasked
                ? `Actuelle : ${payments.secretKeyMasked}`
                : "Aucune clé enregistrée — les paiements sont désactivés."}{" "}
              La clé secrète commence par sk_ (sk_sandbox_… ou sk_live_…). La clé publique
              (pk_…) n&apos;est pas à coller ici.
            </p>
            {payments.secretKeyMasked && (
              <InlineConfirm
                trigger={
                  <>
                    <KeyRound className="size-3.5" aria-hidden="true" />
                    Effacer
                  </>
                }
                triggerVariant="ghost"
                triggerClassName="h-9 shrink-0 text-destructive hover:text-destructive"
                confirmLabel="Confirmer l'effacement"
                pendingLabel="Effacement…"
                size="sm"
                busy={clearing}
                onConfirm={() => handleClear("fedapaySecretKey")}
              />
            )}
          </div>
        </div>

        {/* Secret de webhook */}
        <div className="space-y-2">
          <Label htmlFor="fedapay-webhook-secret">Secret de webhook</Label>
          <PasswordInput
            id="fedapay-webhook-secret"
            fieldName="secret de webhook"
            autoComplete="off"
            placeholder={payments.webhookSecretMasked ?? "whsec_…"}
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            className="h-11"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {payments.webhookSecretMasked
                ? `Actuel : ${payments.webhookSecretMasked}`
                : "Non défini — recommandé pour vérifier l'authenticité des notifications FedaPay."}{" "}
              Ce n&apos;est pas une clé API : n&apos;y collez ni clé pk_… ni clé sk_….
            </p>
            {payments.webhookSecretMasked && (
              <InlineConfirm
                trigger={
                  <>
                    <Webhook className="size-3.5" aria-hidden="true" />
                    Effacer
                  </>
                }
                triggerVariant="ghost"
                triggerClassName="h-9 shrink-0 text-destructive hover:text-destructive"
                confirmLabel="Confirmer l'effacement"
                pendingLabel="Effacement…"
                size="sm"
                busy={clearing}
                onConfirm={() => handleClear("fedapayWebhookSecret")}
              />
            )}
          </div>
        </div>

        {/* Environnement */}
        <div className="space-y-2">
          <Label htmlFor="fedapay-environment">Environnement</Label>
          <Select
            value={envChoice ?? undefined}
            onValueChange={(value) => setEnvChoice(value as FedaPayEnvChoice)}
          >
            <SelectTrigger id="fedapay-environment" className="h-11">
              <SelectValue placeholder="Non défini" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Sandbox">Sandbox — tests</SelectItem>
              <SelectItem value="Live">Live — encaissements réels</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Sandbox pour tester boutiquement, Live pour encaisser réellement une fois votre compte
            marchand validé par FedaPay.
          </p>
        </div>

        <Button type="button" className="h-11 w-full sm:w-auto" disabled={saving} onClick={() => void handleSave()}>
          <ShieldCheck className="size-4" aria-hidden="true" />
          {saving ? "Enregistrement…" : "Enregistrer la configuration"}
        </Button>

        {/* URL de webhook */}
        <div className="rounded-lg border bg-muted/40 p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Webhook className="size-4 text-primary" aria-hidden="true" />
            URL de webhook à renseigner chez FedaPay
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 truncate rounded-md bg-background px-2.5 py-2 font-mono text-xs">
              {payments.webhookUrl}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0"
              onClick={() => void handleCopyWebhookUrl()}
            >
              <Copy className="size-3.5" aria-hidden="true" />
              Copier
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            FedaPay notifiera cette adresse à chaque paiement : c&apos;est ce qui confirme les
            commandes et déclenche la livraison des fichiers, même si l&apos;acheteur ferme son
            navigateur.
          </p>
        </div>

        {/* Aide pas-à-pas */}
        <div className="rounded-lg border p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Info className="size-4 text-primary" aria-hidden="true" />
            Connecter FedaPay en 4 étapes
          </p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>Créez un compte sur fedapay.com (gratuit).</li>
            <li>
              Récupérez votre CLÉ SECRÈTE (sk_…) — Sandbox pour tester, Live après validation
              marchand pour encaisser réellement. (La clé publique pk_… n&apos;est pas nécessaire.)
            </li>
            <li>Dans le dashboard FedaPay → Webhooks, collez l&apos;URL ci-dessus.</li>
            <li>
              Collez la clé secrète ici et enregistrez. Les paiements s&apos;activent immédiatement.
            </li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}

type AdminViewProps = {
  user: User;
};

export function AdminView({ user }: AdminViewProps) {
  // Garde : rôle ADMIN requis — OU greffier en fonction (directive du
  // propriétaire : « le greffier peut voir tout ce que le super admin peut
  // voir mais il ne peut rien modifier ni rien supprimer »). Le serveur
  // garantit réellement l'interdiction : l'UI masque seulement les actions.
  const isGreffier =
    user.role !== "ADMIN" && user.officeRole === "GREFFIER" && user.officeStatus === "ACTIVE";
  const readOnly = isGreffier;

  if (user.role !== "ADMIN" && !isGreffier) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert className="size-7" aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">Accès refusé</h1>
        <p className="mt-2 text-muted-foreground">
          Cet espace est réservé aux administrateurs de la plateforme.
        </p>
        <Button className="mt-6 h-11" onClick={() => navigateTo("#/")}>
          Retour à l&apos;accueil
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight">
          <ShieldCheck className="size-6 text-primary" aria-hidden="true" />
          Espace administrateur
          {readOnly && (
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              Lecture seule — fonction de greffier
            </Badge>
          )}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {readOnly
            ? `Connecté en tant que ${user.name} (greffier) — consultation intégrale de la plateforme, sans aucune possibilité de modification ou de suppression.`
            : `Connecté en tant que ${user.name} — supervision de la plateforme BILLOGRAPH.`}
        </p>
      </div>

      <Tabs defaultValue="overview" className="mt-6">
        <TabsList className="h-11 w-full justify-start overflow-x-auto lg:w-auto">
          <TabsTrigger value="overview" className="px-4">
            Vue d&apos;ensemble
          </TabsTrigger>
          <TabsTrigger value="users" className="px-4">
            Utilisateurs
          </TabsTrigger>
          <TabsTrigger value="office" className="px-4">
            Équipe &amp; Offices
          </TabsTrigger>
          <TabsTrigger value="stores" className="px-4">
            Boutiques
          </TabsTrigger>
          <TabsTrigger value="products" className="px-4">
            Produits
          </TabsTrigger>
          <TabsTrigger value="orders" className="px-4">
            Commandes
          </TabsTrigger>
          <TabsTrigger value="reviews" className="px-4">
            Avis
          </TabsTrigger>
          <TabsTrigger value="withdrawals" className="px-4">
            Retraits
          </TabsTrigger>
          <TabsTrigger value="announcements" className="px-4">
            Annonce
          </TabsTrigger>
          <TabsTrigger value="trash" className="px-4">
            Corbeille
          </TabsTrigger>
          <TabsTrigger value="audit" className="px-4">
            Audit
          </TabsTrigger>
          <TabsTrigger value="settings" className="px-4">
            Paramètres
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="users" className="mt-6">
          <UsersTab currentUserId={user.id} readOnly={readOnly} />
        </TabsContent>
        <TabsContent value="office" className="mt-6">
          <OfficeTab readOnly={readOnly} />
        </TabsContent>
        <TabsContent value="stores" className="mt-6">
          <StoresTab readOnly={readOnly} />
        </TabsContent>
        <TabsContent value="products" className="mt-6">
          <ProductsTab />
        </TabsContent>
        <TabsContent value="orders" className="mt-6">
          <OrdersTab />
        </TabsContent>
        <TabsContent value="reviews" className="mt-6">
          <ReviewsTab readOnly={readOnly} />
        </TabsContent>
        <TabsContent value="withdrawals" className="mt-6">
          <WithdrawalsTab readOnly={readOnly} />
        </TabsContent>
        <TabsContent value="announcements" className="mt-6">
          <AnnouncementsTab readOnly={readOnly} />
        </TabsContent>
        <TabsContent value="trash" className="mt-6">
          <TrashTab readOnly={readOnly} />
        </TabsContent>
        <TabsContent value="audit" className="mt-6">
          <AuditTab />
        </TabsContent>
        <TabsContent value="settings" className="mt-6 space-y-6">
          <SettingsTabWithSmtp readOnly={readOnly} />
          {readOnly ? (
            <Card>
              <CardHeader>
                <CardTitle>Paiements — FedaPay</CardTitle>
                <CardDescription>
                  Consultation réservée : la configuration des paiements (clés secrètes) est
                  modifiable uniquement par le propriétaire.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <PaymentsSettingsCard />
          )}
          {!readOnly && <ExportProjectCard />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
