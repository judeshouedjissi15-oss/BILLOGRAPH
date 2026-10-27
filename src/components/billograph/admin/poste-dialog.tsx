"use client";

// DIALOGUE « POSTE » — attribuer/changer l'office d'un utilisateur (Task 41 :
// le bouton Poste devant le nom dans l'onglet Utilisateurs). Le rôle du COMPTE
// ne change jamais : l'espace professionnel s'ajoute. Plafond réel côté
// serveur : 5 membres actifs par office. Adjoints rattachés à un titulaire.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "../lib/api-client";
import { OFFICE_DEFS, MAX_ADJOINTS_PER_ROLE } from "@/lib/offices";
import type { AdminUser } from "@/types/api";

type StaffResponse = {
  members: AdminUser[];
  capacities: { key: string; active: number }[];
  maxAdjoints: number;
};

export function PosteDialog({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [officeRole, setOfficeRole] = useState(user.officeRole ?? "GREFFIER");
  const [isAdjoint, setIsAdjoint] = useState(Boolean(user.supervisorId));
  const [supervisorId, setSupervisorId] = useState(user.supervisorId ?? "");
  const [members, setMembers] = useState<AdminUser[]>([]);
  const [capacities, setCapacities] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<StaffResponse>("/api/admin/office/staff")
      .then((d) => {
        setMembers(d.members);
        const map: Record<string, number> = {};
        for (const c of d.capacities) map[c.key] = c.active;
        setCapacities(map);
      })
      .catch(() => {
        setMembers([]);
      });
  }, []);

  const titulaires = members.filter(
    (m) => m.officeRole === officeRole && m.officeStatus === "ACTIVE" && !m.supervisorId && m.id !== user.id,
  );

  const save = async () => {
    setSaving(true);
    try {
      if (user.officeRole) {
        // Le compte porte déjà un office : mise à jour (poste / adjoint).
        await apiFetch(`/api/admin/office/staff/${user.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            officeRole,
            isAdjoint,
            supervisorId: isAdjoint ? supervisorId || undefined : undefined,
          }),
        });
      } else {
        // Premier office du compte : attribution via la création staff.
        await apiFetch("/api/admin/office/staff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email,
            officeRole,
            isAdjoint,
            supervisorId: isAdjoint ? supervisorId || undefined : undefined,
          }),
        });
      }
      toast({ title: "Poste enregistré", description: `${user.name} — ${OFFICE_DEFS.find((d) => d.key === officeRole)?.label ?? officeRole}.` });
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Poste de {user.name}</DialogTitle>
          <DialogDescription>
            Attribuez un office à ce compte. Son rôle ({user.role}) ne change pas : l&apos;espace
            professionnel s&apos;ajoute au compte, qui reste pleinement actif. Plafond :{" "}
            {MAX_ADJOINTS_PER_ROLE} membres actifs par office.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Office (poste)</Label>
            <Select value={officeRole} onValueChange={setOfficeRole}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OFFICE_DEFS.map((def) => (
                  <SelectItem key={def.key} value={def.key}>
                    {def.officeName} — {def.label}
                    {capacities[def.key] !== undefined ? ` (${capacities[def.key]}/${MAX_ADJOINTS_PER_ROLE})` : ""}
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
              disabled={!OFFICE_DEFS.find((d) => d.key === officeRole)?.canHaveAdjoints}
            />
            Adjoint (rattaché à l&apos;officier titulaire — n&apos;hérite d&apos;aucune permission)
          </label>
          {isAdjoint && (
            <div className="space-y-1.5">
              <Label>Officier titulaire</Label>
              <Select value={supervisorId || undefined} onValueChange={setSupervisorId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Choisir le titulaire" />
                </SelectTrigger>
                <SelectContent>
                  {titulaires.length === 0 ? (
                    <SelectItem value="__aucun__" disabled>
                      Aucun titulaire actif pour cet office
                    </SelectItem>
                  ) : (
                    titulaires.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name} ({m.email})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
          {user.officeRole && (
            <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              Ce compte porte déjà l&apos;office « {OFFICE_DEFS.find((d) => d.key === user.officeRole)?.label ?? user.officeRole} ».
              L&apos;enregistrement mettra le poste à jour.
            </p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={onClose}>
            Annuler
          </Button>
          <Button className="h-11" disabled={saving || (isAdjoint && !supervisorId)} onClick={() => void save()}>
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {saving ? "Enregistrement…" : "Enregistrer le poste"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
