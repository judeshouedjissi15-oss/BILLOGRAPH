"use client";

// RECHMIAL IA — interface de conversation (utilisateurs connectés, tous rôles).
// SÉCURITÉ FRONTEND :
// - Les réponses de l'IA sont rendues en TEXTE BRUT (React échappe tout) —
//   jamais en HTML : aucune injection possible même si le modèle déraille.
// - Les conversations passent par l'API qui vérifie la propriété côté serveur.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Loader2,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/components/billograph/lib/api-client";
import { cn } from "@/lib/utils";
import type { User } from "@/types/api";

const MAX_MESSAGE = 2000;

type ChatMessage = { id: string; role: "user" | "assistant"; content: string };
type ConversationSummary = { id: string; title: string; updatedAt: string };

const SUGGESTIONS = [
  "Analyse mes ventes récentes",
  "Comment fixer le bon prix pour mes produits ?",
  "Idées pour promouvoir ma boutique",
  "Qui a créé BILLOGRAPH ?",
];

const WELCOME_TEXT =
  "Bonjour ! Je suis Rechmial IA, l'assistante intelligente de BILLOGRAPH. Je peux analyser vos ventes, vous conseiller sur vos prix, votre marketing et l'usage de la plateforme. Posez-moi votre question !";

// Rendu SÛR d'un sous-ensemble markdown (gras + listes) : uniquement des
// éléments React dont le texte est échappé par React — JAMAIS de HTML brut
// (aucune injection possible même si le modèle renvoyait du code malveillant).
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={`${keyPrefix}-${i}`} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={`${keyPrefix}-${i}`}>{part}</span>;
  });
}

function RechmialText({ content }: { content: string }) {
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = (key: string) => {
    if (!list) return;
    const items = list.items.map((it, i) => (
      <li key={i}>{renderInline(it, `li-${key}-${i}`)}</li>
    ));
    blocks.push(
      list.ordered ? (
        <ol key={key} className="my-1 list-decimal space-y-0.5 pl-5">
          {items}
        </ol>
      ) : (
        <ul key={key} className="my-1 list-disc space-y-0.5 pl-5">
          {items}
        </ul>
      ),
    );
    list = null;
  };

  content.split("\n").forEach((line, idx) => {
    const t = line.trim();
    const ulMatch = /^[-*]\s+(.*)$/.exec(t);
    const olMatch = /^\d+[.)]\s+(.*)$/.exec(t);
    if (ulMatch) {
      if (!list || list.ordered) {
        flush(`u${idx}`);
        list = { ordered: false, items: [] };
      }
      list.items.push(ulMatch[1]);
      return;
    }
    if (olMatch) {
      if (!list || !list.ordered) {
        flush(`o${idx}`);
        list = { ordered: true, items: [] };
      }
      list.items.push(olMatch[1]);
      return;
    }
    flush(`p${idx}`);
    if (t === "") {
      blocks.push(<div key={idx} className="h-2" aria-hidden="true" />);
      return;
    }
    blocks.push(<p key={idx}>{renderInline(t, `p-${idx}`)}</p>);
  });
  flush("end");

  return <div>{blocks}</div>;
}

export function RechmialView({ user }: { user: User }) {
  const { toast } = useToast();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ConversationSummary | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const refreshConversations = useCallback(async () => {
    try {
      const data = await apiFetch<{ conversations: ConversationSummary[] }>(
        "/api/ai/conversations",
      );
      setConversations(data.conversations);
    } catch {
      /* liste indisponible : le chat reste utilisable */
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void refreshConversations();
  }, [refreshConversations]);

  // Défilement automatique vers le dernier message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  async function sendMessage(text: string) {
    const message = text.trim();
    if (!message || sending || message.length > MAX_MESSAGE) return;

    setSending(true);
    setInput("");
    const localId = `local-${Date.now()}`;
    setMessages((prev) => [...prev, { id: localId, role: "user", content: message }]);

    try {
      const data = await apiFetch<{ conversationId: string; reply: string }>("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, conversationId: conversationId ?? undefined }),
      });
      setConversationId(data.conversationId);
      setMessages((prev) => [
        ...prev,
        { id: `${localId}-r`, role: "assistant", content: data.reply },
      ]);
      void refreshConversations();
    } catch (err) {
      const message_ = err instanceof Error ? err.message : "Erreur inconnue";
      setMessages((prev) => prev.filter((m) => m.id !== localId));
      setInput(message); // restaure le texte pour éviter la perte de saisie
      toast({
        title: "Rechmial IA",
        description: message_,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }

  async function openConversation(id: string) {
    if (sending) return;
    try {
      const data = await apiFetch<{ id: string; messages: ChatMessage[] }>(
        `/api/ai/conversations/${id}`,
      );
      setConversationId(data.id);
      setMessages(data.messages);
    } catch (err) {
      toast({
        title: "Conversation indisponible",
        description: err instanceof Error ? err.message : "Erreur inconnue",
        variant: "destructive",
      });
    }
  }

  function startNewConversation() {
    if (sending) return;
    setConversationId(null);
    setMessages([]);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/ai/conversations/${deleteTarget.id}`, { method: "DELETE" });
      if (deleteTarget.id === conversationId) {
        startNewConversation();
      }
      void refreshConversations();
    } catch (err) {
      toast({
        title: "Suppression impossible",
        description: err instanceof Error ? err.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setDeleteTarget(null);
    }
  }

  const emptyConversation = messages.length === 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Bot className="size-6 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Rechmial IA</h1>
          <p className="text-sm text-muted-foreground">
            Votre assistante d&apos;analyse et de conseils sur BILLOGRAPH
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        {/* Historique — desktop */}
        <Card className="hidden h-fit md:block">
          <CardContent className="p-3">
            <Button className="mb-3 w-full" onClick={startNewConversation} disabled={sending}>
              <Plus className="size-4" aria-hidden="true" />
              Nouvelle conversation
            </Button>
            {/* Défilement natif : ScrollArea enveloppe le contenu en display:table
                et empêcherait la troncature (ellipsis) des titres longs. */}
            <div className="max-h-72 overflow-y-auto">
              <nav aria-label="Historique des conversations">
                {loadingList ? (
                  <p className="px-2 py-4 text-sm text-muted-foreground">Chargement…</p>
                ) : conversations.length === 0 ? (
                  <p className="px-2 py-4 text-sm text-muted-foreground">
                    Aucune conversation pour l&apos;instant.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {conversations.map((c) => (
                      <li key={c.id} className="group relative">
                        <button
                          type="button"
                          onClick={() => openConversation(c.id)}
                          className={cn(
                            "flex h-10 w-full items-center pr-8 text-left text-sm rounded-md px-2 transition-colors hover:bg-accent",
                            conversationId === c.id && "bg-accent font-medium",
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">{c.title}</span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Supprimer la conversation : ${c.title}`}
                          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                          onClick={() => setDeleteTarget(c)}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </nav>
            </div>
          </CardContent>
        </Card>

        {/* Zone de chat */}
        <Card className="flex min-h-[70vh] flex-col">
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            {/* Barre mobile : historique */}
            <div className="flex items-center gap-2 border-b p-3 md:hidden">
              <select
                aria-label="Historique des conversations"
                className="h-10 min-w-0 flex-1 rounded-md border bg-transparent px-3 text-sm"
                value={conversationId ?? ""}
                onChange={(e) =>
                  e.target.value ? void openConversation(e.target.value) : startNewConversation()
                }
              >
                <option value="">— Nouvelle conversation —</option>
                {conversations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
              {emptyConversation ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 py-6 text-center">
                  <div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
                    <Bot className="size-7 text-primary" aria-hidden="true" />
                  </div>
                  <div className="max-w-md space-y-2">
                    <p className="font-semibold">Bonjour {user.name.split(" ")[0]} !</p>
                    <p className="text-sm text-muted-foreground">{WELCOME_TEXT}</p>
                    <p className="text-xs text-muted-foreground">
                      BILLOGRAPH — plateforme fondée par HOUEDJISSI Judes B.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>
                      Vos conversations restent privées : Rechmial IA n&apos;analyse que les
                      statistiques de votre propre compte et ne vous demandera jamais vos mots de
                      passe ni vos codes secrets.
                    </span>
                  </div>
                  <div className="flex max-w-lg flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map((s) => (
                      <Button
                        key={s}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 rounded-full"
                        onClick={() => void sendMessage(s)}
                        disabled={sending}
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <ul className="space-y-4" aria-live="polite">
                  {messages.map((m) => (
                    <li
                      key={m.id}
                      className={cn("flex gap-3", m.role === "user" && "justify-end")}
                    >
                      {m.role === "assistant" && (
                        <div
                          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10"
                          aria-hidden="true"
                        >
                          <Bot className="size-4 text-primary" />
                        </div>
                      )}
                      <div
                        className={cn(
                          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                          m.role === "user"
                            ? "rounded-br-sm bg-primary text-primary-foreground whitespace-pre-wrap break-words"
                            : "rounded-bl-sm bg-muted break-words [&_p]:whitespace-pre-wrap",
                        )}
                      >
                        {m.role === "user" ? m.content : <RechmialText content={m.content} />}
                        <span className="sr-only">
                          {m.role === "user" ? " — votre message" : " — réponse de Rechmial IA"}
                        </span>
                      </div>
                      {m.role === "user" && (
                        <div
                          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary"
                          aria-hidden="true"
                        >
                          <UserIcon className="size-4" />
                        </div>
                      )}
                    </li>
                  ))}
                  {sending && (
                    <li className="flex gap-3">
                      <div
                        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10"
                        aria-hidden="true"
                      >
                        <Bot className="size-4 text-primary" />
                      </div>
                      <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-muted px-4 py-3 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        Rechmial IA réfléchit…
                      </div>
                    </li>
                  )}
                </ul>
              )}
            </div>

            {/* Saisie */}
            <form
              className="border-t p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void sendMessage(input);
              }}
            >
              <div className="flex items-end gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage(input);
                    }
                  }}
                  placeholder="Écrivez votre message à Rechmial IA…"
                  className="min-h-11 max-h-40 flex-1 resize-none"
                  rows={1}
                  maxLength={MAX_MESSAGE}
                  aria-label="Votre message pour Rechmial IA"
                  disabled={sending}
                />
                <Button
                  type="submit"
                  size="icon"
                  className="size-11 shrink-0"
                  disabled={sending || input.trim().length === 0}
                  aria-label="Envoyer le message"
                >
                  {sending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="size-4" aria-hidden="true" />
                  )}
                </Button>
              </div>
              <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
                Analyse et conseils uniquement — Rechmial IA ne modifie rien sur votre compte.
                Entrée pour envoyer · Maj+Entrée pour un retour à la ligne · {input.length}/
                {MAX_MESSAGE}
              </p>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Confirmation de suppression */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette conversation ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {deleteTarget?.title} » et tous ses messages seront définitivement supprimés.
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
