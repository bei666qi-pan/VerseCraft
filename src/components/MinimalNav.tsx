"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

const ROUTES = [
  { href: "/", label: "主界面" },
  { href: "/intro", label: "入局指南" },
  { href: "/recharge", label: "充值中心" },
  { href: "/world/apartment", label: "公寓档案" },
  { href: "/create", label: "铸造角色" },
  { href: "/play", label: "意识潜入" },
  { href: "/settlement", label: "结算导出" },
] as const;

export function MinimalNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div
        className={`absolute bottom-12 right-0 flex flex-col gap-1 rounded-lg border border-neutral-200 bg-white px-2 py-2 shadow-sm transition-opacity ${
          open ? "visible opacity-100" : "invisible opacity-0"
        }`}
      >
        {ROUTES.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className="whitespace-nowrap px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            {label}
          </Link>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900"
        aria-label={open ? "关闭菜单" : "打开菜单"}
      >
        {open ? <X size={18} strokeWidth={2} /> : <Menu size={18} strokeWidth={2} />}
      </button>
    </div>
  );
}
