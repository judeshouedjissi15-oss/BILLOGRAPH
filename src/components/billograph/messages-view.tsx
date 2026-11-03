"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Archive,
  Check,
  MessageCircle,
  MessageSquareText,
  MoreHorizontal,
  Search,
  Send,
  ShieldBan,
  UserPlus,
  UserRound,
  UserRoundCheck,
  UserRoundX,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, apiUrl } from "./lib/api-client";
import { useDebouncedValue } from "./lib/use-debounced-value";
import type { User } from "@/types/api";

type PublicUser = Pick<User, "id" | "name" | "avatarUrl" | "headline" | "city">;
type Friend = {
  user: PublicUser;
  conversationId: string | null;
  hidden: boolean;
  unreadCount: number;
  lastMessage: { content: string; createdAt: string; senderId: string } | null;
};
type FriendRequest = { id: string; createdAt: string; user: PublicUser };
type ChatMessage = {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
  readAt: string | null;
  deleted: boolean;
  reported: boolean;
};
type MessagesData = {
  friends: Friend[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  blockedUsers: PublicUser[];
  searchResults: PublicUser[];
  unreadCount: number;
};

const EMPTY_DATA: MessagesData = {
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  blockedUsers: [],
  searchResults: [],
  unreadCount: 0,
};

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase() || "?";
}

function MemberAvatar({ member, size = "size-10" }: { member: PublicUser; size?: string }) {
  return (
    <Avatar className={size}>
      {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt="" /> : null}
      <AvatarFallback>{initials(member.name)}</AvatarFallback>
    </Avatar>
  );
}

export function MessagesView({ currentUser }: { currentUser: User }) {
  const { toast } = useToast();
  const [data, setData] = useState<MessagesData>(EMPTY_DATA);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 300);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const lastRenderedMessageId = useRef<string | null>(null);
  const messageConversationId = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<MessagesData>(apiUrl("/api/messages", { q: debouncedQuery.trim() }));
      setData(result);
      setLoading(false);
    } catch (err) {
      setLoading(false);
      toast({
        variant: "destructive",
        title: "Messagerie indisponible",
        description: err instanceof Error ? err.message : "Réessayez.",
      });
    }
  }, [debouncedQuery, toast]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 15_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const selectedFriend = useMemo(
    () => data.friends.find((friend) => friend.user.id === selectedId) ?? null,
    [data.friends, selectedId],
  );
  const conversationId = selectedFriend?.conversationId ?? null;

  const loadMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      setHasMoreMessages(false);
      messageConversationId.current = null;
      lastRenderedMessageId.current = null;
      return;
    }
    try {
      if (messageConversationId.current !== conversationId) {
        messageConversationId.current = conversationId;
        setMessages([]);
        setHasMoreMessages(false);
        lastRenderedMessageId.current = null;
      }
      const result = await apiFetch<{ messages: ChatMessage[]; hasMore: boolean }>(`/api/messages/${conversationId}`);
      if (messageConversationId.current !== conversationId) return;
      setMessages((previous) => {
        const merged = new Map(previous.map((message) => [message.id, message]));
        for (const message of result.messages) merged.set(message.id, message);
        return [...merged.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      });
      setHasMoreMessages(result.hasMore);
      const lastMessageId = result.messages.at(-1)?.id ?? null;
      if (lastMessageId && lastMessageId !== lastRenderedMessageId.current) {
        const isFirstLoad = lastRenderedMessageId.current === null;
        lastRenderedMessageId.current = lastMessageId;
        requestAnimationFrame(() => endOfMessagesRef.current?.scrollIntoView({
          behavior: isFirstLoad ? "auto" : "smooth",
          block: "end",
        }));
      }
    } catch (err) {
      if (err && typeof err === "object" && "status" in err && (err.status === 404 || err.status === 403)) {
        setSelectedId(null);
        await load();
        return;
      }
      toast({
        variant: "destructive",
        title: "Conversation indisponible",
        description: err instanceof Error ? err.message : "Réessayez.",
      });
    }
  }, [conversationId, load, toast]);

  const loadOlderMessages = async () => {
    if (!conversationId || !messages.length || loadingOlder || !hasMoreMessages) return;
    setLoadingOlder(true);
    try {
      const before = encodeURIComponent(messages[0].id);
      const result = await apiFetch<{ messages: ChatMessage[]; hasMore: boolean }>(
        `/api/messages/${conversationId}?before=${before}`,
      );
      setMessages((previous) => {
        const merged = new Map(result.messages.map((message) => [message.id, message]));
        for (const message of previous) merged.set(message.id, message);
        return [...merged.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      });
      setHasMoreMessages(result.hasMore);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Anciens messages indisponibles",
        description: err instanceof Error ? err.message : "Réessayez.",
      });
    } finally {
      setLoadingOlder(false);
    }
  };

  const hideConversation = async () => {
    if (!conversationId) return;
    try {
      await apiFetch(`/api/messages/${conversationId}`, { method: "DELETE" });
      setSelectedId(null);
      await load();
      toast({ title: "Conversation masquée" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Masquage impossible",
        description: err instanceof Error ? err.message : "Réessayez.",
      });
    }
  };

  const openConversation = async (friend: Friend) => {
    if (friend.conversationId) {
      setSelectedId(friend.user.id);
      return;
    }
    try {
      await apiFetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "open", targetUserId: friend.user.id }),
      });
      setSelectedId(friend.user.id);
      await load();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Conversation indisponible",
        description: err instanceof Error ? err.message : "Réessayez.",
      });
    }
  };

  useEffect(() => {
    void loadMessages();
    const timer = window.setInterval(() => {
      if (!document.hidden) void loadMessages();
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [loadMessages]);

  const postAction = async (payload: Record<string, string>, success: string): Promise<boolean> => {
    try {
      await apiFetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      toast({ title: success });
      await load();
      return true;
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Action impossible",
        description: err instanceof Error ? err.message : "Réessayez.",
      });
      return false;
    }
  };

  const sendMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!conversationId || !draft.trim() || sending) return;
    setSending(true);
    try {
      await apiFetch(`/api/messages/${conversationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft }),
      });
      setDraft("");
      await Promise.all([loadMessages(), load()]);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Message non envoyé",
        description: err instanceof Error ? err.message : "Réessayez.",
      });
    } finally {
      setSending(false);
    }
  };

  const submitReport = async () => {
    if (!reportId || reportReason.trim().length < 5) return;
    try {
      await apiFetch("/api/messages/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: reportId, reason: reportReason.trim() }),
      });
      setMessages((previous) => previous.map((message) => message.id === reportId ? { ...message, reported: true } : message));
      setReportId(null);
      setReportReason("");
      toast({ title: "Signalement transmis à l’administration" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Signalement impossible",
        description: err instanceof Error ? err.message : "Réessayez.",
      });
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <MessageCircle className="size-6 text-primary" aria-hidden="true" />
          Messages
          {data.unreadCount > 0 && <Badge>{data.unreadCount} non lu(s)</Badge>}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Retrouvez des membres, ajoutez des amis et échangez directement sur BILLOGRAPH.
        </p>
      </div>

      <div className="grid min-h-[620px] gap-4 lg:grid-cols-[350px_minmax(0,1fr)]">
        <Card className={selectedFriend ? "hidden lg:flex lg:flex-col" : "flex flex-col"}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Amis et demandes</CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                className="pl-9"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher par nom, activité ou ville"
                aria-label="Rechercher des membres"
              />
            </div>
            {query.trim().length > 0 && query.trim().length < 2 && (
              <CardDescription>Saisissez au moins 2 caractères.</CardDescription>
            )}
          </CardHeader>
          <CardContent className="flex-1 space-y-5 overflow-y-auto">
            {data.incomingRequests.length > 0 && (
              <section className="space-y-2" aria-label="Demandes reçues">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Demandes reçues ({data.incomingRequests.length})
                </h2>
                {data.incomingRequests.map((request) => (
                  <div key={request.id} className="flex items-center gap-2 rounded-lg border p-2">
                    <MemberAvatar member={request.user} size="size-9" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{request.user.name}</span>
                    <Button size="icon" variant="ghost" aria-label={`Accepter ${request.user.name}`} onClick={() => void postAction({ action: "accept", requestId: request.id }, "Demande acceptée")}>
                      <UserRoundCheck className="size-4 text-primary" />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label={`Refuser ${request.user.name}`} onClick={() => void postAction({ action: "reject", requestId: request.id }, "Demande refusée")}>
                      <UserRoundX className="size-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </section>
            )}

            {data.searchResults.length > 0 && (
              <section className="space-y-2" aria-label="Résultats de recherche">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Membres</h2>
                {data.searchResults.map((member) => (
                  <div key={member.id} className="flex items-center gap-2 rounded-lg border p-2">
                    <MemberAvatar member={member} size="size-9" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{member.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{member.headline || member.city || "Membre BILLOGRAPH"}</p>
                    </div>
                    <Button size="icon" variant="ghost" aria-label={`Ajouter ${member.name}`} onClick={() => void postAction({ action: "request", targetUserId: member.id }, "Demande d’ami envoyée")}>
                      <UserPlus className="size-4" />
                    </Button>
                  </div>
                ))}
              </section>
            )}

            {data.outgoingRequests.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  En attente ({data.outgoingRequests.length})
                </h2>
                {data.outgoingRequests.map((request) => (
                  <div key={request.id} className="flex items-center gap-2 rounded-lg bg-muted/50 p-2">
                    <MemberAvatar member={request.user} size="size-8" />
                    <span className="truncate text-sm">{request.user.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">En attente</span>
                  </div>
                ))}
              </section>
            )}

            {debouncedQuery.trim().length >= 2 && data.searchResults.length === 0 && (
              <p className="text-sm text-muted-foreground">Aucun nouveau membre trouvé.</p>
            )}

            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Mes amis ({data.friends.length})
              </h2>
              {loading ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Chargement…</p>
              ) : data.friends.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Aucun ami pour le moment. Recherchez un membre pour lui envoyer une invitation.
                </p>
              ) : (
                data.friends.map((friend) => (
                  <button
                    key={friend.user.id}
                    type="button"
                    onClick={() => void openConversation(friend)}
                    className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent ${selectedId === friend.user.id ? "border-primary bg-primary/5" : ""}`}
                  >
                    <MemberAvatar member={friend.user} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{friend.user.name}</span>
                        {friend.unreadCount > 0 && <Badge className="h-5 px-1.5 text-[10px]">{friend.unreadCount}</Badge>}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {friend.hidden ? "Conversation masquée — ouvrir" : friend.lastMessage?.content ?? "Commencer une conversation"}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </section>

            {data.blockedUsers.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Utilisateurs bloqués</h2>
                {data.blockedUsers.map((member) => (
                  <div key={member.id} className="flex items-center gap-2 text-sm">
                    <MemberAvatar member={member} size="size-8" />
                    <span className="min-w-0 flex-1 truncate">{member.name}</span>
                    <Button variant="ghost" size="sm" onClick={() => void postAction({ action: "unblock", targetUserId: member.id }, "Utilisateur débloqué")}>Débloquer</Button>
                  </div>
                ))}
              </section>
            )}
          </CardContent>
        </Card>

        <Card className={selectedFriend ? "flex min-h-[620px] flex-col" : "hidden min-h-[620px] flex-col lg:flex"}>
          {selectedFriend && conversationId ? (
            <>
              <CardHeader className="flex flex-row items-center gap-3 border-b py-3">
                <Button className="lg:hidden" size="icon" variant="ghost" aria-label="Retour à la liste" onClick={() => setSelectedId(null)}>
                  <ArrowLeft className="size-4" />
                </Button>
                <MemberAvatar member={selectedFriend.user} />
                <div className="min-w-0 flex-1">
                  <CardTitle className="truncate text-base">{selectedFriend.user.name}</CardTitle>
                  <CardDescription className="truncate">{selectedFriend.user.headline || selectedFriend.user.city || "Ami BILLOGRAPH"}</CardDescription>
                </div>
                <Button variant="ghost" size="icon" aria-label="Bloquer cet utilisateur" title="Bloquer" onClick={() => void postAction({ action: "block", targetUserId: selectedFriend.user.id }, "Utilisateur bloqué").then((success) => { if (success) setSelectedId(null); })}>
                  <ShieldBan className="size-4 text-destructive" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Retirer cet ami" title="Retirer cet ami" onClick={() => void postAction({ action: "remove", targetUserId: selectedFriend.user.id }, "Ami retiré").then((success) => { if (success) setSelectedId(null); })}>
                  <MoreHorizontal className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Masquer cette conversation" title="Masquer la conversation" onClick={() => void hideConversation()}>
                  <Archive className="size-4" />
                </Button>
              </CardHeader>
              <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
                {hasMoreMessages && (
                  <div className="flex justify-center">
                    <Button type="button" variant="outline" size="sm" disabled={loadingOlder} onClick={() => void loadOlderMessages()}>
                      {loadingOlder ? "Chargement…" : "Charger les anciens messages"}
                    </Button>
                  </div>
                )}
                {messages.length === 0 ? (
                  <div className="flex h-full min-h-48 flex-col items-center justify-center text-center text-muted-foreground">
                    <MessageSquareText className="mb-3 size-8" />
                    <p className="font-medium">Votre conversation commence ici</p>
                    <p className="mt-1 text-sm">Envoyez un premier message à {selectedFriend.user.name}.</p>
                  </div>
                ) : (
                  messages.map((message) => {
                    const mine = message.senderId === currentUser.id;
                    return (
                      <div key={message.id} className={`group flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                          <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
                          <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] opacity-70">
                            <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</time>
                            {mine && message.readAt && <Check className="size-3" aria-label="Lu" />}
                            {!mine && !message.deleted && !message.reported && (
                              <button type="button" className="underline" onClick={() => { setReportId(message.id); setReportReason(""); }}>
                                Signaler
                              </button>
                            )}
                          </div>
                          {reportId === message.id && (
                            <div className="mt-2 space-y-2 rounded-md border border-background/30 p-2">
                              <Textarea value={reportReason} onChange={(event) => setReportReason(event.target.value)} maxLength={500} placeholder="Décrivez le problème (5 caractères minimum)" className="min-h-16 bg-background text-foreground" />
                              <div className="flex justify-end gap-2">
                                <Button size="sm" variant="ghost" onClick={() => setReportId(null)}>Annuler</Button>
                                <Button size="sm" disabled={reportReason.trim().length < 5} onClick={() => void submitReport()}>Envoyer</Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={endOfMessagesRef} />
              </div>
              <form onSubmit={(event) => void sendMessage(event)} className="flex items-end gap-2 border-t p-3">
                <Textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Écrire un message…"
                  maxLength={2000}
                  rows={2}
                  className="max-h-32 min-h-11 resize-y"
                  aria-label="Votre message"
                />
                <Button type="submit" className="size-11 shrink-0" disabled={sending || !draft.trim()} aria-label="Envoyer le message">
                  <Send className="size-4" />
                </Button>
              </form>
              <p className="px-4 pb-3 text-[11px] text-muted-foreground">
                Les messages sont privés entre amis acceptés. En cas d’abus, vous pouvez bloquer ou signaler.
              </p>
            </>
          ) : (
            <CardContent className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <UserRound className="size-10 text-muted-foreground" aria-hidden="true" />
              <p className="mt-3 font-medium">Choisissez une conversation</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Sélectionnez un ami ou recherchez un membre pour lui envoyer une demande.
              </p>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
