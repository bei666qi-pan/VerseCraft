"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface PlayErrorBoundaryProps {
  children: ReactNode;
}

interface PlayErrorBoundaryState {
  hasError: boolean;
}

export class PlayErrorBoundary extends Component<
  PlayErrorBoundaryProps,
  PlayErrorBoundaryState
> {
  constructor(props: PlayErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): PlayErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[PlayErrorBoundary] render error:", error, errorInfo);
  }

  private handleRefresh = () => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          data-testid="play-error-boundary"
          className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#f6f2ec] px-6 text-center"
        >
          <p className="text-lg font-medium text-[#4a3f35]">
            抱歉，游戏遇到了一点问题，请刷新页面重试
          </p>
          <button
            onClick={this.handleRefresh}
            className="rounded-lg bg-[#4a3f35] px-6 py-2.5 text-sm font-medium text-[#f6f2ec] shadow-sm transition active:scale-95"
          >
            刷新页面
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
