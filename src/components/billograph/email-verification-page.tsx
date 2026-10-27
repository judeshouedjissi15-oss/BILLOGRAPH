"use client";

// PAGE DE CONFIRMATION D'EMAIL (#/verifier-email/{jeton}) — atteinte depuis
// le lien réel envoyé par email à l'inscription (voie de secours de la
// confirmation, la voie principale étant le code à 6 chiffres).
// Consomme le jeton via l'API : à succès, le serveur confirme le compte ET
// ouvre la session — la page affiche alors le succès et REDIRIGE
// AUTOMATIQUEMENT vers le tableau de bord (aucune nouvelle connexion).
// IDEMPOTENT : cliquer plusieurs fois sur le même lien (double-clic,
// actualisation, lien déjà utilisé) affiche toujours un message de succès
// (« adresse déjà confirmée ») — jamais d'erreur.

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, LayoutDashboard, MailWarning, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "./lib/api-client";
import { navigateTo } from "./lib/use-hash-route";
import type { User } from "@/types/api";

type VerifyEmailPageProps = { token: string; refreshUser: () => Promise<void> };

type Phase =
  | { state: "loading" }
  | { state: "success"; email: string; name: string; alreadyConfirmed?: boolean; user?: User }
  | { state: "error"; message: string };

function redirectToDashboard(user?: User) {
  navigateTo(user?.role === "ADMIN" ? "#/admin" : "#/dashboard");
}

export function EmailVerificationPage({ token, refreshUser }: VerifyEmailPageProps) {
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>({ state: "loading" });
  const [redirecting, setRedirecting] = useState(false);

  // Renvoi (uniquement proposé en cas d'échec)
  const [resendEmail, setResendEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const requested = useRef(false);

  const verify = useCallback(async () => {
    setPhase({ state: "loading" });
    try {
      const data = await apiFetch<{
        verified: true;
        email: string;
        name: string;
        alreadyConfirmed?: boolean;
        user?: User;
      }>("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      setPhase({
        state: "success",
        email: data.email,
        name: data.name,
        alreadyConfirmed: data.alreadyConfirmed === true,
        user: data.user,
      });
      // La session vient d'être ouverte par le serveur (cookie posé) : on
      // rafraîchit l'utilisateur du shell AVANT la redirection, sinon le
      // tableau de bord verrait encore l'ancien état « invité ».
      await refreshUser().catch(() => {});
      // Session ouverte par le serveur → redirection directe vers le tableau
      // de bord (le lien prouve la possession de l'adresse — lien magique).
      setRedirecting(true);
      window.setTimeout(() => redirectToDashboard(data.user), 2200);
    } catch (error) {
      setPhase({
        state: "error",
        message: error instanceof Error ? error.message : "Confirmation impossible.",
      });
    }
  }, [token, refreshUser]);

  useEffect(() => {
    // Strict mode / double rendu : on ne consomme le jeton qu'une seule fois.
    if (requested.current) return;
    requested.current = true;
    void verify();
  }, [verify]);

  const handleResend = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResendLoading(true);
    try {
      const data = await apiFetch<{ message: string }>("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendEmail.trim() }),
      });
      toast({
        title: "Email de confirmation",
        description: data.message,
      });
      setResendEmail("");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Renvoi impossible",
        description: error instanceof Error ? error.message : "Réessayez plus tard.",
      });
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:py-16">
      <Card>
        {phase.state === "loading" ? (
          <>
            <CardHeader>
              <CardTitle>Confirmation de votre adresse email…</CardTitle>
              <CardDescription>Vérification du lien en cours, veuillez patienter.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center py-8" role="status" aria-live="polite">
                <span className="sr-only">Vérification en cours</span>
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            </CardContent>
          </>
        ) : phase.state === "success" ? (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                {phase.alreadyConfirmed ? "Votre adresse est déjà confirmée" : "Adresse email confirmée"}
              </CardTitle>
              <CardDescription>
                {phase.alreadyConfirmed
                  ? `Bonjour ${phase.name} ! Votre compte est actif — redirection en cours…`
                  : `Merci ${phase.name} ! Votre compte est actif et vous êtes connecté.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                L&apos;adresse <strong>{phase.email}</strong> est confirmée. Redirection
                automatique vers votre tableau de bord…
              </p>
              <div className="flex items-center justify-center py-2" role="status" aria-live="polite">
                <span className="sr-only">Redirection en cours</span>
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
              <Button
                type="button"
                className="h-11 w-full"
                disabled={redirecting}
                onClick={() => redirectToDashboard(phase.user)}
              >
                <LayoutDashboard className="size-4" aria-hidden="true" />
                Accéder à mon tableau de bord
              </Button>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <XCircle className="size-5 text-rose-600 dark:text-rose-400" aria-hidden="true" />
                Lien de confirmation invalide
              </CardTitle>
              <CardDescription>{phase.message}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                Astuce : l&apos;email de confirmation contient aussi un{" "}
                <strong>code à 6 chiffres</strong> que vous pouvez saisir directement sur la page
                de connexion — pas besoin de cliquer sur un lien.
              </p>
              <form onSubmit={handleResend} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="resend-email" className="flex items-center gap-1.5">
                    <MailWarning className="size-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                    Recevoir un nouvel email de confirmation
                  </Label>
                  <Input
                    id="resend-email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="L'adresse email de votre compte"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    className="h-11"
                  />
                </div>
                <Button type="submit" className="h-11 w-full" disabled={resendLoading}>
                  {resendLoading ? "Envoi en cours…" : "Renvoyer l'email de confirmation"}
                </Button>
              </form>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full"
                onClick={() => navigateTo("#/auth")}
              >
                Retour à la connexion
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Vous aviez déjà confirmé votre adresse ? Votre compte est peut-être
                déjà actif — essayez directement de vous connecter.
              </p>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
