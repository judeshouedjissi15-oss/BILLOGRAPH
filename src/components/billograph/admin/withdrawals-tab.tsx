"use client";

// Onglet "Retraits" de l'espace admin : demandes de retrait des vendeurs.
// Décisions : pré-valider (APPROVED), marquer versé (PAID — référence du
// transfert réel requise) ou rejeter (REJECTED — motif requis, fonds libérés).
// GET /api/admin/withdrawals · POST /api/admin/withdrawals/[id]

import { useCallback, useEffect, useState } from "react";
import { Ban, BanknoteArrowDown, CheckCircle2, RefreshCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "../status-badge";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "../lib/api-client";
import { formatDate, formatXOF } from "@/lib/format";
import type { AdminWithdrawal, AdminWithdrawalsResponse } from "@/types/api";

type StatusFilter = "all" | "PENDING" | "APPROVED" | "PAID" | "REJECTED";

type Decision = { kind: "approve" | "mark_paid" | "reject"; withdrawalId: string };

export function WithdrawalsTab({ readOnly = false }: { readOnly?: boolean } = {}) {
  const { toast } = useToast();
  const [data, setData] = useState<AdminWithdrawalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [providerRef, setProviderRef] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (statusFilter: StatusFilter) => {
      setError(null);
      try {
        const query = statusFilter === "all" ? "" : `?status=${statusFilter}`;
        const res = await apiFetch<AdminWithdrawalsResponse>(`/api/admin/withdrawals${query}`);
        setData(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Liste des retraits indisponible.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    setLoading(true);
    void load(filter);
  }, [filter, load]);

  const resetDecision = () => {
    setDecision(null);
    setProviderRef("");
    setAdminNote("");
  };

  const submitDecision = async () => {
    if (!decision) return;
    setBusy(true);
    try {
      await apiFetch(`/api/admin/withdrawals/${decision.withdrawalId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: decision.kind,
          ...(decision.kind === "mark_paid" ? { providerRef: providerRef.trim() } : {}),
          ...(decision.kind === "reject" ? { adminNote: adminNote.trim() } : {}),
        }),
      });
      toast({
        title:
          decision.kind === "mark_paid"
            ? "Retrait marqué comme versé"
            : decision.kind === "approve"
              ? "Retrait pré-validé"
              : "Retrait rejeté — fonds libérés",
        description: "Le vendeur a été notifié de la décision.",
      });
      resetDecision();
      await load(filter);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Action impossible",
        description: err instanceof Error ? err.message : "Réessayez plus tard.",
      });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <Skeleton className="h-96 rounded-xl" aria-busy="true" />;
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <p className="text-sm text-destructive">{error ?? "Retraits indisponibles."}</p>
          <Button variant="outline" onClick={() => void load(filter)}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Réessayer
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile label="En attente" value={data.counts.pending} className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40" />
        <SummaryTile label="Pré-validés" value={data.counts.approved} className="border-teal-300 bg-teal-50 dark:border-teal-900 dark:bg-teal-950/40" />
        <SummaryTile label="Versés" value={data.counts.paid} className="border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40" />
        <SummaryTile label="Rejetés" value={data.counts.rejected} className="border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40" />
      </div>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="size-5 text-primary" aria-hidden="true" />
                Demandes de retrait
              </CardTitle>
              <CardDescription>
                Les versements sont réalisés hors plateforme (Mobile Money / virement) — consignez
                la référence réelle du transfert avant de marquer un retrait comme versé.
              </CardDescription>
            </div>
            <Select value={filter} onValueChange={(value) => setFilter(value as StatusFilter)}>
              <SelectTrigger className="h-10 w-44" aria-label="Filtrer par statut">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="PENDING">En attente</SelectItem>
                <SelectItem value="APPROVED">Pré-validés</SelectItem>
                <SelectItem value="PAID">Versés</SelectItem>
                <SelectItem value="REJECTED">Rejetés</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {data.withdrawals.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucune demande de retrait pour ce filtre.
            </p>
          ) : (
            <div className="max-h-[32rem] space-y-4 overflow-y-auto rounded-md border p-2">
              {data.withdrawals.map((w) => (
                <WithdrawalRow
                  readOnly={readOnly}
                  key={w.id}
                  withdrawal={w}
                  decision={decision?.withdrawalId === w.id ? decision.kind : null}
                  onStartDecision={(kind) => {
                    setDecision({ kind, withdrawalId: w.id });
                    setProviderRef("");
                    setAdminNote("");
                  }}
                  onCancel={resetDecision}
                  providerRef={providerRef}
                  adminNote={adminNote}
                  onProviderRefChange={setProviderRef}
                  onAdminNoteChange={setAdminNote}
                  busy={busy}
                  onSubmit={submitDecision}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryTile({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className={`rounded-xl border p-4 ${className ?? ""}`}>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

type WithdrawalRowProps = {
  withdrawal: AdminWithdrawal;
  readOnly?: boolean;
  decision: "approve" | "mark_paid" | "reject" | null;
  onStartDecision: (kind: "approve" | "mark_paid" | "reject") => void;
  onCancel: () => void;
  providerRef: string;
  adminNote: string;
  onProviderRefChange: (value: string) => void;
  onAdminNoteChange: (value: string) => void;
  busy: boolean;
  onSubmit: () => void;
};

function WithdrawalRow({
  withdrawal: w,
  readOnly = false,
  decision,
  onStartDecision,
  onCancel,
  providerRef,
  adminNote,
  onProviderRefChange,
  onAdminNoteChange,
  busy,
  onSubmit,
}: WithdrawalRowProps) {
  const actionable = w.status === "PENDING" || w.status === "APPROVED";

  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            {formatXOF(w.amountXOF)}
            <StatusBadge status={w.status} />
          </p>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            Boutique « {w.store.name} » ({w.store.slug}) — {w.store.ownerName} · {w.store.ownerEmail}
          </p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {w.method === "BANK_TRANSFER" ? "Virement vers" : "Mobile Money"}{" "}
            <span className="font-medium text-foreground/80">{w.destination}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Demande : {formatDate(w.requestedAt)}
            {w.processedAt ? ` · Traitement : ${formatDate(w.processedAt)}${w.processedByName ? ` par ${w.processedByName}` : ""}` : ""}
            {w.providerRef ? ` · Réf. transfert : ${w.providerRef}` : ""}
            {w.adminNote ? ` · Note : ${w.adminNote}` : ""}
          </p>
        </div>

        {actionable && !decision && !readOnly && (
          <div className="flex flex-wrap gap-2">
            {w.status === "PENDING" && (
              <Button variant="outline" size="sm" className="h-9" onClick={() => onStartDecision("approve")}>
                <CheckCircle2 className="size-4" aria-hidden="true" />
                Pré-valider
              </Button>
            )}
            <Button size="sm" className="h-9" onClick={() => onStartDecision("mark_paid")}>
              <BanknoteArrowDown className="size-4" aria-hidden="true" />
              Marquer versé
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-destructive hover:text-destructive"
              onClick={() => onStartDecision("reject")}
            >
              <Ban className="size-4" aria-hidden="true" />
              Rejeter
            </Button>
          </div>
        )}
      </div>

      {decision && (
        <form
          className="mt-4 space-y-3 rounded-lg border bg-muted/40 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
        >
          {decision === "mark_paid" && (
            <div className="space-y-2">
              <Label htmlFor={`ref-${w.id}`}>Référence du transfert réel (obligatoire)</Label>
              <Input
                id={`ref-${w.id}`}
                placeholder="Ex : MP260928.1432.A53215"
                value={providerRef}
                onChange={(e) => onProviderRefChange(e.target.value)}
                className="h-11"
                required
                autoFocus
              />
            </div>
          )}
          {decision === "approve" && (
            <p className="text-sm text-muted-foreground">
              Pré-validation : la demande est marquée « Pré-validé » avant le versement réel. Le
              solde reste bloqué.
            </p>
          )}
          {decision === "reject" && (
            <div className="space-y-2">
              <Label htmlFor={`note-${w.id}`}>Motif du rejet (obligatoire — visible par le vendeur)</Label>
              <Input
                id={`note-${w.id}`}
                placeholder="Ex : coordonnées de destination invalides"
                value={adminNote}
                onChange={(e) => onAdminNoteChange(e.target.value)}
                className="h-11"
                required
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Le montant rejeté redevient immédiatement disponible dans le portefeuille du
                vendeur.
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" className="h-10" disabled={busy}>
              {busy ? "Traitement…" : "Confirmer la décision"}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-10" onClick={onCancel} disabled={busy}>
              Annuler
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
