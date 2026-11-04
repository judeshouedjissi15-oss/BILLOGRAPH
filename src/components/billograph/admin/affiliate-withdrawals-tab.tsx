"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatXOF } from "@/lib/format";
import { apiFetch } from "../lib/api-client";

type AffiliateWithdrawal = {
  id: string;
  amountXOF: number;
  operator: string;
  phoneNumber: string;
  status: string;
  payoutId: string | null;
  payoutStatus: string | null;
  providerRef: string | null;
  isManual: boolean;
  adminNote: string | null;
  requestedAt: string;
  affiliate: { name: string; email: string };
};

type ResponseData = {
  commissionTotals: Array<{ status: string; count: number; amountXOF: number; paidXOF: number }>;
  withdrawals: AffiliateWithdrawal[];
};

export function AffiliateWithdrawalsTab({ readOnly = false }: { readOnly?: boolean }) {
  const { toast } = useToast();
  const [data, setData] = useState<ResponseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [references, setReferences] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<ResponseData>("/api/admin/affiliate-withdrawals"));
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Retraits affiliés indisponibles",
        description: error instanceof Error ? error.message : "Réessayez.",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (item: AffiliateWithdrawal, action: string) => {
    setBusy(item.id);
    try {
      await apiFetch(`/api/admin/affiliate-withdrawals/${item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          providerRef: references[item.id],
          adminNote: notes[item.id],
        }),
      });
      toast({ title: "Demande mise à jour" });
      await load();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Action impossible",
        description: error instanceof Error ? error.message : "Réessayez.",
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (loading && !data) {
    return <div className="space-y-4"><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Commissions affiliées</CardTitle>
          <CardDescription>Registre financier et montants par état de validation.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(data?.commissionTotals ?? []).map((item) => (
            <div key={item.status} className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">{item.status}</p>
              <p className="mt-1 font-semibold">{formatXOF(item.amountXOF)}</p>
              <p className="text-xs text-muted-foreground">{item.count} commission(s) · {formatXOF(item.paidXOF)} payés</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Demandes de retrait affilié</CardTitle>
          <CardDescription>
            Un payout n&apos;est payé qu&apos;après confirmation FedaPay du statut « sent ». Le traitement manuel exige une référence de transfert vérifiée.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!data?.withdrawals.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Aucune demande de retrait affilié.</p>
          ) : (
            <ul className="divide-y">
              {data.withdrawals.map((item) => (
                <li key={item.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{item.affiliate.name} · {formatXOF(item.amountXOF)}</p>
                      <p className="text-sm text-muted-foreground">{item.affiliate.email} · {item.operator} · {item.phoneNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.status} · {item.payoutStatus ?? "—"} · {new Date(item.requestedAt).toLocaleString("fr-FR")}
                        {item.providerRef ? ` · Réf. ${item.providerRef}` : ""}
                      </p>
                    </div>
                  </div>
                  {!readOnly && (
                    <>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input
                          value={references[item.id] ?? ""}
                          onChange={(event) => setReferences((current) => ({ ...current, [item.id]: event.target.value }))}
                          placeholder="Référence du transfert manuel"
                          aria-label={`Référence du transfert ${item.id}`}
                        />
                        <Input
                          value={notes[item.id] ?? ""}
                          onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                          placeholder={
                            item.status === "PROCESSING" && !item.payoutId
                              ? "Après vérification FedaPay, notez le résultat"
                              : "Note / motif de refus"
                          }
                          aria-label={`Note administrateur ${item.id}`}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(item.status === "PENDING" || item.status === "APPROVED") && !item.isManual && (
                          <>
                            <Button size="sm" disabled={busy === item.id} onClick={() => void decide(item, "payout")}>
                              Envoyer via FedaPay
                            </Button>
                            <Button size="sm" variant="outline" disabled={busy === item.id} onClick={() => void decide(item, "manual")}>
                              Approuver en manuel
                            </Button>
                          </>
                        )}
                        {item.status === "PROCESSING" && item.payoutId && (
                          <Button size="sm" variant="outline" disabled={busy === item.id} onClick={() => void decide(item, "sync")}>
                            Synchroniser FedaPay
                          </Button>
                        )}
                        {item.status === "PROCESSING" && !item.payoutId && item.payoutStatus === "creation_uncertain" && (
                          <Button size="sm" variant="outline" disabled={busy === item.id || !(notes[item.id] ?? "").trim()} onClick={() => void decide(item, "manual")}>
                            Passer en manuel après vérification FedaPay
                          </Button>
                        )}
                        {item.status === "PROCESSING" && !item.payoutId && item.payoutStatus === "creating" && (
                          <p className="text-xs text-muted-foreground">Création du payout en cours; vérifiez de nouveau avant toute action manuelle.</p>
                        )}
                        {item.status === "APPROVED" && item.isManual && (
                          <Button size="sm" disabled={busy === item.id || !(references[item.id] ?? "").trim()} onClick={() => void decide(item, "manual_paid")}>
                            Confirmer le transfert vérifié
                          </Button>
                        )}
                        {["PENDING", "APPROVED", "FAILED"].includes(item.status) && (
                          <Button size="sm" variant="destructive" disabled={busy === item.id || !(notes[item.id] ?? "").trim()} onClick={() => void decide(item, "reject")}>
                            Refuser
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
