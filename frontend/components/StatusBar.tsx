"use client";

import { useEffect, useState } from "react";
import { api, type SystemInfo, type HealthInfo } from "@/lib/api";

export default function StatusBar() {
  const [sys, setSys]       = useState<SystemInfo | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const [s, h] = await Promise.all([api.system(), api.health()]);
        if (!cancelled) { setSys(s); setHealth(h); }
      } catch { /* backend not ready */ }
    }
    tick();
    const id = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const avail = sys?.ram_available_mb ?? 0;
  const total = sys?.ram_total_mb ?? 1;
  const usedPct = Math.min(100, Math.round(((total - avail) / total) * 100));
  const loadedModel = health?.loaded_model;

  return (
    <footer
      className="relative z-10 flex-shrink-0 flex items-center gap-6 px-10 py-3"
      style={{
        borderTop: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(14,12,24,0.75)",
        backdropFilter: "blur(20px)",
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: 10.5,
        color: "rgba(255,255,255,0.40)",
      }}
    >
      {/* model */}
      <span>
        <span className="uppercase tracking-[0.06em] mr-1.5">model</span>
        <span style={{ color: loadedModel ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.30)" }}>
          {health ? (loadedModel ?? "none") : "···"}
        </span>
      </span>

      {/* RAM bar */}
      <span className="flex items-center gap-2">
        <span className="uppercase tracking-[0.06em]">ram</span>
        <span
          className="rounded-full overflow-hidden"
          style={{ width: 56, height: 2, background: "rgba(255,255,255,0.08)" }}
        >
          <span
            className="block h-full rounded-full transition-all duration-700"
            style={{
              width: `${usedPct}%`,
              background: "#8C50FF",
              boxShadow: "0 0 6px rgba(140,80,255,0.5)",
            }}
          />
        </span>
        <span style={{ color: "rgba(255,255,255,0.70)" }}>
          {sys ? `${avail.toLocaleString()} mb free` : "···"}
        </span>
      </span>

      {/* tier */}
      {sys && (
        <span>
          <span className="uppercase tracking-[0.06em] mr-1.5">tier</span>
          <span style={{ color: "#B888FF", fontWeight: 600, letterSpacing: "0.18em" }}>
            {sys.tier.toUpperCase()}
          </span>
        </span>
      )}

      <span className="flex-1" />

      {/* loading indicator */}
      {health?.is_loading && (
        <span style={{ color: "#B888FF" }} className="uppercase tracking-[0.1em]">
          loading model…
        </span>
      )}

      <span className="uppercase tracking-[0.1em]" style={{ color: "rgba(255,255,255,0.20)" }}>
        intelliyash · local
      </span>
    </footer>
  );
}
