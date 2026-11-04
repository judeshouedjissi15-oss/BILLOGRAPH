"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatXOF } from "@/lib/format";
import { apiFetch } from "../lib/api-client";

type WalletData = {
  profile: { countryCode: string; operator: string; phoneNumber: string } | null;
  summary: { generatedXOF: number; pendingXOF: number; availableXOF: number; paidXOF: number };
  commissions: Array<{
    id: string;
    orderReference: string;
    amountXOF: number;
    ratePercent: number;
    status: string;
    createdAt: string;
  }>;
  withdrawals: Array<{
    id: string;
    amountXOF: number;
    operator: string;
    phoneNumber: string;
    status: string;
    payoutStatus: string | null;
    providerRef: string | null;
    isManual: boolean;
    requestedAt: string;
    processedAt: string | null;
  }>;
};

export function AffiliateWalletTab() {
  const { toast } = useToast();
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [operator, setOperator] = useState("mtn_open");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [requestingWithdrawal, setRequestingWithdrawal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const wallet = await apiFetch<WalletData>("/api/affiliates/wallet");
      setData(wallet);
      if (wallet.profile) {
        setOperator(wallet.profile.operator);
        setPhoneNumber(wallet.profile.phoneNumber);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Réessayez dans un instant.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const savePayoutProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingProfile(true);
    try {
      await apiFetch("/api/affiliates/wallet", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryCode: "BJ", operator, phoneNumber }),
      });
      await load();
      toast({ title: "Coordonnées enregistrées", description: "Le numéro sera utilisé pour vos futurs retraits." });
    } catch (saveError) {
      toast({
        variant: "destructive",
        title: "Enregistrement impossible",
        description: saveError instanceof Error ? saveError.message : "Réessayez.",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const requestWithdrawal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRequestingWithdrawal(true);
    try {
      await apiFetch("/api/affiliates/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountXOF: Number(withdrawalAmount) }),
      });
      setWithdrawalAmount("");
      await load();
      toast({ title: "Demande envoyée", description: "Elle sera examinée par l'administration." });
    } catch (withdrawalError) {
      toast({
        variant: "destructive",
        title: "Demande impossible",
        description: withdrawalError instanceof Error ? withdrawalError.message : "Réessayez.",
      });
    } finally {
      setRequestingWithdrawal(false);
    }
  };

  if (loading && !data) {
    return <div className="space-y-4" aria-busy="true"><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>;
  }

  if (error && !data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <p role="alert" className="text-sm text-destructive">{error}</p>
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>Réessayer</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portefeuille affilié</CardTitle>
        <CardDescription>
          Les commissions deviennent disponibles après confirmation serveur du paiement. Les retraits sont versés par FedaPay ou enregistrés en manuel après vérification.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Généré", data?.summary.generatedXOF ?? 0],
            ["En attente", data?.summary.pendingXOF ?? 0],
            ["Disponible", data?.summary.availableXOF ?? 0],
            ["Payé", data?.summary.paidXOF ?? 0],
          ].map(([label, amount]) => (
            <div key={String(label)} className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-1 font-semibold">{formatXOF(Number(amount))}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={savePayoutProfile} className="space-y-3 rounded-xl border p-4">
            <h3 className="font-semibold">Coordonnées de versement</h3>
            <div className="space-y-1.5">
              <Label htmlFor="affiliate-operator">Opérateur au Bénin</Label>
              <select id="affiliate-operator" value={operator} onChange={(event) => setOperator(event.target.value)} className="h-11 w-full rounded-md border bg-background px-3 text-sm">
                <option value="mtn_open">MTN Mobile Money</option>
                <option value="moov">Moov Money</option>
                <option value="sbin">Celtiis Cash (si activé par FedaPay)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="affiliate-phone">Numéro Mobile Money</Label>
              <Input id="affiliate-phone" type="tel" autoComplete="tel" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="Ex. 97 80 80 80" required />
            </div>
            <Button type="submit" variant="outline" disabled={savingProfile}>
              {savingProfile ? "Enregistrement…" : "Enregistrer mes coordonnées"}
            </Button>
          </form>

          <form onSubmit={requestWithdrawal} className="space-y-3 rounded-xl border p-4">
            <h3 className="font-semibold">Demander un retrait</h3>
            <p className="text-sm text-muted-foreground">
              Minimum : 2 000 FCFA. Votre solde reste réservé jusqu&apos;à la décision de l&apos;administrateur.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="affiliate-withdrawal-amount">Montant (FCFA)</Label>
              <Input id="affiliate-withdrawal-amount" type="number" inputMode="numeric" min={2000} max={50000000} step={1} value={withdrawalAmount} onChange={(event) => setWithdrawalAmount(event.target.value)} required />
            </div>
            <Button
              type="submit"
              disabled={
                requestingWithdrawal ||
                !data?.profile ||
                !Number.isInteger(Number(withdrawalAmount)) ||
                Number(withdrawalAmount) < 2000 ||
                Number(withdrawalAmount) > (data?.summary.availableXOF ?? 0)
              }
            >
              {requestingWithdrawal ? "Envoi…" : "Envoyer la demande"}
            </Button>
            {!data?.profile && <p className="text-xs text-destructive">Enregistrez d&apos;abord vos coordonnées Mobile Money.</p>}
          </form>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 font-semibold">Mes commissions</h3>
            {data?.commissions.length ? (
              <ul className="max-h-80 divide-y overflow-auto rounded-lg border px-3">
                {data.commissions.map((commission) => (
                  <li key={commission.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div>
                      <p className="font-medium">{commission.orderReference} · {commission.status}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(commission.createdAt).toLocaleDateString("fr-FR")}
                        {commission.ratePercent ? ` · ${commission.ratePercent}%` : ""}
                      </p>
                    </div>
                    <span className="font-semibold">{formatXOF(commission.amountXOF)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">Aucune commission enregistrée.</p>}
          </div>
          <div>
            <h3 className="mb-2 font-semibold">Historique des retraits</h3>
            {data?.withdrawals.length ? (
              <ul className="max-h-80 divide-y overflow-auto rounded-lg border px-3">
                {data.withdrawals.map((withdrawal) => (
                  <li key={withdrawal.id} className="py-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="font-medium">{formatXOF(withdrawal.amountXOF)}</span>
                      <span>{withdrawal.status}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {withdrawal.operator} · {withdrawal.phoneNumber}
                      {withdrawal.payoutStatus ? ` · FedaPay : ${withdrawal.payoutStatus}` : ""}
                      {withdrawal.providerRef ? ` · Réf. ${withdrawal.providerRef}` : ""}
                      {withdrawal.isManual ? " · Manuel" : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">Aucun retrait demandé.</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
