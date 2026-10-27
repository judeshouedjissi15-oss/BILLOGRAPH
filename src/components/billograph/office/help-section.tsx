"use client";

// DEMANDER DE L'AIDE — demandes réelles au propriétaire (réponse notifiée).
// Le propriétaire agissant dans l'office voit toutes les demandes de l'office.
import { useCallback, useEffect, useState } from "react";
import { LifeBuoy, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "../lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { HELP_CATEGORY_LABELS } from "@/lib/offices";
import { useOfficeScope, officeScopeSuffix } from "./office-scope";
import type { OfficeHelpRequestInfo } from "@/types/api";

export function HelpSection({ onChanged }: { onChanged: () => void }) {
  const scope = useOfficeScope();
  const [requests, setRequests] = useState<OfficeHelpRequestInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ requests: OfficeHelpRequestInfo[] }>(`/api/office/help${officeScopeSuffix(scope)}`);
      setRequests(data.requests);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger vos demandes.");
      setRequests([]);
    }
  }, [scope]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {scope.asOwner
            ? "Demandes d'aide reçues dans cet office — répondez aussi depuis l'administration (Équipe & Offices)."
            : "Une difficulté, un besoin de ressources, une question d'organisation ? Signalez au propriétaire — en toute confidentialité si nécessaire."}
        </p>
        {!scope.asOwner && (
          <Button className="h-10" onClick={() => setOpen(true)}>
            <LifeBuoy className="size-4" aria-hidden="true" />
            Nouvelle demande
          </Button>
        )}
      </div>

      {requests === null ? (
        <Skeleton className="h-64 rounded-xl" aria-busy="true" />
      ) : error ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-destructive">
            {error}
            <div className="mt-3">
              <Button variant="outline" size="sm" onClick={() => void load()}>
                Réessayer
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <LifeBuoy className="size-10 text-muted-foreground" aria-hidden="true" />
            <p className="font-semibold">
              {scope.asOwner ? "Aucune demande d'aide dans cet office" : "Aucune demande envoyée"}
            </p>
            <p className="text-sm text-muted-foreground">
              {scope.asOwner
                ? "Les officiers de cet office n'ont rien signalé pour l'instant."
                : "Vous n'avez besoin de personne pour l'instant — c'est noté. En cas de blocage, cette porte est toujours ouverte."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <Card key={r.id} className="py-0">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.confidential && (
                      <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                        <Lock className="mr-1 size-3" aria-hidden="true" />
                        Confidentiel
                      </Badge>
                    )}
                    <Badge variant="secondary">{r.status}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {HELP_CATEGORY_LABELS[r.category] ?? r.category} · {new Date(r.createdAt).toLocaleString("fr-FR")}
                      {r.requesterName && !r.requesterIsMe ? ` · par ${r.requesterName}` : ""}
                    </span>
                  </div>
                </div>
                <p className="mt-2 font-medium">{r.subject}</p>
                <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">{r.message}</p>
                {r.response && (
                  <div className="mt-3 rounded-lg border border-teal-300 bg-teal-50 p-3 text-sm dark:border-teal-800 dark:bg-teal-950/40">
                    <p className="font-medium">Réponse du propriétaire {r.respondedAt ? `— ${new Date(r.respondedAt).toLocaleString("fr-FR")}` : ""}</p>
                    <p className="mt-1 whitespace-pre-wrap">{r.response}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!scope.asOwner && (
        <CreateHelpDialog
          open={open}
          onOpenChange={setOpen}
          onCreated={() => {
            setOpen(false);
            void load();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function CreateHelpDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const scope = useOfficeScope();
  const { toast } = useToast();
  const [category, setCategory] = useState("AUTRE");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [confidential, setConfidential] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (subject.trim().length < 4) {
      toast({ variant: "destructive", title: "Sujet trop court" });
      return;
    }
    if (message.trim().length < 10) {
      toast({ variant: "destructive", title: "Message trop court", description: "Décrivez votre besoin (10 caractères minimum)." });
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/office/help${officeScopeSuffix(scope)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          subject: subject.trim(),
          message: message.trim(),
          confidential,
        }),
      });
      toast({ title: "Demande envoyée", description: "Le propriétaire a été réellement notifié." });
      setSubject("");
      setMessage("");
      setCategory("AUTRE");
      setConfidential(false);
      onCreated();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Envoi impossible",
        description: err instanceof Error ? err.message : "Réessayez.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Demander de l&apos;aide au propriétaire</DialogTitle>
          <DialogDescription>
            Votre demande est enregistrée réellement et le propriétaire est notifié.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Catégorie</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(HELP_CATEGORY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="help-subject">Sujet *</Label>
            <Input id="help-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="help-message">Message *</Label>
            <Textarea id="help-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={4000} className="min-h-24" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={confidential}
              onChange={(e) => setConfidential(e.target.checked)}
              className="size-4"
            />
            Demande confidentielle (visible uniquement du propriétaire)
          </label>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button className="h-11" disabled={saving} onClick={() => void submit()}>
            {saving ? "Envoi…" : "Envoyer la demande"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
