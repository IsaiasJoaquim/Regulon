import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";
import ReactMarkdown from "react-markdown";
import { Send, Sparkles, Bot, User } from "lucide-react";

export const Route = createFileRoute("/chat")({
  component: Chat,
});

const SUGGESTED = [
  "What are the KYC obligations for a stockbroker onboarding a new client?",
  "How often must a cyber security VAPT be performed and reported?",
  "Can an investment adviser also distribute mutual funds to the same client?",
  "What records must an investment adviser maintain, and for how long?",
];

function Chat() {
  const { corpus } = useStore();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Array<{ id: string; role: string; content: string }>>([]);
  const [status, setStatus] = useState<"idle" | "submitted" | "streaming" | "error">("idle");
  const [error, setError] = useState<Error | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  async function submit(text?: string) {
    const t = (text ?? input).trim();
    if (!t || isLoading) return;
    
    setInput("");
    const newMessages = [...messages, { id: Math.random().toString(), role: "user", content: t }];
    setMessages(newMessages);
    setStatus("submitted");
    setError(null);
    
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, corpus })
      });
      
      const rawText = await response.text();
      let res;
      try {
        res = JSON.parse(rawText);
      } catch (e) {
        throw new Error("Invalid response from server: " + rawText.slice(0, 100));
      }
      
      if (res && res.error) {
        throw new Error(res.error);
      }
      
      const replyText = typeof res?.text === "string" ? res.text : (res?.text || "No response generated.");

      setMessages([...newMessages, { id: Math.random().toString(), role: "assistant", content: replyText }]);
      setStatus("idle");
    } catch (e: any) {
      setError(e instanceof Error ? e : new Error(e.message || "An error occurred"));
      setStatus("error");
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-6 flex flex-col h-[calc(100vh-3.5rem-2.5rem)]">
      <div className="mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" /> <span>Compliance Copilot</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ask questions grounded in your ingested SEBI corpus ({corpus.length} circular{corpus.length === 1 ? "" : "s"},{" "}
          {corpus.reduce((n, c) => n + c.obligations.length, 0)} obligations).
        </p>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardContent className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <Bot className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground max-w-md">
                {corpus.length === 0
                  ? "Ingest a SEBI circular first, then come back to ask questions grounded in that corpus."
                  : "Ask me anything about the obligations in your ingested corpus. I'll cite the relevant circulars."}
              </p>
              {corpus.length > 0 && (
                <div className="mt-6 grid gap-2 w-full max-w-lg">
                  {SUGGESTED.map((s) => (
                    <button
                      key={s}
                      onClick={() => submit(s)}
                      className="text-left text-sm px-3 py-2 rounded-md border hover:bg-secondary/60 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            {messages.map((m: any) => {
              const text = m.content || "";
              const isUser = m.role === "user";
              return (
                <div key={m.id} className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
                  <div className={`w-8 h-8 rounded-full grid place-items-center shrink-0 ${isUser ? "bg-secondary" : "bg-primary text-primary-foreground"}`}>
                    {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 ${isUser ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    {isUser ? (
                      <div className="text-sm whitespace-pre-wrap">{text}</div>
                    ) : (
                      <div className="prose-chat text-sm">
                        <ReactMarkdown>{text || "…"}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {isLoading && messages[messages.length - 1]?.role === "user" && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full grid place-items-center bg-primary text-primary-foreground"><Bot className="w-4 h-4" /></div>
                <div className="bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground"><span>Thinking…</span></div>
              </div>
            )}
            {error && (
              <div className="text-sm text-destructive border border-destructive/40 bg-destructive/5 rounded-md p-3">
                {error.message}
              </div>
            )}
          </div>
        </CardContent>

        <div className="border-t p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex gap-2 items-end"
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about an obligation, frequency, penalty, evidence…"
              rows={2}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              className="resize-none"
            />
            <Button type="submit" disabled={isLoading || !input.trim()} size="lg">
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
