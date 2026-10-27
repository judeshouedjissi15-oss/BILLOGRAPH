"use client";

// Onglet "Portefeuille" du dashboard vendeur : solde disponible, revenus nets,
// commissions, demande de retrait (montant, méthode, destination) et historique.
// GET /api/vendor/wallet · POST /api/vendor/withdrawals

import { useCallback, useEffect, useState } from "react";
import { ArrowDownToLine, Banknote, Landmark, Percent, RefreshCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatCard } from "../stat-card";
import { StatusBadge } from "../status-badge";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "../lib/api-client";
import { formatDate, formatXOF } from "@/lib/format";
import { MIN_WITHDRAWAL_XOF, type WithdrawalMethodId } from "@/lib/constants";
import type { VendorWalletResponse } from "@/types/api";

const METHOD_LABELS: Record<WithdrawalMethodId, string> = {
  MOBILE_MONEY: "Mobile Money",
  BANK_TRANSFER: "Virement bancaire",
};

export function WalletTab() {
  const { toast } = useToast();
  const [data, setData] = useState<VendorWalletResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<WithdrawalMethodId>("MOBILE_MONEY");
  const [destination, setDestination] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch<VendorWalletResponse>("/api/vendor/wallet");
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Portefeuille indisponible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const amountXOF = Number.parseInt(amount.replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(amountXOF) || amountXOF < MIN_WITHDRAWAL_XOF) {
      toast({
        variant: "destructive",
        title: "Montant invalide",
        description: `Le retrait minimum est de ${formatXOF(MIN_WITHDRAWAL_XOF)}.`,
      });
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/api/vendor/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountXOF, method, destination: destination.trim() }),
      });
      toast({
        title: "Demande envoyée",
        description: `Votre retrait de ${formatXOF(amountXOF)} sera traité par la plateforme.`,
      });
      setAmount("");
      setDestination("");
      await load();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Demande refusée",
        description: err instanceof Error ? err.message : "Réessayez plus tard.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <p className="text-sm text-destructive">{error ?? "Portefeuille indisponible."}</p>
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Réessayer
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { wallet, withdrawals } = data;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Solde disponible"
          value={formatXOF(wallet.availableXOF)}
          icon={Wallet}
          hint="Retrait possible immédiatement"
        />
        <StatCard
          label="Revenus nets"
          value={formatXOF(wallet.netXOF)}
          icon={Banknote}
          hint={`Sur ${formatXOF(wallet.grossXOF)} de ventes`}
        />
        <StatCard
          label="Commissions plateforme"
          value={formatXOF(wallet.commissionXOF)}
          icon={Percent}
          hint="Tout compris — frais de paiement inclus"
        />
        <StatCard
          label="Retraits"
          value={formatXOF(wallet.paidOutXOF)}
          icon={Landmark}
          hint={wallet.pendingXOF > 0 ? `${formatXOF(wallet.pendingXOF)} en cours` : "Aucun en cours"}
        />
      </div>

      {/* Demande de retrait */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowDownToLine className="size-5 text-primary" aria-hidden="true" />
            Demander un retrait
          </CardTitle>
          <CardDescription>
            Le versement est effectué par la plateforme vers votre Mobile Money ou votre compte
            bancaire. Minimum : {formatXOF(MIN_WITHDRAWAL_XOF)}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="withdrawal-amount">Montant (FCFA)</Label>
              <Input
                id="withdrawal-amount"
                inputMode="numeric"
                placeholder={`Ex : ${MIN_WITHDRAWAL_XOF}`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-11"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="withdrawal-method">Méthode</Label>
              <Select value={method} onValueChange={(value) => setMethod(value as WithdrawalMethodId)}>
                <SelectTrigger id="withdrawal-method" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MOBILE_MONEY">Mobile Money (MTN / Moov)</SelectItem>
                  <SelectItem value="BANK_TRANSFER">Virement bancaire</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="withdrawal-destination">
                {method === "BANK_TRANSFER" ? "Coordonnées bancaires" : "Numéro Mobile Money"}
              </Label>
              <Input
                id="withdrawal-destination"
                placeholder={method === "BANK_TRANSFER" ? "IBAN / compte" : "Ex : +229 01 97 00 00 00"}
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="h-11"
                required
                minLength={6}
                maxLength={120}
              />
            </div>
            <div className="sm:col-span-3">
              <Button
                type="submit"
                className="h-11 w-full sm:w-auto"
                disabled={submitting || wallet.availableXOF < MIN_WITHDRAWAL_XOF}
              >
                {submitting ? "Envoi…" : "Demander le retrait"}
              </Button>
              {wallet.availableXOF < MIN_WITHDRAWAL_XOF && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Solde insuffisant : les ventes payées apparaissent ici après confirmation du
                  paiement.
                </p>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Historique des retraits */}
      <Card>
        <CardHeader>
          <CardTitle>Historique des retraits</CardTitle>
          <CardDescription>Suivi de vos demandes et versements.</CardDescription>
        </CardHeader>
        <CardContent>
          {withdrawals.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucun retrait pour le moment.
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Montant</TableHead>
                    <TableHead className="hidden sm:table-cell">Destination</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="hidden md:table-cell">Référence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {withdrawals.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(w.requestedAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-semibold">
                        {formatXOF(w.amountXOF)}
                      </TableCell>
                      <TableCell className="hidden max-w-40 truncate text-sm text-muted-foreground sm:table-cell">
                        {METHOD_LABELS[w.method]} · {w.destination}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={w.status} />
                      </TableCell>
                      <TableCell className="hidden max-w-32 truncate font-mono text-xs text-muted-foreground md:table-cell">
                        {w.providerRef ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
