"use client";

import { useEffect, useRef, useState } from "react";
import { api, streamChat, type ChatMessage } from "@/lib/api";

/* ── HeroLogo SVG ──────────────────────────────────────────────── */
function HeroLogo() {
  return (
    <div style={{ width: "100%", maxWidth: 380, animation: "iy-float 6s ease-in-out infinite" }}>
      <svg
        viewBox="0 0 460 320"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          width: "100%", height: "auto",
          filter: "drop-shadow(0 20px 60px rgba(140,80,255,0.35)) drop-shadow(0 -10px 40px rgba(80,140,255,0.2))",
        }}
      >
        <defs>
          <linearGradient id="hl-c1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#F8F8FC"/><stop offset="20%"  stopColor="#C0C0CC"/>
            <stop offset="50%"  stopColor="#3A3A45"/><stop offset="80%"  stopColor="#C0C0CC"/>
            <stop offset="100%" stopColor="#888893"/>
          </linearGradient>
          <linearGradient id="hl-c2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#888893"/><stop offset="40%"  stopColor="#F0F0F8"/>
            <stop offset="70%"  stopColor="#4A4A55"/><stop offset="100%" stopColor="#C0C0CC"/>
          </linearGradient>
          <linearGradient id="hl-v1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#8C50FF" stopOpacity="0"/>
            <stop offset="50%"  stopColor="#B888FF" stopOpacity="1"/>
            <stop offset="100%" stopColor="#8C50FF" stopOpacity="0"/>
          </linearGradient>
          <linearGradient id="hl-v2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#6A30E0" stopOpacity="0"/>
            <stop offset="50%"  stopColor="#8C50FF" stopOpacity="1"/>
            <stop offset="100%" stopColor="#6A30E0" stopOpacity="0"/>
          </linearGradient>
          <radialGradient id="hl-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#FFFFFF" stopOpacity="0.4"/>
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0"/>
          </radialGradient>
          <linearGradient id="hl-shine" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"  stopColor="#FFFFFF" stopOpacity="0.18"/>
            <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {/* neon rings */}
        <ellipse cx="160" cy="140" rx="120" ry="56" fill="none" stroke="url(#hl-v1)" strokeWidth="4"  opacity="0.6" transform="rotate(-22 160 140)"/>
        <ellipse cx="300" cy="140" rx="120" ry="56" fill="none" stroke="url(#hl-v2)" strokeWidth="4"  opacity="0.6" transform="rotate(22 300 140)"/>
        {/* chrome rings */}
        <ellipse cx="160" cy="140" rx="120" ry="56" fill="none" stroke="url(#hl-c1)" strokeWidth="16" transform="rotate(-22 160 140)"/>
        <ellipse cx="160" cy="140" rx="120" ry="56" fill="none" stroke="#0E0C18"     strokeWidth="3"  transform="rotate(-22 160 140)"/>
        <ellipse cx="160" cy="140" rx="120" ry="56" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1" transform="rotate(-22 160 140)"/>
        <ellipse cx="300" cy="140" rx="120" ry="56" fill="none" stroke="url(#hl-c2)" strokeWidth="16" transform="rotate(22 300 140)"/>
        <ellipse cx="300" cy="140" rx="120" ry="56" fill="none" stroke="#0E0C18"     strokeWidth="3"  transform="rotate(22 300 140)"/>
        <ellipse cx="300" cy="140" rx="120" ry="56" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1" transform="rotate(22 300 140)"/>
        {/* pill */}
        <rect x="60"  y="115" width="340" height="92" rx="46" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.18)" strokeWidth="1"/>
        <rect x="66"  y="121" width="328" height="80" rx="40" fill="#08080C"  stroke="rgba(255,255,255,0.12)" strokeWidth="1"/>
        <rect x="66"  y="121" width="328" height="40" rx="40" fill="url(#hl-shine)"/>
        <text x="230" y="159" textAnchor="middle" fontFamily="Inter,sans-serif" fontWeight="800" fontSize="31" fill="#FFFFFF" letterSpacing="-0.02em">INTELLIYASH</text>
        <text x="230" y="183" textAnchor="middle" fontFamily="Inter,sans-serif" fontWeight="500" fontSize="9.5" fill="#B888FF" letterSpacing="0.22em">THE FUTURE IN ACTION</text>
        {/* reflection */}
        <ellipse cx="230" cy="280" rx="200" ry="14" fill="url(#hl-glow)" opacity="0.3"/>
        <line x1="60"  y1="285" x2="400" y2="285" stroke="#8C50FF" strokeWidth="0.5" opacity="0.4"/>
        <line x1="90"  y1="290" x2="370" y2="290" stroke="#B888FF" strokeWidth="0.5" opacity="0.25"/>
      </svg>
    </div>
  );
}

const SUGGESTIONS = [
  "create project: blog app react + fastapi",
  "explain code: def add(a, b): return a + b",
  "fix error: ModuleNotFoundError: No module named 'fastapi'",
  "run python: print(2 + 2)",
];

/* ── CodeBlock ─────────────────────────────────────────────────── */
function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }
  return (
    <div className="my-2 rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.10)" }}>
      <div className="flex items-center justify-between px-3 py-1.5" style={{ background: "#14122A" }}>
        <span
          className="font-mono text-[10px] uppercase tracking-wider"
          style={{ color: "#B888FF" }}
        >
          {lang || "code"}
        </span>
        <button
          onClick={copy}
          className="font-mono text-[10px] px-2 py-0.5 rounded transition-colors"
          style={{ border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.50)", background: "transparent", cursor: "pointer" }}
          onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
          onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.50)")}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre
        className="overflow-x-auto text-xs font-mono leading-relaxed m-0 px-4 py-3"
        style={{ background: "#0A0818", color: "#50FF9C" }}
      >
        {code}
      </pre>
    </div>
  );
}

/* ── MessageContent — splits text / code blocks ────────────────── */
function MessageContent({ content }: { content: string }) {
  const parts = content.split(/(```[\w]*\n[\s\S]*?\n```)/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^```([\w]*)\n([\s\S]*?)\n```$/);
        if (m) return <CodeBlock key={i} lang={m[1] || "text"} code={m[2]} />;
        if (!part) return null;
        return (
          <span key={i} className="whitespace-pre-wrap break-words">
            {part}
          </span>
        );
      })}
    </>
  );
}

type Message = {
  role: "user" | "assistant";
  content: string;
  meta?: { model: string; model_display?: string; reason?: string };
};

/* ── Session persistence ────────────────────────────────────────── */
type SessionMeta = { id: string; name: string; createdAt: number };

const SESSIONS_META_KEY = "iy_sessions_meta_v1";
const ACTIVE_KEY        = "iy_active_session_v1";

function msgKey(id: string) { return `iy_session_msgs_v1_${id}`; }
function genId()  { return Math.random().toString(36).slice(2, 10); }

function loadMeta(): SessionMeta[] {
  try { return JSON.parse(localStorage.getItem(SESSIONS_META_KEY) ?? "[]"); } catch { return []; }
}
function saveMeta(m: SessionMeta[]) {
  localStorage.setItem(SESSIONS_META_KEY, JSON.stringify(m));
}
function loadMsgs(id: string): Message[] {
  try { return JSON.parse(localStorage.getItem(msgKey(id)) ?? "[]"); } catch { return []; }
}
function saveMsgs(id: string, msgs: Message[]) {
  localStorage.setItem(msgKey(id), JSON.stringify(msgs));
}

/* ── Chat page ─────────────────────────────────────────────────── */
export default function Home() {
  const [messages,      setMessages]      = useState<Message[]>([]);
  const [input,         setInput]         = useState("");
  const [loading,       setLoading]       = useState(false);
  const [optimizedMode, setOptimizedMode] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortRef  = useRef<AbortController | null>(null);

  const [sessions,  setSessions]  = useState<SessionMeta[]>([]);
  const [activeId,  setActiveId]  = useState("");
  const [showPanel, setShowPanel] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName,  setEditName]  = useState("");

  // Boot: load session metadata and restore the active session's messages
  useEffect(() => {
    let meta = loadMeta();
    let aid  = localStorage.getItem(ACTIVE_KEY) ?? "";

    if (meta.length === 0) {
      const init: SessionMeta = { id: genId(), name: "session 1", createdAt: Date.now() };
      meta = [init];
      saveMeta(meta);
      aid  = init.id;
      localStorage.setItem(ACTIVE_KEY, aid);
    } else if (!meta.find(s => s.id === aid)) {
      aid = meta[0].id;
      localStorage.setItem(ACTIVE_KEY, aid);
    }

    setSessions(meta);
    setActiveId(aid);
    setMessages(loadMsgs(aid));

    // Consume any template prompt from the projects page
    const pending = localStorage.getItem("iy_pending_prompt");
    if (pending) {
      setInput(pending);
      localStorage.removeItem("iy_pending_prompt");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist messages whenever they change
  useEffect(() => {
    if (activeId) saveMsgs(activeId, messages);
  }, [messages, activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Detect low-RAM optimized mode once on mount
  useEffect(() => {
    api.health().then(h => {
      if (h.ram_available_mb < 1500) setOptimizedMode(true);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function stopGeneration() {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);
    let assistantText = "";
    let capturedMeta: Message["meta"] | undefined;

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      await streamChat({
        messages: next as ChatMessage[],
        signal: ctrl.signal,
        onMeta: (m) => {
          capturedMeta = {
            model:         m.model ?? "local",
            model_display: m.model_display,
            reason:        m.reason,
          };
        },
        onToken: (token) => {
          assistantText += token;
          setMessages([...next, { role: "assistant", content: assistantText }]);
        },
        onError: (err) => {
          setMessages([...next, { role: "assistant", content: `Error: ${err}` }]);
        },
        onDone: () => {
          setMessages([...next, { role: "assistant", content: assistantText, meta: capturedMeta }]);
          setLoading(false);
        },
      });
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setMessages([...next, { role: "assistant", content: `Error: ${err?.message ?? String(err)}` }]);
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  function newSession() {
    const id   = genId();
    const name = `session ${sessions.length + 1}`;
    const meta: SessionMeta = { id, name, createdAt: Date.now() };
    const updated = [meta, ...sessions];
    setSessions(updated);
    saveMeta(updated);
    setActiveId(id);
    localStorage.setItem(ACTIVE_KEY, id);
    setMessages([]);
    setShowPanel(false);
  }

  function switchSession(id: string) {
    if (id === activeId) { setShowPanel(false); return; }
    setActiveId(id);
    localStorage.setItem(ACTIVE_KEY, id);
    setMessages(loadMsgs(id));
    setShowPanel(false);
  }

  function deleteSession(id: string) {
    localStorage.removeItem(msgKey(id));
    const remaining = sessions.filter(s => s.id !== id);
    if (remaining.length === 0) {
      const fresh: SessionMeta = { id: genId(), name: "session 1", createdAt: Date.now() };
      saveMeta([fresh]);
      setSessions([fresh]);
      setActiveId(fresh.id);
      localStorage.setItem(ACTIVE_KEY, fresh.id);
      setMessages([]);
    } else {
      saveMeta(remaining);
      setSessions(remaining);
      if (id === activeId) {
        const next = remaining[0];
        setActiveId(next.id);
        localStorage.setItem(ACTIVE_KEY, next.id);
        setMessages(loadMsgs(next.id));
      }
    }
  }

  function commitRename(id: string) {
    const name = editName.trim();
    setEditingId(null);
    setEditName("");
    if (!name) return;
    const updated = sessions.map(s => s.id === id ? { ...s, name } : s);
    setSessions(updated);
    saveMeta(updated);
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full relative">

      {/* ── Sessions drawer overlay ── */}
      {showPanel && (
        <>
          <div className="absolute inset-0 z-40" onClick={() => setShowPanel(false)} />
          <div
            className="absolute top-0 left-0 bottom-0 z-50 flex flex-col"
            style={{
              width: 230,
              background: "rgba(10,8,20,0.97)",
              borderRight: "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(20px)",
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-3 flex-shrink-0"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
              <span className="text-[10px] font-mono uppercase tracking-[0.18em]"
                    style={{ color: "rgba(255,255,255,0.35)" }}>
                sessions
              </span>
              <button
                onClick={newSession}
                className="text-[9px] font-mono uppercase px-2.5 py-1 rounded-lg"
                style={{
                  background: "rgba(140,80,255,0.15)",
                  border: "1px solid rgba(140,80,255,0.30)",
                  color: "#C8A0FF",
                }}
              >
                + new
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2" style={{ scrollbarWidth: "thin" }}>
              {sessions.map(s => (
                <div
                  key={s.id}
                  className="group flex items-center gap-1 px-2 py-1.5 rounded-lg mb-0.5"
                  style={{
                    background:   s.id === activeId ? "rgba(140,80,255,0.12)" : "transparent",
                    border:       `1px solid ${s.id === activeId ? "rgba(140,80,255,0.25)" : "transparent"}`,
                  }}
                >
                  {editingId === s.id ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter")  commitRename(s.id);
                        if (e.key === "Escape") { setEditingId(null); setEditName(""); }
                      }}
                      onBlur={() => commitRename(s.id)}
                      className="flex-1 min-w-0 text-[12px] font-mono outline-none bg-transparent"
                      style={{
                        color: "#fff",
                        borderBottom: "1px solid rgba(140,80,255,0.40)",
                        caretColor: "#8C50FF",
                      }}
                    />
                  ) : (
                    <button
                      onClick={() => switchSession(s.id)}
                      className="flex-1 min-w-0 text-left text-[12px] font-mono truncate"
                      style={{ color: s.id === activeId ? "#D0B0FF" : "rgba(255,255,255,0.55)" }}
                    >
                      {s.name}
                    </button>
                  )}

                  {editingId !== s.id && (
                    <div className="flex gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setEditingId(s.id); setEditName(s.name); }}
                        className="text-[9px] font-mono px-1 py-0.5 rounded"
                        style={{ color: "rgba(255,255,255,0.30)" }}
                        title="Rename"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => deleteSession(s.id)}
                        className="text-[9px] font-mono px-1 py-0.5 rounded"
                        style={{ color: "rgba(255,100,100,0.50)" }}
                        title="Delete"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Top bar ── */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-10 py-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(14,12,24,0.5)", backdropFilter: "blur(20px)" }}
      >
        <button
          onClick={() => setShowPanel(v => !v)}
          className="font-mono text-[10px] uppercase tracking-[0.12em] flex items-center gap-2 transition-all"
          style={{ color: showPanel ? "#B888FF" : "rgba(255,255,255,0.35)" }}
        >
          sessions
          <span
            className="px-1.5 py-0.5 rounded-full text-[9px]"
            style={{
              background: "rgba(140,80,255,0.15)",
              border: "1px solid rgba(140,80,255,0.25)",
              color: "#B888FF",
            }}
          >
            {sessions.length}
          </span>
        </button>
        {optimizedMode && (
          <span
            className="font-mono text-[9px] uppercase tracking-[0.14em] px-2.5 py-1 rounded-full"
            style={{
              background: "rgba(255,160,60,0.10)",
              border: "1px solid rgba(255,160,60,0.22)",
              color: "rgba(255,180,80,0.80)",
            }}
          >
            ⚡ optimized mode
          </span>
        )}
        <button
          onClick={newSession}
          className="font-mono text-[10px] uppercase tracking-[0.12em] px-3 py-1.5 rounded-lg transition-all duration-200"
          style={{ border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.50)", background: "transparent", cursor: "pointer" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#B888FF"; e.currentTarget.style.color = "#B888FF"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; e.currentTarget.style.color = "rgba(255,255,255,0.50)"; }}
        >
          + new
        </button>
      </div>

      {/* ── Messages / Empty state ── */}
      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          /* ── Empty: hero layout ── */
          <div
            className="grid items-center gap-12 px-10 py-12 mx-auto"
            style={{ gridTemplateColumns: "1fr 1fr", maxWidth: 900 }}
          >
            <div>
              {/* eyebrow */}
              <div
                className="flex items-center gap-2.5 mb-5 font-mono uppercase"
                style={{ fontSize: 10.5, letterSpacing: "0.18em", color: "rgba(255,255,255,0.40)" }}
              >
                <span className="w-5 h-px" style={{ background: "#8C50FF", display: "inline-block" }} />
                a session, awaiting
              </div>

              {/* headline */}
              <h1
                className="lowercase mb-5"
                style={{ fontSize: 56, lineHeight: 0.98, letterSpacing: "-0.025em", fontWeight: 200 }}
              >
                the{" "}
                <em style={{ fontStyle: "italic", fontWeight: 300, color: "#B888FF" }}>future</em>
                <br />in action.
              </h1>

              <p style={{ fontSize: 15, lineHeight: 1.55, color: "rgba(255,255,255,0.55)", maxWidth: 340, marginBottom: 24 }}>
                run a frontier-class assistant on your own machine — quietly, locally, beautifully.
              </p>

              {/* suggestion pills */}
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="text-left font-mono lowercase transition-all duration-200"
                    style={{
                      padding: "7px 14px",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: 100,
                      fontSize: 12,
                      color: "rgba(255,255,255,0.70)",
                      background: "rgba(255,255,255,0.02)",
                      cursor: "pointer",
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = "#B888FF";
                      e.currentTarget.style.color = "#B888FF";
                      e.currentTarget.style.background = "rgba(184,136,255,0.10)";
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
                      e.currentTarget.style.color = "rgba(255,255,255,0.70)";
                      e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* hero logo */}
            <div className="flex justify-center items-center">
              <HeroLogo />
            </div>
          </div>
        ) : (
          /* ── Message list ── */
          <div className="px-10 py-8" style={{ maxWidth: 760 }}>
            {messages.map((msg, i) => {
              const isUser = msg.role === "user";
              return (
                <div key={i} className="iy-msg mb-8">
                  {/* label row */}
                  <div
                    className="flex items-center gap-2.5 mb-2 font-mono uppercase"
                    style={{
                      fontSize: 9.5,
                      letterSpacing: "0.18em",
                      color: isUser ? "#B888FF" : "rgba(255,255,255,0.30)",
                      fontWeight: isUser ? 600 : 400,
                    }}
                  >
                    {isUser ? "you" : "intelliyash"}
                    <span className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)", display: "inline-block" }} />
                  </div>

                  {/* body */}
                  <div
                    style={
                      isUser
                        ? { fontSize: 24, lineHeight: 1.2, fontWeight: 200, letterSpacing: "-0.015em", textTransform: "lowercase" }
                        : { fontSize: 15, lineHeight: 1.65, fontWeight: 300 }
                    }
                  >
                    {isUser ? msg.content : <MessageContent content={msg.content} />}
                  </div>

                  {/* Local / Cloud indicator */}
                  {!isUser && msg.meta && msg.content && (
                    <div className="mt-2">
                      <span
                        className="text-[9px] font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded-full"
                        style={
                          msg.meta.model === "cloud"
                            ? { background: "rgba(140,80,255,0.10)", border: "1px solid rgba(140,80,255,0.22)", color: "#B888FF" }
                            : msg.meta.model === "fallback"
                            ? { background: "rgba(255,160,60,0.08)", border: "1px solid rgba(255,160,60,0.22)", color: "rgba(255,180,80,0.75)" }
                            : { background: "rgba(80,255,156,0.06)", border: "1px solid rgba(80,255,156,0.18)", color: "rgba(80,255,156,0.70)" }
                        }
                      >
                        {msg.meta.model === "cloud"
                          ? "☁ cloud"
                          : msg.meta.model === "fallback"
                          ? "⚡ optimized"
                          : `⬡ local · ${msg.meta.model_display || msg.meta.model}`}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* loading dots */}
            {loading && (
              <div className="iy-msg mb-8">
                <div
                  className="flex items-center gap-2.5 mb-2 font-mono uppercase"
                  style={{ fontSize: 9.5, letterSpacing: "0.18em", color: "rgba(255,255,255,0.30)" }}
                >
                  intelliyash
                  <span className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)", display: "inline-block" }} />
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="rounded-full inline-block"
                      style={{
                        width: 6, height: 6,
                        background: "#B888FF",
                        boxShadow: "0 0 6px #8C50FF",
                        animation: `iy-dot 1.2s ease-in-out ${delay}ms infinite`,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Composer ── */}
      <div
        className="flex-shrink-0 px-10 py-4"
        style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div
          className="iy-composer flex items-center gap-3 px-5 py-3.5 rounded-lg"
          style={{
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.02)",
            backdropFilter: "blur(24px)",
            transition: "all 300ms ease",
          }}
        >
          <span style={{ color: "#B888FF", fontSize: 16, flexShrink: 0 }}>→</span>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="address the machine"
            rows={1}
            className="flex-1 resize-none bg-transparent border-none outline-none text-[15px] leading-normal font-sans"
            style={{ color: "#fff", fontWeight: 300 }}
          />
          <span
            className="font-mono uppercase flex-shrink-0"
            style={{ fontSize: 9.5, letterSpacing: "0.12em", color: "rgba(255,255,255,0.30)" }}
          >
            ↵ send
          </span>
          {loading && (
            <button
              onClick={stopGeneration}
              className="font-mono text-[10px] uppercase tracking-[0.10em] flex-shrink-0 transition-all duration-200"
              style={{
                border: "1px solid rgba(255,100,100,0.35)",
                color: "rgba(255,120,120,0.75)",
                background: "transparent",
                padding: "5px 12px",
                borderRadius: 100,
                cursor: "pointer",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,100,100,0.65)"; e.currentTarget.style.color = "rgba(255,140,140,1)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,100,100,0.35)"; e.currentTarget.style.color = "rgba(255,120,120,0.75)"; }}
            >
              ■ stop
            </button>
          )}
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="font-semibold uppercase tracking-[0.16em] flex-shrink-0 transition-all duration-200 disabled:opacity-30"
            style={{
              background: "#8C50FF",
              color: "#fff",
              border: "none",
              padding: "8px 18px",
              borderRadius: 100,
              fontSize: 10,
              cursor: "pointer",
              boxShadow: "0 0 16px rgba(140,80,255,0.45)",
            }}
            onMouseEnter={e => { if (!loading) { e.currentTarget.style.background = "#B888FF"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
            onMouseLeave={e => { e.currentTarget.style.background = "#8C50FF"; e.currentTarget.style.transform = "translateY(0)"; }}
          >
            dispatch
          </button>
        </div>
      </div>
    </div>
  );
}
