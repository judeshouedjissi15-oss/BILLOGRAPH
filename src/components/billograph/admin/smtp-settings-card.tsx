"use client";

// CARTE ADMIN — SERVICE D'ENVOI D'EMAILS RÉEL (Brevo API ou SMTP).
// Sans cette configuration, l'inscription des nouveaux comptes est mise en
// attente : l'email de confirmation ne peut pas partir. Deux fournisseurs
// réels au choix :
//   • Brevo (recommandé) — une clé API `xkeysib-…` suffit ; chiffrée en base.
//   • SMTP générique — hôte/port/utilisateur/mot de passe (chiffré en base).
// Les secrets ne sont jamais renvoyés en clair — champ vide = conserver
// l'actuel. Le bouton « Envoyer un email de test » effectue un VRAI envoi
// et affiche le résultat réel (succès ou erreur du fournisseur — jamais simulé).

import { useCallback, useEffect, useState } from "react";
import { Mail, Send, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "../lib/api-client";
import { PasswordInput } from "../password-input";

type BrevoState = {
  configured: boolean;
  apiKeySet: boolean;
  apiKeyMasked: string;
  fromName: string;
  fromEmail: string;
};

type EmailState = {
  provider: "smtp" | "brevo";
  configured: boolean;
  brevo: BrevoState;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  fromName: string;
  fromEmail: string;
  passwordSet: boolean;
  siteUrl: string;
};

export function SmtpSettingsCard({ readOnly = false }: { readOnly?: boolean } = {}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<EmailState | null>(null);
  // Fournisseur affiché dans le formulaire (peut différer de l'actif jusqu'à enregistrement).
  const [provider, setProvider] = useState<"smtp" | "brevo">("brevo");
  // Brevo
  const [brevoApiKey, setBrevoApiKey] = useState("");
  const [brevoFromName, setBrevoFromName] = useState("BILLOGRAPH");
  const [brevoFromEmail, setBrevoFromEmail] = useState("");
  // SMTP
  const [password, setPassword] = useState("");
  // Test + envoi
  const [testEmail, setTestEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<EmailState>("/api/admin/smtp");
      setState(data);
      setProvider(data.provider);
      // Pré-remplit le formulaire Brevo avec les valeurs actives (si configuré).
      setBrevoFromName(data.brevo.fromName || "BILLOGRAPH");
      setBrevoFromEmail(data.brevo.fromEmail || data.fromEmail || "");
      setBrevoApiKey("");
      setPassword("");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Chargement impossible",
        description: error instanceof Error ? error.message : "Réessayez.",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!state) return;
    setSaving(true);
    try {
      if (provider === "brevo") {
        // Garde-fou client (miroir de la validation serveur) : une clé qui
        // n'est pas Brevo ne doit jamais partir à l'API.
        const key = brevoApiKey.trim();
        if (key && (key.startsWith("pk_") || key.startsWith("sk_"))) {
          toast({
            variant: "destructive",
            title: "Clé FedaPay détectée (pk_/sk_)",
            description:
              "Ceci est une clé FedaPay, qui sert aux paiements — pas aux emails. Collez ici votre clé API Brevo (elle commence par xkeysib-…).",
          });
          setSaving(false);
          return;
        }
        if (key && !key.startsWith("xkeysib-")) {
          toast({
            variant: "destructive",
            title: "Ce n'est pas une clé API Brevo",
            description: "Une clé API Brevo commence toujours par « xkeysib-… » (Brevo → SMTP & API → Clés API).",
          });
          setSaving(false);
          return;
        }
        if (!brevoApiKey.trim() && !state.brevo.apiKeySet) {
          toast({
            variant: "destructive",
            title: "Clé API Brevo requise",
            description: "Collez votre clé API Brevo (xkeysib-…) lors de la première configuration.",
          });
          setSaving(false);
          return;
        }
        const data = await apiFetch<{ message: string }>("/api/admin/smtp", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "brevo",
            brevoApiKey: brevoApiKey.trim() || undefined,
            fromName: brevoFromName.trim(),
            fromEmail: brevoFromEmail.trim(),
            siteUrl: state.siteUrl.trim(),
          }),
        });
        await load();
        toast({ title: "Configuration Brevo enregistrée", description: data.message });
        return;
      }

      // SMTP générique
      const data = await apiFetch<{ message: string }>("/api/admin/smtp", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: state.host.trim(),
          port: Number(state.port) || 587,
          secure: state.secure,
          user: state.user.trim(),
          password: password || undefined,
          fromName: state.fromName.trim(),
          fromEmail: state.fromEmail.trim(),
          siteUrl: state.siteUrl.trim(),
        }),
      });
      setPassword("");
      await load();
      toast({ title: "Configuration SMTP enregistrée", description: data.message });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Enregistrement impossible",
        description: error instanceof Error ? error.message : "Réessayez.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const data = await apiFetch<{ message: string }>("/api/admin/smtp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testEmail.trim() }),
      });
      toast({ title: "Email de test envoyé", description: data.message });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Test d'envoi échoué",
        description: error instanceof Error ? error.message : "Le fournisseur d'emails a refusé l'envoi.",
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <Skeleton className="h-80 rounded-xl" aria-busy="true" />;
  if (!state) return null;

  const activeLabel = state.configured
    ? state.provider === "brevo"
      ? `Brevo actif (${state.brevo.apiKeyMasked || "clé enregistrée"})`
      : "SMTP générique actif"
    : "Non configuré : les nouvelles inscriptions sont en attente.";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="size-5 text-primary" aria-hidden="true" />
          Emails réels — service d&apos;envoi
        </CardTitle>
        <CardDescription>
          Service utilisé pour l&apos;email de confirmation d&apos;inscription (obligatoire avant
          connexion).{" "}
          {state.configured ? (
            <span className="font-medium text-emerald-700 dark:text-emerald-300">{activeLabel}</span>
          ) : (
            <span className="font-medium text-amber-700 dark:text-amber-300">{activeLabel}</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Sélecteur de fournisseur */}
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Fournisseur d'emails">
          <button
            type="button"
            role="radio"
            aria-checked={provider === "brevo"}
            onClick={() => setProvider("brevo")}
            className={`rounded-lg border p-4 text-left transition-colors ${
              provider === "brevo" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              <Sparkles className="size-4 text-primary" aria-hidden="true" />
              Brevo — API officielle
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                Recommandé
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Une seule clé API (<code className="text-[11px]">xkeysib-…</code>), aucun serveur à
              régler. Plan gratuit : 300 emails/jour.
            </p>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={provider === "smtp"}
            onClick={() => setProvider("smtp")}
            className={`rounded-lg border p-4 text-left transition-colors ${
              provider === "smtp" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              <Mail className="size-4 text-primary" aria-hidden="true" />
              SMTP personnalisé
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Gmail, Zoho, votre hébergeur… Hôte, port, utilisateur et mot de passe d&apos;application.
            </p>
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {provider === "brevo" ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <p className="text-xs text-muted-foreground">
                  Copiez la clé API depuis Brevo → « SMTP &amp; API » → « Clés API » : elle commence
                  par <code className="text-[11px]">xkeysib-</code>. Elle est chiffrée avant
                  stockage et n&apos;est jamais affichée ni exportée. L&apos;adresse d&apos;expédition
                  doit être un expéditeur validé dans Brevo (« Senders »).
                </p>
              </div>

              {state.brevo.apiKeySet && (
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  Clé enregistrée : <span className="font-mono">{state.brevo.apiKeyMasked}</span> —
                  laissez le champ vide pour la conserver.
                </p>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="brevo-api-key">
                    Clé API Brevo {state.brevo.apiKeySet ? "(laisser vide pour conserver)" : ""}
                  </Label>
                  <PasswordInput
                    id="brevo-api-key"
                    fieldName="clé API"
                    required={!state.brevo.apiKeySet}
                    autoComplete="new-password"
                    placeholder={state.brevo.apiKeySet ? "•••••••• (non modifiée)" : "xkeysib-…"}
                    value={brevoApiKey}
                    onChange={(e) => setBrevoApiKey(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="brevo-from-name">Nom d&apos;expéditeur</Label>
                  <Input
                    id="brevo-from-name"
                    type="text"
                    required
                    minLength={2}
                    maxLength={80}
                    placeholder="BILLOGRAPH"
                    value={brevoFromName}
                    onChange={(e) => setBrevoFromName(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="brevo-from-email">Adresse d&apos;expédition (validée dans Brevo)</Label>
                  <Input
                    id="brevo-from-email"
                    type="email"
                    required
                    placeholder="judeshouedjissi2@gmail.com"
                    value={brevoFromEmail}
                    onChange={(e) => setBrevoFromEmail(e.target.value)}
                    className="h-11"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <p className="text-xs text-muted-foreground">
                  Exemples : Gmail (smtp.gmail.com, port 587, mot de passe d&apos;application), Brevo
                  relay (smtp-relay.brevo.com, port 587), Zoho, votre hébergeur… Le mot de passe est
                  chiffré avant stockage et n&apos;est jamais affiché ni exporté.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="smtp-host">Serveur SMTP</Label>
                  <Input
                    id="smtp-host"
                    type="text"
                    required
                    placeholder="smtp.exemple.com"
                    value={state.host}
                    onChange={(e) => setState({ ...state, host: e.target.value })}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-port">Port</Label>
                  <Input
                    id="smtp-port"
                    type="number"
                    min={1}
                    max={65535}
                    required
                    placeholder="587"
                    value={state.port}
                    onChange={(e) => setState({ ...state, port: Number(e.target.value) })}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-user">Utilisateur (souvent l&apos;adresse email)</Label>
                  <Input
                    id="smtp-user"
                    type="text"
                    required
                    autoComplete="off"
                    placeholder="utilisateur@exemple.com"
                    value={state.user}
                    onChange={(e) => setState({ ...state, user: e.target.value })}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-password">
                    Mot de passe {state.passwordSet ? "(laisser vide pour conserver)" : ""}
                  </Label>
                  <PasswordInput
                    id="smtp-password"
                    fieldName="mot de passe SMTP"
                    required={!state.passwordSet}
                    autoComplete="new-password"
                    placeholder={state.passwordSet ? "•••••••• (non modifié)" : "Mot de passe SMTP"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-from-name">Nom d&apos;expéditeur</Label>
                  <Input
                    id="smtp-from-name"
                    type="text"
                    required
                    minLength={2}
                    maxLength={80}
                    placeholder="BILLOGRAPH"
                    value={state.fromName}
                    onChange={(e) => setState({ ...state, fromName: e.target.value })}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-from-email">Adresse d&apos;expédition</Label>
                  <Input
                    id="smtp-from-email"
                    type="email"
                    required
                    placeholder="noreply@billograph.com"
                    value={state.fromEmail}
                    onChange={(e) => setState({ ...state, fromEmail: e.target.value })}
                    className="h-11"
                  />
                </div>
              </div>

              <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/40 p-4">
                <div>
                  <Label htmlFor="smtp-secure" className="font-medium">
                    Connexion SSL/TLS directe (port 465)
                  </Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Désactivé (recommandé) : STARTTLS sur le port 587. Activé : SSL direct (port 465).
                  </p>
                </div>
                <Switch
                  id="smtp-secure"
                  checked={state.secure}
                  onCheckedChange={(checked) => setState({ ...state, secure: checked })}
                  aria-label="SSL/TLS direct"
                />
              </div>
            </div>
          )}

          {/* URL publique commune aux deux fournisseurs */}
          <div className="space-y-2">
            <Label htmlFor="smtp-site-url">URL publique du site (liens des emails)</Label>
            <Input
              id="smtp-site-url"
              type="url"
              placeholder="https://www.billograph.com"
              value={state.siteUrl}
              onChange={(e) => setState({ ...state, siteUrl: e.target.value })}
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">
              Ex : https://www.billograph.com — le lien « Confirmer mon adresse email »
              l&apos;utilisera. Vide : l&apos;origine des visiteurs est utilisée.
            </p>
          </div>

          <Button type="submit" className="h-11" disabled={saving || readOnly}>
            {saving
              ? "Enregistrement…"
              : provider === "brevo"
                ? "Enregistrer la configuration Brevo"
                : "Enregistrer la configuration SMTP"}
          </Button>
        </form>

        <div className="space-y-3 rounded-lg border p-4">
          <div>
            <Label htmlFor="smtp-test" className="font-medium">
              Email de test (envoi réel)
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Enregistrez d&apos;abord la configuration, puis envoyez un email de test réel pour
              vérifier que le service actif (Brevo ou SMTP) l&apos;accepte.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="smtp-test"
              type="email"
              required
              placeholder="votre@email.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="h-11 flex-1"
            />
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={handleTest}
              disabled={testing || !testEmail.trim() || !state.configured}
              title={state.configured ? undefined : "Enregistrez d'abord la configuration"}
            >
              <Send className="size-4" aria-hidden="true" />
              {testing ? "Envoi…" : "Envoyer un email de test"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
