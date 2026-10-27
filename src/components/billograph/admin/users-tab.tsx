"use client";

// Onglet "Utilisateurs" de l'espace admin : recherche, changement de rôle,
// suspension/activation (avec auto-protection côté serveur).

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck as ShieldIcon, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, apiUrl } from "../lib/api-client";
import { navigateTo } from "../lib/use-hash-route";
import { Briefcase, ShieldBan, ShieldCheck } from "lucide-react";
import { useDebouncedValue } from "../lib/use-debounced-value";
import { InlineConfirm } from "../inline-confirm";
import { formatDate } from "@/lib/format";
import { OFFICE_DEFS, MAX_ADJOINTS_PER_ROLE } from "@/lib/offices";
import type { AdminUser, Role } from "@/types/api";
import { PosteDialog } from "./poste-dialog";

type UsersTabProps = {
  currentUserId: string;
  /** Lecture seule (greffier) : consultation sans aucune action. */
  readOnly?: boolean;
};

// Le rôle ADMIN n'est PAS attribuable depuis l'interface ni l'API :
// le compte propriétaire est le seul administrateur (désigné en base).
const ASSIGNABLE_ROLES: Role[] = ["CLIENT", "VENDEUR"];

const ROLE_LABELS: Record<Role, string> = {
  CLIENT: "Client",
  VENDEUR: "Vendeur",
  ADMIN: "Administrateur",
};

export function UsersTab({ currentUserId, readOnly = false }: UsersTabProps) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 300);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [posteUser, setPosteUser] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<{ users: AdminUser[] }>(
        apiUrl("/api/admin/users", { q: debouncedQ.trim() || undefined }),
      );
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les utilisateurs.");
    } finally {
      setLoading(false);
    }
  }, [debouncedQ]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const patchUser = async (
    user: AdminUser,
    body: { role?: Role; status?: "ACTIVE" | "SUSPENDED" },
    successTitle: string,
  ) => {
    setBusyId(user.id);
    try {
      const data = await apiFetch<{ user: AdminUser }>(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, ...data.user } : u)));
      toast({ title: successTitle });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Action impossible",
        description: error instanceof Error ? error.message : "Réessayez dans un instant.",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="admin-users-search">Rechercher un utilisateur</Label>
          <Input
            id="admin-users-search"
            type="search"
            placeholder="Nom ou email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-11"
          />
        </div>
        <p className="text-sm text-muted-foreground sm:pb-3">{users.length} compte(s)</p>
      </div>

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" onClick={() => void load()}>
              Réessayer
            </Button>
          </CardContent>
        </Card>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <Users className="size-10 text-muted-foreground" aria-hidden="true" />
            <p className="font-semibold">Aucun utilisateur trouvé</p>
            <p className="text-sm text-muted-foreground">Modifiez votre recherche.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0">
          <CardContent className="p-0">
            <div className="max-h-96 overflow-y-auto overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Utilisateur</TableHead>
                    <TableHead>Rôle</TableHead>
                    <TableHead>Poste (office)</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Boutique</TableHead>
                    <TableHead>Inscription</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => {
                    const isSelf = user.id === currentUserId;
                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <p className="max-w-40 truncate font-medium">{user.name}</p>
                          <p className="max-w-40 truncate text-xs text-muted-foreground">
                            {user.email}
                          </p>
                        </TableCell>
                        <TableCell>
                          {user.role === "ADMIN" ? (
                            <Badge
                              variant="outline"
                              className="border-primary/30 bg-primary/5 text-primary"
                            >
                              <ShieldIcon className="size-3" aria-hidden="true" />
                              {ROLE_LABELS[user.role]}
                            </Badge>
                          ) : (
                            <Select
                              value={user.role}
                              disabled={isSelf || busyId === user.id || readOnly}
                              onValueChange={(value) =>
                                void patchUser(
                                  user,
                                  { role: value as Role },
                                  `Rôle mis à jour : ${ROLE_LABELS[value as Role]}`,
                                )
                              }
                            >
                              <SelectTrigger
                                className="h-9 w-32"
                                aria-label={`Rôle de ${user.name}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ASSIGNABLE_ROLES.map((role) => (
                                  <SelectItem key={role} value={role}>
                                    {ROLE_LABELS[role]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell>
                          {/* POSTE (office) — le bouton se trouve DEVANT le nom */}
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 shrink-0"
                              disabled={user.role === "ADMIN" || readOnly}
                              onClick={() => setPosteUser(user)}
                              aria-label={`Choisir le poste de ${user.name}`}
                            >
                              <Briefcase className="size-3.5" aria-hidden="true" />
                              Poste
                            </Button>
                            {user.officeRole ? (
                              <span className="text-xs font-medium">
                                {OFFICE_DEFS.find((d) => d.key === user.officeRole)?.label ?? user.officeRole}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {user.status === "ACTIVE" ? (
                            <Badge
                              variant="outline"
                              className="border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                            >
                              Actif
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-red-300 bg-red-100 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                              Suspendu
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {user.storeSlug ? (
                            <button
                              type="button"
                              className="text-sm text-primary hover:underline"
                              onClick={() => navigateTo(`#/boutique/${user.storeSlug}`)}
                            >
                              /{user.storeSlug}
                            </button>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {formatDate(user.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            {readOnly ? (
                              <span className="text-xs text-muted-foreground">Lecture seule</span>
                            ) : user.role === "ADMIN" ? (
                              <span className="text-xs text-muted-foreground">
                                Protégé
                              </span>
                            ) : user.status === "ACTIVE" ? (
                              <InlineConfirm
                                trigger={
                                  <>
                                    <ShieldBan className="size-4" aria-hidden="true" />
                                    Suspendre
                                  </>
                                }
                                triggerClassName="h-9"
                                confirmLabel="Confirmer la suspension"
                                pendingLabel="Traitement…"
                                warnText="La personne ne pourra plus se connecter."
                                busy={busyId === user.id}
                                onConfirm={() =>
                                  patchUser(user, { status: "SUSPENDED" }, "Compte suspendu")
                                }
                              />
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-9"
                                disabled={busyId === user.id}
                                onClick={() =>
                                  void patchUser(user, { status: "ACTIVE" }, "Compte réactivé")
                                }
                              >
                                <ShieldCheck className="size-4" aria-hidden="true" />
                                Réactiver
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {posteUser && (
        <PosteDialog
          user={posteUser}
          onClose={() => setPosteUser(null)}
          onSaved={() => {
            setPosteUser(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
