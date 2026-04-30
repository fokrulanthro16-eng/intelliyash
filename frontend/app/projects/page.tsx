"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, type GeneratedProject } from "@/lib/api";

const TEMPLATES = [
  { name: "todo app",     icon: "☑", prompt: "create project: todo app react + fastapi with sqlite tasks database" },
  { name: "blog app",     icon: "✎", prompt: "create project: blog app react + fastapi with markdown posts and categories" },
  { name: "notes app",    icon: "≡", prompt: "create project: notes app react + fastapi with full text search" },
  { name: "saas starter", icon: "⬡", prompt: "create project: saas starter react + fastapi with auth, user management and billing placeholder" },
] as const;

/* ── Copy button ──────────────────────────────────────────────────────── */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    });
  }
  return (
    <button
      onClick={copy}
      className="text-[10px] font-mono uppercase tracking-[0.10em] px-2.5 py-1 rounded-lg transition"
      style={copied ? {
        background: "rgba(80,255,156,0.10)",
        border: "1px solid rgba(80,255,156,0.28)",
        color: "rgba(80,255,156,0.80)",
      } : {
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.10)",
        color: "rgba(255,255,255,0.35)",
      }}
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}

/* ── Command block ────────────────────────────────────────────────────── */
function CommandBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] font-mono uppercase tracking-[0.16em]"
              style={{ color: "rgba(255,255,255,0.28)" }}>
          {label}
        </span>
        <CopyButton text={value} />
      </div>
      <pre
        className="text-[11px] font-mono px-3 py-2.5 rounded-lg whitespace-pre overflow-x-auto"
        style={{
          background: "rgba(8,6,18,0.60)",
          border: "1px solid rgba(255,255,255,0.06)",
          color: "#50FF9C",
        }}
      >
        {value}
      </pre>
    </div>
  );
}

/* ── Download button ──────────────────────────────────────────────────── */
function DownloadButton({ name }: { name: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function download() {
    if (state === "loading") return;
    setState("loading");
    try {
      await api.downloadProject(name);
      setState("done");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2000);
    }
  }

  const label =
    state === "loading" ? "zipping···" :
    state === "done"    ? "✓ downloaded" :
    state === "error"   ? "failed" :
    "↓ .zip";

  const style: React.CSSProperties =
    state === "done" ? {
      background: "rgba(80,255,156,0.10)",
      border: "1px solid rgba(80,255,156,0.28)",
      color: "rgba(80,255,156,0.80)",
    } : state === "error" ? {
      background: "rgba(255,80,80,0.06)",
      border: "1px solid rgba(255,80,80,0.22)",
      color: "rgba(255,140,140,0.75)",
    } : {
      background: "rgba(140,80,255,0.10)",
      border: "1px solid rgba(140,80,255,0.28)",
      color: "#C0A0FF",
    };

  return (
    <button
      onClick={download}
      disabled={state === "loading"}
      className="text-[10px] font-mono uppercase tracking-[0.10em] px-3 py-1 rounded-lg transition disabled:opacity-50"
      style={style}
    >
      {label}
    </button>
  );
}

/* ── Delete button with 2-option confirmation ─────────────────────────── */
function DeleteButton({ name, onDeleted }: { name: string; onDeleted: () => void }) {
  const [phase, setPhase] = useState<"idle" | "confirm">("idle");
  const [busy, setBusy]   = useState(false);

  async function doDelete(deleteFiles: boolean) {
    setBusy(true);
    try {
      await api.deleteProject(name, deleteFiles);
      onDeleted();
    } catch {
      setBusy(false);
      setPhase("idle");
    }
  }

  if (phase === "idle") {
    return (
      <button
        onClick={() => setPhase("confirm")}
        className="text-[10px] font-mono uppercase tracking-[0.10em] px-2.5 py-1 rounded-lg transition"
        style={{
          background: "rgba(255,80,80,0.06)",
          border: "1px solid rgba(255,80,80,0.18)",
          color: "rgba(255,140,140,0.60)",
        }}
        onMouseEnter={e => { e.currentTarget.style.color = "rgba(255,140,140,0.90)"; }}
        onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,140,140,0.60)"; }}
      >
        delete
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] font-mono uppercase tracking-[0.10em]"
            style={{ color: "rgba(255,255,255,0.35)" }}>
        delete:
      </span>
      <button
        disabled={busy}
        onClick={() => doDelete(false)}
        className="text-[9px] font-mono uppercase px-2 py-1 rounded-lg transition disabled:opacity-40"
        style={{
          background: "rgba(255,160,60,0.10)",
          border: "1px solid rgba(255,160,60,0.25)",
          color: "rgba(255,190,80,0.85)",
        }}
        title="Remove from list only — files stay on disk"
      >
        {busy ? "···" : "list only"}
      </button>
      <button
        disabled={busy}
        onClick={() => doDelete(true)}
        className="text-[9px] font-mono uppercase px-2 py-1 rounded-lg transition disabled:opacity-40"
        style={{
          background: "rgba(255,60,60,0.10)",
          border: "1px solid rgba(255,60,60,0.30)",
          color: "rgba(255,120,120,0.85)",
        }}
        title="Permanently delete files from disk"
      >
        {busy ? "···" : "+ files"}
      </button>
      <button
        onClick={() => setPhase("idle")}
        className="text-[9px] font-mono px-1.5 py-1"
        style={{ color: "rgba(255,255,255,0.25)" }}
      >
        ✕
      </button>
    </div>
  );
}

/* ── Details modal ────────────────────────────────────────────────────── */
function DetailsModal({
  project,
  onClose,
}: {
  project: GeneratedProject;
  onClose: () => void;
}) {
  const [files,    setFiles]   = useState<string[]>([]);
  const [loading,  setLoading] = useState(true);
  const [preview,  setPreview] = useState<{ path: string; content: string } | null>(null);
  const [prevLoad, setPrevLoad] = useState(false);

  useEffect(() => {
    api.projectFiles(project.name)
      .then(r => setFiles(r.files))
      .catch(() => setFiles(["(could not load file list)"]))
      .finally(() => setLoading(false));
  }, [project.name]);

  async function openFile(path: string) {
    setPrevLoad(true);
    try {
      const r = await api.getProjectFile(project.name, path);
      setPreview({ path, content: r.content });
    } catch (e: any) {
      setPreview({ path, content: `(${e.message ?? "could not load"})` });
    } finally {
      setPrevLoad(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="relative flex flex-col rounded-2xl mx-4"
        style={{
          width: "100%",
          maxWidth: 520,
          maxHeight: "80vh",
          background: "rgba(14,12,24,0.97)",
          border: "1px solid rgba(140,80,255,0.28)",
          boxShadow: "0 0 80px rgba(140,80,255,0.15)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5"
             style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div>
            <p className="text-[9px] font-mono uppercase tracking-[0.20em] mb-1"
               style={{ color: "#B888FF" }}>
              project details
            </p>
            <h2 className="text-lg font-light" style={{ color: "#fff" }}>
              {project.name}
            </h2>
            <p className="text-[11px] font-mono mt-0.5 truncate"
               style={{ color: "rgba(255,255,255,0.28)" }}>
              {project.path}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[12px] px-2 py-1 rounded-lg ml-4 flex-shrink-0 transition"
            style={{
              color: "rgba(255,255,255,0.40)",
              background: "rgba(255,255,255,0.06)",
            }}
          >
            ✕
          </button>
        </div>

        {/* Files list */}
        <div className="flex-1 overflow-y-auto p-5" style={{ scrollbarWidth: "thin" }}>
          <p className="text-[9px] font-mono uppercase tracking-[0.16em] mb-3"
             style={{ color: "rgba(255,255,255,0.28)" }}>
            files ({loading ? "···" : files.length})
          </p>
          {preview ? (
            <div>
              <button
                onClick={() => setPreview(null)}
                className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.12em] mb-3 px-2.5 py-1 rounded-lg transition"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.45)" }}
                onMouseEnter={e => { e.currentTarget.style.color = "#B888FF"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.45)"; }}
              >
                ← files
              </button>
              <p className="text-[9px] font-mono mb-2 truncate" style={{ color: "rgba(255,255,255,0.28)" }}>
                {preview.path}
              </p>
              <pre
                className="text-[11px] font-mono leading-relaxed overflow-auto rounded-lg p-3"
                style={{
                  background: "rgba(8,6,18,0.60)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  color: "#50FF9C",
                  maxHeight: 280,
                  scrollbarWidth: "thin",
                }}
              >
                {preview.content}
              </pre>
            </div>
          ) : loading ? (
            <p className="text-[12px] font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>
              loading···
            </p>
          ) : (
            <div className="space-y-0.5">
              {files.map(f => (
                <button
                  key={f}
                  onClick={() => openFile(f)}
                  disabled={prevLoad}
                  className="w-full text-left text-[11px] font-mono px-1 py-0.5 rounded block transition-colors disabled:opacity-40"
                  style={{ color: "rgba(255,255,255,0.55)" }}
                  onMouseEnter={e => { e.currentTarget.style.color = "#B888FF"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.55)"; }}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 p-5"
             style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <DownloadButton name={project.name} />
          <button
            onClick={onClose}
            className="text-[10px] font-mono uppercase tracking-[0.12em] px-3 py-1.5 rounded-lg transition"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "rgba(255,255,255,0.40)",
            }}
          >
            close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Templates section ────────────────────────────────────────────────── */
function TemplatesSection() {
  const router = useRouter();

  function launch(prompt: string) {
    if (typeof window !== "undefined") {
      localStorage.setItem("iy_pending_prompt", prompt);
    }
    router.push("/");
  }

  return (
    <div className="mb-6">
      <p
        className="text-[10px] font-mono uppercase tracking-[0.18em] mb-3"
        style={{ color: "rgba(255,255,255,0.28)" }}
      >
        quick start
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TEMPLATES.map(t => (
          <button
            key={t.name}
            onClick={() => launch(t.prompt)}
            className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-left transition"
            style={{
              background: "rgba(140,80,255,0.06)",
              border: "1px solid rgba(140,80,255,0.18)",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background    = "rgba(140,80,255,0.13)";
              e.currentTarget.style.borderColor   = "rgba(140,80,255,0.38)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background    = "rgba(140,80,255,0.06)";
              e.currentTarget.style.borderColor   = "rgba(140,80,255,0.18)";
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{t.icon}</span>
            <span
              className="text-[12px] font-mono lowercase truncate"
              style={{ color: "rgba(255,255,255,0.65)" }}
            >
              {t.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */
export default function ProjectsPage() {
  const [projects,  setProjects]  = useState<GeneratedProject[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [detail,    setDetail]    = useState<GeneratedProject | null>(null);

  const fetchProjects = useCallback(() => {
    setLoading(true);
    api.projects()
      .then(r => setProjects(r.projects))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const filtered = projects.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
      {detail && (
        <DetailsModal project={detail} onClose={() => setDetail(null)} />
      )}

      <div className="max-w-3xl mx-auto px-10 py-8">

        {/* ── Page header ── */}
        <div className="mb-6">
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] mb-1.5"
             style={{ color: "rgba(255,255,255,0.30)" }}>
            generated projects
          </p>
          <h1 className="text-[26px] font-light tracking-[-0.02em]" style={{ color: "#fff" }}>
            Projects
          </h1>
          <p className="text-sm mt-1.5 font-light" style={{ color: "rgba(255,255,255,0.40)" }}>
            Projects created by IntelliYash Auto File Writer. Persisted across restarts.
          </p>
        </div>

        {/* ── Quick-start templates ── */}
        <TemplatesSection />

        {/* ── Search + refresh ── */}
        <div className="flex items-center gap-3 mb-6">
          <div
            className="flex items-center gap-2 px-3 py-2 flex-1"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ opacity: 0.30, flexShrink: 0 }}>
              <circle cx="6" cy="6" r="4.5" stroke="white" strokeWidth="1.4"/>
              <path d="M10 10L13 13" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search projects…"
              className="flex-1 bg-transparent outline-none text-sm font-light"
              style={{ color: "#fff", caretColor: "#8C50FF" }}
            />
          </div>
          <button
            onClick={fetchProjects}
            disabled={loading}
            className="text-[10px] font-mono uppercase tracking-[0.12em] px-3 py-2 rounded-lg transition disabled:opacity-40"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "rgba(255,255,255,0.50)",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.50)"; }}
          >
            {loading ? "···" : "↺ refresh"}
          </button>
        </div>

        {/* ── Empty states ── */}
        {loading && (
          <p className="text-sm font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>
            loading···
          </p>
        )}

        {!loading && projects.length === 0 && (
          <div
            className="p-6 rounded-xl text-sm"
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.07)",
              color: "rgba(255,255,255,0.40)",
            }}
          >
            No projects yet. Try in chat:{" "}
            <span
              className="font-mono text-[12px] px-2 py-0.5 rounded-lg"
              style={{
                background: "rgba(140,80,255,0.10)",
                border: "1px solid rgba(140,80,255,0.22)",
                color: "#B888FF",
              }}
            >
              create project: blog app react + fastapi
            </span>
          </div>
        )}

        {!loading && projects.length > 0 && filtered.length === 0 && (
          <p className="text-sm font-mono" style={{ color: "rgba(255,255,255,0.28)" }}>
            no projects match "{search}"
          </p>
        )}

        {/* ── Project cards ── */}
        <div className="flex flex-col gap-4">
          {filtered.map(p => (
            <div
              key={p.name}
              className="rounded-xl p-5"
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              {/* Card header */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="min-w-0 flex items-start gap-3">
                  <div
                    className="flex-shrink-0 flex items-center justify-center rounded-lg text-[11px] font-mono font-bold"
                    style={{
                      width: 36, height: 36,
                      background: "rgba(140,80,255,0.10)",
                      border: "1px solid rgba(140,80,255,0.22)",
                      color: "#B888FF",
                    }}
                  >
                    {p.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <button
                      onClick={() => setDetail(p)}
                      className="text-left text-[14px] font-medium truncate block transition"
                      style={{ color: "#fff" }}
                      onMouseEnter={e => { e.currentTarget.style.color = "#B888FF"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "#fff"; }}
                      title="View project details"
                    >
                      {p.name}
                    </button>
                    <p className="text-[11px] font-mono mt-0.5 truncate"
                       style={{ color: "rgba(255,255,255,0.28)" }}>
                      {p.path}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  <DownloadButton name={p.name} />
                  <CopyButton text={p.path} />
                  <button
                    onClick={() => setDetail(p)}
                    className="text-[10px] font-mono uppercase tracking-[0.10em] px-2.5 py-1 rounded-lg transition"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      color: "rgba(255,255,255,0.40)",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = "#B888FF"; e.currentTarget.style.borderColor = "rgba(140,80,255,0.35)"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.40)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)"; }}
                  >
                    files
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div className="mb-4" style={{ height: 1, background: "rgba(255,255,255,0.05)" }} />

              {/* Run commands */}
              <div className="grid gap-3 sm:grid-cols-2">
                <CommandBlock label="backend"  value={p.run_backend} />
                <CommandBlock label="frontend" value={p.run_frontend} />
              </div>

              {/* Install-only commands */}
              <div
                className="mt-3 pt-3"
                style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
              >
                <p className="text-[9px] font-mono uppercase tracking-[0.16em] mb-2"
                   style={{ color: "rgba(255,255,255,0.22)" }}>
                  install only
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <CommandBlock
                    label="install backend"
                    value={p.run_backend.split("\n").slice(0, 2).join("\n")}
                  />
                  <CommandBlock
                    label="install frontend"
                    value={p.run_frontend.split("\n").slice(0, 2).join("\n")}
                  />
                </div>
              </div>

              {/* Delete row */}
              <div className="mt-3 flex justify-end">
                <DeleteButton
                  name={p.name}
                  onDeleted={() => {
                    setProjects(prev => prev.filter(x => x.name !== p.name));
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
