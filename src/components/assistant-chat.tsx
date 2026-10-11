"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Mic, Send, Sparkles, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { AssistantReply } from "@/lib/types";
import { SimpleBars } from "./charts";
import { IconButton, cn } from "./ui";

interface Message {
  role: "user" | "assistant";
  text: string;
  reply?: AssistantReply;
}

type Recognition = { lang: string; interimResults: boolean; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

function newRecognition(): Recognition | null {
  if (typeof window === "undefined") return null;
  const W = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const C = W.SpeechRecognition ?? W.webkitSpeechRecognition;
  return C ? new C() : null;
}

const STORAGE_KEY = "assistant-history";

/** Chat over your own data. Answers can be read aloud, and questions can be spoken. */
export function AssistantChat({ compact }: { compact?: boolean }) {
  // The chat only renders on the client after sign-in, so browser storage is safe to read here.
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]");
    } catch {
      return [];
    }
  });
  const [text, setText] = useState("");
  const [speak, setSpeak] = useState(() => {
    try {
      return localStorage.getItem("assistant-speak") === "1";
    } catch {
      return false;
    }
  });
  const [listening, setListening] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<Recognition | null>(null);
  const suggestions = useQuery({ queryKey: ["assistant-suggestions"], queryFn: () => api.get<{ suggestions: string[] }>("/api/assistant"), select: (d) => d.suggestions, staleTime: Infinity });

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    } catch {}
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const ask = useMutation({
    mutationFn: (message: string) => api.post<AssistantReply>("/api/assistant", { message }),
    onSuccess: (reply) => {
      setMessages((m) => [...m, { role: "assistant", text: reply.answer, reply }]);
      if (speak && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(reply.answer.replace(/₹/g, "rupees "));
        u.lang = "en-IN";
        window.speechSynthesis.speak(u);
      }
    },
    onError: (e: Error) => setMessages((m) => [...m, { role: "assistant", text: e.message }]),
  });

  const send = (q: string) => {
    const t = q.trim();
    if (!t || ask.isPending) return;
    setMessages((m) => [...m, { role: "user", text: t }]);
    setText("");
    ask.mutate(t);
  };

  const toggleMic = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const r = newRecognition();
    if (!r) {
      setMessages((m) => [...m, { role: "assistant", text: "Voice questions need Chrome, Edge or Safari. You can type instead." }]);
      return;
    }
    recRef.current = r;
    r.lang = "en-IN";
    r.interimResults = false;
    r.onresult = (e) => send(e.results[0][0].transcript);
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    r.start();
    setListening(true);
  };

  const toggleSpeak = () => {
    const v = !speak;
    setSpeak(v);
    try {
      localStorage.setItem("assistant-speak", v ? "1" : "0");
    } catch {}
    if (!v && typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-primary" /> Assistant
        </p>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button type="button" onClick={() => setMessages([])} className="h-9 px-2 text-xs font-medium text-muted hover:text-fg">
              Clear
            </button>
          )}
          <IconButton label={speak ? "Stop reading answers aloud" : "Read answers aloud"} onClick={toggleSpeak} className={cn("size-9", speak && "text-primary")}>
            {speak ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </IconButton>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">Ask about your spending, budgets, splits, or try a what-if.</p>
            <div className="flex flex-col gap-2">
              {suggestions.data?.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="rounded-xl border border-line px-3 py-2.5 text-left text-sm hover:bg-surface-muted">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed", m.role === "user" ? "rounded-br-md bg-primary text-primary-fg" : "rounded-bl-md bg-surface-muted")}>
                <p>{m.text}</p>
                {m.reply?.chart && m.reply.chart.data.length > 0 && (
                  <div className="mt-2 rounded-xl bg-surface p-2">
                    <p className="px-1 text-xs font-semibold text-muted">{m.reply.chart.title}</p>
                    <SimpleBars data={m.reply.chart.data} height={compact ? 140 : 170} />
                  </div>
                )}
                {m.reply?.links && m.reply.links.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.reply.links.map((l) => (
                      <Link key={l.href + l.label} href={l.href} className="rounded-full bg-surface px-3 py-1.5 text-xs font-semibold text-primary hover:underline">
                        {l.label} →
                      </Link>
                    ))}
                  </div>
                )}
                {m.reply?.suggestions && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    {m.reply.suggestions.map((s) => (
                      <button key={s} type="button" onClick={() => send(s)} className="rounded-lg bg-surface px-2.5 py-1.5 text-left text-sm hover:underline">
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {ask.isPending && (
            <div className="flex">
              <div className="rounded-2xl rounded-bl-md bg-surface-muted px-4 py-3 text-sm text-muted">Thinking…</div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <form
        className="flex items-center gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about your spending…" aria-label="Ask the assistant" className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 text-[15px] outline-none focus:border-primary" />
        <IconButton label={listening ? "Stop listening" : "Ask by voice"} onClick={toggleMic} className={cn("rounded-xl bg-surface-muted", listening && "bg-danger-soft text-danger")}>
          <Mic className="size-5" />
        </IconButton>
        <IconButton label="Send" onClick={() => send(text)} disabled={!text.trim() || ask.isPending} className="rounded-xl bg-primary text-primary-fg hover:bg-primary-hover">
          <Send className="size-5" />
        </IconButton>
      </form>
    </div>
  );
}
