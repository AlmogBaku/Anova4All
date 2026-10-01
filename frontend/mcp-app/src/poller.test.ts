import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  backoffDelay,
  Poller,
  type PollOutcome,
  type Visibility,
} from "./poller.ts";

function fakeVisibility(initial = true) {
  let visible = initial;
  const listeners = new Set<() => void>();
  const v: Visibility = {
    visible: () => visible,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  return {
    v,
    set(next: boolean) {
      visible = next;
      listeners.forEach((cb) => cb());
    },
    listeners,
  };
}

describe("Poller", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("polls every 2 s while visible", async () => {
    const vis = fakeVisibility();
    const poll = vi.fn(async (): Promise<PollOutcome> => ({
      rateLimited: false,
    }));
    const p = new Poller({ poll, visibility: vis.v });
    p.start();
    await vi.advanceTimersByTimeAsync(1999);
    expect(poll).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(poll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4000);
    expect(poll).toHaveBeenCalledTimes(3);
    p.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(poll).toHaveBeenCalledTimes(3);
    expect(vis.listeners.size).toBe(0);
  });

  it("pauses while hidden and resumes when visible again", async () => {
    const vis = fakeVisibility();
    const poll = vi.fn(async (): Promise<PollOutcome> => ({
      rateLimited: false,
    }));
    const p = new Poller({ poll, visibility: vis.v });
    p.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(poll).toHaveBeenCalledTimes(1);
    vis.set(false);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(poll).toHaveBeenCalledTimes(1);
    vis.set(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(poll).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(poll).toHaveBeenCalledTimes(3);
    p.stop();
  });

  it("does not start polling while hidden", async () => {
    const vis = fakeVisibility(false);
    const poll = vi.fn(async (): Promise<PollOutcome> => ({
      rateLimited: false,
    }));
    const p = new Poller({ poll, visibility: vis.v });
    p.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(poll).not.toHaveBeenCalled();
    p.stop();
  });

  it("waits retry_after_seconds after rate_limited", async () => {
    const vis = fakeVisibility();
    const outcomes: PollOutcome[] = [
      { rateLimited: true, retryAfterSeconds: 7 },
      { rateLimited: false },
    ];
    const poll = vi.fn(async () => outcomes.shift() ?? { rateLimited: false });
    const p = new Poller({ poll, visibility: vis.v });
    p.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(poll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(6999);
    expect(poll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(poll).toHaveBeenCalledTimes(2);
    // Back to the normal interval after a good poll.
    await vi.advanceTimersByTimeAsync(2000);
    expect(poll).toHaveBeenCalledTimes(3);
    p.stop();
  });

  it("doubles the delay up to 30 s without retry_after, also on failures", async () => {
    const vis = fakeVisibility();
    let n = 0;
    const poll = vi.fn(async (): Promise<PollOutcome> => {
      n++;
      if (n === 2) throw new Error("transport");
      return { rateLimited: true };
    });
    const p = new Poller({ poll, visibility: vis.v });
    p.start();
    const delays: number[] = [];
    await vi.advanceTimersByTimeAsync(2000);
    for (let i = 0; i < 5; i++) {
      delays.push(p.currentDelayMs);
      await vi.advanceTimersByTimeAsync(p.currentDelayMs);
    }
    expect(delays).toEqual([4000, 8000, 16000, 30000, 30000]);
    expect(poll).toHaveBeenCalledTimes(6);
    p.stop();
  });

  it("keeps a pending back-off when it becomes visible again", async () => {
    const vis = fakeVisibility();
    const outcomes: PollOutcome[] = [
      { rateLimited: true, retryAfterSeconds: 10 },
    ];
    const poll = vi.fn(async () => outcomes.shift() ?? { rateLimited: false });
    const p = new Poller({ poll, visibility: vis.v });
    p.start();
    await vi.advanceTimersByTimeAsync(2000);
    vis.set(false);
    await vi.advanceTimersByTimeAsync(3000);
    vis.set(true);
    await vi.advanceTimersByTimeAsync(6999);
    expect(poll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(poll).toHaveBeenCalledTimes(2);
    p.stop();
  });
});

describe("backoffDelay", () => {
  it("prefers retry_after, else doubles to the cap", () => {
    expect(backoffDelay(2000, 2000, 30000, 5)).toBe(5000);
    expect(backoffDelay(2000, 2000, 30000, 0.5)).toBe(2000);
    expect(backoffDelay(2000, 2000, 30000)).toBe(4000);
    expect(backoffDelay(20000, 2000, 30000)).toBe(30000);
  });
});
