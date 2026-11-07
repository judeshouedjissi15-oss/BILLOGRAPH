"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Gift, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { formatXOF } from "@/lib/format";
import { apiFetch } from "./lib/api-client";
import { navigateTo } from "./lib/use-hash-route";
import type { User } from "@/types/api";

type ReferralSummary = {
  code: string;
  shareUrl: string;
  earnedXOF: number;
  redeemedXOF: number;
  balanceXOF: number;
  successfulReferrals: number;
};

export function ReferralView({ user }: { user: User | null }) {
  const { toast } = useToast();
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    apiFetch<ReferralSummary>("/api/referrals")
      .then(setSummary)
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Le parrainage est indisponible.");
      });
  }, [user]);

  const copyLink = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary.shareUrl);
      toast({ title: "Lien copié", description: "Partagez-le à vos proches." });
    } catch (copyError) {
      console.error("[referral] impossible de copier le lien:", copyError);
      toast({
        variant: "destructive",
        title: "Copie impossible",
        description: "Votre navigateur n'autorise pas l'accès au presse-papiers.",
      });
    }
  };

  if (!user) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <Gift className="mx-auto size-10 text-primary" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-bold">BILLOGRAPH REFERRAL</h1>
        <p className="mt-2 text-muted-foreground">Connectez-vous pour obtenir votre lien et suivre vos crédits.</p>
        <Button className="mt-6" onClick={() => navigateTo("#/auth")}>Se connecter</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">BILLOGRAPH REFERRAL</p>
        <h1 className="mt-2 text-3xl font-bold">Partagez, gagnez des crédits</h1>
        <p className="mt-2 text-muted-foreground">
          Vos crédits sont accordés uniquement après confirmation d'un paiement réel, une seule fois par nouvel acheteur.
        </p>
      </header>

      {error && <p role="alert" className="mb-5 text-sm text-destructive">{error}</p>}

      {summary ? (
        <>
          <Card className="mb-6">
            <CardHeader><CardTitle>Votre lien personnel</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row">
              <code className="min-w-0 flex-1 break-all rounded-md bg-muted p-3 text-sm">{summary.shareUrl}</code>
              <Button onClick={() => void copyLink()}><Copy className="mr-2 size-4" aria-hidden="true" />Copier le lien</Button>
            </CardContent>
          </Card>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card><CardContent className="flex items-center gap-3 p-5"><Gift className="size-5 text-primary" aria-hidden="true" /><div><p className="text-sm text-muted-foreground">Crédits disponibles</p><p className="text-xl font-bold">{formatXOF(summary.balanceXOF)}</p></div></CardContent></Card>
            <Card><CardContent className="flex items-center gap-3 p-5"><Check className="size-5 text-primary" aria-hidden="true" /><div><p className="text-sm text-muted-foreground">Crédits gagnés</p><p className="text-xl font-bold">{formatXOF(summary.earnedXOF)}</p></div></CardContent></Card>
            <Card><CardContent className="flex items-center gap-3 p-5"><Users className="size-5 text-primary" aria-hidden="true" /><div><p className="text-sm text-muted-foreground">Achats payés parrainés</p><p className="text-xl font-bold">{summary.successfulReferrals}</p></div></CardContent></Card>
          </div>
          <p className="mt-5 text-sm text-muted-foreground">
            Les crédits peuvent être utilisés lors d'une commande en étant connecté. Un achat par personne peut générer un crédit.
          </p>
        </>
      ) : !error ? (
        <p role="status" className="text-muted-foreground">Chargement de votre espace…</p>
      ) : null}
    </div>
  );
}
