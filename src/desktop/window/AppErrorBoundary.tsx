"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/ui/Button";

interface Props {
  appName: string;
  onRestart(): void;
  onClose(): void;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Isolates application crashes to their own window. The desktop and every
 * other window keep running.
 */
export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[nexus] ${this.props.appName} crashed`, error, info.componentStack);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center" role="alert">
        <div className="grid size-10 place-items-center rounded-full bg-danger/10 text-danger">
          <TriangleAlert size={18} strokeWidth={1.75} />
        </div>
        <div className="space-y-1">
          <p className="text-[13.5px] font-medium text-fg">{this.props.appName} stopped unexpectedly</p>
          <p className="max-w-[340px] text-[12px] leading-relaxed text-muted" data-selectable>
            {error.message || "An unknown error occurred."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={this.props.onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              this.setState({ error: null });
              this.props.onRestart();
            }}
          >
            Reopen
          </Button>
        </div>
      </div>
    );
  }
}
