"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Contact, Mail, MessageCircle, RefreshCw, Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatXOF } from "@/lib/format";
import { apiFetch } from "../lib/api-client";

type VendorClient = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  ordersCount: number;
  paidCount: number;
  totalSpentXOF: number;
  lastOrderAt: string;
};

type Segment = "ALL" | "LOYAL" | "FIRST_PURCHASE" | "PROSPECT";

function formatLastOrder(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date indisponible";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(date);
}

function whatsappHref(client: VendorClient, storeName: string): string {
  const message =
    client.paidCount > 0
      ? `Bonjour ${client.name}, merci pour votre confiance envers ${storeName}. Je reste à votre disposition pour vous conseiller et vous présenter les nouveautés de la boutique.`
      : `Bonjour ${client.name}, vous aviez commencé une commande auprès de ${storeName}. Avez-vous besoin d'aide pour finaliser votre achat ? Je reste à votre disposition.`;
  const phone = client.phone?.trim() ?? "";
  const digits = phone.replace(/\\D/g, "");
  const isInternational = /^\\s*(?:\\+|00)/.test(phone);
  const normalized = digits.startsWith("00") ? digits.slice(2) : digits;
  const recipient = isInternational && normalized.length >= 8 ? `/${normalized}` : "";
  return `https://wa.me${recipient}?text=${encodeURIComponent(message)}`;
}

function clientSegment(client: VendorClient): Segment {
  if (client.paidCount >= 2) return "LOYAL";
  if (client.paidCount === 1) return "FIRST_PURCHASE";
  return "PROSPECT";
}

export function ClientsTab({ storeName }: { storeName: string }) {
  const [clients, setClients] = useState<VendorClient[]>([]);
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<Segment>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<{ clients: VendorClient[] }>("/api/vendor/clients");
      setClients(data.clients);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Impossible de charger vos clients.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => ({
    customers: clients.length,
    paying: clients.filter((client) => client.paidCount > 0).length,
    loyal: clients.filter((client) => client.paidCount >= 2).length,
    revenueXOF: clients.reduce((sum, client) => sum + client.totalSpentXOF, 0),
  }), [clients]);

  const filteredClients = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr");
    return clients.filter((client) => {
      const matchesSearch =
        !query ||
        client.name.toLocaleLowerCase("fr").includes(query) ||
        client.email.toLocaleLowerCase("fr").includes(query) ||
        (client.phone ?? "").toLocaleLowerCase("fr").includes(query);
      const matchesSegment = segment === "ALL" || clientSegment(client) === segment;
      return matchesSearch && matchesSegment;
    });
  }, [clients, search, segment]);

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" onClick={() => { setLoading(true); void load(); }}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Réessayer
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <Contact className="size-5 text-primary" aria-hidden="true" />
          <h2 className="text-xl font-semibold tracking-tight">Gestion des clients</h2>
          <Badge variant="secondary">CRM</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Retrouvez les personnes qui ont commandé dans votre boutique et reprenez contact directement.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Clients enregistrés</p>
              <p className="text-xl font-semibold tabular-nums">{totals.customers}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Contact className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Clients ayant payé</p>
              <p className="text-xl font-semibold tabular-nums">{totals.paying}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <RefreshCw className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Clients fidèles</p>
              <p className="text-xl font-semibold tabular-nums">{totals.loyal}</p>
              <p className="text-xs text-muted-foreground">Au moins 2 achats payés</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <span className="text-sm font-bold">XOF</span>
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Dépenses cumulées</p>
              <p className="truncate text-xl font-semibold tabular-nums">{formatXOF(totals.revenueXOF)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">Votre portefeuille clients</CardTitle>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                className="h-11 pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher par nom, email ou téléphone…"
                aria-label="Rechercher un client"
              />
            </div>
            <select
              className="h-11 rounded-md border bg-background px-3 text-sm"
              value={segment}
              onChange={(event) => setSegment(event.target.value as Segment)}
              aria-label="Filtrer les clients"
            >
              <option value="ALL">Tous les clients</option>
              <option value="LOYAL">Clients fidèles</option>
              <option value="FIRST_PURCHASE">Un achat payé</option>
              <option value="PROSPECT">Aucun achat payé</option>
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            {filteredClients.length} client(s) affiché(s) sur {clients.length}. Les montants comptabilisent uniquement les commandes payées ou livrées.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {filteredClients.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="font-medium">{clients.length === 0 ? "Aucun client pour le moment" : "Aucun résultat"}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {clients.length === 0
                  ? "Les clients apparaîtront ici dès qu'une commande sera créée dans votre boutique."
                  : "Modifiez votre recherche ou choisissez un autre segment."}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {filteredClients.map((client) => {
                const kind = clientSegment(client);
                const badgeLabel = kind === "LOYAL" ? "Client fidèle" : kind === "FIRST_PURCHASE" ? "Premier achat payé" : "À convertir";
                return (
                  <div key={client.id} className="rounded-xl border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{client.name}</p>
                        <p className="mt-0.5 break-all text-sm text-muted-foreground">{client.email}</p>
                        {client.phone && <p className="mt-0.5 text-xs text-muted-foreground">{client.phone}</p>}
                      </div>
                      <Badge variant={kind === "LOYAL" ? "default" : "secondary"}>{badgeLabel}</Badge>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Commandes</p>
                        <p className="font-medium tabular-nums">{client.ordersCount} au total · {client.paidCount} payée(s)</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Dépenses payées</p>
                        <p className="font-medium tabular-nums">{formatXOF(client.totalSpentXOF)}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground">Dernière commande</p>
                        <p className="font-medium">{formatLastOrder(client.lastOrderAt)}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline">
                        <a href={`mailto:${encodeURIComponent(client.email)}?subject=${encodeURIComponent(`Votre boutique ${storeName}`)}`}>
                          <Mail className="size-4" aria-hidden="true" />
                          Email
                        </a>
                      </Button>
                      {client.phone && (
                        <Button asChild size="sm" variant="outline">
                          <a href={whatsappHref(client, storeName)} target="_blank" rel="noopener noreferrer">
                            <MessageCircle className="size-4" aria-hidden="true" />
                            WhatsApp
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
