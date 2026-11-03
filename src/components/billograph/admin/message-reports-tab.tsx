"use client";

import { useCallback, useEffect, useState } from "react";
import { Flag, Loader2, MessageSquareText, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "../lib/api-client";
import { formatDate } from "@/lib/format";

type MessageReport = {
  id: string;
  reason: string;
  status: string;
  adminNote: string | null;
  createdAt: string;
  reporter: { id: string; name: string };
  message: {
    id: string;
    content: string;
    deleted: boolean;
    createdAt: string;
    sender: { id: string; name: string };
  };
};

export function MessageReportsTab({ readOnly = false }: { readOnly?: boolean }) {
  const { toast } = useToast();
  const [reports, setReports] = useState<MessageReport[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await apiFetch<{ reports: MessageReport[] }>("/api/admin/message-reports");
      setReports(result.reports);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les signalements.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (report: MessageReport, action: "dismiss" | "review" | "remove_message") => {
    setBusyId(report.id);
    try {
      await apiFetch("/api/admin/message-reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId: report.id,
          action,
          adminNote: notes[report.id]?.trim() || undefined,
        }),
      });
      toast({ title: action === "dismiss" ? "Signalement classé sans suite" : action === "remove_message" ? "Message supprimé" : "Signalement traité" });
      await load();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Action impossible",
        description: err instanceof Error ? err.message : "Réessayez.",
      });
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <div className="space-y-3" aria-busy="true"><Skeleton className="h-40 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>;
  }
  if (error) {
    return <Card><CardContent className="flex flex-col items-center gap-4 p-10 text-center"><p className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={() => void load()}>Réessayer</Button></CardContent></Card>;
  }

  const openCount = reports.filter((report) => report.status === "OPEN").length;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Flag className="size-4" aria-hidden="true" />
        {openCount} signalement(s) à traiter · {reports.length} affiché(s)
      </div>
      {reports.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">Aucun signalement de message.</CardContent></Card>
      ) : reports.map((report) => (
        <Card key={report.id}>
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <ShieldAlert className="size-4 text-amber-600" aria-hidden="true" />
              Signalement · {report.reporter.name}
              <Badge variant={report.status === "OPEN" ? "destructive" : "secondary"}>{report.status}</Badge>
            </CardTitle>
            <CardDescription>Reçu le {formatDate(report.createdAt)} · message de {report.message.sender.name}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground"><MessageSquareText className="size-3.5" /> Message signalé</p>
              <p className="whitespace-pre-wrap break-words text-sm">{report.message.content}</p>
            </div>
            <p className="text-sm"><span className="font-medium">Motif :</span> {report.reason}</p>
            {report.adminNote && <p className="text-sm text-muted-foreground"><span className="font-medium">Note admin :</span> {report.adminNote}</p>}
            {!readOnly && report.status === "OPEN" && (
              <>
                <Input
                  value={notes[report.id] ?? ""}
                  onChange={(event) => setNotes((previous) => ({ ...previous, [report.id]: event.target.value }))}
                  maxLength={500}
                  placeholder="Note interne (facultative)"
                  aria-label="Note de modération"
                />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={busyId === report.id} onClick={() => void review(report, "dismiss")}>
                    Classer sans suite
                  </Button>
                  <Button variant="outline" disabled={busyId === report.id} onClick={() => void review(report, "review")}>
                    {busyId === report.id ? <Loader2 className="size-4 animate-spin" /> : null}
                    Marquer traité
                  </Button>
                  {!report.message.deleted && (
                    <Button variant="destructive" disabled={busyId === report.id} onClick={() => void review(report, "remove_message")}>
                      Supprimer le message
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
