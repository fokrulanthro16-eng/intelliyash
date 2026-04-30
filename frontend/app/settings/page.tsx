"use client";

import { useEffect, useRef, useState } from "react";
import { api, type Settings, type SystemInfo, type ApiKey, type ApiKeyFull } from "@/lib/api";

const PROVIDERS = [
  { value: "anthropic", label: "Anthropic (Claude)", placeholder: "sk-ant-…", field: "cloud_api_key" },
  { value: "openai", label: "OpenAI (GPT)", placeholder: "sk-…", field: "openai_api_key" },
  { value: "gemini", label: "Google Gemini", placeholder: "AIza…", field: "gemini_api_key" },
  { value: "huggingface", label: "HuggingFace", placeholder: "hf_…", field: "hf_token" },
] as const;

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState("anthropic");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([api.getSettings(), api.system()]).then(([ss, sy]) => {
      setS(ss);
      setSys(sy);
      if (ss.cloud_provider) setProvider(ss.cloud_provider);
    });
  }, []);

  async function save() {
    if (!s) return;
    const patch: any = {
      enable_cloud_fallback: s.enable_cloud_fallback,
      cloud_provider: provider,
      temperature: s.temperature,
      max_tokens: s.max_tokens,
      idle_unload_seconds: s.idle_unload_seconds,
    };
    if (apiKey) {
      const prov = PROVIDERS.find(p => p.value === provider) ?? PROVIDERS[0];
      patch[prov.field] = apiKey;
    }
    const updated = await api.updateSettings(patch);
    setS(updated);
    setApiKey("");
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function redetect() {
    const sy = await api.redetect();
    setSys(sy);
  }

  if (!s || !sys) {
    return (
      <div className="h-full flex items-center justify-center">
        <span className="text-sm font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>
          loading···
        </span>
      </div>
    );
  }

  const SPECS = [
    { label: "OS / arch", value: `${sys.os} ${sys.arch}` },
    { label: "CPU cores", value: `${sys.cpu_cores_physical}p / ${sys.cpu_cores_logical}l` },
    { label: "RAM total", value: `${sys.ram_total_mb.toLocaleString()} MB` },
    { label: "RAM free", value: `${sys.ram_available_mb.toLocaleString()} MB` },
    { label: "Disk free", value: `${sys.disk_free_gb} GB` },
    { label: "AVX2", value: sys.has_avx2 ? "yes" : "no" },
    { label: "CUDA", value: sys.has_cuda ? "yes" : "no" },
    { label: "Threads", value: String(sys.recommended_threads) },
    { label: "Context", value: `${sys.recommended_ctx} tok` },
  ];

  return (
    <div className="h-full overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
      <div className="max-w-3xl mx-auto px-10 py-8 space-y-8">

        {/* ── Page header ── */}
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] mb-1.5"
            style={{ color: "rgba(255,255,255,0.30)" }}>
            system settings
          </p>
          <h1 className="text-[26px] font-light tracking-[-0.02em]" style={{ color: "#fff" }}>
            Configuration
          </h1>
          <p className="text-sm mt-1.5 font-light" style={{ color: "rgba(255,255,255,0.40)" }}>
            Sensible defaults already applied for your hardware. Change at your own risk.
          </p>
        </div>

        {/* ── Setup wizard ── */}
        <SetupWizardCard sys={sys} s={s} />

        {/* ── Hardware spec stack ── */}
        <Section
          label="detected hardware"
          action={
            <button
              onClick={redetect}
              className="text-[10px] font-mono uppercase tracking-[0.12em] px-3 py-1.5 rounded-lg transition"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.10)",
                color: "rgba(255,255,255,0.40)",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.40)"; }}
            >
              re-detect
            </button>
          }
        >
          {/* Tier badge */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-mono uppercase tracking-[0.12em]"
              style={{ color: "rgba(255,255,255,0.35)" }}>
              performance tier
            </span>
            <span
              className="text-[13px] font-mono font-semibold uppercase tracking-[0.22em] px-3 py-1 rounded-lg"
              style={{
                background: "rgba(140,80,255,0.15)",
                border: "1px solid rgba(140,80,255,0.35)",
                color: "#B888FF",
              }}
            >
              {sys.tier}
            </span>
          </div>

          {/* Spec rail */}
          <div className="grid grid-cols-3 gap-2">
            {SPECS.map(({ label, value }) => (
              <div
                key={label}
                className="px-3 py-2.5 rounded-lg"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <p className="text-[9px] font-mono uppercase tracking-[0.14em] mb-1"
                  style={{ color: "rgba(255,255,255,0.28)" }}>
                  {label}
                </p>
                <p className="text-[12px] font-mono" style={{ color: "rgba(255,255,255,0.70)" }}>
                  {value}
                </p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Generation sliders ── */}
        <Section label="generation">
          <VioletSlider
            label="Temperature"
            hint="Higher = more creative. Lower = more focused."
            min={0} max={2} step={0.05}
            value={s.temperature}
            onChange={(v) => setS({ ...s, temperature: v })}
            displayFmt={(v) => v.toFixed(2)}
          />
          <VioletSlider
            label="Max tokens per reply"
            min={64} max={2048} step={32}
            value={s.max_tokens}
            onChange={(v) => setS({ ...s, max_tokens: v })}
            displayFmt={(v) => String(v)}
          />
          <VioletSlider
            label="Idle unload"
            hint="Free RAM after this many seconds of inactivity."
            min={30} max={1800} step={30}
            value={s.idle_unload_seconds}
            onChange={(v) => setS({ ...s, idle_unload_seconds: v })}
            displayFmt={(v) => `${v}s`}
          />
        </Section>

        {/* ── Cloud fallback ── */}
        <Section label="cloud fallback">
          <p className="text-sm font-light leading-relaxed mb-5"
            style={{ color: "rgba(255,255,255,0.40)" }}>
            Off by default. Enable for a hosted model on very long or hard requests when local
            inference would be slow. API key held in memory only — never written to disk.
          </p>

          {/* Toggle row */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.75)" }}>
                Enable cloud fallback
              </p>
              <p className="text-[11px] font-mono mt-0.5"
                style={{ color: "rgba(255,255,255,0.28)" }}>
                {s.enable_cloud_fallback ? "active — will use hosted model when needed" : "inactive — local inference only"}
              </p>
            </div>
            <TogglePill
              checked={s.enable_cloud_fallback}
              onChange={(v) => setS({ ...s, enable_cloud_fallback: v })}
            />
          </div>

          {/* Vertical rail separator */}
          <div
            className="flex gap-4 pl-4 flex-col"
            style={{ borderLeft: "2px solid rgba(140,80,255,0.20)" }}
          >
            {/* Provider selector */}
            <div>
              <label className="text-[11px] font-mono uppercase tracking-[0.12em] block mb-2"
                style={{ color: "rgba(255,255,255,0.35)" }}>
                provider
              </label>
              <select
                value={provider}
                onChange={e => { setProvider(e.target.value); setApiKey(""); }}
                className="w-full text-sm font-mono outline-none transition"
                style={{
                  background: "rgba(20,16,36,0.95)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 10,
                  padding: "10px 14px",
                  color: "#fff",
                  cursor: "pointer",
                  appearance: "none",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = "rgba(140,80,255,0.50)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)"; }}
              >
                {PROVIDERS.map(p => (
                  <option key={p.value} value={p.value} style={{ background: "#0E0C18" }}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Dynamic API key input */}
            <div>
              <label className="text-[11px] font-mono uppercase tracking-[0.12em] block mb-2"
                style={{ color: "rgba(255,255,255,0.35)" }}>
                {PROVIDERS.find(p => p.value === provider)?.label ?? "api"} key
                {s.has_cloud_api_key && (
                  <span className="ml-2 px-1.5 py-0.5 rounded text-[9px]"
                    style={{
                      background: "rgba(80,255,156,0.10)",
                      border: "1px solid rgba(80,255,156,0.25)",
                      color: "rgba(80,255,156,0.80)",
                    }}>
                    set
                  </span>
                )}
              </label>
              <input
                type="password"
                placeholder={
                  s.has_cloud_api_key
                    ? "•••••• (replace)"
                    : PROVIDERS.find(p => p.value === provider)?.placeholder ?? "…"
                }
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full text-sm font-mono outline-none transition"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 10,
                  padding: "10px 14px",
                  color: "#fff",
                  caretColor: "#8C50FF",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = "rgba(140,80,255,0.50)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)"; }}
              />
            </div>
          </div>
        </Section>

        {/* ── Developer API keys ── */}
        <DevApiSection />

        {/* ── Export / Import settings ── */}
        <ExportImportSection s={s} onUpdate={setS} />

        {/* ── API usage examples ── */}
        <ApiExamplesSection />

        {/* ── Debug logs ── */}
        <LogsPanel />

        {/* ── Save ── */}
        <div className="flex items-center gap-4 pb-8">
          <button
            onClick={save}
            className="text-[13px] font-mono uppercase tracking-[0.14em] px-6 py-2.5 rounded-xl transition"
            style={{
              background: "rgba(140,80,255,0.18)",
              border: "1px solid rgba(140,80,255,0.45)",
              color: "#C8A0FF",
              boxShadow: "0 0 20px rgba(140,80,255,0.15)",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(140,80,255,0.28)"; e.currentTarget.style.boxShadow = "0 0 30px rgba(140,80,255,0.25)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(140,80,255,0.18)"; e.currentTarget.style.boxShadow = "0 0 20px rgba(140,80,255,0.15)"; }}
          >
            save settings
          </button>
          {saved && (
            <span className="text-[11px] font-mono uppercase tracking-[0.12em]"
              style={{ color: "rgba(80,255,156,0.75)" }}>
              ✓ saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function Section({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-mono uppercase tracking-[0.20em]"
          style={{ color: "rgba(255,255,255,0.30)" }}>
          {label}
        </span>
        {action}
      </div>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

function VioletSlider({
  label, hint, min, max, step, value, onChange, displayFmt,
}: {
  label: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  displayFmt: (v: number) => string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex justify-between items-baseline mb-2">
        <span className="text-[13px] font-light" style={{ color: "rgba(255,255,255,0.70)" }}>
          {label}
        </span>
        <span
          className="text-[12px] font-mono px-2 py-0.5 rounded-md"
          style={{
            background: "rgba(140,80,255,0.12)",
            border: "1px solid rgba(140,80,255,0.25)",
            color: "#B888FF",
          }}
        >
          {displayFmt(value)}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: "#8C50FF" }}
      />
      {hint && (
        <p className="text-[11px] font-light mt-1" style={{ color: "rgba(255,255,255,0.28)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function TogglePill({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="relative flex-shrink-0 rounded-full transition-all duration-300"
      style={{
        width: 44, height: 24,
        background: checked ? "rgba(140,80,255,0.35)" : "rgba(255,255,255,0.08)",
        border: `1px solid ${checked ? "rgba(140,80,255,0.55)" : "rgba(255,255,255,0.12)"}`,
        boxShadow: checked ? "0 0 12px rgba(140,80,255,0.30)" : "none",
      }}
    >
      <span
        className="absolute top-0.5 rounded-full transition-all duration-300"
        style={{
          width: 18, height: 18,
          background: checked ? "#B888FF" : "rgba(255,255,255,0.30)",
          left: checked ? 22 : 3,
          boxShadow: checked ? "0 0 8px rgba(184,136,255,0.6)" : "none",
        }}
      />
    </button>
  );
}

/* ── Developer API keys section ─────────────────────────────────────── */
function DevApiSection() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newFull, setNewFull] = useState<ApiKeyFull | null>(null);
  const [copied, setCopied] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");

  useEffect(() => {
    api.listKeys().then(r => setKeys(r.keys)).catch(() => { });
  }, []);

  async function create() {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const created = await api.createKey(newName.trim());
      setNewFull(created);
      setNewName("");
      setKeys(prev => [...prev, {
        id: created.id,
        name: created.name,
        key_preview: created.key.slice(0, 14) + "…",
        created_at: created.created_at,
      }]);
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: string) {
    await api.deleteKey(id).catch(() => { });
    setKeys(prev => prev.filter(k => k.id !== id));
  }

  async function rename(id: string) {
    const name = renameName.trim();
    if (!name) return;
    await api.renameKey(id, name).catch(() => { });
    setKeys(prev => prev.map(k => k.id === id ? { ...k, name } : k));
    setRenaming(null);
    setRenameName("");
  }

  function copyNewKey() {
    if (!newFull) return;
    navigator.clipboard.writeText(newFull.key).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <Section label="developer api">
      <p className="text-sm font-light leading-relaxed"
        style={{ color: "rgba(255,255,255,0.40)" }}>
        Create keys to call IntelliYash via the OpenAI-compatible{" "}
        <span className="font-mono text-[11px]" style={{ color: "#B888FF" }}>/v1/</span>{" "}
        endpoints from external tools or scripts.
      </p>

      {/* Create key */}
      <div className="flex gap-2 mt-4">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") create(); }}
          placeholder="key name…"
          className="flex-1 text-sm font-mono outline-none"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 8,
            padding: "8px 12px",
            color: "#fff",
            caretColor: "#8C50FF",
          }}
          onFocus={e => { e.currentTarget.style.borderColor = "rgba(140,80,255,0.45)"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)"; }}
        />
        <button
          onClick={create}
          disabled={!newName.trim() || creating}
          className="text-[11px] font-mono uppercase tracking-[0.12em] px-4 py-2 rounded-lg transition disabled:opacity-40"
          style={{
            background: "rgba(140,80,255,0.15)",
            border: "1px solid rgba(140,80,255,0.35)",
            color: "#C8A0FF",
          }}
        >
          {creating ? "···" : "+ create"}
        </button>
      </div>

      {/* Newly created key — show once */}
      {newFull && (
        <div
          className="mt-3 p-3 rounded-lg flex items-center justify-between gap-3"
          style={{
            background: "rgba(80,255,156,0.06)",
            border: "1px solid rgba(80,255,156,0.22)",
          }}
        >
          <div className="min-w-0">
            <p className="text-[9px] font-mono uppercase tracking-[0.14em] mb-0.5"
              style={{ color: "rgba(80,255,156,0.70)" }}>
              copy now — shown once
            </p>
            <p className="text-[11px] font-mono truncate" style={{ color: "#fff" }}>
              {newFull.key}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={copyNewKey}
              className="text-[9px] font-mono uppercase px-2.5 py-1 rounded-lg transition"
              style={copied ? {
                background: "rgba(80,255,156,0.15)",
                border: "1px solid rgba(80,255,156,0.35)",
                color: "rgba(80,255,156,0.90)",
              } : {
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.50)",
              }}
            >
              {copied ? "✓" : "copy"}
            </button>
            <button
              onClick={() => setNewFull(null)}
              className="text-[9px] font-mono px-2 py-1"
              style={{ color: "rgba(255,255,255,0.30)" }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Existing keys */}
      {keys.length > 0 && (
        <div className="mt-4 space-y-2">
          {keys.map(k => (
            <div
              key={k.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              {renaming === k.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    autoFocus
                    value={renameName}
                    onChange={e => setRenameName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") rename(k.id);
                      if (e.key === "Escape") { setRenaming(null); setRenameName(""); }
                    }}
                    className="flex-1 text-[12px] font-mono outline-none"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(140,80,255,0.40)",
                      borderRadius: 6,
                      padding: "4px 8px",
                      color: "#fff",
                      caretColor: "#8C50FF",
                    }}
                  />
                  <button
                    onClick={() => rename(k.id)}
                    className="text-[9px] font-mono uppercase px-2.5 py-1 rounded-lg transition"
                    style={{
                      background: "rgba(140,80,255,0.15)",
                      border: "1px solid rgba(140,80,255,0.30)",
                      color: "#C8A0FF",
                    }}
                  >
                    save
                  </button>
                  <button
                    onClick={() => { setRenaming(null); setRenameName(""); }}
                    className="text-[9px] font-mono px-2 py-1"
                    style={{ color: "rgba(255,255,255,0.30)" }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium" style={{ color: "rgba(255,255,255,0.75)" }}>
                      {k.name}
                    </p>
                    <p className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.28)" }}>
                      {k.key_preview}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => { setRenaming(k.id); setRenameName(k.name); }}
                      className="text-[9px] font-mono uppercase px-2 py-1 rounded transition"
                      style={{
                        color: "rgba(255,255,255,0.35)",
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.10)",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = "#fff"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.35)"; }}
                    >
                      rename
                    </button>
                    <button
                      onClick={() => remove(k.id)}
                      className="text-[9px] font-mono uppercase px-2 py-1 rounded transition"
                      style={{
                        color: "rgba(255,100,100,0.55)",
                        background: "rgba(255,80,80,0.06)",
                        border: "1px solid rgba(255,80,80,0.15)",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = "rgba(255,140,140,0.90)"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,100,100,0.55)"; }}
                    >
                      revoke
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {keys.length === 0 && !newFull && (
        <p className="mt-3 text-[11px] font-mono" style={{ color: "rgba(255,255,255,0.22)" }}>
          no keys yet
        </p>
      )}
    </Section>
  );
}

/* ── Export / Import settings ──────────────────────────────────────── */
function ExportImportSection({
  s,
  onUpdate,
}: {
  s: Settings;
  onUpdate: (updated: Settings) => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function doExport() {
    const payload = {
      enable_cloud_fallback: s.enable_cloud_fallback,
      cloud_provider: s.cloud_provider,
      cloud_model: s.cloud_model,
      temperature: s.temperature,
      max_tokens: s.max_tokens,
      idle_unload_seconds: s.idle_unload_seconds,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "intelliyash-settings.json";
    a.click();
    URL.revokeObjectURL(url);
    setStatus("exported");
    setTimeout(() => setStatus(null), 1500);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setStatus(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const safe: Partial<Settings> = {};
      if (typeof parsed.temperature === "number") safe.temperature = parsed.temperature;
      if (typeof parsed.max_tokens === "number") safe.max_tokens = parsed.max_tokens;
      if (typeof parsed.idle_unload_seconds === "number") safe.idle_unload_seconds = parsed.idle_unload_seconds;
      if (typeof parsed.enable_cloud_fallback === "boolean") safe.enable_cloud_fallback = parsed.enable_cloud_fallback;
      if (typeof parsed.cloud_provider === "string") safe.cloud_provider = parsed.cloud_provider;
      if (typeof parsed.cloud_model === "string") safe.cloud_model = parsed.cloud_model;
      const updated = await api.updateSettings(safe);
      onUpdate(updated);
      setStatus("imported — save settings to apply");
    } catch (err: any) {
      setStatus(`error: ${err?.message ?? "invalid file"}`);
    } finally {
      setImporting(false);
      setTimeout(() => setStatus(null), 3000);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Section label="export / import settings">
      <p className="text-sm font-light leading-relaxed"
        style={{ color: "rgba(255,255,255,0.40)" }}>
        Export settings as JSON for backup or transfer. API keys are never exported — only
        non-sensitive configuration values.
      </p>

      <div className="flex items-center gap-3 flex-wrap mt-2">
        <button
          onClick={doExport}
          className="text-[11px] font-mono uppercase tracking-[0.12em] px-4 py-2 rounded-lg transition"
          style={{
            background: "rgba(140,80,255,0.12)",
            border: "1px solid rgba(140,80,255,0.30)",
            color: "#C8A0FF",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(140,80,255,0.22)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(140,80,255,0.12)"; }}
        >
          ↓ export json
        </button>

        <button
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className="text-[11px] font-mono uppercase tracking-[0.12em] px-4 py-2 rounded-lg transition disabled:opacity-40"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.55)",
          }}
          onMouseEnter={e => { e.currentTarget.style.color = "#fff"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.55)"; }}
        >
          {importing ? "importing···" : "↑ import json"}
        </button>

        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          onChange={handleImport}
          className="hidden"
        />

        {status && (
          <span
            className="text-[11px] font-mono uppercase tracking-[0.10em]"
            style={{
              color: status.startsWith("error")
                ? "rgba(255,120,120,0.80)"
                : "rgba(80,255,156,0.75)",
            }}
          >
            {status.startsWith("error") ? "⚠ " : "✓ "}{status}
          </span>
        )}
      </div>
    </Section>
  );
}

/* ── Setup wizard card ──────────────────────────────────────────────── */
function SetupWizardCard({ sys, s }: { sys: SystemInfo; s: Settings }) {
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (localStorage.getItem("iy_setup_done") === "1") setDismissed(true);
  }, []);

  if (dismissed) return null;

  const hasRam = sys.ram_available_mb >= 1500;
  const cloudOk = s.enable_cloud_fallback && s.has_cloud_api_key;

  const steps = hasRam
    ? [
      "Models page → download a model matching your tier",
      "Click 'load' to activate it",
      "Open Chat and start coding",
    ]
    : [
      "Enable Cloud Fallback in the section below",
      "Add a free HuggingFace token (hf_…) or any provider key",
      "Open Chat and start coding",
    ];

  return (
    <div
      className="rounded-xl p-5 relative"
      style={{
        background: "rgba(140,80,255,0.06)",
        border: "1px solid rgba(140,80,255,0.25)",
        boxShadow: "0 0 30px rgba(140,80,255,0.08)",
      }}
    >
      <button
        onClick={() => { setDismissed(true); localStorage.setItem("iy_setup_done", "1"); }}
        className="absolute top-4 right-4 text-[12px] px-2 py-0.5 rounded transition"
        style={{ color: "rgba(255,255,255,0.30)", background: "rgba(255,255,255,0.04)" }}
        onMouseEnter={e => { e.currentTarget.style.color = "#fff"; }}
        onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.30)"; }}
      >
        ✕
      </button>

      <p className="text-[10px] font-mono uppercase tracking-[0.20em] mb-4"
        style={{ color: "#B888FF" }}>
        quick start
      </p>

      <div className="flex items-start gap-4 mb-4">
        <span
          className="flex-shrink-0 text-[12px] font-mono font-semibold uppercase tracking-[0.16em] px-2.5 py-1 rounded-lg"
          style={{
            background: "rgba(140,80,255,0.15)",
            border: "1px solid rgba(140,80,255,0.30)",
            color: "#B888FF",
          }}
        >
          {sys.tier}
        </span>
        <div>
          <p className="text-sm font-light" style={{ color: "rgba(255,255,255,0.75)" }}>
            {sys.ram_available_mb.toLocaleString()} MB free · {sys.ram_total_mb.toLocaleString()} MB total RAM
          </p>
          <p className="text-[12px] font-light mt-0.5" style={{ color: "rgba(255,255,255,0.40)" }}>
            {hasRam
              ? "Your system can run local AI models."
              : "Low available RAM — cloud fallback recommended."}
          </p>
        </div>
      </div>

      {cloudOk && (
        <p className="text-[11px] font-mono mb-3" style={{ color: "rgba(80,255,156,0.75)" }}>
          ✓ Cloud fallback active
        </p>
      )}

      <ol className="space-y-2">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[12px]"
            style={{ color: "rgba(255,255,255,0.55)" }}>
            <span
              className="flex-shrink-0 font-mono text-[10px] px-1.5 py-0.5 rounded mt-0.5"
              style={{
                background: "rgba(140,80,255,0.15)",
                border: "1px solid rgba(140,80,255,0.25)",
                color: "#B888FF",
              }}
            >
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ── API usage examples ─────────────────────────────────────────────── */
function ExampleCodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }
  return (
    <div className="relative mt-3" style={{ borderRadius: 10, overflow: "hidden" }}>
      <pre
        className="text-[11px] font-mono p-4 overflow-x-auto leading-relaxed"
        style={{
          background: "rgba(8,6,18,0.70)",
          border: "1px solid rgba(255,255,255,0.07)",
          color: "#A8E0A8",
        }}
      >
        {code}
      </pre>
      <button
        onClick={copy}
        className="absolute top-2.5 right-2.5 text-[9px] font-mono uppercase px-2 py-1 rounded transition"
        style={copied ? {
          background: "rgba(80,255,156,0.15)",
          border: "1px solid rgba(80,255,156,0.30)",
          color: "rgba(80,255,156,0.85)",
        } : {
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.10)",
          color: "rgba(255,255,255,0.40)",
        }}
      >
        {copied ? "✓" : "copy"}
      </button>
    </div>
  );
}

function ApiExamplesSection() {
  const [tab, setTab] = useState<"curl" | "python" | "js" | "continue" | "opencode">("curl");

  const TABS = [
    { id: "curl" as const, label: "curl" },
    { id: "python" as const, label: "Python" },
    { id: "js" as const, label: "JavaScript" },
    { id: "continue" as const, label: "Continue.dev" },
    { id: "opencode" as const, label: "OpenCode" },
  ];

  const base = "http://localhost:8000";

  const examples: Record<typeof tab, string> = {
    curl: `curl ${base}/v1/chat/completions \\
  -H "Authorization: Bearer IY_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "local",
    "messages": [{"role": "user", "content": "Write a Python hello world"}]
  }'`,

    python: `import requests

response = requests.post(
    "${base}/v1/chat/completions",
    headers={"Authorization": "Bearer IY_YOUR_KEY"},
    json={
        "model": "local",
        "messages": [{"role": "user", "content": "Write a Python hello world"}],
    },
)
print(response.json()["choices"][0]["message"]["content"])`,

    js: `const res = await fetch("${base}/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": "Bearer IY_YOUR_KEY",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "local",
    messages: [{ role: "user", content: "Write a Python hello world" }],
  }),
});
const data = await res.json();
console.log(data.choices[0].message.content);`,

    continue: `// ~/.continue/config.json — add to "models" array:
{
  "title": "IntelliYash (Local)",
  "provider": "openai",
  "model": "local",
  "apiBase": "${base}/v1",
  "apiKey": "IY_YOUR_KEY"
}`,

    opencode: `// ~/.config/opencode/config.json — custom provider:
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "intelliyash": {
      "name": "IntelliYash",
      "type": "openai",
      "models": ["local"],
      "options": {
        "baseURL": "${base}/v1",
        "apiKey": "IY_YOUR_KEY"
      }
    }
  },
  "model": "intelliyash/local"
}`,
  };

  return (
    <Section label="api usage examples">
      <p className="text-sm font-light leading-relaxed"
        style={{ color: "rgba(255,255,255,0.40)" }}>
        Use your developer key to call IntelliYash from any OpenAI-compatible client.
        Replace{" "}
        <span className="font-mono text-[11px]" style={{ color: "#B888FF" }}>IY_YOUR_KEY</span>
        {" "}with a key from the Developer API section above.
      </p>

      <div className="flex gap-2 flex-wrap mt-4">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="text-[10px] font-mono uppercase tracking-[0.12em] px-3 py-1.5 rounded-lg transition"
            style={tab === t.id ? {
              background: "rgba(140,80,255,0.18)",
              border: "1px solid rgba(140,80,255,0.40)",
              color: "#B888FF",
            } : {
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.35)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ExampleCodeBlock code={examples[tab]} />
    </Section>
  );
}

/* ── Debug logs panel ───────────────────────────────────────────────── */
function LogsPanel() {
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await api.getLogs(80);
      setLogs(r.logs);
    } catch { }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  return (
    <Section
      label="debug logs"
      action={
        <button
          onClick={load}
          className="text-[10px] font-mono uppercase tracking-[0.12em] px-3 py-1.5 rounded-lg transition"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.10)",
            color: "rgba(255,255,255,0.40)",
          }}
          onMouseEnter={e => { e.currentTarget.style.color = "#fff"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.40)"; }}
        >
          {loading ? "···" : "refresh"}
        </button>
      }
    >
      <p className="text-[11px] font-light" style={{ color: "rgba(255,255,255,0.30)" }}>
        Last 80 log lines. Secrets are filtered automatically.
      </p>
      <div
        className="mt-3 rounded-lg overflow-y-auto"
        style={{
          background: "rgba(6,4,14,0.80)",
          border: "1px solid rgba(255,255,255,0.07)",
          maxHeight: 320,
          scrollbarWidth: "thin",
        }}
      >
        {logs.length === 0 ? (
          <p className="text-[11px] font-mono p-4" style={{ color: "rgba(255,255,255,0.20)" }}>
            {loading ? "loading···" : "no logs yet"}
          </p>
        ) : (
          <div className="p-3 space-y-0.5">
            {logs.map((line, i) => (
              <p
                key={i}
                className="text-[10.5px] font-mono leading-relaxed break-all whitespace-pre-wrap"
                style={{
                  color: line.includes("ERROR") || line.includes("error")
                    ? "rgba(255,140,140,0.75)"
                    : line.includes("WARNING") || line.includes("warn")
                      ? "rgba(255,200,80,0.70)"
                      : "rgba(160,224,160,0.70)",
                }}
              >
                {line}
              </p>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}
