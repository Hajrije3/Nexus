# ADR-0003: Typed, synchronous event bus

- Status: Accepted
- Date: 2026-11-13

## Context

Applications and services must react to each other's changes (a file saved in
Code Studio should refresh an open File Explorer) without importing each
other.

## Decision

A single `EventBus<SystemEventMap>`:

- **Typed:** `SystemEventMap` in `system/events/types.ts` is the registry of
  every event and its payload. `emit("fs.moved", …)` is type-checked; an
  unknown event name or a wrong payload is a compile error.
- **Synchronous dispatch:** when `emit` returns, every listener has run.
  Ordering is deterministic and tests need no timers.
- **Isolated listeners:** a throwing listener is reported via `onError` and
  never prevents other listeners from running or reaches the emitter.
- **Stable during dispatch:** listeners are snapshotted, so (un)subscribing
  inside a listener doesn't affect the current dispatch.
- **Bounded history:** the last N events are kept for the Activity Monitor
  event log and debugging.

### Alternatives considered

- *Asynchronous (microtask) dispatch.* Protects emitters from slow listeners,
  but makes ordering harder to reason about and every test async. Rejected;
  listeners that do heavy work defer themselves instead.
- *DOM `EventTarget` / `CustomEvent`.* Native, but untyped payloads and no
  history. Rejected.
- *Stores only (no events).* State stores answer "what is the state now";
  events answer "what just happened". Both are needed: `fs.moved` carries the
  old path, which no state snapshot contains.

## Consequences

- Listeners must be cheap. Expensive reactions (re-indexing, network) must
  queue work rather than run inline.
- Events are facts about committed changes; emitters must emit after the
  change is durable (see ADR-0002, Decision 3).
- Pure modules (window-manager operations) don't emit. Bridges observe their
  stores and publish (`bridgeWindowFocusEvents`).
