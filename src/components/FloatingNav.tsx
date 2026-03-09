"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

const ROUTES = [
  { href: "/", label: "主界面" },
  { href: "/intro", label: "入局指南" },
  { href: "/world/apartment", label: "公寓档案" },
  { href: "/create", label: "铸造角色" },
  { href: "/play", label: "意识潜入" },
  { href: "/settlement", label: "结算导出" },
] as const;

export default function FloatingNav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed bottom-6 right-6 z-50">
      <div
        className={`absolute bottom-14 right-0 flex flex-col gap-0.5 rounded-2xl border border-border bg-white/90 px-1 py-1.5 shadow-lg backdrop-blur-xl transition-all duration-200 ${
          open
            ? "visible translate-y-0 opacity-100"
            : "invisible translate-y-2 opacity-0"
        }`}
      >
        {ROUTES.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className="whitespace-nowrap rounded-lg px-4 py-2 text-sm text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
          >
            {label}
          </Link>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-white/90 text-foreground/60 shadow-lg backdrop-blur-xl transition-all hover:bg-white hover:text-foreground hover:shadow-xl"
        aria-label={open ? "关闭导航" : "打开导航"}
      >
        {open ? (
          <X size={18} strokeWidth={1.5} />
        ) : (
          <Menu size={18} strokeWidth={1.5} />
        )}
      </button>
    </nav>
  );
}
