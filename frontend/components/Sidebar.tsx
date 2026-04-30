"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react"; // ✅ FIX: useRef added
import { api, type SystemInfo } from "@/lib/api";

const NAV = [
  { href: "/", label: "chat" },
  { href: "/models", label: "models" },
  { href: "/projects", label: "projects" },
  { href: "/playground", label: "playground" },
  { href: "/settings", label: "settings" },
];

function BrandPill() {
  return (
    <div
      className="relative flex-shrink-0"
      style={{
        width: 32, height: 18,
        background: "linear-gradient(180deg,#1A1A22,#08080C)",
        borderRadius: 100,
        border: "1px solid rgba(184,136,255,0.5)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1), 0 0 12px rgba(140,80,255,0.3)",
      }}
    >
      <span
        className="absolute"
        style={{
          top: "50%", left: "50%",
          transform: "translate(-50%,-50%)",
          width: 22, height: 8,
          background: "#fff",
          borderRadius: 2,
          display: "block",
        }}
      />
    </div>
  );
}

function Led() {
  return (
    <span
      className="inline-block rounded-full"
      style={{
        width: 7, height: 7,
        background: "#B888FF",
        boxShadow: "0 0 12px #B888FF, 0 0 4px #B888FF",
        animation: "iy-pulse 2.4s ease-in-out infinite",
      }}
    />
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [offline, setOffline] = useState(false);
  const triedRef = useRef(false); // ✅ now works

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const s = await api.system();
        if (!cancelled) {
          setSys(s);
          setOffline(false);
        }
      } catch {
        if (!cancelled && triedRef.current) {
          setOffline(true);
        }
      }
      triedRef.current = true;
    }

    tick();
    const id = setInterval(tick, 8000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <header className="relative z-10 flex-shrink-0" style={{ backdropFilter: "blur(20px)", background: "rgba(14,12,24,0.75)" }}>

      {/* Top bar */}
      <div className="flex items-center gap-3 px-10 py-[18px]" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <BrandPill />

        <span className="text-[15px] font-medium lowercase tracking-[-0.01em]" style={{ color: "#fff" }}>
          intelliyash
        </span>

        <span className="w-px h-[18px] mx-1" style={{ background: "rgba(255,255,255,0.15)" }} />

        <span className="font-mono text-[10.5px] uppercase tracking-[0.18em]" style={{ color: "rgba(255,255,255,0.40)" }}>
          local ai · 2026
        </span>

        <div className="flex-1" />

        <div className="flex items-center gap-2.5 font-mono text-[11px]" style={{ color: "rgba(255,255,255,0.70)" }}>
          <span className="uppercase tracking-[0.06em]" style={{ color: "rgba(255,255,255,0.40)" }}>tier</span>

          <span
            className="font-semibold uppercase tracking-[0.22em]"
            style={{ color: offline ? "rgba(255,180,80,0.80)" : "#B888FF" }}
          >
            {sys ? sys.tier : offline ? "offline" : "···"}
          </span>

          <Led />
        </div>
      </div>

      {/* Offline banner */}
      {offline && (
        <div
          className="flex items-center justify-center gap-2 px-10 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em]"
          style={{
            background: "rgba(255,140,40,0.08)",
            borderBottom: "1px solid rgba(255,160,60,0.18)",
            color: "rgba(255,180,80,0.80)",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,160,60,0.70)" }} />
          backend offline · local processing unavailable
        </div>
      )}

      {/* Nav */}
      <nav className="flex gap-8 px-10" style={{ background: "rgba(14,12,24,0.5)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        {NAV.map(({ href, label }) => {
          const active = pathname === href;

          return (
            <Link
              key={href}
              href={href}
              className="relative text-[13.5px] lowercase py-[14px] transition-colors duration-200"
              style={{ color: active ? "#fff" : "rgba(255,255,255,0.40)" }}
            >
              {label}

              {active && (
                <span
                  className="absolute left-0 right-0"
                  style={{
                    bottom: -1,
                    height: 1.5,
                    background: "#8C50FF",
                    boxShadow: "0 0 10px rgba(140,80,255,0.7)",
                    borderRadius: 100,
                  }}
                />
              )}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}