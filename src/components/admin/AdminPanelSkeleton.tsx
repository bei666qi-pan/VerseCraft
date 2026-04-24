// src/components/admin/AdminPanelSkeleton.tsx
"use client";

export function AdminKpiRowSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-9" data-testid="admin-kpi-skeleton">
      {Array.from({ length: 9 }).map((_, i) => (
        <div
          key={i}
          className="h-24 animate-pulse rounded-2xl bg-gradient-to-br from-white/[0.12] to-white/[0.04] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]"
        />
      ))}
    </div>
  );
}

export function AdminBlockSkeleton({ h = "h-56" }: { h?: string }) {
  return (
    <div
      className={`w-full ${h} animate-pulse rounded-2xl bg-gradient-to-br from-white/[0.1] to-white/[0.04] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]`}
      data-testid="admin-block-skeleton"
    />
  );
}
