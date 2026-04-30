import "./globals.css";
import type { Metadata } from "next";
import Sidebar from "@/components/Sidebar";
import StatusBar from "@/components/StatusBar";

export const metadata: Metadata = {
  title: "IntelliYash",
  description: "A Self-Optimizing Local AI Studio",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800&family=JetBrains+Mono:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans">
        {/* ── Fixed ambient background ── */}
        <div className="iy-grid fixed inset-0 z-0 pointer-events-none" />
        <div className="iy-haze iy-haze-v  fixed z-0 pointer-events-none" />
        <div className="iy-haze iy-haze-v2 fixed z-0 pointer-events-none" />
        <div className="iy-haze iy-haze-b  fixed z-0 pointer-events-none" />

        {/* ── App shell ── */}
        <div className="relative z-10 flex flex-col h-screen w-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
          <StatusBar />
        </div>
      </body>
    </html>
  );
}
