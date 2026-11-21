"use client";

import { CircleAlert, RefreshCw } from "lucide-react";
import { Component, type ReactNode } from "react";

/**
 * Keeps a failed calendar or chart from taking the page down. Ported from the PakaonAI calendar's
 * boundary: the page keeps its heading, filters and the other tab, and this block offers a retry.
 *
 * `resetKey` re-arms the boundary when the thing being drawn changes (the month, the week, the
 * zoom), so a stale error does not stick to a new view.
 */

type Props = {
  children: ReactNode;
  title: string;
  message: string;
  retryLabel: string;
  resetKey?: string;
};

type State = { hasError: boolean };

export class TimelineErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[timeline] The view failed to render:", error);
  }

  componentDidUpdate(previous: Props) {
    if (this.state.hasError && previous.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  private retry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="flex flex-col items-center gap-3 rounded-lg border border-line bg-surface-raised px-6 py-10 text-center"
        >
          <CircleAlert className="size-6 text-danger" aria-hidden="true" />
          <div>
            <p className="font-display text-base font-bold text-ink">{this.props.title}</p>
            <p className="mt-1 max-w-sm text-sm text-ink-muted">{this.props.message}</p>
          </div>
          <button
            type="button"
            onClick={this.retry}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line-strong px-3 text-sm font-semibold text-ink hover:bg-surface-sunken"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            {this.props.retryLabel}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
