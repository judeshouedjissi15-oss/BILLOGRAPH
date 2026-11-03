"use client";

import { useEffect, useRef, useState } from "react";
import { KeyRound, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "./lib/api-client";
import { navigateTo } from "./lib/use-hash-route";

type Props = {
  kind: "password-reset" | "confirm-email-change";
  token: string | null;
  refreshUser: () => Promise<void>;
};

export function AccountActionPage({ kind, token, refreshUser }: Props) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ranTokenAction = useRef(false);

  useEffect(() => {
    if (kind !== "confirm-email-change" || !token || ranTokenAction.current) return;
    ranTokenAction.current = true;
    setBusy(true);
    apiFetch<{ email: string }>("/api/auth/confirm-email-change", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (result) => {
        await refreshUser();
        setDone(true);
        toast({ title: "Adresse email confirmée", description: result.email });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Confirmation impossible."))
      .finally(() => setBusy(false));
  }, [kind, token, refreshUser, toast]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (kind === "password-reset" && token) {
        if (password.length < 8 || password !== confirmation) {
          throw new Error(password.length < 8 ? "Le mot de passe doit contenir au moins 8 caractères." : "Les mots de passe ne correspondent pas.");
        }
        await apiFetch("/api/auth/password-reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "complete", token, newPassword: password }),
        });
        setDone(true);
        toast({ title: "Mot de passe réinitialisé", description: "Vous pouvez maintenant vous connecter." });
      } else {
        const result = await apiFetch<{ message: string }>("/api/auth/password-reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "request", email }),
        });
        setDone(true);
        toast({ title: "Demande prise en compte", description: result.message });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Action impossible. Réessayez.";
      setError(message);
      toast({ variant: "destructive", title: "Action impossible", description: message });
    } finally {
      setBusy(false);
    }
  };

  const isEmailConfirm = kind === "confirm-email-change";
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isEmailConfirm ? <MailCheck className="size-5 text-primary" /> : <KeyRound className="size-5 text-primary" />}
            {isEmailConfirm ? "Confirmation de la nouvelle adresse" : token ? "Choisir un nouveau mot de passe" : "Mot de passe oublié"}
          </CardTitle>
          <CardDescription>
            {isEmailConfirm
              ? "Ce lien confirme l’adresse email que vous avez demandée depuis votre profil."
              : token
                ? "Choisissez un nouveau mot de passe d’au moins 8 caractères. Le lien ne peut être utilisé qu’une seule fois."
                : "Nous enverrons un lien à usage unique si un compte éligible existe pour cette adresse."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {busy ? <p role="status" className="text-sm text-muted-foreground">Vérification en cours…</p> : null}
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          {done ? (
            <div className="space-y-4">
              <p className="rounded-lg border bg-muted/40 p-4 text-sm">
                {isEmailConfirm ? "Votre adresse email est confirmée." : token ? "Votre mot de passe a été changé. Toutes les sessions existantes ont été fermées." : "Si un compte éligible existe pour cette adresse, un lien de réinitialisation a été envoyé."}
              </p>
              <Button className="w-full" onClick={() => navigateTo("#/auth")}>Aller à la connexion</Button>
            </div>
          ) : isEmailConfirm ? (
            !busy && <Button variant="outline" className="w-full" onClick={() => navigateTo("#/profil")}>Retour au profil</Button>
          ) : (
            <form onSubmit={(event) => void submit(event)} className="space-y-4">
              {token ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="reset-password">Nouveau mot de passe</Label>
                    <Input id="reset-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reset-confirm">Confirmer le mot de passe</Label>
                    <Input id="reset-confirm" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Adresse email du compte</Label>
                  <Input id="reset-email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} />
                </div>
              )}
              <Button type="submit" className="w-full" disabled={busy || (!token && !email)}>
                {busy ? "Veuillez patienter…" : token ? "Réinitialiser le mot de passe" : "Envoyer un lien"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
