"use client";

// VUE AUTH (#/auth) — PAGE DE CONNEXION UNIQUE (aucun indice administrateur) :
// l'administrateur utilise exactement le même formulaire que les utilisateurs.
// C'est le SERVEUR qui reconnaît ses identifiants : au lieu d'ouvrir une
// session, il répond alors « challengeRequired » et la page affiche une
// VÉRIFICATION DE SÉCURITÉ à deux codes secrets (étape 1 puis étape 2).
// Cette vérification n'apparaît JAMAIS pour un utilisateur normal : elle n'est
// rendue que si le serveur a reconnu les identifiants propriétaire. Les codes
// sont vérifiés 100 % côté serveur — aucun indice dans le client.
// Redirection selon rôle à succès : ADMIN → #/admin, sinon → #/dashboard.
// CONFIRMATION D'EMAIL : après inscription (ou tentative de connexion sur un
// compte non confirmé), l'utilisateur saisit le CODE À 6 CHIFFRES reçu par
// email. Code correct → le serveur confirme le compte ET ouvre la session →
// redirection immédiate vers le tableau de bord (aucune nouvelle connexion).

import { useCallback, useEffect, useRef, useState } from "react";
import { KeyRound, LogIn, MailCheck, ShieldCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "./lib/api-client";
import { navigateTo } from "./lib/use-hash-route";
import { OtpInput } from "./otp-input";
import { PasswordInput } from "./password-input";
import type { User } from "@/types/api";

type AuthViewProps = {
  user: User | null;
  userLoading: boolean;
  refreshUser: () => Promise<void>;
};

type LoginResponse =
  | { user: User }
  | { challengeRequired: true; challengeToken: string; step: number; steps: number };

type VerifyCodeResponse = {
  verified: true;
  alreadyConfirmed?: boolean;
  user: User;
};

type ChallengeResponse = {
  verified: true;
  step?: number;
  steps?: number;
  challengeToken?: string;
  user?: User;
};

type Challenge = { token: string; step: 1 | 2 };

function redirectAfterAuth(user: User) {
  navigateTo(user.role === "ADMIN" ? "#/admin" : "#/dashboard");
}

// PANNEAU « CONFIRMEZ VOTRE EMAIL » — affiché après une inscription réussie ou
// une tentative de connexion sur un compte non confirmé. L'utilisateur saisit
// le CODE À 6 CHIFFRES reçu par email : code correct → le compte est confirmé
// et la session est ouverte par le serveur → REDIRECTION IMMÉDIATE vers le
// tableau de bord. Le renvoi génère un nouveau code (les tentatives repartent
// de zéro).
function EmailVerificationNotice({
  email,
  origin,
  onBack,
  refreshUser,
}: {
  email: string;
  origin: "register" | "login";
  onBack: () => void;
  refreshUser: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const verifyingRef = useRef(false);

  const submitCode = useCallback(
    async (submitted: string) => {
      if (verifyingRef.current) return;
      verifyingRef.current = true;
      setVerifyLoading(true);
      setVerifyError(null);
      try {
        const data = await apiFetch<VerifyCodeResponse>("/api/auth/verify-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code: submitted }),
        });
        toast({
          title: "Adresse email confirmée",
          description: `Bienvenue ${data.user.name} ! Votre compte est actif — redirection vers votre tableau de bord…`,
        });
        await refreshUser();
        navigateTo(data.user.role === "ADMIN" ? "#/admin" : "#/dashboard");
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Vérification impossible. Réessayez ou demandez un nouveau code.";
        setVerifyError(message);
        setCode("");
        toast({ variant: "destructive", title: "Code refusé", description: message });
      } finally {
        verifyingRef.current = false;
        setVerifyLoading(false);
      }
    },
    [email, refreshUser, toast],
  );

  const handleResend = async () => {
    setResendLoading(true);
    try {
      const data = await apiFetch<{ message: string }>("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
      setCode("");
      setVerifyError(null);
      toast({ title: "Nouveau code envoyé", description: data.message });
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailCheck className="size-5 text-primary" aria-hidden="true" />
          Confirmez votre adresse email
        </CardTitle>
        <CardDescription>
          {origin === "register"
            ? "Votre compte a été créé — saisissez le code reçu par email pour l'activer."
            : "La connexion a été refusée : saisissez le code reçu par email pour activer votre compte."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border bg-muted/40 p-4 text-sm">
          <p className="font-medium">Un code de confirmation à 6 chiffres a été envoyé à</p>
          <p className="mt-1 font-semibold break-all text-primary">{email}</p>
          <p className="mt-2 text-muted-foreground">
            Ouvrez l&apos;email «&nbsp;Votre code de confirmation BILLOGRAPH&nbsp;» (pensez aux
            spams) et saisissez le code ci-dessous. Il est valable 15 minutes.
          </p>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (code.length === 6) void submitCode(code);
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label className="sr-only" htmlFor="otp-0">
              Code de confirmation à 6 chiffres
            </Label>
            <OtpInput
              value={code}
              onChange={(v) => {
                setCode(v);
                setVerifyError(null);
              }}
              disabled={verifyLoading}
              onComplete={(v) => void submitCode(v)}
            />
            {verifyError ? (
              <p className="text-center text-sm font-medium text-destructive" role="alert">
                {verifyError}
              </p>
            ) : (
              <p className="text-center text-xs text-muted-foreground">
                Saisissez les 6 chiffres — la vérification démarre automatiquement.
              </p>
            )}
          </div>
          <Button
            type="submit"
            className="h-11 w-full"
            disabled={verifyLoading || code.length < 6}
          >
            <KeyRound className="size-4" aria-hidden="true" />
            {verifyLoading ? "Vérification…" : "Confirmer mon compte"}
          </Button>
        </form>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1"
            onClick={handleResend}
            disabled={resendLoading || verifyLoading}
          >
            {resendLoading ? "Envoi en cours…" : sent ? "Renvoyer à nouveau" : "Je n'ai rien reçu — renvoyer le code"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-11 flex-1"
            onClick={onBack}
            disabled={verifyLoading}
          >
            Retour à la connexion
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function AuthView({ user, userLoading, refreshUser }: AuthViewProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState("login");

  // Connexion
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Vérification de sécurité (challenge à deux codes — serveur uniquement)
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [challengeCode, setChallengeCode] = useState("");
  const [challengeLoading, setChallengeLoading] = useState(false);

  // Inscription
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerLoading, setRegisterLoading] = useState(false);

  // Confirmation d'email obligatoire : remplace le formulaire le temps du message.
  const [emailNotice, setEmailNotice] = useState<{ email: string; origin: "register" | "login" } | null>(null);

  // Déjà connecté → rediriger selon le rôle.
  useEffect(() => {
    if (!userLoading && user) redirectAfterAuth(user);
  }, [user, userLoading]);

  const handleTabChange = (value: string) => {
    // Changer d'onglet annule toute vérification en cours.
    if (value !== "login") setChallenge(null);
    setTab(value);
  };

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginLoading(true);
    try {
      const data = await apiFetch<LoginResponse>("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }),
      });

      // Le serveur exige la vérification de sécurité (deux codes secrets).
      if ("challengeRequired" in data) {
        setChallenge({ token: data.challengeToken, step: data.step === 2 ? 2 : 1 });
        setLoginPassword(""); // on ne retient pas le mot de passe plus que nécessaire
        toast({
          title: "Vérification de sécurité",
          description: "Saisissez votre code secret pour continuer.",
        });
        return;
      }

      toast({
        title: `Bienvenue, ${data.user.name} !`,
        description: "Vous êtes connecté à votre espace BILLOGRAPH.",
      });
      await refreshUser();
      redirectAfterAuth(data.user);
    } catch (error) {
      // Compte non confirmé → panneau dédié avec renvoi de l'email.
      const apiError = error as Error & { status?: number; body?: { emailVerificationRequired?: boolean } };
      if (apiError.status === 403 && apiError.body?.emailVerificationRequired) {
        setEmailNotice({ email: loginEmail.trim(), origin: "login" });
        return;
      }
      toast({
        variant: "destructive",
        title: "Connexion impossible",
        description: error instanceof Error ? error.message : "Vérifiez vos identifiants.",
      });
    } finally {
      setLoginLoading(false);
    }
  };

  const cancelChallenge = () => {
    setChallenge(null);
    setChallengeCode("");
  };

  const handleChallenge = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!challenge) return;
    setChallengeLoading(true);
    try {
      const data = await apiFetch<ChallengeResponse>("/api/auth/admin-challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: challenge.token, code: challengeCode }),
      });

      if (data.user) {
        // Tous les codes validés → session ADMIN ouverte par le serveur.
        cancelChallenge();
        toast({
          title: `Bienvenue, ${data.user.name} !`,
          description: "Vérification réussie. Accès autorisé.",
        });
        await refreshUser();
        redirectAfterAuth(data.user);
        return;
      }

      if (data.step === 2 && data.challengeToken) {
        // Premier code validé → passage à la seconde étape (token rotaté).
        setChallenge({ token: data.challengeToken, step: 2 });
        setChallengeCode("");
        toast({
          title: "Code validé",
          description: "Dernière étape : saisissez le second code.",
        });
        return;
      }

      cancelChallenge();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Code invalide.";
      // Challenge invalidé (expiration, trop de tentatives) → retour au formulaire.
      if (message.includes("reconnecter")) {
        cancelChallenge();
      }
      toast({
        variant: "destructive",
        title: "Vérification impossible",
        description: message,
      });
    } finally {
      setChallengeLoading(false);
    }
  };

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRegisterLoading(true);
    try {
      const data = await apiFetch<{ emailVerificationRequired: true; email: string; name: string }>(
        "/api/auth/register",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: registerName.trim(),
            email: registerEmail.trim(),
            password: registerPassword,
          }),
        },
      );
      // Aucune session : le compte doit être confirmé par email AVANT connexion.
      setEmailNotice({ email: data.email, origin: "register" });
      setRegisterPassword("");
      toast({
        title: "Compte créé — confirmez votre email",
        description: `Un email de confirmation a été envoyé à ${data.email}.`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Inscription impossible",
        description: error instanceof Error ? error.message : "Vérifiez les informations saisies.",
      });
    } finally {
      setRegisterLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:py-16">
      <div className="text-center">
        <img
          src="/brand/logo-full.png"
          alt="Logo BILLOGRAPH — la plateforme qui facilite la vente des produits en Afrique francophone"
          width={512}
          height={512}
          className="mx-auto h-20 w-20 rounded-2xl shadow-md"
        />
        <h1 className="mt-5 text-3xl font-bold tracking-tight">Bienvenue sur BILLOGRAPH</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Connectez-vous ou créez votre compte pour ouvrir votre boutique en FCFA.
        </p>
      </div>

      {emailNotice ? (
        // COMPTE EN ATTENTE DE CONFIRMATION D'EMAIL — les formulaires restent
        // masqués tant que l'adresse n'est pas confirmée.
        <div className="mt-8">
          <EmailVerificationNotice
            email={emailNotice.email}
            origin={emailNotice.origin}
            refreshUser={refreshUser}
            onBack={() => {
              setEmailNotice(null);
              setTab("login");
            }}
          />
        </div>
      ) : (
        <Tabs value={tab} onValueChange={handleTabChange} className="mt-8">
          <TabsList className="grid h-11 w-full grid-cols-2">
            <TabsTrigger value="login" className="gap-1.5">
              <LogIn className="size-4" aria-hidden="true" />
              Connexion
            </TabsTrigger>
            <TabsTrigger value="register" className="gap-1.5">
              <UserPlus className="size-4" aria-hidden="true" />
              Inscription
            </TabsTrigger>
          </TabsList>

          {/* CONNEXION */}
          <TabsContent value="login">
          <Card>
            {challenge ? (
              // VÉRIFICATION DE SÉCURITÉ (rendue uniquement si le serveur a
              // reconnu des identifiants privilégiés — jamais pour un
              // utilisateur normal). Formulation neutre, aucun indice.
              <>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
                    Vérification de sécurité
                  </CardTitle>
                  <CardDescription>
                    {challenge.step === 1
                      ? "Une vérification supplémentaire est requise pour finaliser votre connexion."
                      : "Premier code validé. Une dernière vérification est requise."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleChallenge} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="challenge-code">
                        {challenge.step === 1 ? "Code secret" : "Second code"}
                      </Label>
                      <PasswordInput
                        id="challenge-code"
                        fieldName="code secret"
                        required
                        autoComplete="off"
                        autoFocus
                        placeholder={challenge.step === 1 ? "Votre code secret" : "Votre second code"}
                        value={challengeCode}
                        onChange={(e) => setChallengeCode(e.target.value)}
                        className="h-11"
                      />
                      {challenge.step === 2 ? (
                        <p className="text-xs text-muted-foreground">
                          Dernière étape de la vérification.
                        </p>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" className="h-11 flex-1" disabled={challengeLoading}>
                        {challengeLoading ? "Vérification…" : "Vérifier"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11"
                        onClick={cancelChallenge}
                        disabled={challengeLoading}
                      >
                        Annuler
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </>
            ) : (
              // FORMULAIRE DE CONNEXION STANDARD (identique pour tout le monde).
              <>
                <CardHeader>
                  <CardTitle>Se connecter</CardTitle>
                  <CardDescription>Accédez à votre tableau de bord vendeur.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleLogin} className="space-y-4" noValidate={false}>
                    <div className="space-y-2">
                      <Label htmlFor="login-email">Email ou identifiant</Label>
                      <Input
                        id="login-email"
                        type="text"
                        inputMode="email"
                        required
                        autoComplete="username"
                        placeholder="vous@exemple.bj"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="login-password">Mot de passe</Label>
                      <PasswordInput
                        id="login-password"
                        required
                        autoComplete="current-password"
                        placeholder="Votre mot de passe"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="h-11"
                      />
                    </div>
                    <Button type="submit" className="h-11 w-full" disabled={loginLoading}>
                      {loginLoading ? "Connexion en cours…" : "Se connecter"}
                    </Button>
                  </form>
                </CardContent>
              </>
            )}
          </Card>
        </TabsContent>

        {/* INSCRIPTION */}
        <TabsContent value="register">
          <Card>
            <CardHeader>
              <CardTitle>Créer un compte</CardTitle>
              <CardDescription>
                Gratuit, sans carte bancaire. Un code de confirmation à 6 chiffres vous sera
                envoyé par email pour activer votre compte.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="register-name">Nom complet</Label>
                  <Input
                    id="register-name"
                    type="text"
                    required
                    autoComplete="name"
                    minLength={2}
                    maxLength={80}
                    placeholder="Ex : Awa Codjo"
                    value={registerName}
                    onChange={(e) => setRegisterName(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-email">Adresse email</Label>
                  <Input
                    id="register-email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="vous@exemple.bj"
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-password">Mot de passe</Label>
                  <PasswordInput
                    id="register-password"
                    required
                    autoComplete="new-password"
                    minLength={8}
                    placeholder="8 caractères minimum"
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                    className="h-11"
                  />
                  <p className="text-xs text-muted-foreground">
                    Utilisez au moins 8 caractères, avec lettres et chiffres.
                  </p>
                </div>
                <Button type="submit" className="h-11 w-full" disabled={registerLoading}>
                  {registerLoading ? "Création du compte…" : "Créer mon compte"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
        </Tabs>
      )}

    </div>
  );
}
