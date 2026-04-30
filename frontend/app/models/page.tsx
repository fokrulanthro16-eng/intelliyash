"use client";

import { useEffect, useState } from "react";
import { api, type ModelInfo } from "@/lib/api";

const PACKS: { tiers: string[]; label: string; ramHint: string }[] = [
  { tiers: ["tiny"],            label: "Tiny Pack",  ramHint: "under 1.5 GB RAM" },
  { tiers: ["mini"],            label: "Lite Pack",  ramHint: "1.5 – 3 GB RAM"  },
  { tiers: ["medium", "large"], label: "Heavy Pack", ramHint: "3 GB+ RAM"        },
];

const FILTERS = ["all", "chat", "code", "reasoning", "recommended"];

export default function ModelsPage() {
  const [models,       setModels]       = useState<ModelInfo[]>([]);
  const [loaded,       setLoaded]       = useState<string | null>(null);
  const [tier,         setTier]         = useState<string>("");
  const [ramAvailable, setRamAvailable] = useState(0);
  const [busy,         setBusy]         = useState<string | null>(null);
  const [loadError,    setLoadError]    = useState<{ id: string; message: string } | null>(null);
  const [search,       setSearch]       = useState("");
  const [filter,       setFilter]       = useState("all");

  async function refresh() {
    const [r, h] = await Promise.all([api.models(), api.health()]);
    setModels(r.models);
    setLoaded(r.loaded);
    setTier(r.recommended_tier);
    setRamAvailable(h.ram_available_mb);
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, []);

  async function download(id: string) {
    setBusy(id);
    try {
      await api.downloadModel(id);
      for (let i = 0; i < 600; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const r = await api.models();
        const m = r.models.find((x) => x.id === id);
        if (m?.downloaded) break;
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function load(id: string) {
    setBusy(id);
    setLoadError(null);
    try {
      await api.loadModel(id);
      await refresh();
    } catch (err: any) {
      setLoadError({ id, message: err.message ?? "Load failed" });
    } finally {
      setBusy(null);
    }
  }

  async function unload() {
    setBusy("__unload");
    try {
      await api.unloadModel();
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  const isSafe    = (m: ModelInfo) => ramAvailable === 0 || ramAvailable >= m.runtime_ram_mb + 300;
  const ramNeeded = (m: ModelInfo) => Math.max(0, m.runtime_ram_mb + 300 - ramAvailable);

  const bestMatch = tier
    ? (models.find(m => m.tier === tier && isSafe(m) && !m.downloaded)
    ?? models.find(m => m.tier === tier && isSafe(m)))
    : null;

  const filterModel = (m: ModelInfo) => {
    if (filter === "recommended") return m.tier === tier;
    if (filter !== "all")         return m.tasks.includes(filter);
    return true;
  };

  const searchModel = (m: ModelInfo) =>
    !search ||
    m.display_name.toLowerCase().includes(search.toLowerCase()) ||
    m.description.toLowerCase().includes(search.toLowerCase());

  return (
    <div className="h-full overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
      <div className="max-w-5xl mx-auto px-10 py-8">

        {/* ── Page header ── */}
        <div className="mb-7">
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] mb-1.5"
             style={{ color: "rgba(255,255,255,0.30)" }}>
            model store
          </p>
          <h1 className="text-[26px] font-light tracking-[-0.02em]" style={{ color: "#fff" }}>
            Local AI Models
          </h1>
          <p className="text-sm mt-1.5 font-light"
             style={{ color: "rgba(255,255,255,0.40)" }}>
            Auto-selected for your{" "}
            <span style={{ color: "#B888FF", fontWeight: 500 }}>{tier || "···"}</span>-tier hardware
            {ramAvailable > 0 && (
              <> · <span style={{ color: "rgba(255,255,255,0.70)" }}>{ramAvailable.toLocaleString()} MB</span> free</>
            )}
            . Manual override available below.
          </p>
        </div>

        {/* ── Search + filters ── */}
        <div className="flex flex-wrap gap-3 mb-6 items-center">
          <div
            className="flex items-center gap-2 px-3 py-2 flex-1 min-w-[200px]"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ opacity: 0.35 }}>
              <circle cx="6" cy="6" r="4.5" stroke="white" strokeWidth="1.4"/>
              <path d="M10 10L13 13" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search models…"
              className="flex-1 bg-transparent outline-none text-sm font-light"
              style={{ color: "#fff", caretColor: "#8C50FF" }}
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="text-[11px] font-mono uppercase tracking-[0.12em] px-3 py-1.5 rounded-full transition-all duration-150"
                style={filter === f ? {
                  background: "rgba(140,80,255,0.18)",
                  border: "1px solid rgba(140,80,255,0.5)",
                  color: "#B888FF",
                } : {
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.40)",
                }}
              >
                {f}
              </button>
            ))}
          </div>

          <button
            onClick={refresh}
            className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.1em] px-3 py-1.5 rounded-full transition-all"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.40)",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.40)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
          >
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
              <path d="M13 7A6 6 0 1 1 7 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M13 1v6h-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            refresh
          </button>
        </div>

        {/* ── Loaded banner ── */}
        {loaded && (
          <div
            className="mb-6 flex items-center justify-between px-5 py-3.5 rounded-xl"
            style={{
              background: "rgba(140,80,255,0.08)",
              border: "1px solid rgba(140,80,255,0.28)",
            }}
          >
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.14em] mb-0.5"
                 style={{ color: "rgba(184,136,255,0.6)" }}>currently loaded</p>
              <p className="text-sm font-medium" style={{ color: "#B888FF" }}>{loaded}</p>
            </div>
            <button
              onClick={unload}
              disabled={busy === "__unload"}
              className="text-[11px] font-mono uppercase tracking-[0.12em] px-3 py-1.5 rounded-lg transition disabled:opacity-40"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.60)",
              }}
            >
              {busy === "__unload" ? "unloading…" : "unload"}
            </button>
          </div>
        )}

        {/* ── Auto suggestion callout ── */}
        {bestMatch && !loaded && (
          <div
            className="mb-6 flex items-center justify-between gap-4 px-5 py-4 rounded-xl"
            style={{
              background: "rgba(80,255,156,0.04)",
              border: "1px solid rgba(80,255,156,0.18)",
            }}
          >
            <div className="min-w-0">
              <p
                className="text-[10px] font-mono uppercase tracking-[0.14em] mb-1"
                style={{ color: "rgba(80,255,156,0.55)" }}
              >
                best match for your hardware
              </p>
              <p className="text-sm font-medium" style={{ color: "#fff" }}>
                {bestMatch.display_name}
              </p>
              <p className="text-[11px] font-mono mt-0.5" style={{ color: "rgba(255,255,255,0.30)" }}>
                {bestMatch.runtime_ram_mb} MB RAM · {bestMatch.size_mb} MB disk
                {ramAvailable > 0 && (
                  <span style={{ color: "rgba(80,255,156,0.60)" }}>
                    {" "}· {ramAvailable.toLocaleString()} MB available
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={() =>
                bestMatch.downloaded ? load(bestMatch.id) : download(bestMatch.id)
              }
              disabled={busy === bestMatch.id}
              className="flex-shrink-0 text-[11px] font-mono uppercase tracking-[0.10em] px-4 py-2 rounded-lg transition disabled:opacity-40"
              style={{
                background: "rgba(80,255,156,0.10)",
                border: "1px solid rgba(80,255,156,0.28)",
                color: "rgba(80,255,156,0.85)",
              }}
            >
              {busy === bestMatch.id
                ? "···"
                : bestMatch.downloaded
                ? "→ load"
                : "↓ download"}
            </button>
          </div>
        )}

        {/* ── Model list ── */}
        {models.length === 0 ? (
          <div className="text-sm font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>
            loading registry···
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {PACKS.map((pack) => {
              const packModels = models
                .filter(m => pack.tiers.includes(m.tier))
                .filter(filterModel)
                .filter(searchModel);
              if (packModels.length === 0) return null;
              const isRecommendedPack = pack.tiers.includes(tier);

              return (
                <section key={pack.label}>
                  {/* Pack label */}
                  <div className="flex items-center gap-3 mb-3">
                    <span
                      className="text-[11px] font-mono uppercase tracking-[0.18em]"
                      style={{ color: isRecommendedPack ? "#B888FF" : "rgba(255,255,255,0.35)" }}
                    >
                      {pack.label}
                    </span>
                    <span className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,0.22)" }}>
                      {pack.ramHint}
                    </span>
                    {isRecommendedPack && (
                      <span
                        className="text-[9px] font-mono uppercase tracking-[0.16em] px-2 py-0.5 rounded-full"
                        style={{
                          background: "rgba(140,80,255,0.15)",
                          border: "1px solid rgba(140,80,255,0.35)",
                          color: "#B888FF",
                        }}
                      >
                        recommended
                      </span>
                    )}
                    <span className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.05)" }} />
                  </div>

                  <div className="grid gap-3">
                    {packModels.map((m) => {
                      const safe        = isSafe(m);
                      const recommended = m.tier === tier;
                      const isLoaded    = loaded === m.id;
                      const isBusy      = busy === m.id;

                      return (
                        <ModelCard
                          key={m.id}
                          m={m}
                          safe={safe}
                          recommended={recommended}
                          isLoaded={isLoaded}
                          isBusy={isBusy}
                          ramNeeded={ramNeeded(m)}
                          ramAvailable={ramAvailable}
                          loadError={loadError}
                          onDownload={() => download(m.id)}
                          onLoad={() => load(m.id)}
                        />
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ModelCard({
  m, safe, recommended, isLoaded, isBusy, ramNeeded, ramAvailable, loadError, onDownload, onLoad,
}: {
  m: ModelInfo;
  safe: boolean;
  recommended: boolean;
  isLoaded: boolean;
  isBusy: boolean;
  ramNeeded: number;
  ramAvailable: number;
  loadError: { id: string; message: string } | null;
  onDownload: () => void;
  onLoad: () => void;
}) {
  const borderColor = isLoaded
    ? "rgba(140,80,255,0.45)"
    : safe
    ? "rgba(255,255,255,0.08)"
    : "rgba(255,255,255,0.05)";

  const bgColor = isLoaded
    ? "rgba(140,80,255,0.06)"
    : "rgba(255,255,255,0.02)";

  return (
    <div
      className="rounded-xl p-4 transition-all duration-200"
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        opacity: safe ? 1 : 0.55,
      }}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Avatar + info */}
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="flex-shrink-0 flex items-center justify-center rounded-lg text-[11px] font-bold"
            style={{
              width: 38, height: 38,
              background: isLoaded
                ? "rgba(140,80,255,0.20)"
                : "rgba(255,255,255,0.06)",
              border: `1px solid ${isLoaded ? "rgba(140,80,255,0.4)" : "rgba(255,255,255,0.08)"}`,
              color: isLoaded ? "#B888FF" : "rgba(255,255,255,0.35)",
              fontFamily: "JetBrains Mono, monospace",
            }}
          >
            {m.display_name.slice(0, 2).toUpperCase()}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-[14px] font-medium" style={{ color: "#fff" }}>
                {m.display_name}
              </span>
              {m.tasks.map((t) => (
                <Tag key={t} variant="muted">{t}</Tag>
              ))}
              {recommended && <Tag variant="violet">recommended</Tag>}
              {isLoaded     && <Tag variant="active">loaded</Tag>}
              {safe  &&  m.downloaded && <Tag variant="safe">local ready</Tag>}
              {!safe &&  m.downloaded && <Tag variant="violet">cloud recommended</Tag>}
              {!safe && !m.downloaded && <Tag variant="warn">+{ramNeeded} MB needed</Tag>}
            </div>
            <p className="text-[13px] font-light leading-relaxed"
               style={{ color: "rgba(255,255,255,0.45)" }}>
              {m.description}
            </p>
            <p className="text-[11px] font-mono mt-1.5"
               style={{ color: "rgba(255,255,255,0.22)" }}>
              ~{m.size_mb} MB disk · {m.runtime_ram_mb} MB RAM required
              {ramAvailable > 0 && (
                <span style={{ color: safe ? "rgba(80,255,156,0.60)" : "rgba(255,160,60,0.70)" }}>
                  {" "}· {ramAvailable} MB available
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Action button */}
        <div className="shrink-0">
          {!m.downloaded ? (
            <button
              onClick={onDownload}
              disabled={isBusy || !safe}
              title={!safe ? `Need ${ramNeeded} MB more free RAM` : undefined}
              className="text-[11px] font-mono uppercase tracking-[0.1em] px-4 py-2 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: isBusy ? "#B888FF" : "rgba(255,255,255,0.60)",
              }}
            >
              {isBusy ? "downloading···" : "↓ download"}
            </button>
          ) : (
            <button
              onClick={onLoad}
              disabled={isBusy || isLoaded || !safe}
              title={!safe ? `Need ${ramNeeded} MB more free RAM` : undefined}
              className="text-[11px] font-mono uppercase tracking-[0.1em] px-4 py-2 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
              style={isLoaded ? {
                background: "rgba(140,80,255,0.15)",
                border: "1px solid rgba(140,80,255,0.4)",
                color: "#B888FF",
              } : {
                background: "rgba(140,80,255,0.10)",
                border: "1px solid rgba(140,80,255,0.30)",
                color: "#C8A0FF",
              }}
            >
              {isLoaded ? "● active" : isBusy ? "loading···" : "→ load"}
            </button>
          )}
        </div>
      </div>

      {loadError?.id === m.id && (
        <div
          className="mt-3 text-[11px] font-mono rounded-lg px-3 py-2"
          style={{
            background: "rgba(255,80,80,0.06)",
            border: "1px solid rgba(255,80,80,0.20)",
            color: "rgba(255,140,140,0.85)",
          }}
        >
          ⚠ {loadError.message}
        </div>
      )}
    </div>
  );
}

function Tag({
  children,
  variant = "muted",
}: {
  children: React.ReactNode;
  variant?: "muted" | "violet" | "active" | "safe" | "warn";
}) {
  const styles: Record<string, React.CSSProperties> = {
    muted:  { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.35)" },
    violet: { background: "rgba(140,80,255,0.12)",  border: "1px solid rgba(140,80,255,0.30)",  color: "#B888FF" },
    active: { background: "rgba(140,80,255,0.18)",  border: "1px solid rgba(140,80,255,0.45)",  color: "#D0A8FF" },
    safe:   { background: "rgba(80,255,156,0.08)",  border: "1px solid rgba(80,255,156,0.22)",  color: "rgba(80,255,156,0.80)" },
    warn:   { background: "rgba(255,160,60,0.08)",  border: "1px solid rgba(255,160,60,0.22)",  color: "rgba(255,180,80,0.80)" },
  };
  return (
    <span
      className="text-[9px] font-mono uppercase tracking-[0.14em] px-2 py-0.5 rounded-full"
      style={styles[variant]}
    >
      {children}
    </span>
  );
}
