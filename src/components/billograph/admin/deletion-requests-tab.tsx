"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, ShieldAlert, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";
import { apiFetch } from "../lib/api-client";

type DeletionRequest = {
  id: string;
  status: string;
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  user: { id: string; name: string; email: string; role: string; createdAt: string };
};

export function DeletionRequestsTab({ readOnly = false }: { readOnly?: boolean }) {
  const { toast } = useToast();
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await apiFetch<{ requests: DeletionRequest[] }>("/api/admin/deletion-requests");
      setRequests(result.requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les demandes.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const review = async (request: DeletionRequest, action: "approve" | "reject") => {
    const message = action === "approve"
      ? "Approuver la demande anonymisera le profil, suspendra le compte et fermera ses sessions. Les historiques financiers seront préservés. Continuer ?"
      : "Refuser la demande de suppression ?";
    if (!window.confirm(message)) return;
    setBusyId(request.id);
    try {
      await apiFetch("/api/admin/deletion-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: request.id, action, adminNote: notes[request.id]?.trim() || undefined }),
      });
      toast({ title: action === "approve" ? "Compte anonymisé et désactivé" : "Demande refusée" });
      await load();
    } catch (err) {
      toast({ variant: "destructive", title: "Examen impossible", description: err instanceof Error ? err.message : "Réessayez." });
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div className="space-y-3" aria-busy="true"><Skeleton className="h-36 rounded-xl" /><Skeleton className="h-36 rounded-xl" /></div>;
  if (error) return <Card><CardContent className="flex flex-col items-center gap-4 p-10 text-center"><p className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={() => void load()}>Réessayer</Button></CardContent></Card>;

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldAlert className="size-4" aria-hidden="true" />{requests.filter((request) => request.status === "OPEN").length} demande(s) à traiter · {requests.length} affichée(s)</p>
      {requests.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">Aucune demande de suppression.</CardContent></Card>
      ) : requests.map((request) => (
        <Card key={request.id}>
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">{request.user.name}<Badge variant={request.status === "OPEN" ? "destructive" : "secondary"}>{request.status}</Badge></CardTitle>
            <CardDescription>{request.user.email} · {request.user.role} · demande du {formatDate(request.createdAt)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {request.adminNote && <p className="text-sm text-muted-foreground">Note : {request.adminNote}</p>}
            {!readOnly && request.status === "OPEN" && (
              <>
                <Input value={notes[request.id] ?? ""} onChange={(event) => setNotes((previous) => ({ ...previous, [request.id]: event.target.value }))} maxLength={500} placeholder="Note interne (facultative)" aria-label="Note de traitement" />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={busyId === request.id} onClick={() => void review(request, "reject")}><X className="size-4" />Refuser</Button>
                  <Button variant="destructive" disabled={busyId === request.id} onClick={() => void review(request, "approve")}>{busyId === request.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}Approuver et anonymiser</Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
