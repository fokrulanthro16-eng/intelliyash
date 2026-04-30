"use client";

import { useState } from "react";
import { api } from "@/lib/api";

export default function PlaygroundPage() {
  const [apiKey,   setApiKey]   = useState("");
  const [model,    setModel]    = useState("local");
  const [userMsg,  setUserMsg]  = useState("");
  const [result,   setResult]   = useState<any>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [showReq,  setShowReq]  = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [elapsed,  setElapsed]  = useState<number | null>(null);

  const messages    = userMsg.trim() ? [{ role: "user", content: userMsg }] : [];
  const requestJson = JSON.stringify({ model, messages, stream: false }, null, 2);

  async function send() {
    if (!userMsg.trim() || !apiKey.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setElapsed(null);
    const t0 = Date.now();
    try {
      const data = await api.v1Chat(apiKey.trim(), [{ role: "user", content: userMsg }], model);
      setElapsed(Date.now() - t0);
      setResult(data);
    } catch (e: any) {
      setError(e?.message ?? "unknown error");
    } finally {
      setLoading(false);
    }
  }

  const content = result?.choices?.[0]?.message?.content ?? "";

  return (
    <div className="h-full overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
      <div className="max-w-3xl mx-auto px-10 py-8 space-y-6">

        {/* ── Header ── */}
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] mb-1.5"
             style={{ color: "rgba(255,255,255,0.30)" }}>
            api playground
          </p>
          <h1 className="text-[26px] font-light tracking-[-0.02em]" style={{ color: "#fff" }}>
            Playground
          </h1>
          <p className="text-sm mt-1.5 font-light" style={{ color: "rgba(255,255,255,0.40)" }}>
            Test the OpenAI-compatible{" "}
            <span className="font-mono text-[11px]" style={{ color: "#B888FF" }}>/v1/</span>
            {" "}endpoint with a developer API key.
          </p>
        </div>

        {/* ── Input panel ── */}
        <div
          className="rounded-xl p-5 space-y-4"
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <p className="text-[10px] font-mono uppercase tracking-[0.20em]"
             style={{ color: "rgba(255,255,255,0.28)" }}>
            request
          </p>

          {/* API key + model row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className="text-[10px] font-mono uppercase tracking-[0.14em] block mb-1.5"
                style={{ color: "rgba(255,255,255,0.30)" }}
              >
                api key
              </label>
              <input
                type="password"
                placeholder="IY_…"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                className="w-full text-[12px] font-mono outline-none"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  color: "#fff",
                  caretColor: "#8C50FF",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = "rgba(140,80,255,0.45)"; }}
                onBlur={e  => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)"; }}
              />
            </div>
            <div>
              <label
                className="text-[10px] font-mono uppercase tracking-[0.14em] block mb-1.5"
                style={{ color: "rgba(255,255,255,0.30)" }}
              >
                model
              </label>
              <select
                value={model}
                onChange={e => setModel(e.target.value)}
                className="w-full text-[12px] font-mono outline-none"
                style={{
                  background: "rgba(20,16,36,0.95)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  color: "#fff",
                  cursor: "pointer",
                  appearance: "none",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = "rgba(140,80,255,0.45)"; }}
                onBlur={e  => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)"; }}
              >
                <option value="local" style={{ background: "#0E0C18" }}>local</option>
                <option value="cloud" style={{ background: "#0E0C18" }}>cloud</option>
              </select>
            </div>
          </div>

          {/* Message textarea */}
          <div>
            <label
              className="text-[10px] font-mono uppercase tracking-[0.14em] block mb-1.5"
              style={{ color: "rgba(255,255,255,0.30)" }}
            >
              user message
            </label>
            <textarea
              rows={5}
              placeholder="Write a Python hello world…"
              value={userMsg}
              onChange={e => setUserMsg(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(); }}
              className="w-full text-sm font-light outline-none resize-none"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 8,
                padding: "10px 14px",
                color: "#fff",
                caretColor: "#8C50FF",
                lineHeight: "1.6",
              }}
              onFocus={e => { e.currentTarget.style.borderColor = "rgba(140,80,255,0.45)"; }}
              onBlur={e  => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)"; }}
            />
            <p className="text-[10px] font-mono mt-1" style={{ color: "rgba(255,255,255,0.20)" }}>
              ctrl+enter to send
            </p>
          </div>

          {/* Request JSON toggle */}
          <div>
            <button
              onClick={() => setShowReq(v => !v)}
              className="text-[10px] font-mono uppercase tracking-[0.12em] transition"
              style={{ color: showReq ? "#B888FF" : "rgba(255,255,255,0.30)" }}
            >
              {showReq ? "▾" : "▸"} request json
            </button>
            {showReq && (
              <pre
                className="mt-2 text-[11px] font-mono p-3 rounded-lg overflow-x-auto leading-relaxed"
                style={{
                  background: "rgba(8,6,18,0.70)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  color: "#A8E0A8",
                }}
              >
                {requestJson}
              </pre>
            )}
          </div>

          {/* Send button */}
          <div className="flex items-center gap-3">
            <button
              onClick={send}
              disabled={!userMsg.trim() || !apiKey.trim() || loading}
              className="text-[13px] font-mono uppercase tracking-[0.14em] px-6 py-2.5 rounded-xl transition disabled:opacity-40"
              style={{
                background: "rgba(140,80,255,0.18)",
                border: "1px solid rgba(140,80,255,0.45)",
                color: "#C8A0FF",
                boxShadow: "0 0 20px rgba(140,80,255,0.15)",
              }}
              onMouseEnter={e => {
                if (!loading) {
                  e.currentTarget.style.background = "rgba(140,80,255,0.28)";
                  e.currentTarget.style.boxShadow  = "0 0 30px rgba(140,80,255,0.25)";
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "rgba(140,80,255,0.18)";
                e.currentTarget.style.boxShadow  = "0 0 20px rgba(140,80,255,0.15)";
              }}
            >
              {loading ? "···" : "send"}
            </button>
            {elapsed !== null && (
              <span className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,0.30)" }}>
                {(elapsed / 1000).toFixed(2)}s
              </span>
            )}
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div
            className="rounded-xl p-4"
            style={{
              background: "rgba(255,80,80,0.06)",
              border: "1px solid rgba(255,80,80,0.20)",
            }}
          >
            <p className="text-[10px] font-mono uppercase tracking-[0.14em] mb-1"
               style={{ color: "rgba(255,100,100,0.70)" }}>
              error
            </p>
            <p className="text-[12px] font-mono" style={{ color: "rgba(255,160,160,0.80)" }}>
              {error}
            </p>
          </div>
        )}

        {/* ── Response ── */}
        {result && (
          <div
            className="rounded-xl p-5 space-y-4"
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div className="flex items-center justify-between">
              <span
                className="text-[10px] font-mono uppercase tracking-[0.20em]"
                style={{ color: "rgba(255,255,255,0.30)" }}
              >
                response
              </span>
              <div className="flex items-center gap-3">
                {result?.model && (
                  <span className="text-[10px] font-mono" style={{ color: "rgba(184,136,255,0.60)" }}>
                    {result.model}
                  </span>
                )}
                {result?.usage?.total_tokens != null && (
                  <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>
                    {result.usage.total_tokens} tok
                  </span>
                )}
                {elapsed !== null && (
                  <span
                    className="text-[10px] font-mono px-2 py-0.5 rounded-md"
                    style={{
                      background: "rgba(140,80,255,0.10)",
                      border: "1px solid rgba(140,80,255,0.22)",
                      color: "#B888FF",
                    }}
                  >
                    {(elapsed / 1000).toFixed(2)}s
                  </span>
                )}
              </div>
            </div>

            {/* Content */}
            <div
              className="text-sm font-light leading-relaxed whitespace-pre-wrap"
              style={{ color: "rgba(255,255,255,0.80)" }}
            >
              {content || (
                <span style={{ color: "rgba(255,255,255,0.25)" }}>(empty response)</span>
              )}
            </div>

            {/* Full JSON toggle */}
            <div>
              <button
                onClick={() => setShowJson(v => !v)}
                className="text-[10px] font-mono uppercase tracking-[0.12em] transition"
                style={{ color: showJson ? "#B888FF" : "rgba(255,255,255,0.30)" }}
              >
                {showJson ? "▾" : "▸"} full response json
              </button>
              {showJson && (
                <pre
                  className="mt-2 text-[10px] font-mono p-3 rounded-lg overflow-x-auto leading-relaxed"
                  style={{
                    background: "rgba(8,6,18,0.70)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    color: "#A8E0A8",
                    maxHeight: 400,
                  }}
                >
                  {JSON.stringify(result, null, 2)}
                </pre>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
