import { createFileRoute, Link } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  Sparkles,
  Send,
  Loader2,
  Trash2,
  Bot,
  User as UserIcon,
  ChevronRight,
  Wrench,
  CheckCircle2,
  XCircle,
  Wallet,
} from "lucide-react";
import { loadPortfolioBrief } from "@/lib/portfolioContext";


const STORAGE_KEY = "orvex.assistant.messages.v1";

export const Route = createFileRoute("/assistant")({
  component: AssistantPage,
  head: () => ({
    meta: [
      { title: "AI Assistant — ORVEX" },
      {
        name: "description",
        content:
          "Chat with the ORVEX Copilot: get step-by-step help with swaps, liquidity, farms, domains, and the AI Trading Hub on LitVM LiteForge.",
      },
      { property: "og:title", content: "AI Assistant — ORVEX" },
      { property: "og:description", content: "In-app AI copilot for the ORVEX DEX on LitVM." },
    ],
  }),
});

const SUGGESTIONS = [
  "Bagaimana cara swap zkLTC ke ORVX?",
  "Jelaskan langkah menambah liquidity ORVX/wzkLTC.",
  "Apa itu Guardrail di AI Trading Hub?",
  "Cara mendaftarkan domain .orvex?",
];

function loadInitial(): UIMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as UIMessage[]) : [];
  } catch {
    return [];
  }
}

function AssistantPage() {
  const [initial, setInitial] = useState<UIMessage[]>([]);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setInitial(loadInitial());
    setHydrated(true);
  }, []);

  if (!hydrated) return <div className="max-w-3xl mx-auto px-4 py-10 text-muted-foreground">Loading…</div>;
  return <ChatUI key="chat" initial={initial} />;
}

function ChatUI({ initial }: { initial: UIMessage[] }) {
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const { messages, sendMessage, status, error, setMessages } = useChat({
    id: "orvex-assistant",
    messages: initial,
    transport,
  });

  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";

  // Persist to localStorage on every change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* noop */
    }
  }, [messages]);

  // Focus on mount + after send
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  const submit = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    // Attach the latest portfolio brief (written by Portfolio → AI Analyzer)
    // so the Copilot can reason about the user's real holdings and P&L.
    const brief = loadPortfolioBrief();
    await sendMessage({ text: t }, brief ? { body: { portfolio: brief.text } } : undefined);
  };


  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit(input);
    }
  };

  const clear = () => {
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col h-[calc(100vh-8rem)]">
      <header className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-2xl grid place-items-center shadow-neon"
            style={{ background: "linear-gradient(135deg,#10b981,#38bdf8)" }}
          >
            <Sparkles className="h-5 w-5 text-black" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight">ORVEX Copilot</h1>
            <p className="text-xs text-muted-foreground">Ask anything about the ORVEX DEX</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clear}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-border hover:border-destructive/60 hover:text-destructive transition"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto glass rounded-2xl p-4 space-y-4"
      >
        {messages.length === 0 ? (
          <EmptyState onPick={(s) => void submit(s)} />
        ) : (
          messages.map((m) => <Bubble key={m.id} msg={m} />)
        )}
        {status === "submitted" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
          </div>
        )}
        {error && (
          <div className="text-xs px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/40 text-destructive">
            {error.message || "Something went wrong. Try again."}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(input);
        }}
        className="mt-3 glass rounded-2xl p-2 flex items-end gap-2"
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          rows={1}
          placeholder="Ask about swap, farm, domains, AI Hub…"
          className="flex-1 resize-none bg-transparent outline-none px-3 py-2 text-sm max-h-40"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="h-10 w-10 grid place-items-center rounded-xl text-black font-bold shadow-neon disabled:opacity-40 disabled:shadow-none transition"
          style={{ background: "linear-gradient(135deg,#10b981,#38bdf8)" }}
          aria-label="Send"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="text-center py-8">
      <div
        className="mx-auto h-14 w-14 rounded-2xl grid place-items-center shadow-neon mb-3"
        style={{ background: "linear-gradient(135deg,#10b981,#38bdf8)" }}
      >
        <Bot className="h-7 w-7 text-black" />
      </div>
      <h2 className="text-lg font-bold mb-1">How can I help?</h2>
      <p className="text-sm text-muted-foreground mb-5">
        Ask about any part of ORVEX — I know the pages, contracts, and how to use them.
      </p>
      <div className="grid sm:grid-cols-2 gap-2 max-w-lg mx-auto">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="text-left text-sm px-3 py-2 rounded-xl border border-border hover:border-emerald-500/60 hover:bg-white/5 transition"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

type ToolPart = {
  type: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

const TOOL_LABELS: Record<string, string> = {
  getProtocolStats: "Reading protocol stats",
  getPools: "Listing liquidity pools",
  getTokenPrice: "Fetching token price",
  getPool: "Reading pool reserves",
  quoteSwap: "Quoting swap route",
};

function ToolCard({ part }: { part: ToolPart }) {
  const [open, setOpen] = useState(false);
  const name = part.type.replace(/^tool-/, "");
  const label = TOOL_LABELS[name] ?? name;
  const state = part.state ?? "input-available";
  const done = state === "output-available";
  const failed = state === "output-error";

  return (
    <div className="rounded-xl border border-border bg-surface-2/60 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-semibold hover:bg-white/5 transition"
      >
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
        {failed ? (
          <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
        ) : done ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-accent shrink-0" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
        )}
        <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="truncate">{label}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
          {failed ? "error" : done ? "on-chain" : "running"}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {part.input != null && (
            <pre className="text-[11px] bg-black/30 rounded-lg p-2 overflow-x-auto">
              {JSON.stringify(part.input, null, 2)}
            </pre>
          )}
          {part.errorText && <div className="text-[11px] text-destructive">{part.errorText}</div>}
          {part.output != null && (
            <pre className="text-[11px] bg-black/30 rounded-lg p-2 overflow-x-auto max-h-60">
              {JSON.stringify(part.output, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

const MD_COMPONENTS = {
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
    if (href && href.startsWith("/")) {
      const [path, qs] = href.split("?");
      const search = qs ? Object.fromEntries(new URLSearchParams(qs)) : undefined;
      return (
        <Link
          to={path}
          search={search as never}
          className="not-prose inline-flex items-center gap-1.5 px-3 py-1.5 my-1 rounded-lg bg-gradient-luxe text-primary-foreground text-[11px] font-bold uppercase tracking-wider shadow-neon hover:opacity-90 transition no-underline"
        >
          {children}
        </Link>
      );
    }
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  },
};

function Bubble({ msg }: { msg: UIMessage }) {
  const isUser = msg.role === "user";
  const parts = msg.parts as unknown as ToolPart[];
  const text = msg.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
  const toolParts = parts.filter((p) => typeof p.type === "string" && p.type.startsWith("tool-"));

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`h-8 w-8 shrink-0 rounded-full grid place-items-center ${
          isUser ? "bg-primary text-primary-foreground" : "text-black"
        }`}
        style={isUser ? undefined : { background: "linear-gradient(135deg,#10b981,#38bdf8)" }}
      >
        {isUser ? <UserIcon className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
      </div>
      <div className={`max-w-[85%] text-sm ${isUser ? "rounded-2xl px-4 py-2.5 bg-primary text-primary-foreground" : ""}`}>
        {isUser ? (
          <div className="whitespace-pre-wrap">{text}</div>
        ) : (
          <div className="space-y-2">
            {toolParts.length > 0 && (
              <div className="space-y-1.5">
                {toolParts.map((p, i) => (
                  <ToolCard key={`${p.type}-${i}`} part={p} />
                ))}
              </div>
            )}
            <div className="prose prose-sm prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-code:text-emerald-300 prose-a:text-primary">
              <ReactMarkdown components={MD_COMPONENTS}>{text || (toolParts.length ? "" : "…")}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );

}
