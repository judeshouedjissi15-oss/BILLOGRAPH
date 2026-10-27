"use client";

// ONGLET ÉQUIPE & OFFICES (administration) — supervision réelle des offices :
// effectifs (x/5), membres, attributions, travaux à valider, demandes d'aide,
// formation, rapports et activités récentes. Lecture seule pour le greffier.
import { useCallback, useEffect, useState } from "react";
import {
  ClipboardList,
  LifeBuoy,
  Loader2,
  Megaphone,
  Plus,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Undo2,
  UserPlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { InlineConfirm } from "../inline-confirm";
import { apiFetch } from "../lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { OFFICE_DEFS, MAX_ADJOINTS_PER_ROLE, TASK_STATUS_LABELS, HELP_CATEGORY_LABELS, TRAINING_CATEGORY_LABELS } from "@/lib/offices";
import { OfficeStatusBadge } from "../office/badges";
import type { AdminOfficeMember, AdminOfficeOverview, AdminTrainingResource } from "@/types/api";

export function OfficeTab({ readOnly = false }: { readOnly?: boolean } = {}) {
  const { toast } = useToast();
  const [data, setData] = useState<AdminOfficeOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<AdminOfficeOverview>("/api/admin/office/overview"));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger la supervision des offices.");
    }
  }, []);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  const patchMember = useCallback(
    async (m: AdminOfficeMember, body: Record<string, unknown>, okTitle: string) => {
      try {
        await apiFetch(`/api/admin/office/staff/${m.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        toast({ title: okTitle });
        await load();
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Action impossible",
          description: err instanceof Error ? err.message : "Réessayez.",
        });
      }
    },
    [toast],
  );

  if (!data) {
    return error ? (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" onClick={() => void load()}>
            Réessayer
          </Button>
        </CardContent>
      </Card>
    ) : (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <Tabs defaultValue="membres" className="space-y-4">
      <TabsList className="h-11 w-full justify-start overflow-x-auto lg:w-auto">
        <TabsTrigger value="membres" className="px-4">Membres</TabsTrigger>
        <TabsTrigger value="attribuer" className="px-4">Attribuer un office</TabsTrigger>
        <TabsTrigger value="validations" className="px-4">
          À valider {data.pendingOwnerValidations.length > 0 && <Badge variant="secondary" className="ml-1">{data.pendingOwnerValidations.length}</Badge>}
        </TabsTrigger>
        <TabsTrigger value="aide" className="px-4">
          Aide {data.helpRequests.filter((h) => !h.response).length > 0 && <Badge variant="secondary" className="ml-1">{data.helpRequests.filter((h) => !h.response).length}</Badge>}
        </TabsTrigger>
        <TabsTrigger value="formation" className="px-4">Formation</TabsTrigger>
        <TabsTrigger value="activite" className="px-4">Activité &amp; rapports</TabsTrigger>
      </TabsList>

      {/* Effectifs réels */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {data.effectifs.map((e) => (
          <Card key={e.key} className="py-0">
            <CardContent className="p-3">
              <p className="text-sm font-semibold">{e.officeName}</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Badge variant="secondary">
                  {e.active}/{e.max} actifs
                </Badge>
                {e.statusCounts.AWAITING_VALIDATION ? `${e.statusCounts.AWAITING_VALIDATION} à valider` : ""}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Membres d'office */}
      <TabsContent value="membres" className="mt-4">
        <MembersList
          members={data.members}
          readOnly={readOnly}
          onPatch={(m, body, title) => patchMember(m, body, title)}
        />
      </TabsContent>

      {/* Attribution d'un office */}
      <TabsContent value="attribuer" className="mt-4">
        <AttributeOffice onAttributed={() => void load()} existingEmails={data.members.map((m) => m.email)} />
      </TabsContent>

      {/* Validations du propriétaire */}
      <TabsContent value="validations" className="mt-4">
        <PendingValidations
          items={data.pendingOwnerValidations}
          readOnly={readOnly}
          onReviewed={() => void load()}
        />
      </TabsContent>

      {/* Demandes d'aide */}
      <TabsContent value="aide" className="mt-4">
        <HelpRequests requests={data.helpRequests} readOnly={readOnly} onResponded={() => void load()} />
      </TabsContent>

      {/* Formation */}
      <TabsContent value="formation" className="mt-4">
        <TrainingManager onChanged={() => void load()} readOnly={readOnly} />
      </TabsContent>

      {/* Activité & rapports */}
      <TabsContent value="activite" className="mt-4 space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Rapports récents des officiers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.recentReports.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Aucun rapport publié.</p>
            ) : (
              data.recentReports.map((r) => (
                <div key={r.id} className="rounded-lg border p-3">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {r.periodLabel}
                    <Badge variant="outline">{r.officerOfficeRole ? (OFFICE_DEFS.find((d) => d.key === r.officerOfficeRole)?.label ?? r.officerOfficeRole) : "—"}</Badge>
                    <Badge variant="secondary">{r.tasksDoneCount} tâche(s)</Badge>
                    <span className="text-xs text-muted-foreground">{r.officerName}</span>
                  </p>
                  <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{r.realizations}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Activité récente des équipes</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentActivities.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Aucune activité.</p>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {data.recentActivities.map((a) => (
                  <div key={a.id} className="rounded-md border p-2 text-sm">
                    <span className="font-medium">{a.authorName}</span>
                    <span className="text-muted-foreground">
                      {" "}— {a.details ?? a.action} · {new Date(a.createdAt).toLocaleString("fr-FR")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function MembersList({
  members,
  onPatch,
  readOnly = false,
}: {
  members: AdminOfficeMember[];
  readOnly?: boolean;
  onPatch: (member: AdminOfficeMember, body: Record<string, unknown>, okTitle: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState<AdminOfficeMember | null>(null);

  if (members.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <ClipboardList className="size-10 text-muted-foreground" aria-hidden="true" />
          <p className="font-semibold">Aucun membre d&apos;office pour le moment</p>
          <p className="text-sm text-muted-foreground">
            Attribuez un premier poste depuis « Attribuer un office » ou depuis l&apos;onglet
            Utilisateurs (bouton « Poste » devant chaque nom).
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {members.map((m) => (
        <Card key={m.id} className="py-0">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {m.name}
                  <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
                    {m.officeRole ? (OFFICE_DEFS.find((d) => d.key === m.officeRole)?.label ?? m.officeRole) : "—"}
                  </Badge>
                  <OfficeStatusBadge active={m.officeStatus === "ACTIVE"} />
                  <span className="text-xs text-muted-foreground">compte {m.role}</span>
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{m.email}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {m.supervisorName
                    ? `Rattaché à ${m.supervisorName} (adjoint)`
                    : "Officier titulaire (sans adjoint rattaché)"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {readOnly ? (
                  <span className="text-xs text-muted-foreground">Lecture seule</span>
                ) : (
                  <>
                    <Button variant="outline" size="sm" className="h-9" onClick={() => setEditing(m)}>
                      Gérer le poste
                    </Button>
                    {m.officeStatus === "ACTIVE" ? (
                      <InlineConfirm
                        trigger={
                          <>
                            <ShieldOff className="size-4" aria-hidden="true" />
                            Suspendre l&apos;office
                          </>
                        }
                        triggerClassName="h-9"
                        confirmLabel="Confirmer"
                        pendingLabel="…"
                        warnText="L'espace professionnel sera bloqué ; le compte CLIENT/VENDEUR reste actif."
                        size="sm"
                        onConfirm={() => onPatch(m, { officeStatus: "SUSPENDED" }, "Office suspendu")}
                      />
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9"
                        onClick={() => onPatch(m, { officeStatus: "ACTIVE" }, "Office réactivé")}
                      >
                        <ShieldCheck className="size-4" aria-hidden="true" />
                        Réactiver l&apos;office
                      </Button>
                    )}
                    <InlineConfirm
                      trigger={
                        <>
                          <Trash2 className="size-4" aria-hidden="true" />
                          Retirer l&apos;office
                        </>
                      }
                      triggerClassName="h-9 text-destructive hover:text-destructive"
                      confirmLabel="Confirmer le retrait"
                      pendingLabel="…"
                      warnText="Le compte CLIENT/VENDEUR reste actif — seul l'espace professionnel est retiré."
                      size="sm"
                      onConfirm={() => onPatch(m, { revoke: true }, "Office retiré — le compte reste actif")}
                    />
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      {editing && <EditMemberDialog member={editing} onClose={() => setEditing(null)} onSaved={() => setEditing(null)} />}
    </div>
  );
}

function EditMemberDialog({
  member,
  onClose,
  onSaved,
}: {
  member: AdminOfficeMember;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [officeRole, setOfficeRole] = useState(member.officeRole ?? "GREFFIER");
  const [isAdjoint, setIsAdjoint] = useState(Boolean(member.supervisorId));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/admin/office/staff/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officeRole, isAdjoint }),
      });
      toast({ title: "Poste mis à jour" });
      onSaved();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Mise à jour impossible",
        description: err instanceof Error ? err.message : "Réessayez.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gérer le poste de {member.name}</DialogTitle>
          <DialogDescription>Le compte reste actif — seul l&apos;office change.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Office</Label>
            <Select value={officeRole} onValueChange={setOfficeRole}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OFFICE_DEFS.map((def) => (
                  <SelectItem key={def.key} value={def.key}>
                    {def.officeName} — {def.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isAdjoint}
              onChange={(e) => setIsAdjoint(e.target.checked)}
              className="size-4"
            />
            Adjoint (sans permission héritée)
          </label>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={onClose}>
            Annuler
          </Button>
          <Button className="h-11" disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

function AttributeOffice({
  onAttributed,
  existingEmails,
}: {
  onAttributed: () => void;
  existingEmails: string[];
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [officeRole, setOfficeRole] = useState("GREFFIER");
  const [isAdjoint, setIsAdjoint] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const exists = existingEmails.includes(email.trim().toLowerCase());

  const submit = async () => {
    if (!email.trim().includes("@")) {
      toast({ variant: "destructive", title: "Adresse email invalide" });
      return;
    }
    if (isAdjoint) {
      // L'adjoint doit être rattaché à un titulaire : on passe par le bouton
      // Poste de l'onglet Utilisateurs ou Gérer le poste pour choisir le
      // titulaire précis.
      toast({
        variant: "destructive",
        title: "Rattachement requis",
        description: "Pour un adjoint, utilisez « Gérer le poste » sur le membre (choix du titulaire).",
      });
      return;
    }
    setSaving(true);
    setTempPassword(null);
    try {
      const data = await apiFetch<{ tempPassword?: string }>("/api/admin/office/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || undefined,
          officeRole,
          isAdjoint: false,
        }),
      });
      toast({
        title: exists ? "Office attribué" : "Compte d'office créé",
        description: exists
          ? "La personne a été réellement notifiée."
          : "Transmettez le mot de passe provisoire à la personne — il n'apparaîtra plus.",
      });
      if (data.tempPassword) setTempPassword(data.tempPassword);
      setEmail("");
      setName("");
      onAttributed();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Attribution impossible",
        description: err instanceof Error ? err.message : "Réessayez.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="size-4 text-primary" aria-hidden="true" />
          Attribuer un office
        </CardTitle>
        <CardDescription>
          Compte existant : l&apos;office s&apos;ajoute (le rôle du compte ne change pas). Nouveau
          compte : il est créé CLIENT, pré-confirmé, avec mot de passe provisoire affiché une seule
          fois.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="staff-email">Email *</Label>
            <Input id="staff-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-name">Nom complet {exists ? "(existant)" : "(nouveau compte)"}</Label>
            <Input id="staff-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="h-11" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Office (poste) *</Label>
            <Select value={officeRole} onValueChange={setOfficeRole}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OFFICE_DEFS.map((def) => (
                  <SelectItem key={def.key} value={def.key}>
                    {def.officeName} — {def.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isAdjoint}
                onChange={(e) => setIsAdjoint(e.target.checked)}
                className="size-4"
                disabled={!OFFICE_DEFS.find((d) => d.key === officeRole)?.canHaveAdjoints}
              />
              Adjoint (rattachement au titulaire via « Gérer le poste »)
            </label>
          </div>
        </div>
        {tempPassword && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
            <span className="font-semibold">Mot de passe provisoire : </span>
            <code className="font-mono">{tempPassword}</code>
            <span className="mt-1 block text-xs text-muted-foreground">
              Notez-le maintenant : il n&apos;est JAMAIS journalisé ni réaffiché.
            </span>
          </p>
        )}
        <Button className="h-11" disabled={saving} onClick={() => void submit()}>
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
          {saving ? "Attribution…" : "Attribuer l'office"}
        </Button>
      </CardContent>
    </Card>
  );
}

function PendingValidations({
  items,
  onReviewed,
  readOnly = false,
}: {
  items: AdminOfficeOverview["pendingOwnerValidations"];
  readOnly?: boolean;
  onReviewed: () => void;
}) {
  const { toast } = useToast();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const review = async (id: string, approve: boolean) => {
    setBusyId(id);
    try {
      await apiFetch(`/api/admin/office/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve, note: notes[id] || undefined }),
      });
      toast({ title: approve ? "Travail validé" : "Travail renvoyé", description: "L'officier a été réellement notifié." });
      onReviewed();
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

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-sm text-muted-foreground">
          Aucun travail en attente de votre validation. Toutes les tâches des officiers sont traitées.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((t) => (
        <Card key={t.id} className="py-0">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{t.title}</p>
              <span className="text-xs text-muted-foreground">
                {t.assigneeName} ({t.officeRole ? (OFFICE_DEFS.find((d) => d.key === t.officeRole)?.label ?? t.officeRole) : "—"})
                {t.submittedAt ? ` · soumis le ${new Date(t.submittedAt).toLocaleDateString("fr-FR")}` : ""}
              </span>
            </div>
            {readOnly ? (
              <p className="mt-2 text-xs text-muted-foreground">Lecture seule — seule l&apos;autorité compétente peut valider.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Input
                  placeholder="Commentaire de validation (facultatif) / motif de renvoi (obligatoire)"
                  value={notes[t.id] ?? ""}
                  onChange={(e) => setNotes((prev) => ({ ...prev, [t.id]: e.target.value }))}
                  className="h-10 flex-1"
                  maxLength={1000}
                />
                <div className="flex gap-2">
                  <Button size="sm" className="h-10" disabled={busyId === t.id} onClick={() => void review(t.id, true)}>
                    <ShieldCheck className="size-3.5" aria-hidden="true" />
                    Valider
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-10"
                    disabled={busyId === t.id || (notes[t.id] ?? "").trim().length < 1}
                    onClick={() => void review(t.id, false)}
                  >
                    <Undo2 className="size-3.5" aria-hidden="true" />
                    Renvoyer
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function HelpRequests({
  requests,
  onResponded,
  readOnly = false,
}: {
  requests: AdminOfficeOverview["helpRequests"];
  readOnly?: boolean;
  onResponded: () => void;
}) {
  const { toast } = useToast();
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const send = async (id: string) => {
    setBusyId(id);
    try {
      await apiFetch(`/api/admin/office/help/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: responses[id] }),
      });
      toast({ title: "Réponse envoyée", description: "L'auteur de la demande a été notifié." });
      onResponded();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Envoi impossible",
        description: err instanceof Error ? err.message : "Réessayez.",
      });
    } finally {
      setBusyId(null);
    }
  };

  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <LifeBuoy className="size-10 text-muted-foreground" aria-hidden="true" />
          <p className="font-semibold">Aucune demande d&apos;aide</p>
          <p className="text-sm text-muted-foreground">Vos officiers n&apos;ont rien signalé pour l&apos;instant.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((r) => (
        <Card key={r.id} className="py-0">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              {r.confidential && (
                <Badge variant="outline" className="text-[10px]">Confidentiel</Badge>
              )}
              <Badge variant="secondary">{r.status}</Badge>
              <span className="text-xs text-muted-foreground">
                {HELP_CATEGORY_LABELS[r.category] ?? r.category} · {r.requesterName}
                {r.requesterOfficeRole ? ` (${OFFICE_DEFS.find((d) => d.key === r.requesterOfficeRole)?.label ?? r.requesterOfficeRole})` : ""} ·{" "}
                {new Date(r.createdAt).toLocaleString("fr-FR")}
              </span>
            </div>
            <p className="mt-2 font-medium">{r.subject}</p>
            <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">{r.message}</p>
            {r.response ? (
              <div className="mt-3 rounded-lg border border-teal-300 bg-teal-50 p-3 text-sm dark:border-teal-800 dark:bg-teal-950/40">
                <p className="font-medium">Réponse {r.respondedAt ? `— ${new Date(r.respondedAt).toLocaleString("fr-FR")}` : ""}</p>
                <p className="mt-1 whitespace-pre-wrap">{r.response}</p>
              </div>
            ) : readOnly ? (
              <p className="mt-3 text-xs text-muted-foreground">Lecture seule — le propriétaire répond aux demandes d&apos;aide.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Input
                  placeholder="Votre réponse à cette demande…"
                  value={responses[r.id] ?? ""}
                  onChange={(e) => setResponses((prev) => ({ ...prev, [r.id]: e.target.value }))}
                  className="h-10 flex-1"
                  maxLength={4000}
                />
                <Button size="sm" className="h-10" disabled={busyId === r.id || (responses[r.id] ?? "").trim().length < 1} onClick={() => void send(r.id)}>
                  Répondre
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TrainingManager({ onChanged, readOnly = false }: { onChanged: () => void; readOnly?: boolean }) {
  const { toast } = useToast();
  const [resources, setResources] = useState<AdminTrainingResource[] | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminTrainingResource | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ resources: AdminTrainingResource[] }>("/api/admin/office/training");
      setResources(data.resources);
    } catch (err) {
      setResources([]);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  const remove = async (id: string) => {
    try {
      await apiFetch(`/api/admin/office/training/${id}`, { method: "DELETE" });
      toast({ title: "Ressource mise à la corbeille", description: "Restaurable depuis l'onglet Corbeille." });
      await load();
      onChanged();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Suppression impossible",
        description: err instanceof Error ? err.message : "Réessayez.",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Instructions, procédures, guides et documents autorisés — publiés aux membres des offices ciblés (notification réelle).
        </p>
        {!readOnly && (
          <Button
            className="h-10"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Megaphone className="size-4" aria-hidden="true" />
            Publier une ressource
          </Button>
        )}
      </div>

      {resources === null ? (
        <Skeleton className="h-40 rounded-xl" aria-busy="true" />
      ) : resources.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Aucune ressource de formation publiée pour le moment.
          </CardContent>
        </Card>
      ) : (
        <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
          {resources.map((r) => (
            <div key={r.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
                    {TRAINING_CATEGORY_LABELS[r.category] ?? r.category}
                  </Badge>
                  <p className="font-medium">{r.title}</p>
                  {!r.active && <Badge variant="secondary">Inactive</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {r.officeRole
                    ? (OFFICE_DEFS.find((d) => d.key === r.officeRole)?.label ?? r.officeRole)
                    : "Commune à tous les offices"}{" "}
                  · actualisée le {new Date(r.updatedAt).toLocaleDateString("fr-FR")}
                </p>
                {r.body && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.body}</p>}
              </div>
              <div className="flex gap-2">
                {readOnly ? (
                  <span className="self-center text-xs text-muted-foreground">Lecture seule</span>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9"
                      onClick={() => {
                        setEditing(r);
                        setOpen(true);
                      }}
                    >
                      Actualiser
                    </Button>
                    <InlineConfirm
                      trigger={
                        <>
                          <Trash2 className="size-4" aria-hidden="true" />
                          Supprimer
                        </>
                      }
                      triggerVariant="ghost"
                      triggerClassName="h-9 text-destructive hover:text-destructive"
                      confirmLabel="Confirmer"
                      pendingLabel="…"
                      size="sm"
                      warnText="Cette ressource sera mise à la corbeille de l'administration (restaurable)."
                      onConfirm={() => void remove(r.id)}
                    />
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <TrainingDialog
          resource={editing}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setEditing(null);
          }}
          onSaved={() => {
            setOpen(false);
            setEditing(null);
            void load();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

// Dialogue de formation — rendu dans les DEUX modes (création ET édition) :
// les champs s'initialisent depuis la ressource en édition, et la validation
// « Contenu requis » est appliquée côté client comme côté serveur.
function TrainingDialog({
  resource,
  onOpenChange,
  onSaved,
}: {
  resource: AdminTrainingResource | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [officeRole, setOfficeRole] = useState(() => resource?.officeRole ?? "TOUS");
  const [title, setTitle] = useState(() => resource?.title ?? "");
  const [category, setCategory] = useState(() => resource?.category ?? "PROCEDURE");
  const [body, setBody] = useState(() => resource?.body ?? "");
  const [externalUrl, setExternalUrl] = useState(() => resource?.externalUrl ?? "");
  const [active, setActive] = useState(() => resource?.active ?? true);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (title.trim().length < 3) {
      toast({ variant: "destructive", title: "Titre requis", description: "3 caractères minimum." });
      return;
    }
    if (body.trim() === "" && externalUrl.trim() === "") {
      toast({
        variant: "destructive",
        title: "Contenu requis",
        description: "Rédigez un contenu (texte) ou fournissez un lien externe.",
      });
      return;
    }
    setSaving(true);
    try {
      if (resource) {
        await apiFetch(`/api/admin/office/training/${resource.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            category,
            body: body.trim() || null,
            externalUrl: externalUrl.trim() || null,
            officeRole: officeRole === "TOUS" ? null : officeRole,
            active,
          }),
        });
        toast({ title: "Ressource actualisée", description: "Les membres ciblés voient la nouvelle version." });
      } else {
        await apiFetch("/api/admin/office/training", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            category,
            body: body.trim() || null,
            externalUrl: externalUrl.trim() || null,
            officeRole: officeRole === "TOUS" ? null : officeRole,
          }),
        });
        toast({ title: "Ressource publiée", description: "Les membres de l'office ciblé ont été réellement notifiés." });
      }
      onSaved();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Enregistrement impossible",
        description: err instanceof Error ? err.message : "Réessayez.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{resource ? "Actualiser la ressource" : "Publier une ressource de formation"}</DialogTitle>
          <DialogDescription>
            {resource ? "Modifiez le contenu : la version est mise à jour pour tous." : "La ressource sera visible dans « Ma formation » des offices ciblés."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tr-title">Titre *</Label>
            <Input id="tr-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="h-11" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Catégorie</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TRAINING_CATEGORY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Office cible</Label>
              <Select value={officeRole} onValueChange={setOfficeRole}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TOUS">Tous les offices</SelectItem>
                  {OFFICE_DEFS.map((def) => (
                    <SelectItem key={def.key} value={def.key}>
                      {def.officeName} — {def.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tr-body">Contenu (texte)</Label>
            <Textarea id="tr-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={8000} className="min-h-32" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tr-url">OU lien externe autorisé</Label>
            <Input id="tr-url" value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} maxLength={500} className="h-11" placeholder="https://…" />
          </div>
          {resource && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4" />
              Ressource active (visible dans les espaces professionnels)
            </label>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button className="h-11" disabled={saving} onClick={() => void submit()}>
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {saving ? "Enregistrement…" : resource ? "Enregistrer les modifications" : "Publier la ressource"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
