// Polls while the card is visible and backs off when the server rate-limits.

export const POLL_MS = 2000;
export const MAX_BACKOFF_MS = 30_000;

/** What one poll reports back to the scheduler. */
export interface PollOutcome {
  rateLimited: boolean;
  /** From error.retry_after_seconds, when the server sent it. */
  retryAfterSeconds?: number;
}

/** Whether the card can be seen, and a way to hear when that changes. */
export interface Visibility {
  visible(): boolean;
  /** Returns an unsubscribe function. */
  subscribe(onChange: () => void): () => void;
}

export interface PollerOptions {
  poll: () => Promise<PollOutcome>;
  visibility: Visibility;
  intervalMs?: number;
  maxBackoffMs?: number;
  now?: () => number;
}

/** Delay before the next poll after a rate-limited (or failed) one. */
export function backoffDelay(
  previousMs: number,
  intervalMs: number,
  maxMs: number,
  retryAfterSeconds?: number,
): number {
  if (retryAfterSeconds && retryAfterSeconds > 0) {
    return Math.max(intervalMs, retryAfterSeconds * 1000);
  }
  return Math.min(maxMs, Math.max(intervalMs, previousMs) * 2);
}

/**
 * Runs `poll` every interval, one at a time, while visible. Hidden pauses it;
 * becoming visible polls at once unless a back-off is still pending.
 */
export class Poller {
  private readonly opts: Required<PollerOptions>;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private inFlight = false;
  private delayMs: number;
  private nextAt = 0;
  private unsubscribe: (() => void) | null = null;

  constructor(opts: PollerOptions) {
    this.opts = {
      intervalMs: POLL_MS,
      maxBackoffMs: MAX_BACKOFF_MS,
      now: () => Date.now(),
      ...opts,
    };
    this.delayMs = this.opts.intervalMs;
  }

  /** Starts polling; the first poll waits one interval (the card already has data). */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.nextAt = this.opts.now() + this.opts.intervalMs;
    this.unsubscribe = this.opts.visibility.subscribe(() => this.reschedule());
    this.reschedule();
  }

  stop(): void {
    this.running = false;
    this.clear();
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** The delay the scheduler is using now (for tests and debugging). */
  get currentDelayMs(): number {
    return this.delayMs;
  }

  private clear(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private reschedule(): void {
    this.clear();
    if (!this.running || this.inFlight || !this.opts.visibility.visible()) {
      return;
    }
    const wait = Math.max(0, this.nextAt - this.opts.now());
    this.timer = setTimeout(() => void this.tick(), wait);
  }

  private async tick(): Promise<void> {
    this.timer = null;
    if (!this.running || !this.opts.visibility.visible()) return;
    this.inFlight = true;
    let outcome: PollOutcome;
    try {
      outcome = await this.opts.poll();
    } catch {
      outcome = { rateLimited: true }; // transport failure: back off the same way
    }
    this.inFlight = false;
    const { intervalMs, maxBackoffMs } = this.opts;
    this.delayMs = outcome.rateLimited
      ? backoffDelay(
          this.delayMs,
          intervalMs,
          maxBackoffMs,
          outcome.retryAfterSeconds,
        )
      : intervalMs;
    this.nextAt = this.opts.now() + this.delayMs;
    this.reschedule();
  }
}

/** Visible when the document is shown and the card is on screen. */
export function domVisibility(el: Element): Visibility {
  let onScreen = true;
  return {
    visible: () => document.visibilityState !== "hidden" && onScreen,
    subscribe(onChange) {
      const onDoc = () => onChange();
      document.addEventListener("visibilitychange", onDoc);
      let observer: IntersectionObserver | null = null;
      if (typeof IntersectionObserver !== "undefined") {
        observer = new IntersectionObserver((entries) => {
          onScreen = entries.some((e) => e.isIntersecting);
          onChange();
        });
        observer.observe(el);
      }
      return () => {
        document.removeEventListener("visibilitychange", onDoc);
        observer?.disconnect();
      };
    },
  };
}
