"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Camera, Check, ImageUp, Keyboard, LoaderCircle, Mic, Square } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api";
import { dayLabel } from "@/lib/format";
import { useCategories, useInvalidateSpending, useMoney } from "@/lib/hooks";
import { parseExpenseText, type ParseResult } from "@/lib/parser";
import type { Expense, ExpenseList, ParseResponse, ReceiptResponse } from "@/lib/types";
import { DuplicateBanner, ExpenseForm, type ExpenseDraft, type ExpenseSubmit } from "./expense-form";
import { Button, IconButton, Sheet, cn } from "./ui";

/* ---------- context ---------- */

type Mode = "text" | "voice" | "receipt" | "manual";
interface QuickAddApi {
  open: (mode?: Mode, file?: File) => void;
}
const QuickAddContext = createContext<QuickAddApi>({ open: () => undefined });
export const useQuickAdd = () => useContext(QuickAddContext);

export function QuickAddProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ open: boolean; mode: Mode; file?: File; nonce: number }>({ open: false, mode: "text", nonce: 0 });
  const open = useCallback((mode: Mode = "text", file?: File) => setState((s) => ({ open: true, mode, file, nonce: s.nonce + 1 })), []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <QuickAddContext.Provider value={value}>
      {children}
      <QuickAddSheet key={state.nonce} open={state.open} initialMode={state.mode} initialFile={state.file} onClose={() => setState((s) => ({ ...s, open: false }))} />
    </QuickAddContext.Provider>
  );
}

/* ---------- sheet ---------- */

type Source = "text" | "voice" | "receipt" | "manual";
interface Review {
  draft: ExpenseDraft;
  source: Source;
  rawInput?: string;
  original?: { categoryName: string | null; merchant: string | null; amount: number | null };
  duplicate?: { expense: Expense; kind: "exact" | "similar" | "recent" } | null;
  notice?: string;
}

function draftFromParse(parsed: ParseResult | null, categoryId: string | null, extra: Partial<ExpenseDraft> = {}): ExpenseDraft {
  return {
    amount: parsed?.amount ?? null,
    categoryId,
    merchant: parsed?.merchant ?? "",
    note: parsed?.note ?? "",
    occurredAt: parsed?.occurredAt ?? new Date().toISOString(),
    paymentMethod: parsed?.paymentMethod ?? null,
    confidence: parsed?.confidence,
    splitWith: parsed?.splitWith,
    ...extra,
  };
}

function QuickAddSheet({ open, initialMode, initialFile, onClose }: { open: boolean; initialMode: Mode; initialFile?: File; onClose: () => void }) {
  const [step, setStep] = useState<"input" | "voice" | "receipt" | "review">(
    initialMode === "voice" ? "voice" : initialMode === "receipt" && initialFile ? "receipt" : initialMode === "manual" ? "review" : "input",
  );
  const [file, setFile] = useState<File | undefined>(initialFile);
  const [review, setReview] = useState<Review | null>(initialMode === "manual" ? { draft: draftFromParse(null, null), source: "manual" } : null);
  const [dupAck, setDupAck] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const invalidate = useInvalidateSpending();
  const money = useMoney();

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post<{ expense: Expense }>("/api/expenses", payload),
    onSuccess: ({ expense }) => {
      invalidate();
      onClose();
      toast.success(`Saved ${money(expense.myShare)} · ${expense.category?.name ?? ""}`, {
        action: {
          label: "Undo",
          onClick: async () => {
            await api.del(`/api/expenses/${expense.id}`).catch(() => toast.error("Couldn't undo."));
            invalidate();
            toast("Expense removed");
          },
        },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/|application\/pdf/.test(f.type)) return toast.error("Use a JPG, PNG, WebP or PDF file.");
    if (f.size > 10 * 1024 * 1024) return toast.error("Receipts must be 10 MB or smaller.");
    setFile(f);
    setStep("receipt");
  };

  const toPayload = (v: ExpenseSubmit, r: Review) => ({
    ...v,
    source: r.source,
    receiptId: r.draft.receiptId ?? null,
    rawInput: r.rawInput,
    confidence: r.draft.confidence as Record<string, string> | undefined,
    original: r.original,
  });

  const title = step === "review" ? "Check and save" : step === "voice" ? "Speak your expense" : step === "receipt" ? "Scanning receipt" : "Add expense";

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pickFile(e.dataTransfer.files?.[0]);
        }}
      >
        <input ref={fileInput} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? undefined)} />

        {step === "input" && (
          <TextCapture
            onVoice={() => setStep("voice")}
            onCamera={() => fileInput.current?.click()}
            onPasteFile={pickFile}
            onManual={() => {
              setReview({ draft: draftFromParse(null, null), source: "manual" });
              setStep("review");
            }}
            onParsed={(text, res, saveNow) => {
              const r: Review = {
                draft: draftFromParse(res.parsed, res.categoryId),
                source: "text",
                rawInput: text,
                original: { categoryName: res.parsed.categoryName, merchant: res.parsed.merchant, amount: res.parsed.amount },
                duplicate: res.duplicate ? { expense: res.duplicate, kind: "recent" } : null,
              };
              if (saveNow && res.parsed.amount && res.categoryId && !res.duplicate) {
                save.mutate({
                  amount: res.parsed.amount,
                  categoryId: res.categoryId,
                  merchant: res.parsed.merchant ?? "",
                  note: res.parsed.note,
                  occurredAt: res.parsed.occurredAt ?? new Date().toISOString(),
                  paymentMethod: res.parsed.paymentMethod,
                  source: "text",
                  rawInput: text,
                  confidence: res.parsed.confidence,
                  original: r.original,
                });
                return;
              }
              setReview(r);
              setStep("review");
            }}
            saving={save.isPending}
          />
        )}

        {step === "voice" && (
          <VoiceCapture
            onCancel={() => setStep("input")}
            onDone={async (text) => {
              try {
                const res = await api.post<ParseResponse>("/api/parse", { text, source: "voice" });
                setReview({
                  draft: draftFromParse(res.parsed, res.categoryId),
                  source: "voice",
                  rawInput: text,
                  original: { categoryName: res.parsed.categoryName, merchant: res.parsed.merchant, amount: res.parsed.amount },
                  duplicate: res.duplicate ? { expense: res.duplicate, kind: "recent" } : null,
                });
                setStep("review");
              } catch (e) {
                toast.error((e as Error).message);
                setStep("input");
              }
            }}
          />
        )}

        {step === "receipt" && file && (
          <ReceiptCapture
            file={file}
            onCancel={() => setStep("input")}
            onResult={(res) => {
              setReview({
                draft: draftFromParse(res.parsed, res.categoryId, { receiptId: res.receiptId }),
                source: "receipt",
                rawInput: res.parsed ? undefined : "",
                original: res.parsed ? { categoryName: res.parsed.categoryName, merchant: res.parsed.merchant, amount: res.parsed.amount } : undefined,
                duplicate: res.duplicate ? { expense: res.duplicate.expense, kind: res.duplicate.kind } : null,
                notice: res.message,
              });
              setStep("review");
            }}
          />
        )}

        {step === "review" && review && (
          <div className="flex flex-col gap-4">
            {review.notice && <p className="rounded-xl bg-surface-muted p-3 text-sm text-muted">{review.notice}</p>}
            {review.duplicate && !dupAck && <DuplicateBanner expense={review.duplicate.expense} kind={review.duplicate.kind} onDismiss={() => setDupAck(true)} />}
            {review.source !== "manual" && (
              <p className="flex items-center gap-3 text-xs text-muted">
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-success" /> AI is sure
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-warning" /> please check
                </span>
              </p>
            )}
            <ExpenseForm
              initial={review.draft}
              autoFocusAmount={review.source === "manual"}
              submitting={save.isPending}
              onSubmit={(v) => save.mutate(toPayload(v, review))}
              secondary={
                <Button variant="secondary" size="lg" onClick={onClose}>
                  Discard
                </Button>
              }
            />
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ---------- text capture ---------- */

function TextCapture({
  onVoice,
  onCamera,
  onPasteFile,
  onManual,
  onParsed,
  saving,
}: {
  onVoice: () => void;
  onCamera: () => void;
  onPasteFile: (f: File) => void;
  onManual: () => void;
  onParsed: (text: string, res: ParseResponse, saveNow: boolean) => void;
  saving: boolean;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<false | "review" | "save">(false);
  const categories = useCategories();
  const money = useMoney();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  const recent = useQuery({
    queryKey: ["expenses", "recent-inputs"],
    queryFn: () => api.get<ExpenseList>("/api/expenses?limit=40"),
    select: (d) => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const e of d.items) {
        const label = `${(e.merchant || e.note || e.category?.name || "").toLowerCase()} ${Math.round(e.amount / 100)}`.trim();
        if (label.length > 2 && !seen.has(label)) {
          seen.add(label);
          out.push(label);
        }
        if (out.length >= 6) break;
      }
      return out;
    },
    staleTime: 60_000,
  });

  const live = useMemo(() => (text.trim() ? parseExpenseText(text, { categories: categories.data?.map((c) => ({ name: c.name, keywords: c.keywords })) }) : null), [text, categories.data]);
  // A mentioned split ("with Ravi") always goes through review so the shares can be set.
  const wantsSplit = !!live?.splitWith.length;
  const confident = !!live?.amount && live.confidence.amount === "high" && !!live.categoryName && !wantsSplit;

  const go = async (saveNow: boolean) => {
    if (!text.trim()) return inputRef.current?.focus();
    setBusy(saveNow ? "save" : "review");
    try {
      const res = await api.post<ParseResponse>("/api/parse", { text, source: "text" });
      onParsed(text, res, saveNow);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Couldn't understand that. Try again or enter details manually.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        go(false);
      }}
    >
      <div className="flex flex-col gap-2.5">
        <div className="flex min-h-14 items-center gap-1.5 rounded-2xl border-2 border-primary bg-surface py-1 pl-4 pr-1.5">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                go(confident);
              }
            }}
            onPaste={(e) => {
              const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/"));
              if (f) {
                e.preventDefault();
                onPasteFile(f);
              }
            }}
            placeholder="petrol 200, lunch 340 with Ravi…"
            aria-label="Describe the expense"
            autoComplete="off"
            enterKeyHint="go"
            className="min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted/70"
          />
          <IconButton label="Speak instead" onClick={onVoice} className="rounded-xl bg-surface-muted">
            <Mic className="size-5" />
          </IconButton>
          <IconButton label="Scan a receipt" onClick={onCamera} className="rounded-xl bg-surface-muted">
            <Camera className="size-5" />
          </IconButton>
        </div>
        <div aria-live="polite" className="flex min-h-8 flex-wrap items-center gap-1.5">
          {live ? (
            <>
              <span className="text-xs text-muted">Understood:</span>
              {live.amount ? <Chip strong>{money(live.amount)}</Chip> : <Chip warn>no amount yet</Chip>}
              {live.categoryName && <Chip>{live.categoryName}</Chip>}
              {live.merchant && <Chip>{live.merchant}</Chip>}
              <Chip>{live.occurredAt ? `${dayLabel(live.occurredAt)}` : "Now"}</Chip>
              {live.paymentMethod && <Chip>{live.paymentMethod}</Chip>}
              {live.splitWith.length > 0 && <Chip>with {live.splitWith.join(", ")}</Chip>}
            </>
          ) : (
            <span className="text-xs text-muted">Type, speak, or paste a receipt screenshot.</span>
          )}
        </div>
      </div>

      {!!recent.data?.length && (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-muted">Recent</span>
          <div className="flex flex-wrap gap-2">
            {recent.data.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setText(r);
                  inputRef.current?.focus();
                }}
                className="h-10 rounded-full border border-line px-3.5 text-sm hover:bg-surface-muted"
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Button type="submit" variant="secondary" size="lg" loading={busy === "review"} disabled={!text.trim()}>
          Review
        </Button>
        <Button size="lg" onClick={() => go(true)} loading={busy === "save" || saving} disabled={!confident}>
          {confident ? `Save ${money(live!.amount!)}` : "Save"}
        </Button>
      </div>
      <p className="-mt-2 text-center text-xs text-muted">
        {confident ? "Looks clear. Save directly, or review first." : wantsSplit ? `Review to split with ${live!.splitWith.join(", ")}.` : "Add an amount and what it was for."}{" "}
        <span className="hidden sm:inline">Ctrl + Enter saves.</span>
      </p>
      <div className="flex justify-center gap-4">
        <button type="button" onClick={onManual} className="flex h-10 items-center gap-1.5 text-sm font-medium text-primary">
          <Keyboard className="size-4" /> Enter manually
        </button>
        <button type="button" onClick={onCamera} className="flex h-10 items-center gap-1.5 text-sm font-medium text-primary">
          <ImageUp className="size-4" /> Upload receipt
        </button>
      </div>
    </form>
  );
}

function Chip({ children, strong, warn }: { children: React.ReactNode; strong?: boolean; warn?: boolean }) {
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-[13px]", strong ? "bg-primary-soft font-semibold text-primary-ink" : warn ? "bg-warning-soft text-warning-ink" : "bg-surface-muted font-medium")}>
      {children}
    </span>
  );
}

/* ---------- voice capture (Web Speech API) ---------- */

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function getRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const W = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

function VoiceCapture({ onDone, onCancel }: { onDone: (text: string) => void; onCancel: () => void }) {
  const [supported] = useState(() => !!getRecognition());
  const [listening, setListening] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [processing, setProcessing] = useState(false);
  const rec = useRef<SpeechRecognitionLike | null>(null);
  const textRef = useRef("");
  const categories = useCategories();
  const money = useMoney();

  const finish = useCallback(() => {
    rec.current?.stop();
    setListening(false);
    const t = textRef.current.trim();
    if (!t) {
      setError("We didn't catch that. Tap the mic and try again.");
      return;
    }
    setProcessing(true);
    onDone(t);
  }, [onDone]);

  const start = useCallback(() => {
    const r = getRecognition();
    if (!r) return;
    rec.current = r;
    r.lang = "en-IN";
    r.interimResults = true;
    r.continuous = true;
    textRef.current = "";
    setFinalText("");
    setInterim("");
    setError(null);
    setSeconds(0);
    r.onresult = (e) => {
      let fin = "";
      let tmp = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) fin += res[0].transcript;
        else tmp += res[0].transcript;
      }
      textRef.current = (fin + " " + tmp).trim();
      setFinalText(fin);
      setInterim(tmp);
    };
    r.onerror = (e) => {
      setListening(false);
      setError(e.error === "not-allowed" || e.error === "service-not-allowed" ? "Microphone access is blocked. Allow it in your browser settings, or type instead." : e.error === "no-speech" ? "We didn't hear anything. Try again." : "Voice input stopped. Try again or type instead.");
    };
    r.onend = () => setListening(false);
    try {
      r.start();
      setListening(true);
    } catch {
      setError("Couldn't start the microphone.");
    }
  }, []);

  // Start listening as soon as the voice step opens.
  useEffect(() => {
    if (!supported) return;
    const t = setTimeout(start, 0);
    return () => {
      clearTimeout(t);
      rec.current?.abort();
    };
  }, [supported, start]);

  // Elapsed-time counter, and an automatic stop after 30 seconds.
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);
  useEffect(() => {
    if (!listening) return;
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000);
    const stop = setTimeout(() => finishRef.current(), 30_000);
    return () => {
      clearInterval(tick);
      clearTimeout(stop);
    };
  }, [listening]);

  const heard = (finalText + " " + interim).trim();
  const live = heard ? parseExpenseText(heard, { categories: categories.data?.map((c) => ({ name: c.name, keywords: c.keywords })) }) : null;

  if (!supported) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <p className="text-[15px] text-muted">Voice input isn&apos;t supported in this browser. Try Chrome, Edge or Safari, or type your expense.</p>
        <Button variant="secondary" onClick={onCancel}>
          Type instead
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 py-2">
      <p className={cn("flex items-center gap-2 text-sm font-semibold", listening ? "text-danger" : "text-muted")} aria-live="polite">
        {listening && <span className="size-2 animate-pulse rounded-full bg-danger" />}
        {processing ? "Understanding…" : listening ? `Listening · 0:${String(seconds).padStart(2, "0")}` : "Paused"}
      </p>
      <div className="flex h-16 items-center gap-1" aria-hidden>
        {Array.from({ length: 18 }).map((_, i) => (
          <span key={i} className={cn("w-1 rounded-full bg-primary", listening ? "animate-wave" : "opacity-30")} style={{ height: `${24 + ((i * 37) % 40)}px`, animationDelay: `${(i % 6) * 0.12}s` }} />
        ))}
      </div>
      <p className="min-h-16 text-center text-2xl font-semibold leading-snug" aria-live="polite">
        {heard ? (
          <>
            “{finalText}
            <span className="text-muted">{interim}</span>”
          </>
        ) : (
          <span className="text-muted">Try “Petrol 100 at HP”</span>
        )}
      </p>
      {live && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {live.amount && <Chip strong>{money(live.amount)}</Chip>}
          {live.categoryName && <Chip>{live.categoryName}</Chip>}
          {live.merchant && <Chip>{live.merchant}</Chip>}
        </div>
      )}
      {error && (
        <p className="text-center text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={listening ? finish : start}
        disabled={processing}
        aria-label={listening ? "Stop and review" : "Start listening"}
        className="flex size-22 items-center justify-center rounded-full bg-primary text-primary-fg shadow-[0_0_0_10px_var(--primary-soft)] transition-transform active:scale-95 disabled:opacity-60"
      >
        {processing ? <LoaderCircle className="size-8 animate-spin" /> : listening ? <Square className="size-7" fill="currentColor" /> : <Mic className="size-9" />}
      </button>
      <div className="flex gap-6 text-sm">
        <button type="button" onClick={onCancel} className="h-10 font-medium text-muted">
          Type instead
        </button>
        {heard && !listening && !processing && (
          <button type="button" onClick={finish} className="flex h-10 items-center gap-1 font-semibold text-primary">
            <Check className="size-4" /> Use this
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- receipt capture ---------- */

function ReceiptCapture({ file, onResult, onCancel }: { file: File; onResult: (r: ReceiptResponse) => void; onCancel: () => void }) {
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const isImage = file.type.startsWith("image/");
  const previewRef = useRef<HTMLImageElement>(null);
  const started = useRef(false);

  // Object URL is created per mount so a remount (e.g. StrictMode) never shows a revoked URL.
  useEffect(() => {
    if (!isImage || !previewRef.current) return;
    const url = URL.createObjectURL(file);
    previewRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const timers = [setTimeout(() => setStage(1), 700), setTimeout(() => setStage(2), 6000)];
    const form = new FormData();
    form.append("file", file);
    api
      .upload<ReceiptResponse>("/api/receipts", form)
      .then((res) => {
        setStage(3);
        setTimeout(() => onResult(res), 300);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => timers.forEach(clearTimeout));
  }, [file, onResult]);

  const steps = ["Uploaded", "Reading amount, merchant and date", "Checking for duplicates"];
  return (
    <div className="flex flex-col gap-5">
      <div className="relative mx-auto h-64 w-48 overflow-hidden rounded-xl border border-line bg-surface-muted">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img ref={previewRef} alt="Receipt being scanned" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">PDF receipt</div>
        )}
        {!error && stage < 3 && <div className="animate-scan absolute inset-x-0 h-0.5 bg-primary shadow-[0_0_14px_4px_var(--primary)]" />}
      </div>
      {error ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
          <Button variant="secondary" onClick={onCancel}>
            Try again
          </Button>
        </div>
      ) : (
        <ol className="flex flex-col gap-3" aria-live="polite">
          {steps.map((s, i) => {
            const done = stage > i || stage === 3;
            const active = stage === i || (i === 1 && stage === 1) || (i === 2 && stage === 2);
            return (
              <li key={s} className={cn("flex items-center gap-3 text-[15px]", !done && !active && "text-muted")}>
                {done ? (
                  <span className="flex size-6 items-center justify-center rounded-full bg-success text-white">
                    <Check className="size-4" />
                  </span>
                ) : active ? (
                  <LoaderCircle className="size-6 animate-spin text-primary" />
                ) : (
                  <span className="size-6 rounded-full border-2 border-line" />
                )}
                <span className={cn(active && !done && "font-semibold")}>{s}</span>
              </li>
            );
          })}
        </ol>
      )}
      <p className="text-center text-xs text-muted">The first scan downloads the reading model and can take up to a minute.</p>
    </div>
  );
}

