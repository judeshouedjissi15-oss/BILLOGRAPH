"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, LoaderCircle, MessageCircle, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const STARTERS = [
  "Comment acheter un produit ?",
  "Comment créer ma boutique ?",
  "Aide-moi avec une question générale",
];

export function VirtualAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endOfMessages = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessages.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, open]);

  const sendMessage = async (value = input) => {
    const content = value.trim();
    if (!content || sending) return;

    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setSending(true);

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ messages: nextMessages.slice(-12) }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          result && typeof result === "object" && "error" in result && typeof result.error === "string"
            ? result.error
            : "Impossible d’obtenir une réponse. Réessayez.";
        throw new Error(message);
      }
      if (!result || typeof result !== "object" || !("answer" in result) || typeof result.answer !== "string") {
        throw new Error("La réponse de l’assistant est invalide. Réessayez.");
      }
      setMessages([...nextMessages, { role: "assistant", content: result.answer }]);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Une erreur est survenue. Réessayez.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          size="lg"
          className="fixed bottom-5 right-5 z-40 h-14 rounded-full px-5 shadow-lg"
          aria-label="Ouvrir HOUEDJISSI IA"
        >
          <MessageCircle className="size-5" aria-hidden="true" />
          <span className="hidden sm:inline">HOUEDJISSI IA</span>
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="mx-auto h-[min(82dvh,700px)] w-full max-w-2xl gap-0 rounded-t-2xl p-0"
      >
        <SheetHeader className="border-b px-5 py-4 pr-14 text-left">
          <SheetTitle className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="size-5" aria-hidden="true" />
            </span>
            HOUEDJISSI IA
          </SheetTitle>
          <SheetDescription>
            Posez une question sur BILLOGRAPH ou sur un autre sujet.
          </SheetDescription>
        </SheetHeader>

        <div
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-6"
          aria-live="polite"
        >
          {messages.length === 0 ? (
            <div className="m-auto w-full max-w-lg text-center">
              <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                <Bot className="size-6 text-primary" aria-hidden="true" />
              </span>
              <p className="mt-3 font-semibold">Comment puis-je vous aider ?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Je peux vous guider sur le site et répondre à vos questions générales.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {STARTERS.map((starter) => (
                  <Button
                    key={starter}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-auto whitespace-normal rounded-full py-2"
                    onClick={() => void sendMessage(starter)}
                    disabled={sending}
                  >
                    {starter}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={`${index}-${message.role}`}
                className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  message.role === "user"
                    ? "ml-auto rounded-br-sm bg-primary text-primary-foreground"
                    : "mr-auto rounded-bl-sm bg-muted"
                }`}
              >
                {message.content}
              </div>
            ))
          )}
          {sending && (
            <div className="mr-auto flex items-center gap-2 rounded-2xl rounded-bl-sm bg-muted px-4 py-3 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              HOUEDJISSI IA réfléchit…
            </div>
          )}
          {error && (
            <div role="alert" className="mr-auto max-w-[88%] rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <div ref={endOfMessages} />
        </div>

        <form
          className="border-t bg-background p-4 sm:px-6"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage();
          }}
        >
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="Écrivez votre question…"
              aria-label="Votre question"
              maxLength={3000}
              rows={1}
              className="max-h-32 min-h-11 resize-y"
              disabled={sending}
            />
            <Button type="submit" size="icon" className="size-11 shrink-0" disabled={sending || !input.trim()} aria-label="Envoyer">
              <Send className="size-4" aria-hidden="true" />
            </Button>
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Les réponses peuvent être inexactes. N’envoyez aucune information confidentielle.
          </p>
        </form>
      </SheetContent>
    </Sheet>
  );
}
