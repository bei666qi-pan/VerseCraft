// src/components/admin/AdminErrorBoundary.tsx
"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { label: string; children: ReactNode };
type S = { err: Error | null };

export class AdminErrorBoundary extends Component<Props, S> {
  state: S = { err: null };

  static getDerivedStateFromError(err: Error): S {
    return { err };
  }

  override componentDidCatch(err: Error, info: ErrorInfo) {
    console.warn(`[admin] panel error: ${this.props.label}`, err, info);
  }

  override render() {
    if (this.state.err) {
      return (
        <div
          className="rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-100/95 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] backdrop-blur-xl"
          data-testid="admin-panel-fallback"
        >
          <p>「{this.props.label}」暂无法显示，其它区域仍可继续查看。</p>
        </div>
      );
    }
    return this.props.children;
  }
}
