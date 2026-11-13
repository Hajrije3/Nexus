/**
 * Typed, synchronous event bus.
 *
 * Synchronous dispatch keeps ordering deterministic and testable: when
 * `emit` returns, every listener has run. Listeners must therefore be cheap;
 * anything heavy should defer itself (queueMicrotask / a worker).
 *
 * A throwing listener never prevents other listeners from running and never
 * propagates to the emitter — errors go to `onError`.
 */
import type { EventMeta, SystemEvent, SystemEventMap } from "./types";

export type Unsubscribe = () => void;
type Listener<P> = (payload: P, meta: EventMeta) => void;

export interface EventBusOptions {
  /** Number of recent events retained for inspection (Activity Monitor, debugging). */
  historySize?: number;
  onError?: (error: unknown, event: { type: PropertyKey }) => void;
  now?: () => number;
}

export class EventBus<M extends object = SystemEventMap> {
  private listeners = new Map<keyof M, Set<Listener<never>>>();
  private wildcard = new Set<(event: SystemEvent<M>) => void>();
  private history: SystemEvent<M>[] = [];
  private seq = 0;
  private readonly historySize: number;
  private readonly onError: NonNullable<EventBusOptions["onError"]>;
  private readonly now: () => number;

  constructor(options: EventBusOptions = {}) {
    this.historySize = options.historySize ?? 100;
    this.now = options.now ?? Date.now;
    this.onError =
      options.onError ??
      ((error, event) => console.error(`[nexus] listener for "${String(event.type)}" threw`, error));
  }

  on<K extends keyof M>(type: K, listener: Listener<M[K]>): Unsubscribe {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener as Listener<never>);
    return () => {
      set.delete(listener as Listener<never>);
    };
  }

  once<K extends keyof M>(type: K, listener: Listener<M[K]>): Unsubscribe {
    const off = this.on(type, (payload, meta) => {
      off();
      listener(payload, meta);
    });
    return off;
  }

  /** Listen to every event (logging, devtools, Activity Monitor). */
  onAny(listener: (event: SystemEvent<M>) => void): Unsubscribe {
    this.wildcard.add(listener);
    return () => {
      this.wildcard.delete(listener);
    };
  }

  emit<K extends keyof M>(type: K, payload: M[K]): void {
    const meta: EventMeta = { seq: ++this.seq, timestamp: this.now() };
    const event = { type, payload, ...meta } as unknown as SystemEvent<M>;

    this.history.push(event);
    if (this.history.length > this.historySize) this.history.shift();

    // Snapshot so listeners that (un)subscribe during dispatch don't affect this round.
    const set = this.listeners.get(type);
    if (set) {
      for (const listener of [...set]) {
        try {
          (listener as Listener<M[K]>)(payload, meta);
        } catch (error) {
          this.onError(error, { type });
        }
      }
    }
    for (const listener of [...this.wildcard]) {
      try {
        listener(event);
      } catch (error) {
        this.onError(error, { type });
      }
    }
  }

  /** Most recent events, oldest first. */
  recent(): readonly SystemEvent<M>[] {
    return this.history;
  }

  listenerCount(type?: keyof M): number {
    if (type !== undefined) return this.listeners.get(type)?.size ?? 0;
    let n = this.wildcard.size;
    for (const set of this.listeners.values()) n += set.size;
    return n;
  }
}

/** The system-wide bus. */
export const systemEvents = new EventBus<SystemEventMap>({ historySize: 200 });
