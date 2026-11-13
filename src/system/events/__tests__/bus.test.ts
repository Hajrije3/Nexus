import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../bus";

interface TestEvents {
  ping: { n: number };
  pong: { text: string };
}

const makeBus = (onError = vi.fn()) => ({ bus: new EventBus<TestEvents>({ historySize: 3, onError, now: () => 42 }), onError });

describe("EventBus", () => {
  it("delivers typed payloads with metadata", () => {
    const { bus } = makeBus();
    const seen: unknown[] = [];
    bus.on("ping", (p, meta) => seen.push([p.n, meta.seq, meta.timestamp]));
    bus.emit("ping", { n: 1 });
    bus.emit("ping", { n: 2 });
    expect(seen).toEqual([
      [1, 1, 42],
      [2, 2, 42],
    ]);
  });

  it("only delivers to listeners of the emitted type", () => {
    const { bus } = makeBus();
    const pong = vi.fn();
    bus.on("pong", pong);
    bus.emit("ping", { n: 1 });
    expect(pong).not.toHaveBeenCalled();
  });

  it("unsubscribes", () => {
    const { bus } = makeBus();
    const fn = vi.fn();
    const off = bus.on("ping", fn);
    off();
    bus.emit("ping", { n: 1 });
    expect(fn).not.toHaveBeenCalled();
    expect(bus.listenerCount("ping")).toBe(0);
  });

  it("once fires a single time", () => {
    const { bus } = makeBus();
    const fn = vi.fn();
    bus.once("ping", fn);
    bus.emit("ping", { n: 1 });
    bus.emit("ping", { n: 2 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("isolates throwing listeners", () => {
    const { bus, onError } = makeBus();
    const after = vi.fn();
    bus.on("ping", () => {
      throw new Error("boom");
    });
    bus.on("ping", after);
    expect(() => bus.emit("ping", { n: 1 })).not.toThrow();
    expect(after).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
  });

  it("is unaffected by subscriptions made during dispatch", () => {
    const { bus } = makeBus();
    const late = vi.fn();
    bus.on("ping", () => bus.on("ping", late));
    bus.emit("ping", { n: 1 });
    expect(late).not.toHaveBeenCalled();
  });

  it("notifies wildcard listeners and keeps bounded history", () => {
    const { bus } = makeBus();
    const any = vi.fn();
    bus.onAny(any);
    bus.emit("ping", { n: 1 });
    bus.emit("pong", { text: "a" });
    bus.emit("ping", { n: 2 });
    bus.emit("ping", { n: 3 });
    expect(any).toHaveBeenCalledTimes(4);
    expect(any.mock.calls[1]?.[0]).toMatchObject({ type: "pong", payload: { text: "a" }, seq: 2 });
    expect(bus.recent().map((e) => e.seq)).toEqual([2, 3, 4]);
  });
});
