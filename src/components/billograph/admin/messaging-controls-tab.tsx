"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Save, ShieldBan } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "../lib/api-client";

type MessagingSettings = {
  enabled: boolean;
  retentionDays: number;
  stats: { users: number; friendships: number; conversations: number; messages: number; openReports: number; suspendedUsers: number };
};
type AdminUser = { id: string; name: string; email: string };

export function MessagingControlsTab({ readOnly = false }: { readOnly?: boolean }) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<MessagingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [user, setUser] = useState<AdminUser | null>(null);
  const [hours, setHours] = useState("24");
  const [reason, setReason] = useState("");
  const [controlBusy, setControlBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setSettings(await apiFetch<MessagingSettings>("/api/admin/messaging-settings"));
    } catch (err) {
      toast({ variant: "destructive", title: "Réglages de messagerie indisponibles", description: err instanceof Error ? err.message : "Réessayez." });
    } finally {
      setLoading(false);
    }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const save = async (patch: Partial<Pick<MessagingSettings, "enabled" | "retentionDays">>) => {
    if (!settings) return;
    setSaving(true);
    try {
      const result = await apiFetch<Pick<MessagingSettings, "enabled" | "retentionDays">>("/api/admin/messaging-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      setSettings({ ...settings, ...result });
      toast({ title: "Réglages de messagerie enregistrés" });
    } catch (err) {
      toast({ variant: "destructive", title: "Enregistrement impossible", description: err instanceof Error ? err.message : "Réessayez." });
    } finally {
      setSaving(false);
    }
  };

  const findUser = async () => {
    if (query.trim().length < 2) return;
    try {
      const result = await apiFetch<{ users: AdminUser[] }>(`/api/admin/users?q=${encodeURIComponent(query.trim())}`);
      setUser(result.users.find((item) => item.email.toLowerCase() === query.trim().toLowerCase()) ?? result.users[0] ?? null);
      if (!result.users.length) toast({ title: "Aucun utilisateur trouvé" });
    } catch (err) {
      toast({ variant: "destructive", title: "Recherche impossible", description: err instanceof Error ? err.message : "Réessayez." });
    }
  };

  const controlUser = async (action: "suspend" | "restore") => {
    if (!user) return;
    setControlBusy(true);
    try {
      await apiFetch(`/api/admin/users/${user.id}/messaging`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "suspend"
          ? { action, hours: Number(hours), reason }
          : { action }),
      });
      toast({ title: action === "suspend" ? "Messagerie suspendue" : "Accès à la messagerie rétabli" });
      setUser(null);
      setQuery("");
      setReason("");
      await load();
    } catch (err) {
      toast({ variant: "destructive", title: "Action impossible", description: err instanceof Error ? err.message : "Réessayez." });
    } finally {
      setControlBusy(false);
    }
  };

  if (loading) return <Skeleton className="h-80 rounded-xl" aria-busy="true" />;
  if (!settings) return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Les réglages ne sont pas disponibles.</CardContent></Card>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MessageCircle className="size-5 text-primary" aria-hidden="true" />Messagerie BILLOGRAPH</CardTitle>
          <CardDescription>Interrupteur global, conservation et indicateurs. Les messages qui dépassent la durée seront purgés au prochain accès à la messagerie; les signalements ouverts sont conservés pour examen.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {Object.entries({
              "Membres actifs": settings.stats.users,
              "Amis": settings.stats.friendships,
              "Conversations": settings.stats.conversations,
              "Messages": settings.stats.messages,
              "Signalements ouverts": settings.stats.openReports,
              "Suspensions": settings.stats.suspendedUsers,
            }).map(([label, count]) => <div key={label} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{count}</p></div>)}
          </div>
          <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div><Label htmlFor="messaging-enabled">Activer la messagerie</Label><p className="mt-1 text-xs text-muted-foreground">Désactive immédiatement les routes de messagerie pour tous les membres.</p></div>
            <Switch id="messaging-enabled" checked={settings.enabled} disabled={readOnly || saving} onCheckedChange={(enabled) => void save({ enabled })} />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2"><Label htmlFor="message-retention">Conservation (jours)</Label><Input id="message-retention" type="number" min={30} max={3650} value={settings.retentionDays} disabled={readOnly || saving} onChange={(event) => setSettings({ ...settings, retentionDays: Number(event.target.value) })} className="w-40" /></div>
            {!readOnly && <Button disabled={saving || settings.retentionDays < 30 || settings.retentionDays > 3650} onClick={() => void save({ retentionDays: settings.retentionDays })}><Save className="size-4" />Enregistrer</Button>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldBan className="size-5 text-primary" aria-hidden="true" />Suspension individuelle</CardTitle>
          <CardDescription>Recherchez un membre par nom ou email, puis suspendez temporairement sa capacité à envoyer et consulter des messages. Chaque action est auditée.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void findUser(); }} placeholder="Nom ou email (min. 2 caractères)" className="max-w-md" />
            <Button type="button" variant="outline" disabled={readOnly || query.trim().length < 2} onClick={() => void findUser()}>Rechercher</Button>
          </div>
          {user && (
            <div className="space-y-3 rounded-lg border p-4">
              <p className="text-sm font-medium">{user.name} · {user.email}</p>
              <div className="grid gap-3 sm:grid-cols-[150px_1fr_auto]">
                <div className="space-y-2"><Label htmlFor="suspension-hours">Durée (heures)</Label><Input id="suspension-hours" type="number" min={1} max={720} value={hours} onChange={(event) => setHours(event.target.value)} disabled={readOnly} /></div>
                <div className="space-y-2"><Label htmlFor="suspension-reason">Motif de modération</Label><Input id="suspension-reason" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} disabled={readOnly} /></div>
                <Button className="self-end" variant="destructive" disabled={readOnly || controlBusy || Number(hours) < 1 || Number(hours) > 720 || reason.trim().length < 5} onClick={() => void controlUser("suspend")}>{controlBusy ? "…" : "Suspendre"}</Button>
              </div>
              {!readOnly && <Button type="button" variant="outline" disabled={controlBusy} onClick={() => void controlUser("restore")}>Rétablir l&apos;accès</Button>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
