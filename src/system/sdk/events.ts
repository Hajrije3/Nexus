/**
 * App SDK — system events.
 */
import { useEffect, useEffectEvent, useState } from "react";
import { systemEvents } from "@/system/events/bus";
import type { EventMeta, SystemEvent, SystemEventMap } from "@/system/events/types";

export type { SystemEvent, SystemEventMap } from "@/system/events/types";

/** Subscribe to one event type for the lifetime of the component. */
export function useSystemEvent<K extends keyof SystemEventMap>(
  type: K,
  handler: (payload: SystemEventMap[K], meta: EventMeta) => void,
): void {
  const onEvent = useEffectEvent(handler);
  useEffect(() => systemEvents.on(type, (payload, meta) => onEvent(payload, meta)), [type]);
}

/** Emit an event (e.g. `file.opened`). */
export function emitSystemEvent<K extends keyof SystemEventMap>(type: K, payload: SystemEventMap[K]): void {
  systemEvents.emit(type, payload);
}

/** The most recent system events, newest last. */
export function useRecentEvents(limit = 50): readonly SystemEvent[] {
  const [events, setEvents] = useState<readonly SystemEvent[]>(() => systemEvents.recent().slice(-limit));
  useEffect(
    () => systemEvents.onAny((e) => setEvents((prev) => [...prev.slice(-(limit - 1)), e])),
    [limit],
  );
  return events;
}
